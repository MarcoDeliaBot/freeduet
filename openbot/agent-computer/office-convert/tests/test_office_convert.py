"""Tests for office-convert. Every file is generated here from the standard library. LibreOffice is not needed:
a stub `soffice` records how it was called and writes a small result, so what the wrapper refuses, what it passes
to LibreOffice and how it stops one are tested alone. The tests that need the real program are skipped without it
(the Dockerfile's build check runs a real conversion)."""

import hashlib
import importlib.util
import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parent.parent / "office_convert.py"
spec = importlib.util.spec_from_file_location("office_convert", TOOL)
oc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oc)

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def ct(main):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        f'<Override PartName="/x" ContentType="{main}"/></Types>'
    )


DOCX_CT = ct("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")
XLSX_CT = ct("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")


def zipped(path, parts):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in parts.items():
            zf.writestr(name, data)
    return path


def docx_parts(extra=None):
    parts = {
        "[Content_Types].xml": DOCX_CT,
        "word/document.xml": f'<?xml version="1.0"?><w:document xmlns:w="{W}"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>',
    }
    parts.update(extra or {})
    return parts


def xlsx_parts(extra=None):
    parts = {
        "[Content_Types].xml": XLSX_CT,
        "xl/workbook.xml": f'<?xml version="1.0"?><workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": f'<?xml version="1.0"?><Relationships xmlns="{PKG_REL}"><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0"?><worksheet xmlns="{S}"><dimension ref="A1:B1"/><sheetData><row r="1"><c r="A1"><f>1+1</f></c></row></sheetData></worksheet>',
    }
    parts.update(extra or {})
    return parts


STUB = """#!{python}
import hashlib, json, os, subprocess, sys, time, zipfile
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
profile = [a for a in args if a.startswith("-env:UserInstallation=file://")][0].split("file://", 1)[1]
xcu = open(os.path.join(profile, "user", "registrymodifications.xcu"), encoding="utf-8").read()
outdir = args[args.index("--outdir") + 1]
source = args[-1]
fmt = args[args.index("--convert-to") + 1]
with open(os.path.join(here, "calls.jsonl"), "a", encoding="utf-8") as log:
    log.write(json.dumps({{"args": args, "xcu": xcu, "env": dict(os.environ), "cwd": os.getcwd(), "pid": os.getpid(),
                          "source_exists": os.path.exists(source), "profile": profile,
                          "source_sha": hashlib.sha256(open(source, "rb").read()).hexdigest()}}) + "\\n")
mode = open(os.path.join(here, "behavior")).read().strip() if os.path.exists(os.path.join(here, "behavior")) else "ok"
stem = os.path.splitext(os.path.basename(source))[0]
if mode == "sleep":
    open(os.path.join(here, "pid"), "w").write(str(os.getpid()))
    time.sleep(60)
if mode == "orphan":
    child = subprocess.Popen(["sleep", "60"])
    open(os.path.join(here, "grandchild"), "w").write(str(child.pid))
    time.sleep(60)
if mode == "fail":
    sys.stderr.write("boom: cannot load\\n"); sys.exit(1)
if mode == "nooutput":
    sys.exit(0)
if fmt.startswith("pdf"):
    open(os.path.join(outdir, stem + ".pdf"), "wb").write(b"%PDF-1.4\\n" if mode != "garbage" else b"not a pdf")
elif mode == "errors":
    S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    cells = "".join(f'<c r="B{{i}}" t="e"><f>BAD({{i}})</f><v>#NAME?</v></c>' for i in range(1, 13))
    cells += '<c r="C1" t="str"><f>X()</f><v>Err:508</v></c><c r="D1"><v>5</v></c>'
    with zipfile.ZipFile(os.path.join(outdir, stem + ".xlsx"), "w") as z:
        z.writestr("xl/workbook.xml", f'<workbook xmlns="{{S}}" xmlns:r="{{R}}"><sheets><sheet name="Totals" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{{S}}"><sheetData><row r="1">{{cells}}</row></sheetData></worksheet>')
else:
    S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    count = 700 if mode == "many" else 2
    cells = "".join(f'<c r="A{{i}}"><f>SUM(1,{{i}})</f><v>{{i + 1}}</v></c>' for i in range(1, count + 1))
    cells += '<c r="B1" t="str"><f>"a"&amp;"b"</f><v>ab</v></c><c r="C1"><v>5</v></c>'
    with zipfile.ZipFile(os.path.join(outdir, stem + ".xlsx"), "w") as z:
        z.writestr("xl/workbook.xml", f'<workbook xmlns="{{S}}" xmlns:r="{{R}}"><sheets><sheet name="Totals" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{{S}}"><sheetData><row r="1">{{cells}}</row></sheetData></worksheet>')
"""


