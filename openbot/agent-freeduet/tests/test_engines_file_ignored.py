"""A person's own engines file is never committed by mistake; the shipped example is.

docs/PROVIDERS.md tells the person to copy ``engines.example.yaml`` to ``engines.yaml`` and edit it. That copy
can hold a gateway address and settings of the person's own, so ``agent-freeduet/.gitignore`` makes git ignore
it, and the example stays tracked. The test asks git what it does. It needs git and a checkout; anywhere else
it is skipped (the Docker image ships no ``.git``).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(PACKAGE_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.fixture(autouse=True)
def needs_a_checkout():
    if shutil.which("git") is None or git("rev-parse", "--is-inside-work-tree").stdout.strip() != "true":
        pytest.skip("needs git and a checkout of the repository")


def test_the_persons_engines_file_is_ignored():
    # --no-index judges the rule on its own, whether or not git already tracks the file.
    result = git("check-ignore", "-q", "--no-index", "engines.yaml")
    assert result.returncode == 0, "agent-freeduet/engines.yaml is not ignored by git"


def test_the_example_is_not_ignored_and_stays_tracked():
    # Guard of unchanged behaviour: the example was never ignored, and must still be tracked.
    result = git("check-ignore", "-q", "--no-index", "engines.example.yaml")
    assert result.returncode == 1, "engines.example.yaml is ignored by git"
    tracked = git("ls-files", "--error-unmatch", "engines.example.yaml")
    assert tracked.returncode == 0, tracked.stderr
