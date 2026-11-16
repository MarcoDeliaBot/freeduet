"""office-convert: two fixed jobs for LibreOffice in the member's computer, and nothing else.

    office-convert recalc <file.xlsx>   writes <name>.recalculated.xlsx next to the file, with every formula
                                        calculated and its value stored; the source is never touched
    office-convert pdf <file>           writes <name>.pdf next to a .docx, .xlsx or .pptx

How a hostile file is kept from doing anything (docs/design/office-files.md, section 12):
  * `office-inspect` runs first, and whatever it refuses (macros, old binary formats, passwords, polyglots,
    zip bombs, bad paths) is refused here with its sentence; LibreOffice never sees that file.
  * a link, a symbolic link anywhere in the path, a file over 25 MiB, or a type other than the three is refused.
  * LibreOffice starts on a profile directory made for this one call and deleted after it. The profile is
    written here: macro security at its highest level (3), macro execution disabled, active content (OLE, DDE)
    disabled, links never updated in Calc and Writer, a forced recalculation after load of an .xlsx, and a
    proxy that points at a closed local port, so a request for an address that gets past the other settings
    fails at once. This is configuration, not a sandbox: no network namespace is made.
  * LibreOffice works on a COPY in the throwaway directory, with a stripped environment.
  * a hard timeout of 100 seconds (the member's command stops at about 120), then the whole process group is killed.

  * the file is copied ONCE, through one open that never follows a link, into the throwaway folder; that copy is the
    one inspected and the one LibreOffice gets, so a file swapped after the copy is never read.
  * the result is created with O_CREAT|O_EXCL|O_NOFOLLOW next to the source: an existing file or link of any kind
    there is never replaced or followed, and nothing is renamed over anything.
  * recalc refuses a workbook that uses a function LibreOffice 24.2 cannot calculate (it would rewrite it in the saved
    copy), and reports any error value the recalculation produced that the source did not already hold.

The recalculated copy is for READING the values. It was saved again by LibreOffice, so formatting and features may differ;
the file to hand over is the original.

Exit status: 0 done, 2 bad use or an error, 3 refused (the sentence says why), 4 timed out, 5 recalculated, but with
error values in the result (the JSON lists them).
"""

import ctypes
import errno
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import zipfile
import xml.etree.ElementTree as ET

TIMEOUT_SECONDS = 100
MAX_INPUT_BYTES = 25 * 1024 * 1024
MAX_OUTPUT_BYTES = 200 * 1024 * 1024
INSPECTOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "office-inspect", "office_inspect.py")
USAGE = "usage: office-convert recalc <file.xlsx> | office-convert pdf <file.docx|.xlsx|.pptx>\n"
KINDS = ("docx", "xlsx", "pptx")

# Functions LibreOffice 24.2 does not calculate (they arrived in later releases or never): a workbook that uses one is
# refused by recalc, because LibreOffice would write something else in its place in the saved copy.
UNSUPPORTED_FUNCTIONS = frozenset(
    "XLOOKUP XMATCH LET LAMBDA FILTER SORT SORTBY UNIQUE SEQUENCE RANDARRAY TEXTSPLIT TEXTBEFORE TEXTAFTER TAKE DROP "
    "VSTACK HSTACK TOCOL TOROW WRAPCOLS WRAPROWS CHOOSECOLS CHOOSEROWS EXPAND MAP REDUCE SCAN BYROW BYCOL MAKEARRAY "
    "ISOMITTED GROUPBY PIVOTBY ARRAYTOTEXT VALUETOTEXT IMAGE REGEXTEST REGEXEXTRACT REGEXREPLACE TRIMRANGE "
    "STOCKHISTORY COPILOT".split()
)
FUNCTION_CALL = re.compile(r"(?<![A-Za-z0-9_.])(?:_x[a-z]+\.)*([A-Za-z][A-Za-z0-9.]*)\(")
FORMULA = re.compile(rb"<f\b[^>]*?(?:/>|>(.*?)</f>)", re.S)
CELL = re.compile(rb"<c\s([^>]*?)(?:/>|>(.*?)</c>)", re.S)
CHUNK = 4 * 1024 * 1024
MAX_LISTED = 10

