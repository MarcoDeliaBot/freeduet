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

Exit status: 0 done, 2 bad use or an error, 3 refused (the sentence says why), 4 timed out.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile

TIMEOUT_SECONDS = 100
MAX_INPUT_BYTES = 25 * 1024 * 1024
MAX_OUTPUT_BYTES = 200 * 1024 * 1024
INSPECTOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "office-inspect", "office_inspect.py")
USAGE = "usage: office-convert recalc <file.xlsx> | office-convert pdf <file.docx|.xlsx|.pptx>\n"
KINDS = ("docx", "xlsx", "pptx")

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


def check_path(path):
    absolute = os.path.abspath(path)
    try:
        info = os.lstat(absolute)
    except OSError as error:
        raise Stop(f"Cannot read the file: {clean(error)}", 2)
    if os.path.realpath(absolute) != absolute or os.path.islink(absolute):
        raise Stop("A symbolic link is in this path. It was not opened; give the real file.", 3)
    if not os.path.isfile(absolute):
        raise Stop("This is not a regular file.", 3)
    if info.st_size > MAX_INPUT_BYTES:
        raise Stop(f"The file is {info.st_size} bytes, over the {MAX_INPUT_BYTES // (1024 * 1024)} MiB limit. It was not opened.", 3)
    if info.st_size == 0:
        raise Stop("The file is empty.", 3)
    return absolute


def inspect_first(path):
    """Run office-inspect; return its JSON, or stop with its sentence when it refuses."""
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


def kill_group(process):
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except OSError:
        pass
    try:
        process.wait(timeout=5)
    except Exception:
        pass


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


def place(produced, destination):
    """Move the finished file next to the source. A symbolic link or a folder at the destination is refused."""
    if os.path.islink(destination) or os.path.isdir(destination):
        raise Stop("The output name is taken by a link or a folder: " + os.path.basename(destination), 3)
    staging = destination + ".part"
    shutil.copyfile(produced, staging)
    os.replace(staging, destination)


def convert(mode, path):
    absolute = check_path(path)
    report = inspect_first(absolute)
    kind = report.get("detected_type")
    if mode == "recalc" and kind != "xlsx":
        raise Stop(f"recalc takes an .xlsx; this is a {kind} file.", 3)
    if mode == "pdf" and kind not in KINDS:
        raise Stop(f"pdf takes a .docx, .xlsx or .pptx; this is a {kind} file.", 3)
    soffice = shutil.which("soffice")
    if not soffice:
        raise Stop("LibreOffice (soffice) is not installed in this computer.", 2)
    folder, name = os.path.split(absolute)
    stem = os.path.splitext(name)[0]
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
        # LibreOffice reads a copy, so it never writes a lock file or anything else beside the source.
        source = os.path.join(work, "work" + os.path.splitext(name)[1].lower())
        shutil.copyfile(absolute, source)
        run_soffice(soffice, work, source, target_format, outdir)
        produced = os.path.join(outdir, produced_name)
        if not os.path.isfile(produced) or os.path.getsize(produced) == 0:
            raise Stop("LibreOffice finished but wrote no file. The file may be damaged.", 2)
        if os.path.getsize(produced) > MAX_OUTPUT_BYTES:
            raise Stop("The result is over the size limit and was not kept.", 3)
        with open(produced, "rb") as handle:
            if not handle.read(len(magic)).startswith(magic):
                raise Stop("LibreOffice wrote something that is not the expected kind of file.", 2)
        place(produced, destination)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"ok": True, "mode": mode, "source": name, "output": os.path.basename(destination), "output_path": destination,
            "size_bytes": os.path.getsize(destination)}


def main(argv):
    if len(argv) == 2 and argv[1] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        return 0
    if len(argv) != 3 or argv[1] not in ("recalc", "pdf"):
        sys.stderr.write(USAGE)
        return 2
    try:
        say(convert(argv[1], argv[2]))
        return 0
    except Stop as stop:
        say({"ok": False, "refused": stop.code == 3, "timed_out": stop.code == 4, "reason": str(stop)})
        return stop.code


if __name__ == "__main__":
    sys.exit(main(sys.argv))
