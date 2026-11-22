# The token counter (D102, D126, D134)

Status: built, not yet run live. Counts are tested against recorded streams; no real engine was asked.

## 1. What the person gets

On the Engines page, a "Tokens" section: a table with one row per member and engine, with today and the last seven days
(input and output tokens and the time used), then a total row per engine, then a "Saved" line (section 6). An engine that reported nothing says "not reported", never zero and
never a guess (its time is still shown: "not reported · 12 min"). A day is a UTC day, as in the spend ledger, because the service knows no time zone of the person's.

## 2. Where the numbers come from

Only what the engine itself reported for the turn (`Health.usage`, `engine_adapter.Usage`):

- Claude Code (`claude -p`) and every anthropic-compatible gateway run through the same CLI stream, so the same parser reads
  both: the result line's `usage` block, else the sum over the messages of the stream (`stream_json.StreamParser.usage`).
  Input counts every token the model was given, cached ones included; the cached part is also kept apart
  (`cache_usage`: read, written) when the stream says it.
- An engine whose stream has no usage block is counted as a turn and not as tokens ("not reported").
- What Ollama's and FreeLLMAPI's endpoints report is in section 7. An engine whose stream has no usage block is "not reported".
- No cost is stored: the spend ledger (`ledger.py`) is still the only place for money, and only for
  metered engines. The ledger could not be reused for the counter: it keeps no member, holds only the engines the person put
  under a limit, and has the job of holding engines back, which a counter must never do.

## 3. Where they are kept

One small file in the data directory, `token-usage.json` (`FREEDUET_TOKEN_USAGE_FILE`), written whole and atomically, 31 days:
day, member id, engine id, and seven counts (`turns`, `reported_turns`, `input_tokens`, `output_tokens`, `cache_read_tokens`,
`cache_write_tokens`, `seconds`). The file is read strictly: a count that is missing, negative, not whole or not a number makes the
file "damaged" (said, never overwritten). `seconds` was added before anything was released, so the file version is still 1. No message, key, path or cost. No database table, so no migration and no entry in the adoption registry.
A file that cannot be read is said (`problem`) and never overwritten.

The count is made when a member's segment is over (`segment.run_segment`, once per engine tried, so a turn that switched
engines counts for each), for every member turn, hand-offs included. A turn that reported nothing and answered nothing is not
a turn.

## 4. The read route

`GET /engines/usage` on agent-freeduet (same token as `GET /engines`), and `GET /api/freeduet/engines/usage` on the server:
administrators only, the same authority as the Engines page, and refused to a remote session by the same `ALL
/api/freeduet/engines/*` rule. The server reduces the answer to ids and whole numbers.

**What a count is.** The unit is an engine attempt, not a person's message: a retry on the same engine counts again, and so does each
engine a turn moved to. The tables say "attempts".

## 5. Not built

- The free-tier daily request counter of OpenRouter. It needs the saved key to be read by a new call; no key was read here.
  Left for a later change (decision below).
- The plan's own limit and its reset time (the roadmap row says "when they are known"): the Claude CLI states a reset only
  when a limit is reached, and that is already on the engine's card.
- "Today" in the person's own time zone: the counter is UTC.

## 6. Time, tokens saved, money (D126 additions, 21 November 2026)

**Time.** `segment.run_segment` takes `usage_counter.monotonic()` (a replaceable clock; tests give it a fake one) when the engine's work
begins and again when the segment ends, however it ends, and adds the difference in whole seconds (never negative, never NaN, at most
seven days) to the attempt's row. It exists even when the engine reported no tokens. Time is never turned into tokens.