XCU = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetProxyType" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPProxyName" oor:op="fuse"><value>127.0.0.1</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPProxyPort" oor:op="fuse"><value>9</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPSProxyName" oor:op="fuse"><value>127.0.0.1</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPSProxyPort" oor:op="fuse"><value>9</value></prop></item>
</oor:items>
"""


class Stop(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def say(payload):
    sys.stdout.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def clean(text, limit=300):
    text = "".join(ch if ch.isprintable() else " " for ch in str(text))
    return text[:limit]


def become_reaper():
    """Make this process the parent of any LibreOffice helper that outlives its launcher (Linux), so that what is
    killed can be waited for here and no defunct process is left behind when init does not reap."""
    try:
        ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0)  # PR_SET_CHILD_SUBREAPER
    except Exception:
        pass


def reap_children(seconds=5):
    """Wait for every child and grandchild that was killed, until none is left or the time is up."""
    deadline = time.time() + seconds
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        except OSError:
            return
        if pid == 0:
            if time.time() > deadline:
                return
            time.sleep(0.02)


def kill_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        process.wait(timeout=5)
    except Exception:
        pass
    reap_children()


def check_path(path):
    """Lexical checks that need no open: a link in the path, a name that is not a plain file."""
    absolute = os.path.abspath(path)
    try:
        os.lstat(absolute)
    except OSError as error:
        raise Stop(f"Cannot read the file: {clean(error)}", 2)
    if os.path.realpath(absolute) != absolute or os.path.islink(absolute):
        raise Stop("A symbolic link is in this path. It was not opened; give the real file.", 3)
    return absolute


def copy_once(absolute, destination):
    """Copy the source into the throwaway folder through ONE open that never follows a link, checking the size on
    that same descriptor. Everything after this reads the copy, never the original."""
    try:
        fd = os.open(absolute, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, "O_CLOEXEC", 0))
    except OSError as error:
        if error.errno == errno.ELOOP:
            raise Stop("A symbolic link is in this path. It was not opened; give the real file.", 3)
        raise Stop(f"Cannot read the file: {clean(error)}", 2)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise Stop("This is not a regular file.", 3)
        if info.st_size > MAX_INPUT_BYTES:
            raise Stop(f"The file is {info.st_size} bytes, over the {MAX_INPUT_BYTES // (1024 * 1024)} MiB limit. It was not opened.", 3)
        if info.st_size == 0:
            raise Stop("The file is empty.", 3)
        total = 0
        with open(destination, "xb") as out:
            while True:
                block = os.read(fd, 1024 * 1024)
                if not block:
                    break
                total += len(block)
                if total > MAX_INPUT_BYTES:
                    raise Stop(f"The file is over the {MAX_INPUT_BYTES // (1024 * 1024)} MiB limit. It was not opened.", 3)
                out.write(block)
        return total
    finally:
        os.close(fd)


def inspect_first(path):
    """Run office-inspect on the copy; return its JSON, or stop with its sentence when it refuses."""
    try:
        done = subprocess.run(
            [sys.executable, "-I", INSPECTOR, path], capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Stop(f"The inspector could not run ({clean(error)}). Nothing was converted.", 2)
    try:
        report = json.loads(done.stdout)
    except ValueError:
        raise Stop("The inspector gave no report. Nothing was converted. " + clean(done.stderr), 2)
    if done.returncode == 3 or report.get("refused"):
        raise Stop("Refused by the inspector, before LibreOffice: " + clean(report.get("reason", "no reason given"), 600), 3)
    if done.returncode != 0:
        raise Stop("The inspector failed. Nothing was converted. " + clean(done.stderr), 2)
    return report


# ---- reading a workbook's parts (stdlib only) ------------------------------------------------------------------


def sheet_parts(zf):
    """[(sheet name, part name)] in workbook order, from workbook.xml and its relationships."""
    try:
        book = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    except (KeyError, ET.ParseError):
        return []
    targets = {r.get("Id"): r.get("Target") or "" for r in rels}
    found = []
    for element in book.iter():
        if element.tag.rsplit("}", 1)[-1] != "sheet":
            continue
        rid = next((v for k, v in element.attrib.items() if k.rsplit("}", 1)[-1] == "id"), None)
        target = targets.get(rid, "")
        part = target.lstrip("/") if target.startswith("/") else "xl/" + target
        found.append((element.get("name") or "?", os.path.normpath(part).replace("\\", "/")))
    return found


def stream(zf, part, pattern, keep):
    """Yield the matches of `pattern` in a part read in chunks. `keep` is the marker the unfinished tail starts at."""
    buffer = b""
    with zf.open(part) as handle:
        while True:
            chunk = handle.read(CHUNK)
            buffer += chunk
            end = 0
            for match in pattern.finditer(buffer):
                yield match
                end = match.end()
            if not chunk:
                return
            tail = buffer[end:]
            cut = tail.rfind(keep)
            buffer = tail[cut:] if cut >= 0 else b""


def attribute(attrs, name):
    found = re.search(rb"(?<![A-Za-z:])" + name + rb'="([^"]*)"', attrs)
    return found.group(1).decode("utf-8", "replace") if found else ""


def unsupported_in(path):
    """Names of the functions LibreOffice 24.2 cannot calculate that a workbook uses, and whether it has dynamic arrays."""
    names = set()
    dynamic = False
    with zipfile.ZipFile(path) as zf:
        if "xl/metadata.xml" in zf.namelist() and b"XLDAPR" in zf.read("xl/metadata.xml")[:2_000_000]:
            dynamic = True
        for _, part in sheet_parts(zf):
            if part not in zf.namelist():
                continue
            for match in stream(zf, part, FORMULA, b"<f"):
                text = (match.group(1) or b"").decode("utf-8", "replace")
                text = re.sub(r'"[^"]*"', '""', text.replace("&quot;", '"'))
                for call in FUNCTION_CALL.finditer(text):
                    if call.group(1).upper() in UNSUPPORTED_FUNCTIONS:
                        names.add(call.group(1).upper())
            for _ in stream(zf, part, re.compile(rb'<c\s[^>]*\bcm="'), b"<c"):
                dynamic = True
                break
    return sorted(names), dynamic


def error_cells(path):
    """{(sheet, cell): value} for every cell that holds an error value (t="e") or an Err:nnn result."""
    found = {}
    with zipfile.ZipFile(path) as zf:
        for name, part in sheet_parts(zf):
            if part not in zf.namelist():
                continue
            for match in stream(zf, part, CELL, b"<c"):
                attrs, body = match.group(1), match.group(2) or b""
                value = re.search(rb"<v>(.*?)</v>", body, re.S)
                text = value.group(1).decode("utf-8", "replace") if value else ""
                kind = attribute(attrs, b"t")
                if kind == "e" or (kind == "str" and text.startswith("Err:")):
                    found[(name, attribute(attrs, b"r"))] = clean(text, 20)
    return found


def new_errors(source_copy, result):
    """The error values in the recalculated file that the source did not already hold as errors."""
    before = error_cells(source_copy)
    fresh = [(key, value) for key, value in error_cells(result).items() if key not in before]
    return fresh


# ---- running LibreOffice -----------------------------------------------------------------------------------


def run_soffice(soffice, work, source, target_format, outdir):
    profile = os.path.join(work, "profile")
    os.makedirs(os.path.join(profile, "user"))
    with open(os.path.join(profile, "user", "registrymodifications.xcu"), "w", encoding="utf-8") as handle:
        handle.write(XCU)
    environment = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": work,
        "TMPDIR": work,
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "SAL_USE_VCLPLUGIN": "svp",
    }
    command = [
        soffice,
        "-env:UserInstallation=file://" + profile,
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--nolockcheck",
        "--convert-to",
        target_format,
        "--outdir",
        outdir,
        source,
    ]
    process = subprocess.Popen(
        command, cwd=work, env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, text=True,
    )
    try:
        out, err = process.communicate(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        kill_group(process)
        raise Stop(
            f"LibreOffice did not finish in {TIMEOUT_SECONDS} seconds and was stopped. "
            "The file is too large or too complex for one command; split it, or ask the person for a smaller one.",
            4,
        )
    finally:
        kill_group(process)
    if process.returncode != 0:
        raise Stop("LibreOffice failed: " + clean((err or out).strip()[-300:] or f"exit {process.returncode}"), 2)


def write_new(produced, destination):
    """Create the destination for the first time, or refuse. O_EXCL means an existing file, folder or link (even a
    dangling one) is never replaced and never followed; there is no staging name and no rename."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
    try:
        fd = os.open(destination, flags, 0o644)
    except FileExistsError:
        raise Stop(f"{os.path.basename(destination)} already exists next to the file. Nothing was replaced; move or rename it.", 3)
    except OSError as error:
        raise Stop(f"Cannot create {clean(os.path.basename(destination), 80)}: {clean(error)}", 2)
    try:
        with open(produced, "rb") as source, os.fdopen(fd, "wb") as target:
            shutil.copyfileobj(source, target, 1024 * 1024)
    except BaseException:
        try:
            os.unlink(destination)  # ours: it was created by the O_EXCL open above
        except OSError:
            pass
        raise


