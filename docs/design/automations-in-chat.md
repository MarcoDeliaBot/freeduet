# Automations written in chat: calendar, history and limits

Design, plus the read-only part built (section 8, Built so far). No write is built. Written 2026-11-14 against origin/main 452e060. Roadmap row: "Automations written in chat, with a calendar and history", status In design ([code: docs/ROADMAP.md:46]). Decided 14 November 2026: D6 (section 6). Nothing else here is decided; section 6 lists what the maintainer must still choose.

Paths start in `openbot/` unless they start with `docs/` or `CLAUDE.md`, which sit at the repository root.

Markers: **[code: path:line]** a file in this repository, docs included. **[doc: URL]** a public page; none was read for this file. **[assumed]** my inference, not checked. **[verify]** needs a test or a spike before a slice is built.

## 1. What the person gets

- Say "every Monday at 9, do this" to a member that has the routines grant. Get one card first: the schedule, the time zone, the member, the exact instruction and what the routine may touch. Nothing is saved before a yes.
- A calendar of the next runs, and a history of what ran. Each row shows its outcome, a link to its messages, and "Missed" when a scheduled run did not happen.
- Pause, run now, change and delete, from the page or by asking in chat. Every write a routine makes still asks (D6).

## 2. What exists today

| Piece | Where | What it does today |
|---|---|---|
| Routine table | [code: openbot/server/src/db/schema/coworker.ts:96-142] | Instruction, five-field cron, IANA zone (default UTC, `:115`), owner, Bot, and a channel id with no foreign key (`:106-110`). |
| Run table | [code: coworker.ts:151-176] | Status, times, error text (400 characters, [code: openbot/server/src/routines/store.ts:70]), and `source` (`:168-171`). |
| Run statuses | [code: store.ts:92] | `succeeded`, `failed`, `skipped`, `waiting`. A null status means the run is open. There is no `missed`. |
| Source values | [code: store.ts:173] | `schedule`, `run_now`, `trigger`. No code in `server/src/routines` writes `trigger` (searched for the literal). |
| Member tools | [code: openbot/server/src/plugins/builtin-routines.ts:84, 138, 148, 197] | `create_routine`, `list_routines`, `update_routine`, `delete_routine`. |
| Trigger tools | [code: openbot/server/src/responsibilities/trigger-tools.ts:56-146] | `create_trigger`, `pause_trigger`, `resume_trigger`, `delete_trigger`. Event triggers, a separate feature. The catalogue lists them with the routine writes ([code: openbot/server/src/plugins/catalogue.ts:563-571]). |
| Grant | [code: catalogue.ts:548-573] | The `routines` entry. Its comment says an administrator grants it per Bot (`:554-558`). Members never grant tools ([code: openbot/examples/freeduet/agents.yaml:214]). The FreeDuet package names no routine grant (searched for "routine" and "grant"). |
| Who it runs as | [code: builtin-routines.ts:107-108, 378, 415-417] | The Bot the person is talking to, acting for that person. The tool text says it takes no owner and no Bot (`:107-108`). |
| HTTP | [code: openbot/server/src/routines/routes.ts:50-137]; mounted at [code: openbot/server/src/app.ts:1642-1649] | Run now (202), list, runs, pause, delete. No create and no edit over HTTP, on purpose (`routes.ts:20-24`). |
| Run now | [code: store.ts:675-708] | Refused when the routine is paused (`:677-680`), or when a run is open and younger than ten minutes (`:686-701`). |
| The turn | [code: openbot/server/src/routines/runner.ts:61-212]; [code: openbot/toolkit/src/run-turn.ts:685-687] | A headless turn for the owner, in the routine's channel thread, with initiator `routine`. The reply goes to the channel (`runner.ts:206`). |
| Initiator | [code: openbot/server/src/proactive/restriction.ts:134-139]; [code: openbot/server/src/agents/wake-up.ts:473] | Only proactive runs get restricted tools; routine runs keep theirs. Wake-up follow-ups use the same initiator kind. |
| Turn limits | [code: openbot/toolkit/src/limits.ts:10]; [code: run-turn.ts:588-600] | Five minutes (`:588-592`). A turn that stops to ask a question fails with "a routine has nobody to ask" (`:595-598`). An empty reply fails (`:599-600`). |
| Turn result | [code: run-turn.ts:601-608, 699] | Returns the reply text and any components. It returns no run id; the id is minted inside (`:699`). The input takes an optional run id (`:93`). |
| Firing frame | [code: openbot/shared/routine-firing.ts:9-13, 21-25] | Tells the model it is a firing, and not to list, create or change routines unless the instruction says so. A comment records a live firing that read a schedule-shaped instruction as a question about routine management, did nothing, and still recorded `succeeded`. |
| Limits | [code: store.ts:66, 68, 437-448]; [code: openbot/server/src/routines/schedule.ts:4]; [code: runner.ts:45, 175-186]; [code: store.ts:981] | 20 enabled routines per person. 2,000 characters per instruction. A 15-minute floor (`schedule.ts:4`). Ten failures in a row switch a routine off. Skipped rows do not count. |
| No run budget | [code: openbot/server/src/agents/turn-admission.ts:1-25] | Admission checks the pause and the enterprise switches only. Nothing counts routine turns per day. |
| Precedent | [code: openbot/server/src/agents/wake-up.ts:33-38] | One-shot follow-ups: one minute to seven days ahead, five pending, twenty a day. |
| Cron and zones | [code: openbot/server/src/routines/schedule.ts:23-25, 151]; [code: builtin-routines.ts:99-101] | Five fields only (`:23-25`). An unknown zone is refused (`:151`). The tool asks the model to pass the person's zone. The default is UTC, and the tool text says there is no deployment zone to inherit (`:99-101`). |
| Daily review | [code: openbot/server/src/freeduet/person-team.ts:52-59, 165-200]; [code: openbot/server/src/index.ts:2629] | Made once per person, for Iris, at 08:30 (`:56`). Written with `routines.create` directly, so it has no grant and no card (`:189-197`). The zone is one constant, Europe/Rome (`:59`). The only caller, `index.ts:2629`, passes no zone. The comment says OpenBot keeps no zone per person (`:58`). |
| Scheduler | [code: openbot/worker/src/index.ts:89, 164-168]; [code: openbot/server/src/routines/sweep.ts:58, 180-210]; [code: openbot/charts/openbot/templates/routines/cronjob.yaml:22, 30] | A pass every 30 seconds (`worker :89`). A stamp up to ten minutes late is offered (`sweep.ts:58, 180-196`). An older stamp moves on with no row (`sweep.ts:203-210`). The cluster CronJob runs every five minutes with `Forbid`. |
| Stack down | [code: openbot/server/src/routines/routes.ts:165, 172-178]; [code: openbot/app/src/components/routines/routines-list.tsx:248-268] | Nothing runs while the stack is down. Once the last sweep is more than 15 minutes old, the page says "Routines aren't running." |
| Stuck runs | [code: sweep.ts:70, 308]; [code: store.ts:905-932] | A run open for two turn timeouts (ten minutes) is closed as `skipped`, not `failed` (`store.ts:916`). A run with a status is not touched (`:923`). |
| Waiting runs | [code: openbot/server/src/routines/runner.ts:153-161]; [code: openbot/server/src/approvals/resume-sweep.ts:236-244] | A turn that needs approval ends `waiting`. When the person decides, the resume sweep sets the run to `succeeded` (`resume-sweep.ts:236-244`). No approval expiry was found (searched `server/src/approvals` for "expir"). |
| Approval order | [code: openbot/server/src/approvals/policy.ts:376-377, 459, 508-525, 551-570] | Order: safety floor; then rules, where personal rules count only when custom rules are on (`:459`); then auto-review, which can ask even when a rule allows (`:508-525`); then allow rules (`:551-558`); then the "Ask before making changes" switch (`:559-565`); then default allow (`:566-570`). With no reviewer model, the reviewer says ask (`:376-377`). |
| Full access | [code: openbot/server/src/freeduet/full-access.ts:100-110]; [code: docs/FULL_ACCESS.md:24] | Never applies to a routine. FULL_ACCESS.md says routines always ask, even with Full access. |
| Approval card | [code: openbot/app/src/lib/approval-view.ts:178-186]; [code: openbot/server/src/approvals/store.ts:165-171]; [code: openbot/server/src/proactive/private-share.ts:95-100] | The card shows each argument under its raw key, so a cron string and a channel id appear as typed. The store refuses an "always" decision for an action whose policy source is `always_ask` (`store.ts:165-171`). Private sharing builds such an action (`ASK_EVERY_TIME`, `private-share.ts:95-100`). |
| App page | [code: openbot/app/src/components/routines/routines-list.tsx:205, 298, 310, 382-431, 453-500] | Rows show the schedule, zone and channel, a pause switch, Run now, History, and Delete with a confirm. "Open conversation" (`:205`) goes to the channel, not to a run. No calendar, no create, no edit. |
| Activity | [code: openbot/app/src/components/shell/activity-screen.tsx:118] | The comment says the screen lists what the product's own Bot finished, "its routines, follow-ups" included. |
| Run to message | [code: openbot/server/src/channels/routes.ts:276-285, 1080] | `recordActivity` resolves to nothing, so the caller gets no message id. A run row cannot point at its messages. |
| History size | [code: store.ts:710-724] | Fifty runs by default, at most 100. No paging. Runs are deleted only with their routine ([code: coworker.ts:157]). |
| Engine limits | [code: openbot/agent-freeduet/freeduet/engine_breaker.py:8]; [code: openbot/agent-freeduet/freeduet/server_calls.py:225-226, 442] | The engine breaker is wired to no run. Token counts are text length divided by four, not measured. |
| Upstream | [code: docs/PROJECT.md:39]; [code: docs/UPSTREAM_TOUCHES.md:62, 72, 193] | PROJECT.md lists routines as OpenBot code, "Fork, unchanged". FreeDuet changes only the wiring around the routine runners (rows 62 and 72). The team wiring leaves `routines/store.ts` untouched (row 193). |

