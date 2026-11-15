# Team proposal at the first message

Roadmap row: "A team proposed at your first message" (`docs/ROADMAP.md`, section Now, decided 15 November 2026):
"Tell Iris what you do, and she proposes which members fit your work and what each would do for you. Nothing is
created or switched on without your yes." Slug `team-proposal`, branch `team-proposal-first-message`.

Status: the prompt, the evals, the harness and the report guard are built. The guard no longer adds the six-line
report after Iris's first question or after her proposal from knowledge (Decision 1, taken 15 November 2026). Not
yet run live.

## What the person sees (intended)

1. On a new installation the first day opens with the app's welcome. Iris's first reply is one short question,
   "What is your work?", in the person's language. The connection card for Gmail and Google Calendar is still
   shown when the first-day request asks for it.
2. The person says what their work is. Iris replies with at most six lines: one line each for three or four
   colleagues from the team who fit that work, each saying what that colleague would do for this person, then
   one closing question that offers a first small job to try.
3. If nobody on the team covers the work, Iris says so in one line and that Leo can design a colleague if the
   person wants one. Leo starts only when the person asks.
4. Nothing starts from a proposal. A hand-off, a task, a routine, a lesson or a setting waits for the person's yes
   to a specific job; then Iris hands that job over as she does today.

## Where Iris greets today (read in code)

- Welcome and plan bubbles: `openbot/app/src/components/channels/first-day-greeting.ts` (`firstDayWelcome`,
  `FIRST_DAY_PLAN_WITHOUT_MAIL`). Chat sends the request to the primary Bot (`openbot/app/src/components/shell/chat-screen.tsx`,
  `useFirstDayGreeting`), as `without_mail` unless Gmail is ready.
- The request is built by the server: `openbot/shared/first-day.ts` (`FIRST_DAY_REQUEST_WITHOUT_MAIL`,
  `firstDayGreeting`), called from `openbot/server/src/channels/routes.ts:1464`. It asks for "a few sentences"
  about what Iris can do, and for the connection card.
- Iris holds the `first-day` skill (`openbot/examples/freeduet/agents.yaml`, her skill list). Its text
  (`openbot/examples/freeduet/skills.yaml`, around line 44) reads mail and calendar, so it is for a person whose mail is connected.
- The reply chips under the answer are drawn only when mail is connected
  (`openbot/app/src/components/channels/chat-transcript.tsx:2048`).
- The runtime report guard (`openbot/agent-freeduet/freeduet/report_guard.py`, `applies`) adds the report to any turn
  that made a tool call, and to any turn whose message is neither a greeting nor a question. Before this change the
  first-day request was neither, so the guard counted the first day as work.

## Rules

- Iris names only colleagues on the team list in her prompt.
- A proposal calls no tool: no hand-off, task, routine, lesson, setting or creation.
- A message that asks for a job is handled as usual, not as a proposal.
- The first question and the proposal are not followed by the report, and they are the exception to the
  three-sentence limit. The exception is written in Iris's own part of her prompt, because the shared no-report
  sentence is pinned word for word in all twelve prompts (`openbot/server/tests/freeduet-person-language.test.ts`)
  and in code (`NO_REPORT_RULE` and `isWork` in `evals/team/checks.ts`), which are unchanged.
- At runtime the guard exempts exactly two turns with no tool call (`report_guard.applies`):
  - the first-day question: the person's message starts with the first-day frame (`FIRST_DAY_MARKER`, pinned by a
    test to `openbot/shared/first-day.ts`);
  - Iris's proposal from knowledge: at most six lines, the last ending in a question, and a line that starts with a
    colleague's name. Colleague names come from each member's "You are <Name>," opening in the team file.
  Any tool call, in this segment or earlier in the turn, keeps the report, so a member created or a write made
  keeps it. The mail-connected first day calls read tools, so it keeps the report as before.
- Known gap: an ordinary short Iris answer with no tool call that ends in a question and starts a line with a
  colleague's name gets no report. No live case covers it.
- The eval's `isWork` still expects a report for a message that is a described job and not a question. No eval case
  sends one; aligning `NO_REPORT_RULE` with the guard is left to the maintainer.

## Built so far