@pytest.fixture
def stub(tmp_path, monkeypatch):
    bin_dir = tmp_path / "stubbin"
    bin_dir.mkdir()
    soffice = bin_dir / "soffice"
    soffice.write_text(STUB.format(python=sys.executable))
    soffice.chmod(soffice.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    class Stub:
        dir = bin_dir

        def calls(self):
            log = bin_dir / "calls.jsonl"
            return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

        def behave(self, mode):
            (bin_dir / "behavior").write_text(mode)

    return Stub()


@pytest.fixture
def work(tmp_path):
    folder = tmp_path / "ws"
    folder.mkdir()
    return folder


def run(*args):
    done = subprocess.run([sys.executable, "-I", str(TOOL), *map(str, args)], capture_output=True, text=True, timeout=120)
    try:
        out = json.loads(done.stdout) if done.stdout.strip().startswith("{") else done.stdout
    except ValueError:
        out = done.stdout
    return done.returncode, out, done.stderr


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ---- use ----------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("args", [[], ["recalc"], ["pdf"], ["convert", "x.xlsx"], ["recalc", "a.xlsx", "b.xlsx"], ["--outdir", "x", "y"]])
def test_only_the_two_fixed_modes_with_one_file_are_accepted(args, stub):
    code, _, err = run(*args)
    assert code == 2 and "usage: office-convert" in err
    assert stub.calls() == []


def test_help_prints_the_usage_and_exits_zero(stub):
    code, out, _ = run("--help")
    assert code == 0 and "recalc" in out and "pdf" in out


# ---- what is refused before LibreOffice sees the file -----------------------------------------------------

def test_a_macro_file_is_refused_by_the_inspector_and_libreoffice_never_starts(work, stub):
    f = zipped(work / "m.xlsx", xlsx_parts({"xl/vbaProject.bin": b"\x00\x01"}))
    for mode in ("recalc", "pdf"):
        code, out, _ = run(mode, f)
        assert code == 3 and out["refused"] is True
        assert out["reason"].startswith("Refused by the inspector") and "macros" in out["reason"]
    assert stub.calls() == []
    assert sorted(p.name for p in work.iterdir()) == ["m.xlsx"]


@pytest.mark.parametrize("name", ["m.docm", "m.xlsm"])
def test_macro_extensions_are_refused(work, stub, name):
    f = work / name
    f.write_bytes(zipped(work / "tmp.zip", docx_parts()).read_bytes())
    code, out, _ = run("pdf", f)
    assert code == 3 and "Refused by the inspector" in out["reason"]
    assert stub.calls() == []


def test_an_old_binary_format_and_a_password_protected_package_are_refused(work, stub):
    legacy = work / "old.xls"
    legacy.write_bytes(bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 600)
    code, out, _ = run("recalc", legacy)
    assert code == 3 and "old binary" in out["reason"]
    # A password-protected OOXML file is an OLE container too: refused the same way, never opened.
    protected = work / "locked.xlsx"
    protected.write_bytes(bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 600)
    code, out, _ = run("recalc", protected)
    assert code == 3
    assert stub.calls() == []


def test_a_zip_bomb_is_refused(work, stub):
    f = zipped(work / "bomb.docx", docx_parts({"word/media/zeros.bin": b"\x00" * (5 * 1024 * 1024)}))
    code, out, _ = run("pdf", f)
    assert code == 3 and "Refused by the inspector" in out["reason"]
    assert stub.calls() == []


def test_a_polyglot_pdf_zip_is_refused(work, stub):
    f = work / "poly.docx"
    f.write_bytes(b"%PDF-1.4\n% polyglot\n" + zipped(work / "z.zip", docx_parts({"word/vbaProject.bin": b"\x00"})).read_bytes())
    code, out, _ = run("pdf", f)
    assert code == 3
    assert stub.calls() == []


def test_a_pdf_is_not_converted_to_a_pdf_and_a_docx_is_not_recalculated(work, stub):
    docx = zipped(work / "a.docx", docx_parts())
    code, out, _ = run("recalc", docx)
    assert code == 3 and "recalc takes an .xlsx" in out["reason"]
    pdf = work / "a.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF\n")
    code, out, _ = run("pdf", pdf)
    assert code == 3 and "pdf takes" in out["reason"]
    assert stub.calls() == []


def test_a_symbolic_link_is_refused_whether_it_is_the_file_or_a_folder_in_the_path(work, stub, tmp_path):
    real = zipped(work / "real.docx", docx_parts())
    (work / "link.docx").symlink_to(real)
    code, out, _ = run("pdf", work / "link.docx")
    assert code == 3 and "symbolic link" in out["reason"]
    other = tmp_path / "other"
    other.mkdir()
    zipped(other / "in.docx", docx_parts())
    (work / "dir").symlink_to(other)
    code, out, _ = run("pdf", work / "dir" / "in.docx")
    assert code == 3 and "symbolic link" in out["reason"]
    assert stub.calls() == []
    assert not (other / "in.pdf").exists()


def test_a_file_over_the_size_limit_is_refused_without_being_read(work, stub):
    big = work / "big.xlsx"
    with open(big, "wb") as handle:
        handle.truncate(oc.MAX_INPUT_BYTES + 1)
    code, out, _ = run("recalc", big)
    assert code == 3 and "limit" in out["reason"]
    assert stub.calls() == []


def test_an_empty_file_and_a_missing_file_stop_cleanly(work, stub):
    (work / "e.xlsx").write_bytes(b"")
    assert run("recalc", work / "e.xlsx")[0] == 3
    code, out, _ = run("recalc", work / "nope.xlsx")
    assert code == 2 and out["ok"] is False
    assert stub.calls() == []