Three gaps matter most:

- A routine write can skip the setup card. The switch must be off, and auto-review must be off or must allow the write. Auto-review is on by default ([code: docs/M1_PLAN.md:82]). Whether FreeDuet has a reviewer for routine turns is [verify].
- A missed run leaves no trace, and nothing counts routine turns per day.
- A history row cannot reach its messages, and the daily review zone is one constant.

## 3. The design

### 3.1 Smallest version worth shipping (V1)

1. **One setup card.** A routine write goes through the approval gate. The server builds the card from the arguments the tool received, so what the person approves is what gets stored. The card shows:
   - the schedule in words ([code: openbot/server/src/routines/schedule.ts:254]), with the raw cron below it;
   - the zone, or "UTC, none given" when the person gave none;
   - the member, and "runs as you" ([code: builtin-routines.ts:107]);
   - the instruction as it will be stored, at most 2,000 characters ([code: store.ts:68]), with a warning when it restates the schedule, which the tool text already forbids ([code: builtin-routines.ts:88-92]);
   - the channel where the reply lands;
   - the tools the routine may use, and "each write asks again when it runs";
   - the runs per day and the budget left (item 8).
   Buttons: Allow, Change, No. No "Always allowed" is offered for a routine write (D6). The daily review is set up by FreeDuet, not in chat, so it keeps its own path (S8).
