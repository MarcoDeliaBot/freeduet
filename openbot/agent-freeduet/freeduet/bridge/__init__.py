"""The `freeduet` MCP server and its line to the parent.

The CLI launches `python -m freeduet.bridge` through `--mcp-config` (the only server it gets, D7).
The bridge lists exactly the tools OpenBot offered for this segment and hands every call to the
parent over a loopback socket guarded by a per-run secret (`ipc.py`). The parent decides what a
call means (`segment.py`): a deployment tool runs through OpenBot's callback route (`callback.py`)
and its result goes back to the CLI; any other tool ends the segment so OpenBot can run it.
"""
