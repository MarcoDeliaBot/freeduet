# Spend ledger and limits, first part

Status on 14 November 2026: built and closed. No paid gateway can run, so on every installation nothing here happens.
Never run against a real gateway. Branch `engines-ledger-slice-1`, agent-freeduet only. The plan is in
[ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.1 (row 12) and 9.3 (E3, E5). The rule is [PROVIDERS.md](../PROVIDERS.md) rule 4:
a metered engine is opt-in, last, and capped.

## What it is, in plain words

A paid engine may run only if FreeDuet can stop it at the limits the person set. This part builds the half that counts and
stops: a file that records, for each turn of such an engine, only what the engine itself reported; a check before every turn;
and the words the person is told. It also builds the lock in front of it, and the lock is closed. The evidence below is why
it should stay closed until the maintainer decides where a cost is to come from.

## Built so far

- **The ledger** (`freeduet/ledger.py`). One JSON file, `engine-ledger.json`, in the same folder as `engine-state.json`
  (`FREEDUET_ENGINE_LEDGER_FILE` moves it; a bare name is a file of the data folder; `engine_state.ledger_file`). It is written
  whole and atomically (a temporary file in the same folder, flushed, then renamed), so a crash leaves the old file or the
  new one. It holds the last 200 turns (when, engine, tokens in and out, cost or null), the totals per UTC day for the last
  62 days and per UTC month for the last 14 months, per engine. The current day and month are never dropped. Reading a
  file larger than 4 MiB is refused. It holds no message text, key, path or member.
- **Money.** Costs are written as text and added as exact decimals: four turns of 0.7, 0.1, 0.1 and 0.1 are 1.00, and
  not 0.9999999999999999. Totals are in the currency of the `metered:` block. A cost in another currency is never added and
  never converted (FreeDuet has no rate to take): the turn counts as "cost unknown".
- **Time.** A day is 00:00 UTC to the next 00:00 UTC, a month is the first to the next first. The service knows no time
  zone of the person's, and every notice already says UTC. `GET /engines` says `"time_zone": "UTC"`.
- **The verdict** (`Ledger.hold`). The two limits are for all held engines together. An engine is held when, in this order:
  the file cannot be trusted; a write failed; the totals are in another currency than the limits; a turn this month had an
  unknown cost; the month's total has reached `monthly_cap`; today's has reached `daily_cap`. At or over a cap is reached
  (`>=`). Each verdict says when it lifts by itself (the next UTC midnight, the next first of the month), or says that only
  the person can lift it.
- **Never "zero spent".** A missing file is a ledger that has recorded nothing. Anything else that is not a file this module
  wrote (empty, damaged, unreadable, too big, an unknown version, a cost that is not a number, an extra key) holds every
  held engine. The person mends the file or deletes it, which is how the ledger is reset; the file is read again at each check
  while it is held, so neither needs a restart, and a file that cannot be read is never written over. A write that fails
  (a full disk) holds the engines until it succeeds. A turn that cost an unknown amount holds them until the month turns,
  or until the person deletes the file and restarts, because a total that is only a lower bound is not a limit.
- **Recording** (`EngineState.finish`, once per attempt). One record per turn of an engine held to the limits, and nothing for
  a login or a free engine. A turn that reported nothing and said nothing is not a turn. One that answered and reported no
  usage is recorded with nothing known, so its cost is unknown.
- **Enforcement** (`EngineState.hold_of`, asked by the router's `_pick`). Before a turn on a held engine the router asks the
  ledger. At or over a cap the engine is skipped exactly like a limited one: the same notices, the engine is not started or
  probed, a pinned member stops and says so, and when nothing else can answer the message lists what is unavailable. It is
  available again when the day or the month turns. A turn that crosses a cap while it runs finishes and is counted, so a cap can
  be passed by what the turns already running cost (see decision 5).
- **`GET /engines`** gains, for an engine held to the limits only, a `spend` block of numbers (the currency, the time zone,
  `held`, and for the day and the month the period, the cap, what all held engines spent, how many turns had no stated cost,
  and the engine's own turns, tokens and cost). A held engine is shown as state `refused` with its sentence in `refusal`, which
  the server already passes on. The Claude row, and every row of a default installation, has the keys it always had.
- **The gate.** A paid gateway runs only if all four hold. (1) `PAID_GATEWAYS_OPEN` in `freeduet/engines.py`: the maintainer's
  switch, `False`. (2) `metered.enabled: true`, both caps above 0 and the new `metered.enforce: ledger`, written by the person.
  (3) The kind reports what each turn costs, in the currency of the limits, as a fact checked against public documentation:
  `COST_REPORTING_KINDS`, which is empty. (4) The entry is on and not locked. The sentence of slice 5 is unchanged, byte for
  byte, while the switch is closed; two new sentences say that the person's words or the cost report are missing once it is open.
  Flipping the switch is the maintainer's decision (E3), and alone it changes nothing, because the table is empty.
- **What an engine reports** (`engine_adapter.Usage` on `Health`, read from the stream by `stream_json.StreamParser.usage`). Tokens
  given (the three input counts of a usage block, cached ones included) and written, counted once per message; the result
  line's totals win when it was read, and the placeholder output of a message start is never taken. The Claude Code CLI's
  `total_cost_usd` is not read at all (see the evidence).
- **Words.** English and Italian (`engine_notices.py`): "gw reached the daily limit you set (1.00 EUR), so Claude Code is
  answering instead."; the pinned and every-engine-unavailable forms; the monthly form; and "gw is held back because FreeDuet
  cannot tell what it has cost". A month-long hold never gives the "back at 00:00 UTC" time of the every-engine message, because
  the notices write a time and not a date.
- **Untouched.** Claude Code's engine and the one-engine path, the segment loop, the 52 goldens, the server and the app.

## The evidence: what the CLI reports as a cost

Read on 14 November 2026. Vendor page: [Track cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking). Run
with Claude Code 2.1.325 against a loopback test double (no real gateway, no key), whose output is trimmed in
`tests/fixtures/gateway_usage.jsonl` and `gateway_usage_unknown_model.jsonl`.

- The page says: "The `total_cost_usd` and `costUSD` fields are client-side estimates, not authoritative billing data", computed
  "locally from a price table bundled at build time", that they can drift when "the installed SDK version does not recognize a
  model", and "Do not bill end users or trigger financial decisions from these fields." It also says a model's `costBasis` is
  `list`, `managed` or `unknown`.
- The run: a model name the CLI does not know still got a cost (`costBasis: "unknown"`, 0.0076425 for 1234 + 10 + 20 tokens in and 56
  out), and a Claude model name got Anthropic's list price (`costBasis: "list"`, 0.0045855) whatever a gateway charges.
- A segment that ends on a tool call stops the CLI before its result line (D4), so a cost would be missing exactly on the turns
  that use tools. Per-message output tokens are a placeholder; the real count is in the message delta and the result.
- So no kind of engine qualifies as reporting a verified cost, `COST_REPORTING_KINDS` is empty, and the adapter records tokens
  only. A cost is recorded only when an engine states one, which no engine does today.
- The CLI's `modelPricing` setting makes it report spend at rates the person supplies. The vendor's
  [settings reference](https://code.claude.com/docs/en/settings-reference#modelpricing) gives its scope as managed ("Claude Code
  ignores it in user, project, and local settings, in `--settings`, ..."), needs Claude Code 2.1.242 or later, and lets only a
  host application that embeds Claude Code through the SDK supply a table of its own. FreeDuet starts the CLI, it does not embed
  it, so a person would have to deploy managed settings on their own machine. It was not tried (decision 2, option d).

## Tests

160 new tests, written against the fake CLI and a made-up clock:

| File | Tests | What it holds |
|---|---|---|
| `tests/test_ledger.py` | 67 | The module alone: recording, exact money, UTC day and month roll-over, caps (`>=`), retention, restart, atomic writes, a damaged, unreadable, oversized or foreign file (never "zero spent"), a failed write, another currency, unknown cost, two threads recording together |
| `tests/test_ledger_gate.py` | 36 | The four conditions of the gate, the `enforce` word in the file, the sentences (the closed one byte for byte) |
| `tests/test_ledger_usage.py` | 27 | What the stream parser reads from the two real CLI streams, what reaches `Health.usage`, the gateway engine end to end, the evidence that the CLI's cost is not taken |
| `tests/test_ledger_router.py` | 28 | The member path: recording, a cap skipping the engine with the notice in English and Italian, a pinned member stopping, the overshoot, the day and the month turning, a restart, a damaged file and how it is mended, two turns ending together, `GET /engines`, the start-up wiring |
| `tests/test_ledger_guards.py` | 2 | Guards of unchanged behaviour (below) |

With `tests/ledger_support.py` and two fixtures of the CLI's real output (`gateway_usage.jsonl`,
`gateway_usage_unknown_model.jsonl`). One existing test changed: the shape pin of `Health` in `tests/test_engine_state.py`
now lists the new `usage` field and pins the four fields of `Usage`.

- **Result.** The whole agent-freeduet suite on the merged tree passes: 1823 tests, the 1663 that were there and the 160 new ones.
  The 52 goldens are byte-identical and none was regenerated.
- **They fail without the change.** Laid over main's untouched source (`93ed8d6`), the four feature files fail to import the names
  main does not have, so all 158 of their tests fail (a collection error is a failure), and the changed `Health` pin fails the same
  way. The two guards are the exception and pass on both: a login chain with no metered engine writes no ledger file and shows the
  engine rows with exactly the keys they always had, and a `metered:` block that never heard of `enforce` reads as it did.
- **Each production change is needed.** Reverting one production file at a time to main's version, in a scratch copy, and running
  the five files: without `stream_json.py` 21 tests fail, without `engine_notices.py` 25, without `engine_router.py` 29, without
  `compatible_engine.py` the 27 of the usage file cannot be collected; without `engines.py`, `engine_state.py`, `engine_adapter.py`
  or `ledger.py` nothing imports.
- **What is real and what is made up.** The two streams are real output of Claude Code 2.1.325 against a loopback test double,
  trimmed. Everything else is a fake CLI with invented numbers: the costs, the limits and the clock are made up, and a test that
  needs the gate open opens it for itself, so no test depends on the switch being flipped.
- **Timing.** Like its neighbours, the router file starts a fake CLI process for each turn. Under a heavy machine load one older
  test, `test_engine_state_neutral` on its open-segment timeout case, has failed on timing and passed alone.

## Not verified

- No paid gateway has run, and no cost has been compared with a provider's own usage page. Whether a gateway's bill and the
  CLI's token counts agree is unknown.
- The notices and the `GET /engines` sentences have not been seen by a person, and the Engines page of the app has no sentence
  for a held engine beyond the server's own "Not run: ..." text.
- A turn that the CLI never reports on (killed before its stream said anything) is not counted. A segment that ends on a tool
  call is counted as far as its stream had said: input tokens are there, the output count may not be.
- Input tokens include the cached ones, so a price that differs for cached input cannot be applied to what is recorded.
- Two service processes on one data folder would overwrite each other's file. One is assumed.
- Concurrency: the check is made when a turn starts. Turns already in flight when a cap is reached all finish and all count.
  The overshoot is bounded by what they cost, and is not one turn.
- The monthly roll-over and a clock that goes backwards are tested with a made-up clock only.

## Decisions left to the maintainer

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | Open the switch `PAID_GATEWAYS_OPEN` (E3) | Keep it closed. Open it after decisions 2 and 8. Open it now. | Keep it closed until 2 and 8 are done. | It is a decision about money, and it is the maintainer's. Opened alone it does nothing, because `COST_REPORTING_KINDS` is empty. Opened with the CLI's cost accepted, the limits would rest on an estimate its vendor says not to rely on. |
| 2 | Where a cost comes from | (a) The CLI's `total_cost_usd`. (b) Tokens times a price per million tokens the person writes in `prices.yaml` (the plan's section 7), shown as an estimate; a model with no price stays "unknown" and holds. (c) The provider's own usage figure, which this kind of engine does not get. (d) The CLI's `modelPricing`, which needs managed settings. | (b). | (a) priced a model it did not know and priced Claude names at list whatever the gateway charges, and its vendor says not to take financial decisions from it. (b) is the person's own number, as the plan already says ("FreeDuet never guesses a price"). (c) is not reachable through the CLI. (d) was not tried and is version-bound. (b) needs the cached input tokens kept apart (decision 10). |
| 3 | Limits together or per engine | Together (built). Per engine. | Together. | The limit is about money, not about which gateway spent it. Per engine would multiply the cap by the number of paid engines. |
| 4 | A turn whose cost is unknown | Hold until the month turns, or the person resets (built). Count it as zero. Count a worst case the person declares. | Hold. | A sum that may be too low is not a limit. Counting zero is the failure the whole slice exists to avoid. A declared worst case is decision 2(b) again. |
| 5 | How far a limit may be passed | Built: checked before each turn, and the turns already running finish and count. Run paid turns one at a time, so the overshoot is one turn. Reserve a declared maximum per turn before starting. | Keep, unless one turn can cost a large part of a cap; then run them one at a time. | The first is the simplest and says so. Under concurrency it is bounded by the turns in flight, not by one. The other two cost latency or need a number nobody can state yet. |
| 6 | The time zone of a day | UTC (built). A `timezone:` in the `metered:` block. | UTC now; a field when the dashboard can ask for it. | The service knows no zone of the person's, and the notices say UTC. |
| 7 | The same notice on every turn | Leave it. Say it only when the held engine comes before the one that answers. | Change it in a small router PR before the switch is opened. | An existing behaviour of the router: any skipped engine, even a later one in the chain, is announced on every turn another engine answers, and in ask-first mode the person is asked each time. A paid engine is always last in a chain, and a hold lasts a day or a month, so the notice repeats on every turn until it lifts. Not changed here: it changes how limited engines are announced too. |
| 8 | A real check | A run with a real gateway and a key capped at the provider, on a disposable setup, comparing the CLI's tokens and the ledger with the provider's usage page. Or none. | Do it before decision 1. | Everything here is tested with a fake CLI and invented costs. |
| 9 | E5 and the wording of PROVIDERS rule 4 | Leave. Update when the switch is decided. | Update with decision 1. | E5 says the ledger and the card come after a real engine beyond Claude exists. This part is the cap ledger that E3 needs, it is closed, and no number it keeps reaches a person. PROVIDERS rule 4 still says "until the usage ledger exists ... no metered engine runs": it is still true in effect, and its condition is no longer the one that holds. Not edited here. |
| 10 | What is recorded | As built: tokens (cached included), cost, engine, time. Add member and model. Keep cached tokens apart. | Add them in the server half (`freeduet_usage`, the savings card) and, if decision 2 is (b), keep cached tokens apart now. | The per-member and per-model figures belong to the card. The split matters only once a price is applied. |
| 11 | One process, one file | Keep. Move the ledger to Postgres with the card. | Keep until the card. | The agent runs as one process today. |

## Where this stops

Not built: the `freeduet_usage` table, the savings card, the dashboard's numbers, the person's price table, per-member and
per-model figures, and any real check. Nothing in the server or the app changed.
