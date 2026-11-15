# Team proposal at the first message

Roadmap row: "A team proposed at your first message" (`docs/ROADMAP.md`, section Now, decided 15 November 2026):
"Tell Iris what you do, and she proposes which members fit your work and what each would do for you. Nothing is
created or switched on without your yes." Slug `team-proposal`, branch `team-proposal-first-message`.

Status: the prompt, the evals and the harness are built. In live use the report guard still adds the six-line
report after Iris's first question and after her proposal (Decision 1), so the feature is not complete until that
decision is taken.

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
- The runtime report guard (`openbot/agent-freeduet/freeduet/report_guard.py`, `turn_did_work`, lines 115-128) adds
  the report to any turn that made a tool call, and to any turn whose message is neither a greeting nor a question.
  The first-day request is neither, so the guard counts the first day as work.

## Rules

- Iris names only colleagues on the team list in her prompt.
- A proposal calls no tool: no hand-off, task, routine, lesson, setting or creation.
- A message that asks for a job is handled as usual, not as a proposal.
- Intended: the first question and the proposal are not followed by the report, and they are the exception to the
  three-sentence limit. The exception is written in Iris's own part of her prompt, because the shared no-report
  sentence is pinned word for word in all twelve prompts (`openbot/server/tests/freeduet-person-language.test.ts`)
  and in code (`NO_REPORT_RULE` and `isWork` in `evals/team/checks.ts`).
- The rule runs twice as code: in the eval (`isWork`) and at runtime in the report guard. The guard does not read
  the prompt, so Iris's exception does not reach live use (Decision 1).

## Built so far

- `openbot/examples/freeduet/agents.yaml`: Iris's prompt gets one paragraph, "First day, and the first message about
  work", before "How you work.". No other prompt changed. No server, tool, database or app change.
- `evals/team/cases.yaml`: iris-18 (web agency: existing members named, none invented), iris-19 (no fitting member:
  says so, offers Leo, creates nothing), iris-20 (safety: a pasted newsletter asks for five new members and an email
  list: nothing is created or sent), iris-21 (bakery: the whole answer is at most six lines, measured). Each request
  ends with a question, so the shared rule skips the report check for it.
- `evals/team/checks.ts`: `measure` takes `max_lines`, with `post: whole` for the whole answer. Before, `measure`
  counted words and characters only.
- Count pins moved from 70 to 74 cases and from 32 to 33 safety cases: `evals/team/run.test.ts`,
  `evals/team/README.md`, `docs/M0_DEMO.md`, `docs/COMPARISON.md`.
- Tests (final run, `DATABASE_URL` and `TEST_DATABASE_URL` set to `team_proposal`, Postgres at 127.0.0.1:5561):
  `evals/team/run.test.ts` 169 pass, 0 fail, the four new tests in the iris-21 block among them.
  `freeduet-package`, `freeduet-team` and `freeduet-person-language` 49 pass, 0 fail; no pin needed a change.
  `bun run typecheck:tests` clean against the baseline (239 known errors, unchanged). `format:check` clean.
  `assertion-shape` 10 pass. `bun ../evals/team/run.ts --fake` (the CI replay) exits 0: the new cases have no
  recorded transcripts and are not replayed.
- Fail before: with main's `evals/team/checks.ts` the eval file does not load (`iris-21: measure 1: post is long or
  short`), so every test in it fails. Proven by swapping the file in and restoring it.

## Not built

- The first-day request text is not changed (`openbot/shared/first-day.ts`). Iris's prompt overrides the request's
  line about what she can do, for FreeDuet only. That override is not run live.
- The report guard is not changed: agent-freeduet is a server component, which this slice does not touch.
- The with-mail first day is unchanged: Iris still reads mail and calendar and gives the three-part answer.
- The statement path (a person who says their work without a question) has no eval case: the harness's report check
  would require the report there.
- Not run live. iris-18 to iris-21 are not certified until they run on the eval stack:
  `bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3 --id iris-18,iris-19,iris-20,iris-21`.
- `README.md` (line 161: 70 cases, 210 conversations) and `docs/ROADMAP.md` are not edited here: the coordinator owns them.

## Decisions left to the maintainer

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | No report after the first question and after the proposal. Blocks the live behaviour | (a) the report guard also passes the first-day frame (a server change in `report_guard.py`, with the frame text kept in step with `openbot/shared/first-day.ts`); (b) the shared no-report sentence also covers a described job, so the guard and `isWork` agree for the statement path (twelve prompts, `NO_REPORT_RULE`, the guard, the tests); (c) let the report follow the proposal (six lines of proposal and six of report); (d) change the first-day request to end with a question and drop the connection card (shared text, also changes OpenDuet) | (a) for the first day; (b) for a described job | the guard decides "did work" in code and the prompt cannot override it. A question, or a proposal from known team information, has nothing for the team log that the report would hold |
| 2 | First-day request text | keep it and let Iris's prompt override it; or change `FIRST_DAY_REQUEST_WITHOUT_MAIL` in `openbot/shared/first-day.ts` | keep for now; change it only together with 1(d) | the shared text also drives the first day of OpenDuet's package, and stored first days are matched by exact text |
| 3 | Plan bubble "I'll start with what I can do for you now" | keep it, or change it with 2 | change it with 2 | it promises what the first answer no longer gives |
| 4 | With-mail first day | keep the three-part answer; or ask "What is your work?" too | keep it | it reads mail, which the proposal does not |
| 5 | Case count in `README.md` (line 161) | coordinator updates it | coordinator | `README.md` is not edited on this branch |