# ---- how LibreOffice is called -------------------------------------------------------------------------------

def test_recalc_writes_a_new_file_next_to_the_source_and_never_touches_the_source(work, stub):
    f = zipped(work / "totals.xlsx", xlsx_parts())
    before = sha(f)
    code, out, _ = run("recalc", "--keep", f)
    assert code == 0 and out["ok"] is True
    assert out["output"] == "totals.recalculated.xlsx"
    assert (work / "totals.recalculated.xlsx").read_bytes()[:2] == b"PK"
    assert sha(f) == before
    assert sorted(p.name for p in work.iterdir()) == ["totals.recalculated.xlsx", "totals.xlsx"]


def test_pdf_writes_the_pdf_next_to_the_source(work, stub):
    for name, parts in (("letter.docx", docx_parts()), ("sheet.xlsx", xlsx_parts())):
        f = zipped(work / name, parts)
        before = sha(f)
        code, out, _ = run("pdf", f)
        assert code == 0 and out["output"] == Path(name).stem + ".pdf"
        assert (work / out["output"]).read_bytes().startswith(b"%PDF-")
        assert sha(f) == before


def test_libreoffice_gets_a_throwaway_profile_a_copy_and_a_stripped_environment(work, stub, monkeypatch):
    monkeypatch.setenv("PYTHONPATH", "/should/not/pass")
    monkeypatch.setenv("SECRET_TOKEN", "do-not-pass-this")
    f = zipped(work / "totals.xlsx", xlsx_parts())
    assert run("recalc", f)[0] == 0
    (call,) = stub.calls()
    args = call["args"]
    for flag in ("--headless", "--invisible", "--nologo", "--norestore", "--nolockcheck", "--convert-to", "--outdir"):
        assert flag in args
    assert any(a.startswith("-env:UserInstallation=file:///") and "office-convert-" in a for a in args)
    assert args[-1] != str(f) and str(work) not in args[-1]  # a copy in the throwaway folder, not the source
    assert call["source_exists"] is True
    assert "SECRET_TOKEN" not in call["env"] and "PYTHONPATH" not in call["env"]
    assert call["env"]["HOME"].startswith(os.path.dirname(call["profile"]))
    assert not os.path.exists(os.path.dirname(call["profile"]))  # deleted after the call
    assert not list(work.glob(".~lock*"))


def test_the_profile_sets_the_safe_settings(work, stub):
    f = zipped(work / "a.docx", docx_parts())
    assert run("pdf", f)[0] == 0
    xcu = stub.calls()[0]["xcu"]
    for expected in (
        'oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value>',
        'oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value>',
        'oor:name="DisableActiveContent" oor:op="fuse"><value>true</value>',
        "org.openoffice.Office.Calc/Content/Update",
        "org.openoffice.Office.Writer/Content/Update",
        'oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value>',
        'oor:name="ooInetHTTPProxyPort" oor:op="fuse"><value>9</value>',
    ):
        assert expected in xcu


def test_two_calls_use_two_different_profiles(work, stub):
    first = zipped(work / "a.docx", docx_parts())
    second = zipped(work / "b.docx", docx_parts())
    run("pdf", first)
    run("pdf", second)
    one, two = stub.calls()
    assert one["profile"] != two["profile"]


# ---- the result is only ever created, never replaced and never reached through a link ----------------------------

def test_an_existing_output_of_any_kind_is_never_replaced(work, stub, tmp_path):
    f = zipped(work / "a.docx", docx_parts())
    (work / "a.pdf").write_bytes(b"old")
    code, out, _ = run("pdf", f)
    assert code == 3 and "a.pdf already exists" in out["reason"]
    assert (work / "a.pdf").read_bytes() == b"old"
    (work / "a.pdf").unlink()
    target = tmp_path / "victim.txt"
    target.write_text("keep")
    (work / "a.pdf").symlink_to(target)
    assert run("pdf", f)[0] == 3 and target.read_text() == "keep"
    (work / "a.pdf").unlink()
    (work / "a.pdf").symlink_to(tmp_path / "does-not-exist")  # a dangling link is also refused
    assert run("pdf", f)[0] == 3 and not (tmp_path / "does-not-exist").exists()
    (work / "a.pdf").unlink()
    (work / "a.pdf").mkdir()
    assert run("pdf", f)[0] == 3
    (work / "a.pdf").rmdir()
    assert run("pdf", f)[0] == 0 and (work / "a.pdf").read_bytes().startswith(b"%PDF-")


def test_a_second_pdf_of_the_same_stem_is_refused_not_numbered(work, stub):
    zipped(work / "report.docx", docx_parts())
    zipped(work / "report.xlsx", xlsx_parts())
    assert run("pdf", work / "report.docx")[0] == 0
    first = (work / "report.pdf").read_bytes()
    code, out, _ = run("pdf", work / "report.xlsx")
    assert code == 3 and "report.pdf already exists" in out["reason"]
    assert (work / "report.pdf").read_bytes() == first
    assert sorted(p.name for p in work.iterdir()) == ["report.docx", "report.pdf", "report.xlsx"]


