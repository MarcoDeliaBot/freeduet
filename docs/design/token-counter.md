# The token counter (D102, D126)

Status: built, not yet run live. Counts are tested against recorded streams; no real engine was asked.

## 1. What the person gets

On the Engines page, a "Tokens" section: a table with one row per member and engine, with today and the last seven days
(input and output tokens), then a total row per engine. An engine that reported nothing says "not reported", never zero and
never a guess. A day is a UTC day, as in the spend ledger, because the service knows no time zone of the person's.

## 2. Where the numbers come from

Only what the engine itself reported for the turn (`Health.usage`, `engine_adapter.Usage`):

- Claude Code (`claude -p`) and every anthropic-compatible gateway run through the same CLI stream, so the same parser reads
  both: the result line's `usage` block, else the sum over the messages of the stream (`stream_json.StreamParser.usage`).
  Input counts every token the model was given, cached ones included; the cached part is also kept apart
  (`cache_usage`: read, written) when the stream says it.
- An engine whose stream has no usage block is counted as a turn and not as tokens ("not reported").
- No price is worked out and no cost is stored: the spend ledger (`ledger.py`) is still the only place for money, and only for
  metered engines. The ledger could not be reused for the counter: it keeps no member, holds only the engines the person put
  under a limit, and has the job of holding engines back, which a counter must never do.

## 3. Where they are kept

One small file in the data directory, `token-usage.json` (`FREEDUET_TOKEN_USAGE_FILE`), written whole and atomically, 31 days:
day, member id, engine id, and six counts (`turns`, `reported_turns`, `input_tokens`, `output_tokens`, `cache_read_tokens`,
`cache_write_tokens`). No message, key, path or cost. No database table, so no migration and no entry in the adoption registry.
A file that cannot be read is said (`problem`) and never overwritten.

The count is made when a member's segment is over (`segment.run_segment`, once per engine tried, so a turn that switched
engines counts for each), for every member turn, hand-offs included. A turn that reported nothing and answered nothing is not
a turn.

## 4. The read route

`GET /engines/usage` on agent-freeduet (same token as `GET /engines`), and `GET /api/freeduet/engines/usage` on the server:
administrators only, the same authority as the Engines page, and refused to a remote session by the same `ALL
/api/freeduet/engines/*` rule. The server reduces the answer to ids and whole numbers.

## 5. Not built

- The free-tier daily request counter of OpenRouter. It needs the saved key to be read by a new call; no key was read here.
  Left for a later change (decision below).
- The plan's own limit and its reset time (the roadmap row says "when they are known"): the Claude CLI states a reset only
  when a limit is reached, and that is already on the engine's card.
- "Today" in the person's own time zone: the counter is UTC.

## Built so far

- `agent-freeduet/freeduet/usage_counter.py`, `stream_json.py` (`cache_usage`), `engine_adapter.py` (`Usage` cache fields),
  `claude_engine.py` and `compatible_engine.py` (`note_usage`), `segment.py` (the hook), `app.py` (`GET /engines/usage`).
- `server/src/freeduet/engines-routes.ts` (`readUsage`, `GET /usage`).
- `app/src/freeduet/engines-tokens.tsx`, `engines-tokens-text.ts`, and one line in `engines-section.tsx`.
- Tests: `agent-freeduet/tests/test_usage_counter.py`, `server/tests/freeduet-engines-usage.test.ts`,
  `app/tests/freeduet-engines-tokens.test.tsx`.
- Not verified: a real Claude Code stream (the recorded one was used), a real day boundary on a running service, and any engine
  other than the CLI-based ones (an engine that is not CLI-based reports nothing today, so it reads "not reported").
