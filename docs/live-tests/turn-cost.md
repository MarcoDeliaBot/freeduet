# Live test: model calls per member turn

This measures how many model calls and segments a member turn costs, per member and overall (ROADMAP row 93, decision D123, [M1_PLAN.md](../M1_PLAN.md) section 81). It is the measurement that code mode (row 97) waits for: no saving is promised before it is run.

The script is `openbot/scripts/freeduet-turn-cost.ts`. It is read-only: it reads the stored runs in `freeduet_thread_runs` inside one `read only` transaction, and it prints counts only. It never prints message text, an account, a path or the database URL.

## What it prints

For the last N hours (default 24), one row per member and one `all` row. Each cell is the median / p90 per turn:

| Column | What it counts |
|---|---|
| turns | Rows of `freeduet_thread_runs` in the window (one row per turn; a hand-off is its own row) |
| tool calls | `TOOL_CALL_START` events of the turn |
| texts | Distinct messages with `TEXT_MESSAGE_CONTENT` |
| notices | Those messages whose text is an engine switch or limit notice (the fixed sentences of `openbot/agent-freeduet/freeduet/engine_notices.py`, English and Italian) |
| segments | `claude -p` runs in the turn, inferred from the events (see below) |
| duration s | `finished_at` minus `created_at`, finished turns only |
| events KB | The size of the stored events |

`--json` prints the same numbers as JSON, with the count of turns per status.

## Rules used

- **Median and p90.** The median averages the two middle values of an even count. The p90 is the nearest-rank value, at rank ceil(0.9 n).
- **Segments.** A segment is one fresh `claude -p`, and it ends at the first tool OpenBot runs itself (D4, `segment.py`). In the events such a call is announced with `TOOL_CALL_START` and never answered (no `TOOL_CALL_RESULT` with its id), and the segment ends with `RUN_FINISHED`. A deployment tool is answered, and Iris's own tools are never announced. So the script counts segments as the unanswered calls of the turn plus one. This is an inference: a run that crashed in the middle of a call also has an unanswered call and counts it.
- **Notices.** A notice is one text message. Its deltas are joined in order before the match, so a notice split into several deltas counts once. The match uses fixed fragments of `engine_notices.py`; a test fails if one of them is reworded in that file.

## What it does not count

- The loop stop ("switched engines N times") and the "every engine is unavailable" notice are sent as run errors (`RUN_ERROR`), not as text. They are not in `notices`.
- A member who writes one of these fixed sentences in an ordinary answer is counted as a notice too. It is rare, and it is a known limit of matching text.
- Routines and computer work outside a thread run are not in `freeduet_thread_runs`.

## How to run it

The script needs Bun (1.4 or later) and a checkout of the repository at the commit you want to measure.

1. Get the database URL of the installation. It is the server's `DATABASE_URL`, in the install's `.env` or in the server container's environment. Keep it in your shell only. Do not paste it into a report, a log or a chat.
2. From the `openbot/` folder of the checkout:

   ```bash
   cd openbot
   DATABASE_URL='<the URL>' bun scripts/freeduet-turn-cost.ts --hours 24
   DATABASE_URL='<the URL>' bun scripts/freeduet-turn-cost.ts --hours 168 --json > /tmp/turn-cost.json
   ```

   `--hours` takes a whole number from 1 to 744. A file written with `--json` holds counts only, so it is safe to keep. Check it before you share it anyway.

3. Inside the server container, run the same command there if the image carries the `openbot/scripts` folder. If it does not, run it from a checkout with the same `DATABASE_URL`, which reaches the same database.

On the maintainer's machine the stack runs in WSL with Docker inside it. The database is reached through the Postgres container of the stack, so the URL uses the port that the stack publishes. The URL is never written into the repository.

## Test

```bash
cd openbot
bun test scripts/freeduet-turn-cost.test.ts
```

The test uses fixture events and needs no database. It also checks that each notice fragment is still written in `engine_notices.py`, and that the query runs in a read-only transaction.

## Status

Built, not yet run live. The test passes with 18 tests. The query was checked against a throwaway PostgreSQL 16 cluster with five fixture rows: the row older than the window was left out, the segment and duration figures matched a count by hand, no message text was printed, and an insert inside the same `read only` transaction was refused. The numbers from a real installation are not measured yet; they are the next step of row 93, and they come before any decision on code mode (row 97).