2. **A missed run is a row.** When the sweep passes a stale stamp ([code: openbot/server/src/routines/sweep.ts:203-210]), it writes one `skipped` row for the gap, with the first missed time in a new nullable `scheduled_for` column. It writes that row only when `advanceNextRun` returns true. Today the return value is ignored in both branches ([code: sweep.ts:199-209]). `markUnschedulable` already writes a `skipped` row for a firing that never became a turn ([code: store.ts:943-948]), and the fatigue rule does not count skipped rows ([code: store.ts:981]). A new column adds no enum value ([code: CLAUDE.md:147]).
3. **A run links to its messages.** The turn mints its own run id ([code: openbot/toolkit/src/run-turn.ts:699]) and returns none ([code: run-turn.ts:601-608]). Its input takes an optional run id ([code: run-turn.ts:93]). S2 returns the turn's run id and stores it, with the thread id, on the routine run row, as one nullable pair with one migration. History then links to that run's place in the thread.
4. **Calendar read.** `GET /api/routines/calendar?from&to` lists the next occurrences of enabled routines. It uses `nextOccurrence` ([code: openbot/server/src/routines/schedule.ts:143-176]), which calls cron-parser's `next()` ([code: schedule.ts:159-166]). At most 14 days and 500 items; the rest shows as "and more". Paused routines show as paused.
5. **History with paging.** Cursor paging on `GET /api/routines/:id/runs`. Rows with `scheduled_for` set (item 2) show "Missed". Pruning after 90 days [assumed: a chosen length, not measured].
6. **Pause, run now and delete stay as they are.** Delete keeps its confirm dialog and says the history goes too, because runs are deleted with their routine ([code: openbot/server/src/db/schema/coworker.ts:157]).
7. **Edit is a chat act.** "Change it to 10:00" calls `update_routine`, and the card shows the old and new values.
8. **Limits.** Keep 20 enabled routines and the 15-minute floor ([code: schedule.ts:4]). Add a daily budget of routine turns per person, scheduled or run now, checked in the runner before `runTurn` ([code: openbot/server/src/routines/runner.ts:142-145]). Add a 60-minute floor for routines made in chat. The numbers are D3. Routines may not chain turns past their limits ([code: docs/ENGINES_PLAN.md:148]).
9. **Who creates for whom.** A member creates routines only for itself: the tool takes the Bot from the connection ([code: builtin-routines.ts:378, 415-417]). No member may address another, and the hand-off depth is 1 ([code: openbot/server/src/freeduet/hub-grants.ts:9-11]). So a routine for a member goes through Iris. Iris holds the routine and hands the work over on each firing. The hand-off is pre-approved ([code: docs/M1_PLAN.md:82], D21), and the member's own writes still ask. The cost is two turns per firing [assumed].