**Saved.** `usage_counter.engine_class` reads the engines file at view time and classifies with the engines module's own functions:
`metered` (billing), `local` (`engines.is_local_model`: Ollama and the like), `free_cloud` (`engines.is_free_cloud`: OpenRouter free
models, a FreeLLMAPI router), `login` (a subscription) or `other` (not in the file). `free_cloud` and `local` count as saved; the
Claude Code subscription is a flat rate and metered engines cost money, so neither does. The server passes the class through as one of
those five words. In the page, saved tokens are input plus output of the member rows of free engines. A free-engine row that reported no
tokens adds its time instead ("plus 40 min on your own GPU, tokens not reported"); a row that reported some tokens and also had
attempts that reported none shows its tokens only, because the file keeps one time total per row.

**Money.** "≈ amount" is what the saved tokens would have cost on one declared paid model at its public list price: Claude Sonnet 5.5,
$2 per million input tokens and $10 per million output tokens (https://platform.claude.com/docs/en/about-claude/pricing, read on
21 November 2026), converted at 1 EUR = 1.0989 USD (the ECB euro reference rate of 17 November 2026, as published by the Banca
d'Italia, https://www.bancaditalia.it/compiti/operazioni-cambi/cambio/cambi_rif_20261117). Both are constants in
`app/src/freeduet/engines-tokens-text.ts`; nothing is fetched, so they age: update them with this paragraph. The reference ("At Claude
Sonnet 5.5 list prices ($2 in, $10 out per million tokens, 21 Nov 2026); €1 = $1.0989 (17 Nov 2026).") is printed under the line.
It is an estimate of a list price, not what anything cost. Clicking an amount switches euros and dollars; the choice is kept in the
browser's `localStorage` (`freeduet.tokens.currency`, read and written inside try/catch, default euros, any other stored value is
ignored). The amounts are buttons with an accessible name, "€3.64. Show amounts in dollars".

## 7. What Ollama and FreeLLMAPI report (checked 21 November 2026, read from their public documents; no request was sent)

- **Ollama.** Its Anthropic-compatibility page lists `usage` (`input_tokens`, `output_tokens`) among the supported response fields, and
  `message_start` and `message_delta` among the supported streaming events, but does not say where usage sits in the stream, says token
  counts are "approximations based on the underlying model's tokenizer", and lists no cache fields. The parser reads `usage` from
  `message_start` and `message_delta`, so it will count what Ollama sends there; if it sends none, the row says "not reported".
- **FreeLLMAPI.** Its public page says only that `/v1/messages` "speaks Anthropic's wire format over the same router", with analytics of
  "tokens in and out" of its own; its REST document does not show the `usage` of a `/v1/messages` reply, streaming or not. Unknown.
- Neither was asked live, so whether a real stream carries usage is **not verified**. Run live: one turn through each, then read
  `GET /engines/usage`; a row that says "not reported" with time is the honest result if they send nothing. Time is measured by us, so
  it is there either way.

## 8. Where the use came from, and the charts (D134, 22 November 2026)

Status: built, not yet run live. A look change: it waits for the maintainer's yes on the preview before it merges.

**What the person gets.** Under "Tokens", above the table: a "Plan limits" card, and a card "Where the last 7 days went" with two
toggles (By source or By member; Tokens or Time), one stacked bar with a legend, and seven stacked days. The legend names each
part with its share and its amount ("You 63% · 1.8M tokens"), so a colour is never the only way to tell parts apart. The same
numbers are in each segment's title and in a table for screen readers. Plain SVG; no chart library was added.

**Source.** Each attempt is labelled from the run's signed statement (`origin.run_claims`, the reading the cannot guard and the
report guard use): `person` (the person's own message, browser or paired phone: shown as "You"), `routine` (a routine, a check-in
or a responsibility: "Routines"), `handoff` (a hop between members, by any sign `origin.is_handoff_run` reads: "Between members")
and `other` (a deployment, a memory run, a kind not named, or a statement that cannot be read: "Other"). The label only sorts a
count; it is never used to trust a run. `usage_counter.source_of` does it and never raises.

