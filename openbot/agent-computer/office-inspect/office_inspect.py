#!/usr/bin/env python3
"""office-inspect: a small, read-only inspector for .docx, .xlsx, .pptx and .pdf files.

Written for FreeDuet's member computer. It looks at a file and prints one JSON object: the type
detected from the bytes (never from the name), the size, counts, whether macros or external links
are present. It reports; it never runs, calculates or fetches anything.

Hard rules this program keeps:
  * It never executes content: no macro, no formula, no script, no embedded object.
  * It never fetches a URL: our code calls no process and opens no socket, and imports no network module
    (a test checks that). pypdf, which is only used to count a PDF's pages, loads more of the standard
    library than we do; none of its network or process paths is reached by counting pages.
  * OOXML files are ZIP archives and are untrusted: the central directory is read first and the
    file is refused above the limits below, before any part is read. Nothing is extracted to disk.
  * XML is parsed only after a scan has shown that no part of the archive holds a DOCTYPE or an
    ENTITY declaration, so no entity is ever resolved, internal or external. OOXML has no use for one.
  * Macro-enabled files (.docm, .xlsm, .pptm, or any archive holding a VBA project or an Excel 4
    macro sheet), .xlsb, and the old binary formats (.doc, .xls, .ppt) are refused with a sentence.

Exit status: 0 inspected, 3 refused (the JSON says why; a corrupt or hostile file is a refusal, never a
traceback), 2 usage or unreadable file.
Standard library only; pypdf is used for a PDF's page count when it is installed (the image has it).
"""

import errno
import io
import json
import os
import re
import stat
import sys
import zipfile
import xml.etree.ElementTree as ET

# Starting limits (docs/design/office-files.md, section 3.3). They are values to tune, not promises.
MAX_FILE_BYTES = 100 * 1024 * 1024  # the computer's own download limit
MAX_ENTRIES = 5000
MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024
MAX_ENTRY_UNCOMPRESSED = 100 * 1024 * 1024
# Compression ratio, per entry and for the archive as a whole, uncompressed : compressed. Measured, not
# guessed (zlib, the same family of coder every Office file uses):
#   honest files: a sheet or table 9 to 13; 5,000 x 10 table 196; 3,000 identical paragraphs 163; 50,000
#     identical paragraphs 281 per entry and 94 for the archive; Word's own 500 identical pages 151 (a
#     reviewer's file); the ceiling for a repeated paragraph is 294, however long the document is.
#   bombs: a run of zeros reaches 1009 (1 MiB) to 1029 (100 MiB), the most deflate can do; the reviewer's
#     bombs measured 902 to 1029 per entry and 662 to 1023 for the archive.
# 600 leaves a margin of 2 over the honest files and 1.5 under the bombs. The ratio is only a first
# stop: the absolute limits below (100 MiB an entry, 200 MiB in all, depth, element count) are what bound
# the work, so a bomb that compresses less well is still bounded. Entries under RATIO_FLOOR cannot reach
# the limit at all (a 64 KiB entry of zeros plus its headers is about 380 to 1); a swarm of them is stopped
# by the 200 MiB total and the 5,000 entries, which is what the tests check.
MAX_RATIO = 600
RATIO_FLOOR = 64 * 1024  # below this an entry is too small to matter (a few KB of XML compresses well)
ARCHIVE_RATIO_FLOOR = 4 * 1024 * 1024  # the whole-archive rule applies once the archive expands past this
# A part that is parsed whole (content types, relationships, workbook, app properties, presentation) is
# tiny in a real file (a few KB; a very large workbook's relationships are well under 1 MB). 5 MiB is
# generous and keeps the tree this tool builds at tens of MB, where 78 MB of XML built 880 MB.
MAX_WHOLE_PART = 5 * 1024 * 1024
# Big parts (the document body, a sheet) are streamed and never kept; depth and element count are bounded.
MAX_XML_DEPTH = 100
MAX_XML_ELEMENTS = 4_000_000  # a sheet at the 1,000,000-cell limit has about 3 million; 4 million took 6 s to count
MAX_FORMULA_CHARS = 8192  # Excel's own limit for a formula
MAX_SHEETS = 50
MAX_CELLS = 1_000_000
MAX_OUTPUT_BYTES = 1024 * 1024
MAX_SAMPLES = 10
MAX_TEXT = 200