@pytest.mark.parametrize("mode,source,suffix", [("pdf", "report.docx", ".pdf.part"), ("recalc", "report.xlsx", ".recalculated.xlsx.part")])
def test_a_planted_part_link_does_not_overwrite_anything(work, stub, mode, source, suffix):
    """The reviewer's repro: a link named <output>.part pointing at a file the member must not lose."""
    victim = work / "victim.txt"
    victim.write_text("PRECIOUS\n")
    stem = source.rsplit(".", 1)[0]
    (work / (stem + suffix)).symlink_to("victim.txt")
    zipped(work / source, docx_parts() if mode == "pdf" else xlsx_parts())
    code, out, _ = run(*([mode, "--keep"] if mode == "recalc" else [mode]), work / source)
    assert code == 0, out
    assert victim.read_text() == "PRECIOUS\n"
    output = work / out["output"]
    assert output.is_file() and not output.is_symlink()


def test_a_name_too_long_for_the_result_is_a_clean_refusal(work, stub):
    f = zipped(work / (("a" * 240) + ".xlsx"), xlsx_parts())
    code, out, err = run("recalc", "--keep", f)
    assert code == 2 and out["ok"] is False and "Cannot" in out["reason"]
    assert "Traceback" not in err
    assert [p.name for p in work.iterdir()] == [f.name]


def test_the_source_is_copied_once_and_a_swap_afterwards_never_reaches_libreoffice(work, stub, monkeypatch, capsys):
    f = zipped(work / "a.docx", docx_parts())
    original = sha(f)
    real = oc.inspect_first

    def swapping(path, **kw):
        report = real(path, **kw)
        zipped(f, docx_parts({"word/media/swapped.bin": b"EVIL"}))  # the original changes after the copy
        return report

    monkeypatch.setattr(oc, "inspect_first", swapping)
    assert oc.main(["office-convert", "pdf", str(f)]) == 0
    assert sha(f) != original  # the swap happened
    (call,) = stub.calls()
    assert call["source_sha"] == original


def test_the_inspector_sees_the_copy_and_not_the_original(work, stub, monkeypatch, capsys):
    f = zipped(work / "a.docx", docx_parts())
    seen = []
    real = oc.inspect_first
    monkeypatch.setattr(oc, "inspect_first", lambda path, **kw: (seen.append(path), real(path, **kw))[1])
    assert oc.main(["office-convert", "pdf", str(f)]) == 0
    assert seen and seen[0] != str(f) and "office-convert-" in seen[0]


# ---- recalc says what it found ----------------------------------------------------------------------------------

def sheet_with(formulas, extra_attrs=""):
    cells = "".join(f'<c r="A{i}"><f>{f}</f></c>' for i, f in enumerate(formulas, 1))
    return f'<?xml version="1.0"?><worksheet xmlns="{S}"><dimension ref="A1:A9"/><sheetData><row r="1">{cells}</row></sheetData></worksheet>'


@pytest.mark.parametrize(
    "formula,named",
    [
        ("XLOOKUP(1,B1:B3,C1:C3)", "XLOOKUP"),
        ("_xlfn.XLOOKUP(1,B1:B3,C1:C3)", "XLOOKUP"),
        ("_xlfn._xlws.FILTER(A1:A9,A1:A9&gt;1)", "FILTER"),
        ("SUM(_xlfn.UNIQUE(A1:A9))", "UNIQUE"),
        ("_xlfn.LET(x,1,x+1)", "LET"),
        ("SEQUENCE(5)+TEXTSPLIT(&quot;a,b&quot;,&quot;,&quot;)", "SEQUENCE"),
    ],
)
def test_recalc_refuses_functions_libreoffice_24_2_cannot_calculate(work, stub, formula, named):
    f = zipped(work / "w.xlsx", xlsx_parts({"xl/worksheets/sheet1.xml": sheet_with([formula])}))
    code, out, _ = run("recalc", f)
    assert code == 3 and named in out["reason"] and "rewrite" in out["reason"]
    assert stub.calls() == []
    assert sorted(p.name for p in work.iterdir()) == ["w.xlsx"]


def test_recalc_refuses_dynamic_arrays(work, stub):
    cell = f'<?xml version="1.0"?><worksheet xmlns="{S}"><sheetData><row r="1"><c r="A1" cm="1"><f t="array" ref="A1:A3">SUM(B1:B3)</f></c></row></sheetData></worksheet>'
    f = zipped(work / "d.xlsx", xlsx_parts({"xl/worksheets/sheet1.xml": cell}))
    code, out, _ = run("recalc", f)
    assert code == 3 and "dynamic arrays" in out["reason"]
    assert stub.calls() == []


def test_a_function_name_inside_text_or_a_string_is_not_a_function(work, stub):
    sheet = (
        f'<?xml version="1.0"?><worksheet xmlns="{S}"><sheetData><row r="1">'
        '<c r="A1" t="inlineStr"><is><t>use XLOOKUP( here</t></is></c>'
        '<c r="A2"><f>IF(B1=&quot;XLOOKUP(&quot;,1,2)</f></c></row></sheetData></worksheet>'
    )
    f = zipped(work / "ok.xlsx", xlsx_parts({"xl/worksheets/sheet1.xml": sheet}))
    code, out, _ = run("recalc", f)
    assert code == 0, out