**File.** `token-usage.json` keeps its totals (`days`) as before, and a second block, `sources` (day, source, member, the same seven
counts), is added beside it. The version stays 1 on purpose: the change is additive, so a file from before this opens as it did, and
an older service (after "go back", see `update-and-go-back.md`) still reads a newer file and ignores the block. A missing `sources`
is not damage. A `sources` that is there and is not what this module writes (a day that is not a date, a source not in the four,
a count missing, negative or not whole) is damage, said and never overwritten, as for `days`. Counts only, as before.

**Older days.** A day counted before this has totals and no sources. The view shows the part of a day's total that no stored source
accounts for as `unknown`, drawn grey and called "Earlier (not recorded)". The totals stay the single truth: the sources are never
added to them.

**Daily series.** `GET /engines/usage` now also sends `daily`: always seven UTC days, oldest first (empty days present), each with
the counts per source (and `unknown`) and per member. The server (`readUsage`, `dailyOf`) keeps only a real date, the five source
words, member ids and whole counts. An older service that sends no `daily` gives an empty list, and the page then shows the table and
the limits and no chart.

**The weekly limit.** A percentage of the plan's weekly limit is not shown, and none was made up: the subscription does not report
its limit or what is left of it. The only thing FreeDuet knows is an engine that has reached a limit and when it is expected back
(`limited` or `out_of_credit` with a time, D121). "Plan limits" lists those engines in the words the engine card already uses
("Claude Code: Reached its limit until 07:29"), taken from the same engine state the cards read, with no new call; with none held
it says so, and always says why there is no percentage. The state does not say whether the limit is a weekly or a shorter one, so
the page does not say "weekly" about it.

**Not built.** A time zone other than UTC; a per-engine split of the chart; a source for the attempts made before this change.

**Built so far (D134).** `agent-freeduet/freeduet/usage_counter.py` (`source_of`, `sources`, `daily`), `segment.py` (one argument to
`note_turn`), `server/src/freeduet/engines-routes.ts` (`dailyOf`), `app/src/freeduet/engines-tokens-text.ts` (the breakdown and
chart logic), `engines-usage-charts.tsx` (new; the cards, bar and chart, with an error boundary so a failure draws one sentence and
leaves the table), and `engines-tokens.tsx` (one component added). Tests: `tests/test_usage_counter.py` (20 of the new ones fail
before and pass after), `server/tests/freeduet-engines-usage.test.ts` (2 fail before), `app/tests/freeduet-engines-usage-charts.test.tsx`
(new). Screenshots, with invented numbers, light and dark, are in the pull request description.
Not verified: a real day's use through a running service (the numbers in the screenshots are made up); a paired phone or a routine
run labelled live; the look in a narrow window.

## Built so far

- D126 additions: `usage_counter.py` (`seconds`, `engine_class`, `monotonic`), `segment.py` (the timing), `engines-routes.ts` (`seconds`,
  `class`), `engines-tokens-text.ts` (durations, saved, money constants), `engines-tokens.tsx` (the Saved line and the currency button).
  Tests: the same three test files; the screenshots are `3-*.png` of the preview.
- `agent-freeduet/freeduet/usage_counter.py`, `stream_json.py` (`cache_usage`), `engine_adapter.py` (`Usage` cache fields),
  `claude_engine.py` and `compatible_engine.py` (`note_usage`), `segment.py` (the hook), `app.py` (`GET /engines/usage`).
- `server/src/freeduet/engines-routes.ts` (`readUsage`, `GET /usage`).
- `app/src/freeduet/engines-tokens.tsx`, `engines-tokens-text.ts`, and one line in `engines-section.tsx`.
- Tests: `agent-freeduet/tests/test_usage_counter.py`, `server/tests/freeduet-engines-usage.test.ts`,
  `app/tests/freeduet-engines-tokens.test.tsx`.
- Not verified: a real Claude Code stream (the recorded one was used), a real day boundary on a running service, and any engine
  other than the CLI-based ones (an engine that is not CLI-based reports nothing today, so it reads "not reported").