LIMITS = {
    "max_file_bytes": MAX_FILE_BYTES,
    "max_entries": MAX_ENTRIES,
    "max_total_uncompressed_bytes": MAX_TOTAL_UNCOMPRESSED,
    "max_entry_uncompressed_bytes": MAX_ENTRY_UNCOMPRESSED,
    "max_entry_ratio": MAX_RATIO,
    "max_whole_part_bytes": MAX_WHOLE_PART,
    "max_xml_depth": MAX_XML_DEPTH,
    "max_formula_chars_examined": MAX_FORMULA_CHARS,
    "max_sheets_listed": MAX_SHEETS,
    "max_cells": MAX_CELLS,
}

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
MACRO_EXTENSIONS = {".docm", ".xlsm", ".pptm", ".dotm", ".xlsb", ".xltm", ".potm", ".ppsm", ".sldm", ".xlam", ".ppam"}
LEGACY_EXTENSIONS = {".doc", ".xls", ".ppt", ".dot", ".xlt", ".pot", ".pps"}

CONTENT_TYPES = {
    "wordprocessingml.document.main+xml": "docx",
    "spreadsheetml.sheet.main+xml": "xlsx",
    "presentationml.presentation.main+xml": "pptx",
}

class _Dde:
    """A DDE call looks like cmd|'/c calc'!A1: a pipe, and a bang somewhere after it. Two plain string
    searches, linear in the text, instead of a pattern that backtracks."""

    @staticmethod
    def search(text):
        bar = text.find("|")
        return bar >= 0 and text.find("!", bar + 1) >= 0


# Every pattern is anchored on a function name and has no nested or unbounded repetition, so it runs in
# linear time; the text it sees is also cut at MAX_FORMULA_CHARS by the caller.
SUSPICIOUS_FORMULA = (
    ("webservice", re.compile(r"\bWEBSERVICE\s*\(", re.I)),
    ("hyperlink", re.compile(r"\bHYPERLINK\s*\(", re.I)),
    ("external_data", re.compile(r"\b(IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|FILTERXML|RTD|CALL|REGISTER)\s*\(", re.I)),
    ("dde", _Dde),
)


RATIO_SENTENCE = (
    "The file expands unusually much when it is opened (more than 600 times its stored size), which is how a zip bomb "
    "is built. It was not opened. If you made the file yourself, say so to the person instead of retrying, and do not "
    "open it another way."
)


class Refused(Exception):
    """The file is refused; the message is the sentence the person is told."""

    def __init__(self, reason, **extra):
        super().__init__(reason)
        self.reason = reason
        self.extra = extra


def clean(text, limit=MAX_TEXT):
    """Text from a file is data. Drop control characters and cut it, so it cannot be a wall of text."""
    text = "".join(ch if ch.isprintable() else " " for ch in str(text))
    return text if len(text) <= limit else text[:limit] + "..."


def local(tag):
    return tag.rsplit("}", 1)[-1]


# ---- the archive -------------------------------------------------------------------------------


def check_archive(zf, file_size):
    """Refuse a hostile archive from its central directory alone, before any part is read."""
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise Refused(
            f"This archive has {len(infos)} entries; the limit is {MAX_ENTRIES}. It was not opened.",
            reason_code="too_many_entries",
        )
    total = 0
    for info in infos:
        name = info.filename
        if name.startswith("/") or "\\" in name or ".." in name.split("/") or ":" in name.split("/")[0]:
            raise Refused(
                "An entry name in this archive points outside it (a path with .. or an absolute path). It was not opened.",
                reason_code="unsafe_entry_name",
            )
        if info.flag_bits & 0x1:
            raise Refused(
                "This archive is password-protected. Ask the person for an unprotected copy; it was not opened.",
                reason_code="encrypted_archive",
            )
        size = info.file_size
        if size > MAX_ENTRY_UNCOMPRESSED:
            raise Refused(
                f"One part declares {size} bytes when opened; the limit is {MAX_ENTRY_UNCOMPRESSED}. It was not opened.",
                reason_code="entry_too_large",
            )
        if size >= RATIO_FLOOR and size > MAX_RATIO * max(info.compress_size, 1):
            raise Refused(
                RATIO_SENTENCE,
                reason_code="zip_bomb_ratio",
            )
        total += size
        if total > MAX_TOTAL_UNCOMPRESSED:
            raise Refused(
                f"This archive would expand to more than {MAX_TOTAL_UNCOMPRESSED} bytes. It was not opened.",
                reason_code="archive_too_large",
            )
    # The archive as a whole: many entries that each stay under the per-entry floor still add up.
    if total > ARCHIVE_RATIO_FLOOR and total > MAX_RATIO * max(file_size, 1):
        raise Refused(
            RATIO_SENTENCE,
            reason_code="zip_bomb_ratio",
        )
    return total