def test_recalc_reports_new_error_values_and_exits_with_its_own_status(work, stub):
    stub.behave("errors")
    f = zipped(work / "w.xlsx", xlsx_parts())
    code, out, _ = run("recalc", f)
    assert code == 5 and out["ok"] is True and out["recalculated_with_errors"] is True
    assert out["errors"]["count"] == 13  # twelve #NAME? and one Err:508
    assert len(out["errors"]["first"]) == 10 and out["errors"]["first"][0] == "Totals!B1 #NAME?"
    assert not (work / "w.recalculated.xlsx").exists()  # no file is kept by default


def test_an_error_the_source_already_cached_is_not_reported_as_new(work, stub):
    stub.behave("errors")
    cached = "".join(f'<c r="B{i}" t="e"><f>BAD({i})</f><v>#NAME?</v></c>' for i in range(1, 13))
    cached += '<c r="C1" t="str"><f>X()</f><v>Err:508</v></c>'
    sheet = f'<?xml version="1.0"?><worksheet xmlns="{S}"><sheetData><row r="1">{cached}</row></sheetData></worksheet>'
    book = f'<?xml version="1.0"?><workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="Totals" sheetId="1" r:id="rId1"/></sheets></workbook>'
    f = zipped(work / "w.xlsx", xlsx_parts({"xl/worksheets/sheet1.xml": sheet, "xl/workbook.xml": book}))
    code, out, _ = run("recalc", f)
    assert code == 0 and "errors" not in out


def test_a_clean_recalc_has_no_errors_key_and_says_the_copy_is_for_reading(work, stub):
    f = zipped(work / "w.xlsx", xlsx_parts())
    code, out, _ = run("recalc", f)
    assert code == 0 and "errors" not in out
    assert "original" in out["note"] and "No file was kept" in out["note"] and out["kept"] is False
    assert out["formula_cells_total"] == 3 and out["truncated"] is False and out["error_cells_total"] == 0
    assert out["formula_cells"][0] == {"sheet": "Totals", "cell": "A1", "formula": "SUM(1,1)", "value": 2}
    assert out["formula_cells"][1] == {"sheet": "Totals", "cell": "A2", "formula": "SUM(1,2)", "value": 3}
    assert "output" not in out and sorted(p.name for p in work.iterdir()) == ["w.xlsx"]


def test_recalc_says_values_from_external_links_are_not_refreshed(work, stub):
    f = zipped(work / "l.xlsx", xlsx_parts({"xl/externalLinks/externalLink1.xml": f'<externalLink xmlns="{S}"/>'}))
    code, out, _ = run("recalc", f)
    assert code == 0 and "NOT refreshed" in out["external_links_not_refreshed"]
    g = zipped(work / "n.xlsx", xlsx_parts())
    assert "external_links_not_refreshed" not in run("recalc", g)[1]


# ---- when LibreOffice misbehaves ------------------------------------------------------------------------------

def test_a_missing_libreoffice_says_so(work, monkeypatch):
    monkeypatch.setenv("PATH", "/nonexistent")
    f = zipped(work / "a.docx", docx_parts())
    code, out, _ = run("pdf", f)
    assert code == 2 and "not installed" in out["reason"]


@pytest.mark.parametrize("mode,fragment", [("fail", "boom"), ("nooutput", "wrote no file"), ("garbage", "not the expected")])
def test_a_failing_libreoffice_is_reported_and_leaves_nothing_behind(work, stub, mode, fragment):
    stub.behave(mode)
    f = zipped(work / "a.docx", docx_parts())
    code, out, _ = run("pdf", f)
    assert code == 2 and fragment in out["reason"]
    assert sorted(p.name for p in work.iterdir()) == ["a.docx"]


def test_the_whole_call_is_under_the_commands_own_two_minutes():
    assert oc.TOTAL_SECONDS < 110 and oc.INSPECT_SECONDS + oc.RESERVE_SECONDS < oc.TOTAL_SECONDS


def test_a_stuck_libreoffice_is_killed_and_the_message_says_what_to_do(work, stub, monkeypatch, capsys):
    stub.behave("sleep")
    monkeypatch.setattr(oc, "TOTAL_SECONDS", 3)
    monkeypatch.setattr(oc, "RESERVE_SECONDS", 1)
    f = zipped(work / "a.docx", docx_parts())
    started = time.time()
    assert oc.main(["office-convert", "pdf", str(f)]) == 4
    assert time.time() - started < 20
    out = json.loads(capsys.readouterr().out)
    assert out["timed_out"] is True and "stopped" in out["reason"] and "smaller" in out["reason"]
    pid = int((stub.dir / "pid").read_text())
    time.sleep(0.3)
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
    assert sorted(p.name for p in work.iterdir()) == ["a.docx"]


# ---- recalc keeps no file by default; --keep and --replace ---------------------------------------------------------