def convert(mode, path):
    absolute = check_path(path)
    folder, name = os.path.split(absolute)
    stem, ext = os.path.splitext(name)
    if mode == "recalc":
        destination = os.path.join(folder, stem + ".recalculated.xlsx")
        target_format, produced_name, magic = "xlsx:Calc MS Excel 2007 XML", "work.xlsx", b"PK"
    else:
        destination = os.path.join(folder, stem + ".pdf")
        target_format, produced_name, magic = "pdf", "work.pdf", b"%PDF-"
    work = tempfile.mkdtemp(prefix="office-convert-")
    try:
        os.chmod(work, 0o700)
        outdir = os.path.join(work, "out")
        os.makedirs(outdir)
        source = os.path.join(work, "work" + ext.lower())
        copy_once(absolute, source)
        report = inspect_first(source)
        kind = report.get("detected_type")
        if mode == "recalc" and kind != "xlsx":
            raise Stop(f"recalc takes an .xlsx; this is a {kind} file.", 3)
        if mode == "pdf" and kind not in KINDS:
            raise Stop(f"pdf takes a .docx, .xlsx or .pptx; this is a {kind} file.", 3)
        if os.path.lexists(destination):
            raise Stop(f"{os.path.basename(destination)} already exists next to the file. Nothing was replaced; move or rename it.", 3)
        extra = {}
        if mode == "recalc":
            names, dynamic = unsupported_in(source)
            if names or dynamic:
                what = ", ".join(names) + ("; " if names and dynamic else "") + ("dynamic arrays" if dynamic else "")
                raise Stop(
                    "recalc refused: this workbook uses what LibreOffice 24.2 cannot calculate (" + what + "), and LibreOffice "
                    "would rewrite it in the saved copy. Check the totals with your own Python figures instead and say so.",
                    3,
                )
            links = report.get("external_links") or {}
            if links.get("workbook_external_link_parts") or links.get("data_connections") or links.get("other_external_targets"):
                extra["external_links_not_refreshed"] = (
                    "This workbook has links to other workbooks or data connections. Values that come from them are NOT "
                    "refreshed: they are the stale values stored in the file."
                )
        soffice = shutil.which("soffice")
        if not soffice:
            raise Stop("LibreOffice (soffice) is not installed in this computer.", 2)
        run_soffice(soffice, work, source, target_format, outdir)
        produced = os.path.join(outdir, produced_name)
        if not os.path.isfile(produced) or os.path.getsize(produced) == 0:
            raise Stop("LibreOffice finished but wrote no file. The file may be damaged.", 2)
        if os.path.getsize(produced) > MAX_OUTPUT_BYTES:
            raise Stop("The result is over the size limit and was not kept.", 3)
        with open(produced, "rb") as handle:
            if not handle.read(len(magic)).startswith(magic):
                raise Stop("LibreOffice wrote something that is not the expected kind of file.", 2)
        if mode == "recalc":
            try:
                fresh = new_errors(source, produced)
            except (zipfile.BadZipFile, OSError, ET.ParseError) as error:
                raise Stop("The recalculated file could not be read back: " + clean(error), 2)
            if fresh:
                extra["errors"] = {
                    "count": len(fresh),
                    "first": [f"{sheet}!{cell} {value}" for (sheet, cell), value in fresh[:MAX_LISTED]],
                    "note": "These cells hold an error value after the recalculation and did not before. Fix the formulas in the original.",
                }
            extra["note"] = (
                "Read the values from this copy; do not hand it over. LibreOffice saved it again, so formatting and features "
                "may differ. The file to hand over is the original."
            )
        write_new(produced, destination)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    result = {"ok": True, "mode": mode, "source": name, "output": os.path.basename(destination), "output_path": destination,
              "size_bytes": os.path.getsize(destination)}
    result.update(extra)
    if "errors" in extra:
        result["recalculated_with_errors"] = True
    return result


def main(argv):
    if len(argv) == 2 and argv[1] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    if len(argv) != 3 or argv[1] not in ("recalc", "pdf"):
        sys.stderr.write(USAGE)
        return 2
    become_reaper()
    try:
        result = convert(argv[1], argv[2])
        say(result)
        return 5 if result.get("recalculated_with_errors") else 0
    except Stop as stop:
        say({"ok": False, "refused": stop.code == 3, "timed_out": stop.code == 4, "reason": str(stop)})
        return stop.code
    except OSError as error:
        say({"ok": False, "refused": False, "timed_out": False, "reason": "Could not finish: " + clean(error)})
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