def scan_for_dtd(zf):
    """Refuse when any XML part holds a DOCTYPE or ENTITY declaration. Reads in chunks, bounded by the
    sizes already checked; the parts are only searched, never parsed here."""
    for info in zf.infolist():
        name = info.filename.lower()
        if not (name.endswith(".xml") or name.endswith(".rels") or name.endswith(".vml")):
            continue
        tail = b""
        with zf.open(info) as handle:
            first = True
            while True:
                chunk = handle.read(1 << 20)
                if not chunk:
                    break
                if first:
                    first = False
                    if chunk[:2] in (b"\xff\xfe", b"\xfe\xff") or b"\x00" in chunk[:64]:
                        raise Refused(
                            "An XML part is in a wide-character encoding that this tool does not read safely. It was not opened.",
                            reason_code="unsupported_xml_encoding",
                        )
                window = (tail + chunk).upper()
                if b"<!DOCTYPE" in window or b"<!ENTITY" in window:
                    raise Refused(
                        "An XML part declares a DOCTYPE or an entity, which a normal Office file never does and which is how "
                        "an XML entity bomb or an external-file read is built. It was not opened.",
                        reason_code="xml_dtd",
                        part=clean(info.filename),
                    )
                tail = chunk[-16:]
    return None


def read_part(zf, name):
    try:
        info = zf.getinfo(name)
    except KeyError:
        return None
    if info.file_size > MAX_WHOLE_PART:
        raise Refused(
            f"The part {clean(name, 80)} is {info.file_size} bytes; a part of that kind is a few KB in a real file and "
            f"the limit is {MAX_WHOLE_PART}. It was not opened.",
            reason_code="part_too_large",
            part=clean(name, 80),
        )
    with zf.open(info) as handle:
        return handle.read(info.file_size + 1)


def parse_part(zf, name):
    data = read_part(zf, name)
    if data is None:
        return None
    try:
        return ET.fromstring(data)
    except ET.ParseError:
        return None


def iter_part(zf, name, keep=()):
    """Stream the 'end' events of a big part. Depth and element count are bounded, and each element is
    removed from its parent once the caller has seen it (except children of a tag in `keep`, which the
    caller still needs), so the tree this builds stays small however large the part is."""
    stack = []
    count = 0
    with zf.open(name) as handle:
        for event, element in ET.iterparse(handle, events=("start", "end")):
            if event == "start":
                stack.append(element)
                count += 1
                if len(stack) > MAX_XML_DEPTH:
                    raise Refused(
                        f"The part {clean(name, 80)} nests its elements more than {MAX_XML_DEPTH} levels deep. It was not read.",
                        reason_code="xml_too_deep",
                    )
                if count > MAX_XML_ELEMENTS:
                    raise Refused(
                        f"The part {clean(name, 80)} has more than {MAX_XML_ELEMENTS} elements. It was not read.",
                        reason_code="xml_too_many_elements",
                    )
            else:
                stack.pop()
                yield "end", element
                if stack and local(stack[-1].tag) not in keep:
                    stack[-1].remove(element)


def macro_evidence(zf):
    found = []
    for info in zf.infolist():
        lowered = info.filename.lower()
        if lowered.endswith("vbaproject.bin") or lowered.endswith("vbadata.xml") or "/macrosheets/" in lowered or "/macros/" in lowered:
            found.append(clean(info.filename))
        elif lowered.startswith("xl/dialogsheets/"):
            found.append(clean(info.filename))
    ct = parse_part(zf, "[Content_Types].xml")
    if ct is not None:
        for element in ct:
            value = (element.get("ContentType") or "").lower()
            if "macroenabled" in value or "vbaproject" in value or "macrosheet" in value:
                found.append("content type: " + clean(value, 80))
    return found