def test_recalc_lists_formula_cells_capped_with_totals_and_a_truncated_flag(work, stub, monkeypatch, capsys):
    stub.behave("many")
    f = zipped(work / "w.xlsx", xlsx_parts())
    code, out, _ = run("recalc", f)
    assert code == 0
    assert len(out["formula_cells"]) == oc.MAX_FORMULA_CELLS_LISTED == 500
    assert out["formula_cells_total"] == 701 and out["truncated"] is True
    assert sorted(p.name for p in work.iterdir()) == ["w.xlsx"]
    monkeypatch.setattr(oc, "MAX_LISTED_BYTES", 1500)
    assert oc.main(["office-convert", "recalc", str(f)]) == 0
    small = json.loads(capsys.readouterr().out)
    assert 0 < len(small["formula_cells"]) < 30 and small["truncated"] is True and small["formula_cells_total"] == 701


def test_keep_writes_the_copy_and_a_second_keep_is_refused_without_replace(work, stub):
    f = zipped(work / "w.xlsx", xlsx_parts())
    assert run("recalc", "--keep", f)[0] == 0
    first = (work / "w.recalculated.xlsx").read_bytes()
    code, out, _ = run("recalc", "--keep", f)
    assert code == 3 and "w.recalculated.xlsx already exists" in out["reason"] and "--replace" in out["reason"]
    assert (work / "w.recalculated.xlsx").read_bytes() == first


def test_replace_swaps_in_a_regular_file_atomically_and_leaves_no_temporary_name(work, stub):
    f = zipped(work / "w.xlsx", xlsx_parts())
    (work / "w.recalculated.xlsx").write_bytes(b"old copy")
    before = os.stat(work / "w.recalculated.xlsx").st_ino
    code, out, _ = run("recalc", "--keep", "--replace", f)
    assert code == 0, out
    assert (work / "w.recalculated.xlsx").read_bytes()[:2] == b"PK"
    assert os.stat(work / "w.recalculated.xlsx").st_ino != before  # a new file renamed over, not written in place
    assert sorted(p.name for p in work.iterdir()) == ["w.recalculated.xlsx", "w.xlsx"]


def test_pdf_again_after_an_edit_needs_replace_and_replace_works(work, stub):
    f = zipped(work / "a.docx", docx_parts())
    assert run("pdf", f)[0] == 0
    assert run("pdf", f)[0] == 3
    zipped(f, docx_parts({"word/media/more.bin": b"edit"}))
    code, out, _ = run("pdf", "--replace", f)
    assert code == 0 and (work / "a.pdf").read_bytes().startswith(b"%PDF-")
    assert sorted(p.name for p in work.iterdir()) == ["a.docx", "a.pdf"]


def test_replace_never_replaces_a_link_a_folder_or_a_special_file(work, stub, tmp_path):
    f = zipped(work / "a.docx", docx_parts())
    victim = tmp_path / "victim.txt"
    victim.write_text("keep")
    (work / "a.pdf").symlink_to(victim)
    code, out, _ = run("pdf", "--replace", f)
    assert code == 3 and "regular file" in out["reason"] and victim.read_text() == "keep" and (work / "a.pdf").is_symlink()
    (work / "a.pdf").unlink()
    (work / "a.pdf").mkdir()
    assert run("pdf", "--replace", f)[0] == 3 and (work / "a.pdf").is_dir()
    (work / "a.pdf").rmdir()
    os.mkfifo(work / "a.pdf")
    assert run("pdf", "--replace", f)[0] == 3 and stat.S_ISFIFO(os.lstat(work / "a.pdf").st_mode)


@pytest.mark.parametrize(
    "args",
    [["recalc", "--replace", "x.xlsx"], ["pdf", "--keep", "x.docx"], ["recalc", "--keep", "--bogus", "x.xlsx"], ["pdf", "--replace"]],
)
def test_the_flags_are_checked(args, stub):
    code, _, err = run(*args)
    assert code == 2 and "usage: office-convert" in err and stub.calls() == []


# ---- the folder is opened once: a rename-and-link swap while LibreOffice runs changes nothing ------------------

@pytest.mark.parametrize("mode", ["pdf", "recalc"])
def test_the_result_lands_in_the_original_folder_even_if_it_is_swapped_for_a_link(work, stub, monkeypatch, mode):
    shared = work / "shared"
    shared.mkdir()
    elsewhere = work / "elsewhere"
    elsewhere.mkdir()
    name = "a.docx" if mode == "pdf" else "a.xlsx"
    zipped(shared / name, docx_parts() if mode == "pdf" else xlsx_parts())
    real = oc.run_soffice

    def swapping(*args, **kwargs):
        real(*args, **kwargs)
        os.rename(shared, work / "real")  # after LibreOffice ran, before the result is placed
        os.symlink(elsewhere, shared)

    monkeypatch.setattr(oc, "run_soffice", swapping)
    argv = ["office-convert", mode] + (["--keep"] if mode == "recalc" else []) + [str(shared / name)]
    assert oc.main(argv) == 0
    assert list(elsewhere.iterdir()) == []
    assert (work / "real" / ("a.pdf" if mode == "pdf" else "a.recalculated.xlsx")).is_file()


# ---- each guard alone ---------------------------------------------------------------------------------------------

