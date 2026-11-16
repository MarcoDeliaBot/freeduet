"""The file lock in freeduet/locking.py: the mode of the lock file, exclusion between two writers,
release when the body raises, and paths that do not block each other.

Nothing here sleeps, and no assertion depends on how fast a thread runs. Ordering comes from Events
that the threads set. `HANG` bounds each wait only so that a deadlock fails the run instead of
hanging it: a passing run never reaches it.
"""

import os
import threading
from pathlib import Path

import pytest

from freeduet import locking
from freeduet.locking import locked

HANG = 30.0  # a deadlock fails the test after this long; no passing run comes near it


def _file_lock_held(path: Path) -> bool:
    """True when the file lock on `path` is held by someone else right now. No file, no lock.

    The attempt does not wait. `flock` is per open file description, so it contends with the holder
    inside this process as well as with holders in other processes. When nobody holds the lock the
    attempt succeeds, and closing the descriptor gives the lock back at once.
    """
    try:
        fd = os.open(path, os.O_RDWR)
    except FileNotFoundError:
        return False
    try:
        locking.fcntl.flock(fd, locking.fcntl.LOCK_EX | locking.fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    finally:
        os.close(fd)
    return False


def test_a_new_lock_file_is_created_with_mode_0600_and_kept(tmp_path):
    path = tmp_path / "new.lock"
    with locked(path):
        assert path.exists()
    assert oct(path.stat().st_mode & 0o777) == "0o600"
    assert path.exists()  # never removed on release: every writer locks the same inode


def test_an_existing_lock_file_keeps_the_mode_it_has(tmp_path):
    """`os.open` applies 0600 only when it creates the file, so a lock file that already exists is
    used as it is. Here it is 0644, a file the code did not create."""
    path = tmp_path / "old.lock"
    path.write_bytes(b"")
    path.chmod(0o644)
    with locked(path):
        pass
    assert oct(path.stat().st_mode & 0o777) == "0o644"


@pytest.mark.skipif(locking.fcntl is None, reason="the file lock is flock(2): no fcntl on this platform")
def test_a_second_writer_waits_until_the_first_leaves(tmp_path):
    """Exclusion between two writers, with no timing in the proof.

    The holder takes the lock and stays inside until the test releases it. The contender sets
    `contender_trying` right before it calls `locked`. While the holder is inside, two checks run:

    1. The file lock is held: a non-blocking `flock` from a second open file description fails. The
       holder sets `holder_inside` only after it has the lock, and keeps it until it leaves, so this
       check has no timing in it. With no lock taken the attempt succeeds, so a removed lock fails
       here on every run, however fast the threads are.
    2. The contender has not entered. This is the behaviour the test is about, but read alone it could
       pass by luck: a contender that has not reached the lock yet has also not entered. Check 1 is
       what makes a removed lock fail every time.

    Only then is the holder released, and the contender must enter. Each join is bounded by `HANG`,
    which is a hang detector: a passing run never reaches the bound.
    """
    path = tmp_path / "shared.lock"
    holder_inside = threading.Event()
    release_holder = threading.Event()
    contender_trying = threading.Event()
    contender_entered = threading.Event()

    def hold():
        with locked(path):
            holder_inside.set()
            release_holder.wait(HANG)

    def contend():
        contender_trying.set()
        with locked(path):
            contender_entered.set()

    holder = threading.Thread(target=hold, daemon=True)
    contender = threading.Thread(target=contend, daemon=True)
    holder.start()
    try:
        assert holder_inside.wait(HANG), "the holder never got the lock"
        contender.start()
        assert contender_trying.wait(HANG), "the contender never started"
        assert _file_lock_held(path), "the file lock was not held while the holder was inside"
        assert not contender_entered.is_set(), "a second writer entered while the first still held the lock"
    finally:
        release_holder.set()
        holder.join(HANG)
    contender.join(HANG)
    assert not holder.is_alive() and not contender.is_alive(), "a writer did not leave the lock (hang)"
    assert contender_entered.is_set(), "the second writer did not enter once the first left"


def test_the_lock_is_released_when_the_body_raises(tmp_path):
    path = tmp_path / "raises.lock"
    with pytest.raises(RuntimeError, match="body failed"):
        with locked(path):
            raise RuntimeError("body failed")

    # The next writer runs on its own thread, so a lock still held fails the bounded join below
    # instead of hanging the run.
    again = threading.Event()

    def take_again():
        with locked(path):
            again.set()

    writer = threading.Thread(target=take_again, daemon=True)
    writer.start()
    writer.join(HANG)
    assert again.is_set(), "the lock was still held after the body raised (or the next writer hung)"


def test_two_different_paths_do_not_block_each_other(tmp_path):
    holder_inside = threading.Event()
    release_holder = threading.Event()
    other_entered = threading.Event()

    def hold_first():
        with locked(tmp_path / "first.lock"):
            holder_inside.set()
            release_holder.wait(HANG)

    def take_second():
        with locked(tmp_path / "second.lock"):
            other_entered.set()

    holder = threading.Thread(target=hold_first, daemon=True)
    holder.start()
    try:
        assert holder_inside.wait(HANG), "the first lock was never taken"
        # On its own thread, joined with a bound: a lock shared by the two paths would hang here,
        # and the bound turns that into a failed assertion.
        other = threading.Thread(target=take_second, daemon=True)
        other.start()
        other.join(HANG)
        assert other_entered.is_set(), "a lock on one path waited for a lock on another"
    finally:
        release_holder.set()
        holder.join(HANG)