def external_links(zf):
    hyperlinks = 0
    other = 0
    samples = []
    for info in zf.infolist():
        if not info.filename.lower().endswith(".rels"):
            continue
        root = parse_part(zf, info.filename)
        if root is None:
            continue
        for rel in root:
            if rel.get("TargetMode") != "External":
                continue
            kind = clean((rel.get("Type") or "").rsplit("/", 1)[-1], 40)
            if kind == "hyperlink":
                hyperlinks += 1
            else:
                other += 1
            if len(samples) < MAX_SAMPLES:
                samples.append({"part": clean(info.filename, 80), "kind": kind, "target": clean(rel.get("Target") or "")})
    names = [i.filename.lower() for i in zf.infolist()]
    return {
        "present": bool(hyperlinks or other or any(n.startswith("xl/externallinks/") or n == "xl/connections.xml" for n in names)),
        "hyperlinks": hyperlinks,
        "other_external_targets": other,
        "workbook_external_link_parts": sum(1 for n in names if n.startswith("xl/externallinks/") and n.endswith(".xml")),
        "data_connections": 1 if "xl/connections.xml" in names else 0,
        "samples": samples,
        "note": "Reported only. This tool never opens or fetches a link.",
    }


# ---- types -------------------------------------------------------------------------------------


def sniff(head):
    """The family of a file from its first bytes. A file that starts like a ZIP is a ZIP, whatever else
    its first kilobyte says; a PDF is recognised only at byte 0."""
    if head[:4] in (b"PK\x03\x04", b"PK\x05\x06"):
        return "zip"
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(OLE_MAGIC):
        return "ole"
    return "unknown"


def detect(zf):
    ct = parse_part(zf, "[Content_Types].xml")
    if ct is not None:
        for element in ct:
            value = (element.get("ContentType") or "").lower()
            if "macroenabled" in value:
                return "macro"
            for needle, kind in CONTENT_TYPES.items():
                if needle in value:
                    return kind
    if "xl/workbook.bin" in {i.filename for i in zf.infolist()}:
        return "xlsb"
    return "zip"


def column_number(letters):
    number = 0
    for ch in letters:
        number = number * 26 + (ord(ch) - 64)
    return number


def column_letters(number):
    out = ""
    while number:
        number, rem = divmod(number - 1, 26)
        out = chr(65 + rem) + out
    return out


CELL_REF = re.compile(r"^([A-Z]{1,3})([0-9]{1,7})$")


def inspect_docx(zf):
    paragraphs = tables = 0
    headings = {}
    root_name = "word/document.xml"
    if root_name not in zf.namelist():
        raise Refused("This archive says it is a Word file but holds no word/document.xml.", reason_code="malformed")
    for _event, element in iter_part(zf, root_name):
        tag = local(element.tag)
        if tag == "p":
            paragraphs += 1
        elif tag == "tbl":
            tables += 1
        elif tag == "pStyle":
            val = element.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val") or ""
            match = re.match(r"^[Hh]eading\s*([1-9])$", val)
            if match:
                headings[match.group(1)] = headings.get(match.group(1), 0) + 1
        element.clear()
    pages = None
    app = parse_part(zf, "docProps/app.xml")
    if app is not None:
        for element in app.iter():
            if local(element.tag) == "Pages" and (element.text or "").strip().isdigit():
                pages = int(element.text.strip())
    images = sum(1 for i in zf.infolist() if i.filename.startswith("word/media/"))
    return {
        "paragraphs": paragraphs,
        "tables": tables,
        "headings_by_level": dict(sorted(headings.items())),
        "images": images,
        "pages_declared_by_file": pages,
        "pages_note": "A Word file does not store its page count reliably; the number is what the file says, not a rendering.",
    }


def inspect_pptx(zf):
    names = zf.namelist()
    root = parse_part(zf, "ppt/presentation.xml")
    slides = None
    if root is not None:
        slides = sum(1 for e in root.iter() if local(e.tag) == "sldId")
    return {
        "slides": slides,
        "slide_parts": sum(1 for n in names if re.match(r"^ppt/slides/slide[0-9]+\.xml$", n)),
        "notes_slides": sum(1 for n in names if re.match(r"^ppt/notesSlides/notesSlide[0-9]+\.xml$", n)),
        "images": sum(1 for n in names if n.startswith("ppt/media/")),
    }


def resolve_target(base_dir, target):
    if target.startswith("/"):
        return target.lstrip("/")
    parts = (base_dir + "/" + target).split("/")
    out = []
    for part in parts:
        if part == "..":
            if out:
                out.pop()
        elif part not in ("", "."):
            out.append(part)
    return "/".join(out)