def test_exclusive_creation_alone_stops_a_file_planted_between_the_last_check_and_the_create(work, stub, monkeypatch):
    f = zipped(work / "a.docx", docx_parts())
    real = oc.destination_state
    calls = []

    def planting(dirfd, destination):
        state = real(dirfd, destination)
        calls.append(state)
        if len(calls) == 2:  # the check inside place(), the last one before the create
            (work / "a.pdf").write_bytes(b"PRECIOUS")
        return state

    monkeypatch.setattr(oc, "destination_state", planting)
    assert oc.main(["office-convert", "pdf", str(f)]) == 3
    assert (work / "a.pdf").read_bytes() == b"PRECIOUS"


def test_the_single_copy_open_alone_refuses_a_link_swapped_in_after_the_path_check(work, stub, monkeypatch, capsys):
    f = zipped(work / "a.docx", docx_parts())
    secret = zipped(work / "secret.docx", docx_parts({"word/media/secret.bin": b"SECRET"}))
    real = oc.open_parent

    def swapping(path):
        result = real(path)
        os.unlink(f)
        os.symlink(secret, f)  # after the lexical check, before the one open
        return result

    monkeypatch.setattr(oc, "open_parent", swapping)
    assert oc.main(["office-convert", "pdf", str(f)]) == 3
    out = json.loads(capsys.readouterr().out)
    assert "symbolic link" in out["reason"]
    assert stub.calls() == []


# ---- one deadline for everything ------------------------------------------------------------------------------

def slow_inspector(tmp_path, seconds):
    script = tmp_path / "slow_inspector.py"
    script.write_text(
        "import os, sys, time\n"
        f"time.sleep({seconds})\n"
        f"os.execv(sys.executable, [sys.executable, '-I', {str(TOOL.parent.parent / 'office-inspect' / 'office_inspect.py')!r}, sys.argv[1]])\n"
    )
    return str(script)


def test_inspector_and_libreoffice_share_one_deadline(work, stub, monkeypatch, capsys, tmp_path):
    stub.behave("sleep")
    monkeypatch.setattr(oc, "TOTAL_SECONDS", 6)
    monkeypatch.setattr(oc, "RESERVE_SECONDS", 1)
    monkeypatch.setattr(oc, "INSPECT_SECONDS", 3)
    monkeypatch.setattr(oc, "INSPECTOR", slow_inspector(tmp_path, 2))  # takes most of its share, then passes
    f = zipped(work / "a.docx", docx_parts())
    started = time.time()
    assert oc.main(["office-convert", "pdf", str(f)]) == 4
    elapsed = time.time() - started
    assert elapsed < 6, elapsed  # the soffice budget was what the inspector left, not a fresh one


