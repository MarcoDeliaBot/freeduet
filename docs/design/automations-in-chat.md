# Automations written in chat: calendar, history and limits

Design, plus the read-only part built (section 8, Built so far), and the routine's card in the chat, built in PR #241 (section 9.5): the card with Pause or Resume, Edit and Cancel, drawn after a routine is created. Status checked 2026-11-17 against origin/main 7ee1dc6: writing a routine in chat is built, because creating, changing or deleting one asks with the ordinary approval card, whose Details show the arguments as raw JSON ([code: openbot/server/src/freeduet/always-ask.ts:11-13, 172]; [code: openbot/app/src/components/approvals/approval-card.tsx:324-343]). Not built: the setup card that states the schedule, the zone and the channel in words, with a Change button (sections 3.1 and 8). Written 2026-11-14 against origin/main of that day. Roadmap row: "Automations written in chat, with a calendar and history", status In progress ([code: docs/ROADMAP.md]). Decided 14 November 2026: D6 (section 6). Nothing else here is decided; section 6 lists what the maintainer must still choose.

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
3. **A run links to its messages.** The turn mints its own run id ([code: openbot/toolkit/src/run-turn.ts:699]) and returns none ([code: run-turn.ts:601-608]). Its input takes an optional run id ([code: run-turn.ts:93]). S2 returns the turn's run id and stores it, with the thread id, on the routine run row, as one nullable pair with one migration. History then links to that run's place in the thread. Decided 14 November 2026: a run has a link to its conversation.
4. **Calendar read.** `GET /api/routines/calendar?from&to` lists the next occurrences of enabled routines. It uses `nextOccurrence` ([code: openbot/server/src/routines/schedule.ts:143-176]), which calls cron-parser's `next()` ([code: schedule.ts:159-166]). At most 14 days and 500 items; the rest shows as "and more". Paused routines show as paused.
5. **History with paging.** Cursor paging on `GET /api/routines/:id/runs`. Rows with `scheduled_for` set (item 2) show "Missed". Decided 14 November 2026: run history is kept 90 days.
6. **Pause, run now and delete stay as they are.** Delete keeps its confirm dialog and says the history goes too, because runs are deleted with their routine ([code: openbot/server/src/db/schema/coworker.ts:157]).
7. **Edit is a chat act.** "Change it to 10:00" calls `update_routine`, and the card shows the old and new values.
8. **Limits.** Keep 20 enabled routines and the 15-minute floor ([code: schedule.ts:4]). Add a daily budget of routine turns per person, scheduled or run now, checked in the runner before `runTurn` ([code: openbot/server/src/routines/runner.ts:142-145]). Add a 60-minute floor for routines made in chat. The numbers are D3. Routines may not chain turns past their limits ([code: docs/ENGINES_PLAN.md, section 8, rule "No long autonomous pipelines"]).
9. **Who creates for whom.** A member creates routines only for itself: the tool takes the Bot from the connection ([code: builtin-routines.ts:378, 415-417]). No member may address another, and the hand-off depth is 1 ([code: openbot/server/src/freeduet/hub-grants.ts:9-11]). So a routine for a member goes through Iris. Iris holds the routine and hands the work over on each firing. The hand-off is pre-approved ([code: docs/M1_PLAN.md:82], D21), and the member's own writes still ask. The cost is two turns per firing [assumed].

### 3.2 After V1

- V2: "catch up once" for morning routines, inside a window (D2). A zone per person (D5), used by new routines and by the daily review, replacing the constant at [code: openbot/server/src/freeduet/person-team.ts:59].
- V3: a routine waits when an engine is down, instead of failing. Needs the engine breaker wired ([code: openbot/agent-freeduet/freeduet/engine_breaker.py:8]) and the engine plan ([code: docs/ENGINES_PLAN.md, section 5, switch rule "Unattended turns"; section 8, rule "No long autonomous pipelines"]).
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

- **Logins first.** A routine turn runs on the person's subscription login. No metered engine is added to routines ([code: CLAUDE.md:26-28]; [code: docs/ENGINES_PLAN.md, section 5, switch rule "Unattended turns"]).
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