def inspect_xlsx(zf):
    workbook = parse_part(zf, "xl/workbook.xml")
    if workbook is None:
        raise Refused("This archive says it is an Excel file but holds no readable xl/workbook.xml.", reason_code="malformed")
    rels = {}
    rels_root = parse_part(zf, "xl/_rels/workbook.xml.rels")
    if rels_root is not None:
        for rel in rels_root:
            rels[rel.get("Id")] = rel.get("Target") or ""
    declared = []  # the first MAX_SHEETS only; the rest are counted, never listed
    declared_total = 0
    for element in workbook.iter():
        if local(element.tag) == "sheet":
            declared_total += 1
            if len(declared) < MAX_SHEETS:
                rid = element.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                declared.append((clean(element.get("name") or "", 100), element.get("state") or "visible", rels.get(rid, "")))
    sheets = []
    cells_left = MAX_CELLS
    formulas_total = 0
    overlong_total = 0
    suspicious = {name: 0 for name, _ in SUSPICIOUS_FORMULA}
    truncated = False
    for index, (name, state, target) in enumerate(declared):
        entry = {"name": name, "state": state}
        if cells_left <= 0:
            entry["skipped"] = "sheet and cell limits reached"
            truncated = True
            sheets.append(entry)
            continue
        part = resolve_target("xl", target) if target else ""
        if not part or part not in zf.namelist():
            entry["skipped"] = "sheet part not found"
            sheets.append(entry)
            continue
        formulas = no_value = nonempty = overlong = 0
        min_r = min_c = 10**9
        max_r = max_c = 0
        declared_dim = None
        cut = False
        for event, element in iter_part(zf, part, keep=("c", "is")):
            tag = local(element.tag)
            if tag == "dimension":
                declared_dim = clean(element.get("ref") or "", 40)
            elif tag == "c":
                has_f = has_v = False
                for child in element:
                    ctag = local(child.tag)
                    if ctag == "f":
                        has_f = True
                        formulas += 1
                        text = child.text or ""
                        if len(text) > MAX_FORMULA_CHARS:
                            overlong += 1  # longer than Excel allows: counted, never handed to a pattern
                        else:
                            for kind, pattern in SUSPICIOUS_FORMULA:
                                if pattern.search(text):
                                    suspicious[kind] += 1
                    elif ctag in ("v", "is") and ((child.text or "").strip() or len(child)):
                        has_v = True
                if has_f and not has_v:
                    no_value += 1
                if has_f or has_v:
                    nonempty += 1
                    match = CELL_REF.match(element.get("r") or "")
                    if match:
                        col, row = column_number(match.group(1)), int(match.group(2))
                        min_c, max_c = min(min_c, col), max(max_c, col)
                        min_r, max_r = min(min_r, row), max(max_r, row)
                cells_left -= 1
                element.clear()
                if cells_left <= 0:
                    cut = True
                    break
        formulas_total += formulas
        overlong_total += overlong
        entry.update(
            {
                "declared_dimension": declared_dim,
                "used_range": (
                    f"{column_letters(min_c)}{min_r}:{column_letters(max_c)}{max_r}" if max_r else None
                ),
                "non_empty_cells": nonempty,
                "formulas": formulas,
                "formulas_without_stored_value": no_value,
                "overlong_formulas": overlong,
            }
        )
        if cut:
            entry["truncated"] = True
            truncated = True
        sheets.append(entry)
    return {
        "sheet_count": declared_total,
        "sheets": sheets,
        "sheets_not_listed": max(0, declared_total - len(declared)),
        "formulas_total": formulas_total,
        "formulas_note": "Formulas are counted as text. Nothing here calculates them; a formula without a stored value shows as empty until a spreadsheet program calculates it.",
        "formula_patterns_reported": {k: v for k, v in suspicious.items() if v},
        "overlong_formulas_total": overlong_total,
        "truncated": truncated or declared_total > len(declared),
    }


