"""One writer at a time on a data file, across threads and processes.

`flock` on a lock file beside the data: separate opens of the same file conflict even inside one
process, so segments running side by side (threads, or several uvicorn workers) wait for each other.
A platform without `fcntl` falls back to a lock per path inside this process.
"""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path

try:
    import fcntl
except ImportError:  # pragma: no cover - not on Linux
    fcntl = None

_local: dict[str, threading.Lock] = {}
_guard = threading.Lock()


@contextmanager
def locked(lock_file: Path):
    """Hold an exclusive lock on `lock_file` (created 0600 if missing) for the block."""
    with _guard:
        local = _local.setdefault(str(lock_file), threading.Lock())
    with local:
        fd = os.open(lock_file, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            if fcntl is not None:
                fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)  # also releases the flock