- **Missed runs (S1).** Built in PR #207 (migration 0070, `scheduled_for`): the "Missed" label, and a missed run is recorded.
- **Run to messages (S2).** A history row links to its conversation, not to its run. That needs the turn to return a run id, and a migration.
- **Paging and pruning (S4).** The history stops at 100 rows.
- **Event triggers (V4).** Not on this view. Each Bot's Responsibilities page still lists them.
- **Writes (S6 to S9).** The setup card, and the card's Pause, Resume and Cancel, are built in PR #241 (section 9.5). A change from chat is built: Edit sends the person's words, and the member's `update_routine` goes through the approval card [code: openbot/app/src/components/routines/routine-chat-card.tsx:114; openbot/server/src/plugins/builtin-routines.ts:150]. Not built: the setup card's Change button and the card that shows the old and new values (section 3, items 1 and 7), no daily budget, no zone per person, no routines held by Iris.

For the maintainer to decide (none is taken here):

1. Missed runs: S1 changes the sweep and adds one nullable column (`scheduled_for`). Build it now, or wait? Decided 14 November 2026: build it, with the "Missed" label. Built in PR #207 (section 8).
2. Run links: S2 adds a run id and a thread id to each run, with one migration and a change to what the turn returns. Build it? Decided 14 November 2026: build it, so that a run links to its conversation.
3. History size: paging with 90-day pruning (S4), or the latest 100 rows? Decided 14 November 2026: paging with 90-day pruning (S4).
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

### Second slice, branch `routines-missed-link-90` (14 November 2026)

Three pieces, one commit each, smallest first. Each is read from the code on main at `c93c947` and each was tested against real Postgres.

**1. Retention (done).** What bounds the history today, with the number and what it bounds:

| Number | Where | What it bounds |
|---|---|---|
| 14 days | `openbot/server/src/routines/calendar.ts:13` (`CALENDAR_MAX_DAYS`) | The longest window the "Next runs" view may ask for. It bounds the calendar, not the history. |
| 500 runs | `calendar.ts:14` (`CALENDAR_MAX_RUNS`) | The number of upcoming runs one calendar answer lists. It bounds the calendar's size. |
| 100 rows | `openbot/server/src/routines/store.ts:775` (`listRuns`) and `:817` (`listRunsFor`), `routes.ts:149` and `:297` | The most rows one history read may return. It protects the page and the query. The app asks for 100 (`app/src/lib/routines/schedule-queries.ts:67`) and names the cap when it gets 100 (`routine-history.tsx:49`, `HISTORY_LIMIT`). |
| 50 rows | `routes.ts:294` (default), `store.ts:759` (`listRuns`) and `:793` (`listRunsFor`) default `limit = 50` | The history read when no limit is given. |
| 400 characters | `store.ts:70` (`MAX_RUN_ERROR`) | The error text kept on a run row. |
| 20 runs | `store.ts:86` (`FAILURE_SCAN_LIMIT`) | How far back the fatigue rule counts failures. It is not a display limit. |
| 10 minutes | `openbot/server/src/routines/sweep.ts:58` (`DEFAULT_GRACE_MS`) | How late a firing may be and still be offered. |

Built: the history reads now answer only runs that started within ninety days of the database's clock (`HISTORY_WINDOW_DAYS`, `store.ts`, `withinHistoryWindow()`). It is a read filter. Nothing is deleted, and the 100-row cap stays. Verified: `routine-history.integration.test.ts` ("the history keeps ninety days of runs, and deletes none": a run at 91 days is left out of both reads and is still in the table; it fails on main's source, where the 91-day run is listed). Not built: pruning. Deleting runs older than ninety days is a separate decision, because it removes data (decision 3 below).