def inspect_ooxml(handle, size):
    try:
        zf = zipfile.ZipFile(handle)
    except zipfile.BadZipFile:
        raise Refused("This file starts like a ZIP archive but is not a readable one.", reason_code="bad_zip")
    with zf:
        total = check_archive(zf, size)
        scan_for_dtd(zf)
        kind = detect(zf)
        evidence = macro_evidence(zf)
        base = {"detected_type": kind, "size_bytes": size}
        if kind == "macro" or evidence:
            raise Refused(
                "This file can carry macros (a macro-enabled type or a VBA project inside). It is not opened or run. "
                "Ask the person to save a copy as .docx, .xlsx or .pptx without macros.",
                reason_code="macros",
                detected_type=kind,
                macro_evidence=evidence[:MAX_SAMPLES],
            )
        if kind == "xlsb":
            raise Refused(
                "This is the binary Excel format (.xlsb), which can carry macros. Ask the person to save a copy as .xlsx.",
                reason_code="xlsb",
                detected_type=kind,
            )
        if kind not in ("docx", "xlsx", "pptx"):
            raise Refused(
                "This is a ZIP archive but not a Word, Excel or PowerPoint file.",
                reason_code="not_office",
                detected_type=kind,
            )
        base["zip"] = {"entries": len(zf.infolist()), "uncompressed_bytes": total}
        base["macros"] = {"present": False, "note": "No macro project found. Macros are never run by this tool."}
        base["external_links"] = external_links(zf)
        base["embedded_objects"] = sum(
            1 for i in zf.infolist() if "/embeddings/" in i.filename.lower() or "/activex/" in i.filename.lower()
        )
        detail = {"docx": inspect_docx, "xlsx": inspect_xlsx, "pptx": inspect_pptx}[kind](zf)
        base[kind] = detail
        return base


PDF_TOKENS = (
    ("javascript", rb"/(?:JavaScript|JS)(?![A-Za-z0-9])"),
    ("launch_action", rb"/Launch(?![A-Za-z0-9])"),
    ("open_action", rb"/OpenAction(?![A-Za-z0-9])"),
    ("additional_actions", rb"/AA(?![A-Za-z0-9])"),
    ("embedded_files", rb"/EmbeddedFile(?![A-Za-z0-9])"),
    ("submit_form", rb"/SubmitForm(?![A-Za-z0-9])"),
    ("uri_links", rb"/URI(?![A-Za-z0-9])"),
    ("form_fields", rb"/AcroForm(?![A-Za-z0-9])"),
)


def zip_trailer_in(handle, data):
    """True when the file also holds a ZIP archive. Readers differ on where they look for the end-of-central-
    directory record: Python's zipfile in the last 64 KiB plus 22 bytes, other programs anywhere. So both are
    asked: zipfile first, on the same handle, and then every such record anywhere in the file whose central
    directory could fit before it (a record need not end the file, and need not be near the end)."""
    handle.seek(0)
    try:
        with zipfile.ZipFile(handle) as zf:
            if zf.infolist():
                return True
    except Exception:
        pass
    pos = data.find(b"PK\x05\x06")
    while pos != -1:
        if pos + 22 <= len(data):
            cd_entries = int.from_bytes(data[pos + 10 : pos + 12], "little")
            cd_size = int.from_bytes(data[pos + 12 : pos + 16], "little")
            comment = int.from_bytes(data[pos + 20 : pos + 22], "little")
            if cd_entries and 0 < cd_size <= pos and pos + 22 + comment <= len(data):
                return True
        pos = data.find(b"PK\x05\x06", pos + 1)
    return False


def inspect_pdf(handle, size):
    handle.seek(0)
    data = handle.read(MAX_FILE_BYTES + 1)
    if zip_trailer_in(handle, data):
        raise Refused(
            "This file is a PDF and a ZIP archive at once. That is how a file is made to look harmless to one reader "
            "and different to another. It was not opened.",
            reason_code="polyglot",
            detected_type="pdf",
        )
    raw = {}
    for name, pattern in PDF_TOKENS:
        count = len(re.findall(pattern, data))
        if count:
            raw[name] = count
    encrypted = bool(re.search(rb"/Encrypt(?![A-Za-z0-9])", data))
    pages = None
    method = None
    if not encrypted:
        try:
            import pypdf  # present in the member's computer image

            reader = pypdf.PdfReader(io.BytesIO(data), strict=False)
            pages = len(reader.pages)
            method = "pypdf"
        except Exception:
            pages = None
        if pages is None:
            pages = len(re.findall(rb"/Type\s*/Page(?![A-Za-z0-9])", data))
            method = "raw scan (objects inside compressed streams are not seen, so this can undercount)"
    return {
        "pages": pages,
        "page_count_method": method,
        "encrypted": encrypted,
        "encrypted_note": "Protected: ask the person for an unprotected copy or the password in the chat. Never guess one."
        if encrypted
        else None,
        "active_content_found_by_raw_scan": raw,
        "raw_scan_note": "A search of the file's own bytes. Names written with #-escapes and objects inside compressed streams are not seen. Nothing is run.",
        "size_bytes": size,
    }