def test_a_hanging_inspector_is_stopped_within_its_share(work, stub, monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(oc, "INSPECT_SECONDS", 1)
    monkeypatch.setattr(oc, "INSPECTOR", slow_inspector(tmp_path, 30))
    f = zipped(work / "a.docx", docx_parts())
    started = time.time()
    assert oc.main(["office-convert", "pdf", str(f)]) == 4
    assert time.time() - started < 5
    assert "inspector did not finish" in json.loads(capsys.readouterr().out)["reason"]
    assert stub.calls() == []


# ---- the detector: where formulas hide, and no false refusals ---------------------------------------------------

def book_with(names_xml="", sheet_name="A"):
    return (
        f'<?xml version="1.0"?><workbook xmlns="{S}" xmlns:r="{R}"><sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets>'
        f"{names_xml}</workbook>"
    )


def sheet_xml(cell_formula="1+1", after_data=""):
    return (
        f'<?xml version="1.0"?><worksheet xmlns="{S}"><sheetData><row r="1"><c r="A1"><f>{cell_formula}</f></c></row></sheetData>'
        f"{after_data}</worksheet>"
    )


@pytest.mark.parametrize(
    "parts,named",
    [
        ({"xl/worksheets/sheet1.xml": sheet_xml("XLOOKUP (1,B1:B3,C1:C3)")}, "XLOOKUP"),
        ({"xl/worksheets/sheet1.xml": sheet_xml("XLOOKUP\t(1,B1:B3,C1:C3)")}, "XLOOKUP"),
        ({"xl/worksheets/sheet1.xml": sheet_xml("1"), "xl/workbook.xml": book_with('<definedNames><definedName name="Pick">FILTER (A1:A9,A1:A9&gt;1)</definedName></definedNames>')}, "FILTER"),
        ({"xl/worksheets/sheet1.xml": sheet_xml(after_data='<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1"><formula>_xlfn.XLOOKUP(A1,B1:B2,C1:C2)&gt;1</formula></cfRule></conditionalFormatting>')}, "XLOOKUP"),
        ({"xl/worksheets/sheet1.xml": sheet_xml(after_data='<dataValidations count="1"><dataValidation type="list" sqref="A1"><formula1>_xlfn.UNIQUE(B1:B9)</formula1></dataValidation></dataValidations>')}, "UNIQUE"),
        ({"xl/worksheets/sheet1.xml": sheet_xml(after_data='<dataValidations count="1"><dataValidation type="custom" sqref="A1"><formula1>1</formula1><formula2>SORT(B1:B9)</formula2></dataValidation></dataValidations>')}, "SORT"),
        ({"xl/worksheets/sheet1.xml": sheet_xml(after_data='<extLst><ext><x14:conditionalFormattings xmlns:x14="x" xmlns:xm="y"><x14:cfRule><xm:f>LET(a,1,a)</xm:f></x14:cfRule></x14:conditionalFormattings></ext></extLst>')}, "LET"),
    ],
)
def test_recalc_finds_unsupported_functions_wherever_a_formula_can_be(work, stub, parts, named):
    f = zipped(work / "w.xlsx", xlsx_parts(parts))
    code, out, _ = run("recalc", f)
    assert code == 3 and named in out["reason"], out
    assert stub.calls() == []


@pytest.mark.parametrize(
    "parts",
    [
        {"xl/workbook.xml": book_with(sheet_name="FILTER"), "xl/worksheets/sheet1.xml": sheet_xml("FILTER!A2+SUM(FILTER!B1:B2)")},
        {"xl/workbook.xml": book_with(sheet_name="FILTER (2)"), "xl/worksheets/sheet1.xml": sheet_xml("'FILTER (2)'!A1+1")},
        {"xl/workbook.xml": book_with('<definedNames><definedName name="FILTER">A!$A$1</definedName></definedNames>'), "xl/worksheets/sheet1.xml": sheet_xml("FILTER+1")},
        {"xl/worksheets/sheet1.xml": sheet_xml('IF(B1=&quot;XLOOKUP (&quot;,1,2)')},
        {"xl/worksheets/sheet1.xml": sheet_xml(after_data='<dataValidations count="1"><dataValidation type="list" sqref="A1"><formula1>"SORT (a),UNIQUE"</formula1></dataValidation></dataValidations>')},
    ],
)
def test_the_detector_has_no_false_refusals(work, stub, parts):
    f = zipped(work / "w.xlsx", xlsx_parts(parts))
    code, out, _ = run("recalc", f)
    assert code == 0, out


def zombies():
    """Defunct children of this process."""
    found = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            fields = Path(f"/proc/{entry}/stat").read_text().rsplit(")", 1)[1].split()
        except OSError:
            continue
        if fields[0] == "Z" and int(fields[1]) == os.getpid():
            found.append(int(entry))
    return found


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="needs /proc and prctl")
def test_a_helper_that_outlives_a_killed_libreoffice_is_reaped(work, stub, monkeypatch, capsys):
    import ctypes

    libc = ctypes.CDLL(None, use_errno=True)
    stub.behave("orphan")
    monkeypatch.setattr(oc, "TOTAL_SECONDS", 3)
    monkeypatch.setattr(oc, "RESERVE_SECONDS", 1)
    f = zipped(work / "a.docx", docx_parts())
    try:
        assert oc.main(["office-convert", "pdf", str(f)]) == 4
        flag = ctypes.c_int(0)
        libc.prctl(37, ctypes.byref(flag), 0, 0, 0)  # PR_GET_CHILD_SUBREAPER
        assert flag.value == 1
        grandchild = int((stub.dir / "grandchild").read_text())
        deadline = time.time() + 5
        while time.time() < deadline and os.path.exists(f"/proc/{grandchild}"):
            time.sleep(0.05)
        assert not os.path.exists(f"/proc/{grandchild}")  # gone, not even a defunct entry
        assert zombies() == []
    finally:
        libc.prctl(36, 0, 0, 0, 0)


# ---- the real program, where it is installed ------------------------------------------------------------------

needs_soffice = pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice is not installed here")


@needs_soffice
def test_real_libreoffice_recalculates_a_formula_and_makes_a_pdf(work):
    openpyxl = pytest.importorskip("openpyxl")
    docx = pytest.importorskip("docx")
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(["a", 10])
    sheet.append(["b", 32.5])
    sheet["B3"] = "=SUM(B1:B2)"
    book.save(work / "t.xlsx")
    assert openpyxl.load_workbook(work / "t.xlsx", data_only=True).active["B3"].value is None
    code, out, _ = run("recalc", work / "t.xlsx")
    assert code == 0, out
    assert out["formula_cells"] == [{"sheet": "Sheet", "cell": "B3", "formula": "SUM(B1:B2)", "value": 42.5}]
    assert [p.name for p in work.iterdir()] == ["t.xlsx"]  # nothing kept
    code, out, _ = run("recalc", "--keep", work / "t.xlsx")
    assert code == 0, out
    done = openpyxl.load_workbook(work / "t.recalculated.xlsx", data_only=True).active
    assert done["B3"].value == 42.5
    assert openpyxl.load_workbook(work / "t.recalculated.xlsx").active["B3"].value == "=SUM(B1:B2)"
    # fix-and-run-again: without --replace the kept copy is refused, with it a regular file is replaced
    assert run("recalc", "--keep", work / "t.xlsx")[0] == 3
    assert run("recalc", "--keep", "--replace", work / "t.xlsx")[0] == 0
    document = docx.Document()
    document.add_heading("Title", 1)
    document.save(work / "t.docx")
    code, out, _ = run("pdf", work / "t.docx")
    assert code == 0 and (work / "t.pdf").read_bytes().startswith(b"%PDF-")
    assert run("pdf", work / "t.docx")[0] == 3
    assert run("pdf", "--replace", work / "t.docx")[0] == 0