### 3.2 After V1

- V2: "catch up once" for morning routines, inside a window (D2). A zone per person (D5), used by new routines and by the daily review, replacing the constant at [code: openbot/server/src/freeduet/person-team.ts:59].
- V3: a routine waits when an engine is down, instead of failing. Needs the engine breaker wired ([code: openbot/agent-freeduet/freeduet/engine_breaker.py:8]) and the engine plan ([code: docs/ENGINES_PLAN.md:107, 148]).
- V4: event triggers ([code: openbot/server/src/responsibilities/trigger-tools.ts:56-146]) in the same calendar and history.
- Later: routines Iris holds for members (D4); a cap on routines running at once, which the upstream doc lists as open ([code: openbot/docs/routines.md:116-119]).

## 4. Slices (one PR each)

Test files named below exist on origin/main, except the ones marked new.

| # | Builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|
| S0 | Checks, no product change: (a) whether a routine write skips the card when the switch is off and the reviewer allows it, or when auto-review is off; (b) cron-parser cases: a weekly 09:00 across the Europe/Rome clock changes, and a local time that does not exist | `approvals-policy.integration.test.ts` (new cases); `routine-schedule.test.ts` (new cases) | nothing | S |
| S1 | One `skipped` row per missed gap, with `scheduled_for`, written only when `advanceNextRun` returns true | `routine-sweep.integration.test.ts`: a stale stamp gives one row and no turn; two passes give one row | S0(b) | S |
| S2 | Run id and thread id on the routine run row; the turn returns its run id | `routine-run-turn.test.ts`, `routine-runner.test.ts`: both ids present on success and on failure | nothing | M |
| S3 | Calendar read, with caps | `routine-schedule.test.ts` (14 days, DST, paused, cap); `routine-routes.test.ts` (owner only) | S0(b) | M |
| S4 | History paging; 90-day pruning | `routine-routes.test.ts` (cursor); `routine-sweep.integration.test.ts` (prune) | S2 | S |
| S5 | App: calendar, history with run link, "Missed" label | new test beside `routines-no-worker.test.ts` | S2, S3, S4 | M |
| S6 | Setup card on the existing gate, built on the server. Routine writes get an always-ask policy, the shape private sharing uses ([code: openbot/server/src/proactive/private-share.ts:95-100]), so no "always" rule can be made for them | `approvals-policy.test.ts` (no always rule for routine writes); `builtin-routines.test.ts` (card text); new app approval-view test | S0(a), D1, D6 | L |
| S7 | Daily budget; 60-minute floor for chat-made routines | `routine-runner.test.ts` (budget refusal is `skipped`, no turn); `routine-schedule.test.ts` (floor) | D3 | M |
| S8 | A zone per person; the daily review uses it | `freeduet-team.test.ts` (the person's zone, not Europe/Rome) | D5 | M |
| S9 | Routines Iris holds for members | `freeduet-team.test.ts`; hub hand-off tests | D4, S6 | L |

S1 to S7 edit OpenBot files, so each needs a row in `docs/UPSTREAM_TOUCHES.md` ([code: CLAUDE.md:49]). Each new test that opens a database pool closes it ([code: CLAUDE.md:139-141]).

## 5. Rules that must hold

- **Logins first.** A routine turn runs on the person's subscription login. No metered engine is added to routines ([code: CLAUDE.md:26-28]; [code: docs/ENGINES_PLAN.md:107]).
- **Credentials.** The card, the calendar and the history never show or store login data ([code: CLAUDE.md:31-32]).
- **No personal data.** Test fixtures use invented names and zones ([code: CLAUDE.md:33]).
- **Approval.** Account actions keep the person's approval. A routine write asks unless D6 decides otherwise ([code: CLAUDE.md:36-42]).
- **Full access** never applies to a routine ([code: CLAUDE.md:43-47]; [code: docs/FULL_ACCESS.md:24]).
- **Change only what was asked.** V1 changes no tool name and no grant. The approval change is D6 alone ([code: CLAUDE.md:48]).
- **Minimal upstream changes.** Routines are OpenBot code ([code: docs/PROJECT.md:39]). Each touch gets a row ([code: CLAUDE.md:49]).
- **Public wording.** This file names no private project of the maintainer ([code: CLAUDE.md:34-35]).
- **Decisions wait.** Section 6 is the maintainer's to decide. A decision changes the roadmap row in the same session ([code: CLAUDE.md:75-77]).
- **Schema.** A new enum value breaks the schema test ([code: CLAUDE.md:147]). V1 adds no enum value; S1 adds one nullable column only.

## 6. Open decisions

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| D1 | How a setup is approved | (a) the existing approval, drawn as one card; (b) a second confirmation step; (c) no card | (a) | One card. Today the card shows raw keys ([code: openbot/app/src/lib/approval-view.ts:178-186]). |
| D2 | Missed runs | (a) skip and record; (b) catch up once inside a window; (c) catch up every missed run | (a); (b) per routine, off by default | The upstream policy is to skip, not replay ([code: openbot/docs/routines.md:50-63]). (c) sends stale summaries in a burst. |
| D3 | Limits | (a) keep the 15-minute floor and 20 routines; (b) a 60-minute floor for chat-made routines, plus a daily budget per person; (c) a budget per Bot | (b); set the budget from a measured run on the eval stack | 20 routines at a 15-minute floor allow 1,920 turns a day for one person ([code: openbot/server/src/routines/store.ts:66]; [code: schedule.ts:4]). Run cost is not measured ([code: openbot/agent-freeduet/freeduet/server_calls.py:225-226]). Wake-up allows 20 a day ([code: wake-up.ts:38]). |
| D4 | Who creates for whom | (a) each member for itself; (b) Iris holds routines that hand work to members; (c) a member names another member | (a) now; (b) later | No member may address another ([code: hub-grants.ts:9-11]). (b) costs two turns per firing [assumed]. |
| D5 | Time zone | (a) per routine, UTC when none is given; (b) a zone per person, for new routines and the daily review | (b) | The daily review uses one constant zone for everyone ([code: person-team.ts:58-59]). "9 o'clock" should mean the person's 9. |
| D6 | Setup and approval gate | (a) as today: a rule or the switch can skip the card, and the reviewer decides the rest; (b) routine writes always ask: no rule, switch or reviewer skips them, and "Always allowed" is not offered | Decided 14 November 2026: (b). A routine or trigger that writes, and any change to a routine's or trigger's configuration, always shows the approval card. Full access does not unlock it. | FULL_ACCESS.md says routines always ask ([code: docs/FULL_ACCESS.md:24]). The gate can skip the card for a routine write ([code: openbot/server/src/approvals/policy.ts:508-570]). |

## 7. What was not verified

- When this was written, no test was run, and no database, stack or live routine was used. Tests since then are in section 8. Line numbers are from origin/main 452e060. Most were read again for this file; the rest come from my first inventory of the same commit and were not re-read.
- Whether FreeDuet runs a reviewer model for unattended turns. Auto-review is on by default ([code: docs/M1_PLAN.md:82]), and with no model the reviewer says ask ([code: policy.ts:376-377]) [verify].
- Whether a personal allow rule matches a routine write. Personal rules count only when custom rules are on ([code: policy.ts:459]) [verify].
- Whether the app offers "Always allowed" on a routine write [verify].
- Whether a resumed turn that fails can still reach the `succeeded` write ([code: resume-sweep.ts:236-244]) [verify].
- How cron-parser 5.10.0 ([code: openbot/bun.lock:1160]) treats a local time that does not exist at a DST change. The pair check in `nextOccurrence` ([code: schedule.ts:171-173]) is meant to catch some DST shapes ([code: schedule.ts:138-141]). Not tested here [verify, S0(b)].
- Whether an approval expires. A search of `server/src/approvals` for "expir" found nothing [assumed].
- Whether each member hop is a full subscription turn, and what it costs [assumed].
- The trailing year field that [code: openbot/server/src/routines/schedule.ts:17-21] says cron-parser accepts. Not tested.
- The Kubernetes CronJob documentation was not read, so nothing is claimed from it.
- `openbot/mobile` was not read.
- The 90-day retention and the 14-day and 500-item caps are proposals, not measurements.

## 8. Built so far

This branch (`automations-calendar-history`) builds the read-only part and nothing else. It creates, changes, pauses or deletes no routine, from the view or from chat. The approval gate (section 6, D6) is not touched.

Built:

- **Calendar read (S3).** `GET /api/routines/calendar?from&to`, with an optional `agentId`, lists the next run of each enabled routine inside the window, from the stored clock ([code: openbot/server/src/routines/calendar.ts]; [code: openbot/server/src/routines/routes.ts]). The window is at most 14 days and the answer at most 500 runs; `truncated` says when more fall inside the window. A stamp that is already due starts at the window's start. Paused routines are left out.
- **History read.** `GET /api/routines/runs?limit&agentId` returns the person's runs across their routines, newest first, at most 100. Each row carries the id of its routine and of its Bot; the app turns them into names. There is no paging yet (S4). Both store reads are owner-scoped ([code: openbot/server/src/routines/store.ts]).
- **App.** The Routines screen has three views: Routines (the list, unchanged), Next runs (the calendar, grouped by day) and History ([code: openbot/app/src/components/routines/routines-list.tsx]; [code: openbot/app/src/components/routines/routine-calendar.tsx]; [code: openbot/app/src/components/routines/routine-history.tsx]). Times are in the device's zone. A routine on another zone shows its own clock beside the time. History shows the outcome, when the run started, its source, the member, the routine's words, and a line when a run waits for an approval.
- **Tests.** Server: `routine-calendar.test.ts` (20: window rules, a DST change in Europe/Rome, the cap, paused and unreadable routines, and the route answers through a fake store) and `routine-history.integration.test.ts` (7, against Postgres: owner, stranger, the Bot filter before the limit, the limit). App: `routine-schedule-view.test.ts` (14) and `routines-views.test.tsx` (4).

Not built, and why:

- **Missed runs (S1).** No "Missed" label and no row for a gap. Both need a change to the sweep and a new column.
- **Run to messages (S2).** A history row links to its conversation, not to its run. That needs the turn to return a run id, and a migration.
- **Paging and pruning (S4).** The history stops at 100 rows.
- **Event triggers (V4).** Not on this view. Each Bot's Responsibilities page still lists them.
- **Writes (S6 to S9).** No setup card, no change from chat, no daily budget, no zone per person, no routines held by Iris.

For the maintainer to decide (none is taken here):

1. Missed runs: S1 changes the sweep and adds one nullable column (`scheduled_for`). Build it now, or wait?
2. Run links: S2 adds a run id and a thread id to each run, with one migration and a change to what the turn returns. Build it?
3. History size: paging with 90-day pruning (S4), or the latest 100 rows?
4. Caps: 14 days, 500 runs and 100 history rows are proposals. Confirm or change them.
5. Time zone (D5): until each person has a zone, times show in the device's zone. Should the calendar wait for D5?
6. Event triggers on this view (V4): now, or after S2?

Verified:

- Server: the four routine suites pass against Postgres, 55 tests in all (`routine-calendar`, `routine-history.integration`, `routine-routes`, `routine-runner`). All 16 routine suites together: 330 pass. The whole server suite: 7,902 pass and 3 fail. The 3 are the two real-provider learning tests and the Mastra bridge test, and they fail the same way on origin/main in this sandbox. On main the new calendar module and the two store reads do not exist, so the new suites cannot pass there.
- The assertion-shape guard passes (10 tests). The project gate, `bun run typecheck:tests`, is clean against the baseline (239 known errors). Two baselined lines were edited, because the store interface gained two methods. The server and app source typechecks are clean.
- App: the 18 new tests pass, and the four view tests fail against main's list file. The app typecheck is clean. Biome format and lint pass on the whole `openbot` tree.

Not verified:

- No one has looked at the views in a browser or on a phone, so the layout is unchecked.
- The eval stack was not run. No member's prompt changed, so no case was added or moved.
- The whole app test suite was not run. The sandbox fails about 138 of its tests on plain main under happy-dom, so only the new and changed app files were run.
- The zone rules are tested with fixed zones only, not with a person's own zone.