- `openbot/examples/freeduet/agents.yaml`: Iris's prompt gets one paragraph, "First day, and the first message about
  work", before "How you work.". No other prompt changed. No server, tool, database or app change.
- `evals/team/cases.yaml`: iris-20 (web agency: existing members named, none invented), iris-21 (no fitting member:
  says so, offers Leo, creates nothing), iris-22 (safety: a pasted newsletter asks for five new members and an email
  list: nothing is created or sent), iris-23 (bakery: the whole answer is at most six lines, measured). Each request
  ends with a question, so the shared rule skips the report check for it. iris-18 and iris-19 are taken on main by
  another feature, so these four were renamed when main was merged in.
- `openbot/agent-freeduet/freeduet/report_guard.py` and `segment.py`: the two exemptions above, `colleague_names`,
  `is_proposal`, `is_first_day`. No server, tool, database or app change. No `docs/UPSTREAM_TOUCHES.md` row needed.
- `evals/team/checks.ts`: `measure` takes `max_lines`, with `post: whole` for the whole answer. Before, `measure`
  counted words and characters only.
- Count pins: 79 cases and 35 safety cases, counted from the file after the merge of main (75 and 34 there):
  `evals/team/run.test.ts`, `evals/team/README.md`, `docs/M0_DEMO.md` (237 conversations), `docs/COMPARISON.md`.
- Guard tests: `openbot/agent-freeduet/tests/test_report_guard.py` 56 pass with the exemptions; with the old `applies`
  rule the four exemption tests fail (4 failed, 4 passed in the selected set), the keep-the-report tests pass both ways.
  Full agent-freeduet suite on Python 3.12: 1893 passed.
- Eval tests: `evals/team/run.test.ts` 171 pass, 0 fail. `freeduet-package`, `freeduet-team` (105 pass with its file
  family), `freeduet-person-language`: no pin needed a change. `bun run typecheck:tests` clean against the baseline
  (239 known errors). `bunx biome format .` clean. `assertion-shape` 10 pass. `bun evals/team/run.ts --fake` exits 0.
- Fail before (eval file): with main's `evals/team/checks.ts` the eval file does not load (`post is long or short`).

## Not built

- The first-day request text is not changed (`openbot/shared/first-day.ts`). Iris's prompt overrides the request's
  line about what she can do, for FreeDuet only. That override is not run live.
- The report guard is not changed: agent-freeduet is a server component, which this slice does not touch.
- The with-mail first day is unchanged: Iris still reads mail and calendar and gives the three-part answer.
- The statement path (a person who says their work without a question) has no eval case: the harness's report check
  would require the report there.
- Not run live. iris-20 to iris-23 are not certified until they run on the eval stack:
  `bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3 --id iris-20,iris-21,iris-22,iris-23`.
- `README.md` (line 161, on main: 75 cases, 225 conversations; with this branch 79 and 237) and `docs/ROADMAP.md` are not edited here: the coordinator owns them.

## Decisions left to the maintainer

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | No report after the first question and after the proposal | (a) first-day exemption; (b) proposal exemption, narrow | (a) and (b) as built | Taken by the maintainer on 15 November 2026 (option a, and the narrow form of b). The shared `NO_REPORT_RULE` is not changed, so `isWork` in the eval still expects a report for a described job (see Rules) |
| 2 | First-day request text | keep it and let Iris's prompt override it; or change `FIRST_DAY_REQUEST_WITHOUT_MAIL` in `openbot/shared/first-day.ts` | keep for now; change it only together with 1(d) | the shared text also drives the first day of OpenDuet's package, and stored first days are matched by exact text |
| 3 | Plan bubble "I'll start with what I can do for you now" | keep it, or change it with 2 | change it with 2 | it promises what the first answer no longer gives |
| 4 | With-mail first day | keep the three-part answer; or ask "What is your work?" too | keep it | it reads mail, which the proposal does not |
| 5 | Case count in `README.md` (line 161) | coordinator updates it | coordinator | `README.md` is not edited on this branch |
| 6 | Align `NO_REPORT_RULE` and `isWork` with the guard for a described job | leave as is; or add the proposal to the shared sentence (twelve prompts and their pins) | leave as is until a live case needs it | no live case sends a described job |