def inspect(path):
    """Open the file once, without following a link, and do everything through that one handle: the
    name is never looked at again, so it cannot be swapped between the check and the read."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    try:
        fd = os.open(path, flags)
    except OSError as error:
        if error.errno == errno.ELOOP:
            raise Refused("This is not a regular file (a link, folder or device is not opened).", reason_code="not_regular")
        raise
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            os.close(fd)
            raise Refused("This is not a regular file (a link, folder or device is not opened).", reason_code="not_regular")
    except OSError:
        os.close(fd)
        raise
    with os.fdopen(fd, "rb") as handle:
        try:
            return inspect_open(handle, st.st_size, os.path.splitext(path)[1].lower(), os.path.basename(path))
        except Refused:
            raise
        except Exception as error:  # a hostile or damaged file must end as a refusal, never a traceback
            raise Refused(
                "This file is damaged or built to confuse a reader (" + clean(type(error).__name__, 40) + "). It was not opened.",
                reason_code="corrupt",
            )


def inspect_open(handle, size, ext, base_name):
    if size > MAX_FILE_BYTES:
        raise Refused(f"This file is larger than {MAX_FILE_BYTES} bytes. It was not opened.", reason_code="file_too_large")
    if size == 0:
        raise Refused("This file is empty.", reason_code="empty")
    head = handle.read(4096)
    if ext in MACRO_EXTENSIONS:
        raise Refused(
            f"The name ends in {ext}, a type that can carry macros. It is not opened or run. "
            "Ask the person to save a copy as .docx, .xlsx or .pptx without macros.",
            reason_code="macro_extension",
            size_bytes=size,
        )
    family = sniff(head)
    if family == "ole":
        raise Refused(
            "This is an old binary Office file (.doc, .xls or .ppt). It can carry macros and is not read by the member's tools. "
            "Ask the person to open it and save a copy as .docx, .xlsx or .pptx.",
            reason_code="legacy_binary",
            detected_type="ole",
            size_bytes=size,
        )
    if family == "unknown" and b"%PDF-" in head[:1024]:
        raise Refused(
            "This looks like a PDF that does not start at the first byte. Readers differ on such a file, which is how one "
            "is made to look harmless to one and different to another. It was not opened; ask the person for the original.",
            reason_code="pdf_not_at_start",
            size_bytes=size,
        )
    if family == "unknown":
        raise Refused(
            "This is not a Word, Excel, PowerPoint or PDF file (the first bytes match none of them).",
            reason_code="unknown_type",
            size_bytes=size,
        )
    if family == "pdf":
        result = {"detected_type": "pdf", "size_bytes": size, "pdf": inspect_pdf(handle, size)}
    else:
        handle.seek(0)
        result = inspect_ooxml(handle, size)
    detected = result["detected_type"]
    result["extension"] = ext
    result["extension_matches_content"] = ext == "." + detected
    if ext in LEGACY_EXTENSIONS:
        result["note"] = "The name says an old format but the content is " + detected + "."
    result["file"] = clean(base_name, 120)
    result["limits"] = LIMITS
    result["refused"] = False
    return result


def main(argv):
    if len(argv) == 2 and argv[1] in ("-h", "--help"):
        sys.stdout.write("usage: office-inspect <file.docx|.xlsx|.pptx|.pdf>\n")
        return 0
    if len(argv) != 2:
        sys.stderr.write("usage: office-inspect <file.docx|.xlsx|.pptx|.pdf>\n")
        return 2
    path = argv[1]
    try:
        result = inspect(path)
        code = 0
    except Refused as refusal:
        result = {"refused": True, "reason": refusal.reason, "file": clean(os.path.basename(path), 120)}
        result.update(refusal.extra)
        code = 3
    except (OSError, ValueError) as error:
        sys.stderr.write(f"office-inspect: cannot read the file: {clean(error)}\n")
        return 2
    text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if len(text) > MAX_OUTPUT_BYTES:
        text = json.dumps(
            {"refused": True, "reason": "The report would be larger than a member can use. The file was not reported.", "reason_code": "output_too_large"}
        ) + "\n"
        code = 3
    sys.stdout.write(text)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