**2. The conversation link (done).** Each run now records the conversation it posted into: `routine_runs.channel_id` (migration 0069, nullable, no foreign key). The runner writes it once it has read the channel as the owner (`runner.ts`), so a routine moved to another channel later does not move the link of an earlier run. Both history reads return `channelId` only while the owner may still open that conversation, asked of the channel store as the owner (`routes.ts`, `openableConversations`). With no channel store nothing is openable. The thread id is never in a response. The app's "Open conversation" uses that `channelId` (the routine history and each routine's own History), through the existing `/channel/$channelId` route. Verified: `routine-history.integration.test.ts` (six cases on real Postgres with two people: the link, a stranger sees no run and no thread, a link is dropped when the conversation is deleted, a moved routine keeps its runs' links, a run with no conversation names none, no channel store means no link), `routine-runner.test.ts` (the write, and a failed write does not stop the run), `routines-views.test.tsx` (three cases). Each fails on the source before the change. Not built: a link to the message the run posted (the conversation is the link). Runs recorded before this change have no link. A backfill from the routine's current channel would be a guess when the routine has since moved, so it is not done.

**3. Missed runs (done, with limits).** A firing the server did not run is written down once, as a `skipped` row whose `started_at` and `finished_at` are the time it was due and whose `scheduled_for` is that same time (`routine_runs.scheduled_for`, migration 0070, with a unique index per routine and occurrence). Its error text is "The server reached this occurrence too late to run it, so no run was started." History and each routine's own list show it as "Missed", and it names no conversation. Two places write it, and only where the server holds the fact that the firing was dropped: a stale stamp that the sweep moves past instead of offering (`sweep.ts`, the branch that advances without offering), and a queued firing claimed more than the grace window after its occurrence (`sweep.ts`, before the claim is finished). Each waits a settle margin of 60 seconds past the grace window (`MISSED_SETTLE_MS`). The write (`store.ts`, `recordMissed`) is one statement. It writes nothing when a run already started for that occurrence inside the window, and nothing when the occurrence has a row already. A missed row does not change the fatigue rule, which already leaves skipped rows out (`consecutiveFailures`), and it does not change when or whether a routine fires. A long outage writes one row, for the first occurrence it passed (decision M1).

Not written, on purpose: a paused, switched-off or deleted routine; a firing given up after repeated dispatch failures; a firing whose queue item another replica holds. The server stores no fact that says those occurrences were missed, rather than chosen, given up, or possibly still running (decisions M2 and M3).

This slice answers items 1 and 2 of the maintainer list in section 8: missed runs are built, with the limits in the decisions below, and run links are built to the conversation, not to the message.

Verified:

- Server, against real Postgres: `routine-sweep.integration.test.ts`, 33 pass. Eight of them are new, in "writing down the firings the server did not run" and the schedule-floor check for the miss window. Two existing expectations changed: a firing claimed late, and a firing abandoned by the grace window, now each write one missed row for their occurrence (the second beside its closed attempt row). `routine-history.integration.test.ts`, 17 pass, three new: History and the list name the miss, a stranger sees none of it, and a missed firing does not break the fatigue streak.
- All 15 server routine suites together: 320 pass.
- App: `routines-views.test.tsx`, 9 pass, two new: History reads Missed with the reason and no conversation link, and the routines list reads Missed. The three app routine files together: 28 pass.
- On the piece-2 source, the new cases fail: 7 sweep cases (the two changed expectations and five new), 3 history cases and 2 app cases. Three new cases pass there too, because the old source writes nothing: the two guards that assert nothing is written inside the settle margin, and the schedule-floor check.
- Gates: `bun run typecheck:tests` is clean against the baseline (239 known errors). Two baselined lines were re-worded, because the two typed fakes' member lists changed with the store interface, and their missing methods did not change. Server and app `tsc --noEmit` are clean. Biome format and lint are clean on the changed files. `assertion-shape.test.ts`, 10 pass.

Not verified:

- Migration 0070 was applied to a local test database on the shared Postgres 16 cluster (port 5561). Nothing was applied to a deployment, and the whole server suite was not run for this slice; the server routine suites were.
- The settle margin is timing, not a lock. A dispatch that waits more than 60 seconds between its grace check and its insert could still have its run recorded beside a missed row. No test forces that stall.
- A run started with Run now inside the window of a missed occurrence hides that miss, because the check reads any run. That errs toward not writing a miss. It is not tested.
- The label, the reason line and the amber tone have not been looked at on a screen.
- No routine ran on the eval stack or on a real deployment.

Decisions left to the maintainer (none is taken here):

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| M1 | A long outage | (a) one row, for the first occurrence it passed (built); (b) one row per occurrence it passed; (c) one row for the whole outage, saying how many occurrences it covers | (c) | (b) writes about 2,900 rows for a fifteen-minute routine that was down for a month. (a) shows one time where many were missed. (c) needs a count in the row or its text; the count comes from the schedule the sweep already reads. |
| M2 | Paused, switched-off or deleted routines | (a) write nothing (built); (b) write a row saying the routine was paused | (a) | A pause is a choice. The stored clock is recomputed when a routine is switched back on, so the occurrences that passed while it was paused are not stored anywhere, and a row would be a guess. |
| M3 | Firings given up after repeated dispatch failures | (a) write nothing (built); (b) write a miss once the reaper has closed their attempts | (a) | A dispatch that timed out can still come back and finish its run (the comment at the dispatch in `sweep.ts`). Nothing stored says the attempts are dead, so the server cannot say the firing was missed. |
| M4 | The settle margin | (a) 60 seconds (built); (b) a longer margin; (c) write misses from the reaper, after open attempts are closed | (a) | A minute covers an ordinary database round trip. (b) only delays rows. (c) moves the write to another pass, a larger change than the risk it removes. Revisit only if the database can stall for longer than a minute. |
| M5 | The words a person reads | (a) "Missed", with the reason above (built); (b) other words; (c) no label, only the reason | (a), unless the maintainer prefers other words | The person needs to read a miss as a miss, and the reason must not blame them. The text is English, as the interface is. |
| M6 | Missed in other places | (a) History and each routine's list only (built); (b) also the calendar, notifications or the Bot's page | (a) for now | Those surfaces answer other questions (the calendar shows future runs). Who is told, and how, is a product decision. |

## 9. The routine's card in the chat (branch `routine-card-in-chat`)

Roadmap row "The routine's card in the chat" (section Now, decided 15 November 2026): when a routine is written in chat, a card under the message shows what it will do and when it runs next, with Pause, Edit and Cancel, without leaving the conversation. Routines always ask when they act, as today. This section is the first slice: the card, in the app only, with no server change. It changes nothing in how a routine runs and in no approval.

Markers are as in section 2.

### 9.1 What the person sees

After `create_routine` succeeds, a card appears under its tool line. A call that is one step of a folded run gets its card under the fold ([code: openbot/app/src/components/channels/tool-activity.tsx:562-568]). A call alone in its turn gets it under the line ([code: openbot/app/src/components/channels/chat-transcript.tsx:1735-1736]). The card reads the routine's current state each time the conversation is drawn.

| State | What the card says | Buttons |
|---|---|---|
| Active | The routine's instruction, as plain text, cut at 160 characters. "Next run: Monday, 16 November 2026 at 09:00 (Europe/Rome)." When the browser's zone differs, the same instant follows in that zone, named. | Pause, Edit, Cancel |
| Paused | The instruction, then "Paused". No next run is shown, because a paused routine has none. | Resume, Edit, Cancel |
| Cancelled in the card | "Routine cancelled", and nothing else. | none |
| Gone | "This routine no longer exists", and nothing else. | none |

- **Cancel** asks "Cancel this routine?" inside the card, with "Yes, cancel it" and "No, keep it" (the second has focus). Nothing is deleted before the first is pressed.
- **Edit** opens a box, "What should change?", and "Send change". Pressing it sends the person's own message, "Change my routine with id <id>: <their words>", through the conversation ([code: openbot/app/src/components/channels/conversation-send.tsx]). The member then changes the routine with `update_routine`, and that call shows its approval card as it does today. No edit screen or dialog exists for a routine, so this is the only edit path.
- **A failed read** shows the message the server gives, or "This routine could not be read." when it gives none. It never says "no longer exists", because a remote session is refused every routine route ([code: openbot/server/src/auth/remote-limits.ts:263]).

### 9.2 Rules

- The card's buttons are the person's own presses in the app. Pause, Resume and Cancel call the routes the Routines page already calls, so no approval card is added or removed. The Routines page switches a routine with no card and deletes it after a confirm today ([code: openbot/app/src/components/routines/routines-list.tsx:330-338, 441-451]). Nothing a member or a routine writes can press them.
- Edit sends a message the person typed. A change to the routine still asks with its card (D6), because the member's `update_routine` goes through the gate.
- No new server route, and no change to the remote list.
- The routine's id comes from the words of a successful `create_routine` result. That result ends with `· id: <id>` when the routine is switched on, and reads "That routine is set. Its id is <id>." on the fallback ([code: openbot/server/src/plugins/builtin-routines.ts:300-316, 333-353, 429-435]). A failed, refused or declined call gives no card ([code: openbot/app/src/lib/plugins/tool-result.ts:127, 144]).
- The routine's words are plain text and bounded. The zone is always named. A different browser zone shows both times.
- The dates are written in English (en-GB), because the interface is English.

### 9.3 Routes used

| Action | Route | Code |
|---|---|---|
| Read the state | `GET /api/routines` (the list; there is no get-by-id, on purpose) | [code: openbot/server/src/routines/routes.ts:193-202, 29-31] |
| Pause, Resume | `PUT /api/routines/:id/enabled` with `{ "enabled": false }` or `true` | [code: openbot/server/src/routines/routes.ts:204-223] |
| Cancel | `DELETE /api/routines/:id` | [code: openbot/server/src/routines/routes.ts:225-236] |
| Edit | none: a message through the conversation | [code: routes.ts:20-24] (no create or edit endpoint, on purpose) |

### 9.4 Not built, and why

- **An edit form.** A dialog that saved a routine directly would be a second write path with no approval card, which D6 forbids. A structured form that sends the same kind of message is a later decision (section 9.6, R1).
- **Cards for `update_routine`, `delete_routine` and triggers.** The first slice is the creation the roadmap row names.
- **Remembering a cancellation after the conversation is reopened.** The server keeps no record, so the card then reads "This routine no longer exists".
- **The schedule in words on the card.** The time is shown; the Routines page keeps the schedule.
- **Live updates.** The state is read when the card is drawn and after each press, not on a timer.

### 9.5 Built so far

Built on branch `routine-card-in-chat`, from origin/main cec4464.

- **The card (app).** `openbot/app/src/components/routines/routine-chat-card.tsx`: `RoutineChatCard` (the four states, the zone line, Cancel's confirm, Pause and Resume, Edit) and `RoutineCreatedCard` (draws the card only for a successful create).
- **The words it reads (app).** `openbot/app/src/lib/routines/chat-card.ts`: the id from the create result, the instruction cut to 160 characters, and the next-run line in one zone or two.
- **Where it is drawn.** `chat-transcript.tsx` (a single tool call) and `tool-activity.tsx` (a folded run), each one line after the approval card.

Verified:
- App: `routine-chat-card.test.tsx` 18 pass (the four states and a failed read, the zone line in one zone and in two, Cancel's question and its focus, the requests of Pause, Resume and Cancel, Edit, and the gate that draws the card for a created routine only); `routine-chat-card-words.test.ts` 18 pass (the id, the 160-character cut, the zone words); `routine-card-folded-run.test.tsx` 2 pass; `routine-card-lone-call.test.tsx` 2 pass.
- Fail before: the first two files cannot load on main, because the card's modules are not there (36 tests). In the folded run and in the lone call, the case where a routine is created fails on main (1 fail each, in `tool-activity.tsx` and `chat-transcript.tsx`). The other case in each of those files is a guard: a call that wrote no routine draws no card and reads no routine, and it passes on main too.
- Server: `server/tests/routine-card-words.test.ts` 3 pass. A guard, since no server file changed: it pins the sentence the app reads the id from.
- Whole app suite, `bun test app/`: 2967 pass, 0 fail, 312 files.
- Gates: `bun run typecheck:tests` clean against the baseline (239 known errors); app `tsc --noEmit` clean; Biome format and lint clean on the nine changed and new files; `assertion-shape.test.ts` 10 pass.

Not verified:
- Nobody has looked at the card in a browser or on a phone: layout, focus and the keyboard path are checked in code and in tests only.
- The remote-session case is not run: the routine routes are refused there (`remote-limits.ts:263`), and the card shows the message it gets.
- No routine was created, paused or cancelled on a running server. The requests are checked against stubbed routes.
- The zone tests pass fixed zones, not the browser's own zone.
- Edit's approval card for `update_routine` was not run live.
- The eval stack was not run. No member prompt changed.

### 9.6 Decisions left to the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| R1 | Edit | (a) a sentence the person sends through the conversation (built); (b) a structured form that sends the same kind of message; (c) a dialog that saves through a route | (a) now; (b) later; never (c) | There is no edit screen to reuse. (c) skips the approval card that D6 requires, and `routes.ts:20-24` rules out an edit endpoint. |
| R2 | Pause, Resume and Cancel without an approval card | (a) as the Routines page does today (built); (b) with a card each time | (a) | They are the person's own presses, as the switch and Delete are. A card on each would ask the person to confirm their own press. |
| R3 | Date form | (a) English, en-GB (built); (b) en-US | (a) unless the maintainer prefers US dates | The interface is English. The card does not follow the browser's locale, so every card reads the same way. |
| R4 | A cancelled routine after the conversation is reopened | (a) "This routine no longer exists" (built); (b) keep a record in the conversation | (a) for now | (b) needs a stored fact, which is a change to messages or to a table. |
| R5 | How the card learns the routine's id | (a) read it from the words of the create result (built, pinned by a server test); (b) a structured field on the tool result | (b) before the Edit form (R1) | (b) changes how tool results reach the app, which is outside an app-only first slice. |
| R6 | A remote session | (a) the card shows the message the server gives, and never says "no longer exists" (built); (b) a message of its own | (a) | `remote-limits.ts:263` refuses the routine routes to a remote session. |
