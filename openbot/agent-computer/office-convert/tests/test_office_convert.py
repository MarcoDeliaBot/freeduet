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
import json, os, sys, time, zipfile
here = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
profile = [a for a in args if a.startswith("-env:UserInstallation=file://")][0].split("file://", 1)[1]
xcu = open(os.path.join(profile, "user", "registrymodifications.xcu"), encoding="utf-8").read()
outdir = args[args.index("--outdir") + 1]
source = args[-1]
fmt = args[args.index("--convert-to") + 1]
with open(os.path.join(here, "calls.jsonl"), "a", encoding="utf-8") as log:
    log.write(json.dumps({{"args": args, "xcu": xcu, "env": dict(os.environ), "cwd": os.getcwd(), "pid": os.getpid(),
                          "source_exists": os.path.exists(source), "profile": profile}}) + "\\n")
mode = open(os.path.join(here, "behavior")).read().strip() if os.path.exists(os.path.join(here, "behavior")) else "ok"
stem = os.path.splitext(os.path.basename(source))[0]
if mode == "sleep":
    open(os.path.join(here, "pid"), "w").write(str(os.getpid()))
    time.sleep(60)
if mode == "fail":
    sys.stderr.write("boom: cannot load\\n"); sys.exit(1)
if mode == "nooutput":
    sys.exit(0)
if fmt.startswith("pdf"):
    open(os.path.join(outdir, stem + ".pdf"), "wb").write(b"%PDF-1.4\\n" if mode != "garbage" else b"not a pdf")
else:
    with zipfile.ZipFile(os.path.join(outdir, stem + ".xlsx"), "w") as z:
        z.writestr("x", "recalculated")
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
    code, out, _ = run("recalc", f)
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
    f = zipped(work / "a.docx", docx_parts())
    run("pdf", f)
    run("pdf", f)
    first, second = stub.calls()
    assert first["profile"] != second["profile"]


def test_an_existing_output_is_replaced_but_a_link_or_folder_in_its_place_is_refused(work, stub, tmp_path):
    f = zipped(work / "a.docx", docx_parts())
    (work / "a.pdf").write_bytes(b"old")
    assert run("pdf", f)[0] == 0
    assert (work / "a.pdf").read_bytes().startswith(b"%PDF-")
    target = tmp_path / "victim.txt"
    target.write_text("keep")
    (work / "a.pdf").unlink()
    (work / "a.pdf").symlink_to(target)
    code, out, _ = run("pdf", f)
    assert code == 3 and target.read_text() == "keep"


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


def test_the_timeout_is_under_the_commands_own_two_minutes():
    assert oc.TIMEOUT_SECONDS < 120


def test_a_stuck_libreoffice_is_killed_and_the_message_says_what_to_do(work, stub, monkeypatch, capsys):
    stub.behave("sleep")
    monkeypatch.setattr(oc, "TIMEOUT_SECONDS", 2)
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
    done = openpyxl.load_workbook(work / "t.recalculated.xlsx", data_only=True).active
    assert done["B3"].value == 42.5
    assert openpyxl.load_workbook(work / "t.recalculated.xlsx").active["B3"].value == "=SUM(B1:B2)"
    document = docx.Document()
    document.add_heading("Title", 1)
    document.save(work / "t.docx")
    code, out, _ = run("pdf", work / "t.docx")
    assert code == 0 and (work / "t.pdf").read_bytes().startswith(b"%PDF-")
