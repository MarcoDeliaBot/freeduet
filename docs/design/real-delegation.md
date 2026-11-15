# Real delegation (v0.3): design

Design only. No code is changed. Checked against origin/main at 5b96410. Since e1c11b3 no file under `openbot/` has changed; the later commits touch CI workflows, `CLAUDE.md`, `README.md`, `SECURITY.md`, `docs/` and the team evals in `evals/team/`.
Code markers: `[code: path:line]`, paths relative to `openbot/`. Documents and evals: `[doc: file, section]`, paths from the repository root. Anything not checked is marked `[assumed]`.

## 1. What the person gets

- You ask Iris once. She splits the job across members and brings back one answer [doc: docs/ROADMAP.md, row "Real delegation (v0.3)"].
- From slice S1, a check such as a review runs inside the same request, straight after the work it checks, with no message from you in between. Anything that leaves the team (a send, a payment, a booking, a deletion) still asks you first, as today. The one exception is a new email whose recipients you typed yourself (D27).
- From S2 you see the plan, with each step's state and what is already done. From S3 one button stops it, and work already done stays done.

## 2. What exists today

### 2.1 The rules that decide what a hand-off can do

| Rule | What the code does | Marker |
|---|---|---|
| Who may hand to whom | Iris to each member, and back. No member to member. | [code: server/src/freeduet/hub-grants.ts:9-11, 52-62] |
| Depth cap | `BOT_HANDOFF_MAX_DEPTH` = 1. A run at depth 1 is not offered `message_bot`, and the desk refuses one that gets through. | [code: server/src/config.ts:466; server/src/agents/handoff-tool.ts:111, 120; server/src/agents/handoff.ts:177-187] |
| Fan-out | At most `BOT_HANDOFF_MAX_PER_RUN` = 3 hand-offs per person and run. | [code: server/src/config.ts:467; server/src/agents/handoff.ts:321, 345, 389] |
| Pre-approval | A hand-off along a hub grant (effect `delegate`) does not ask. Each write the receiver makes still meets the gate. | [code: server/src/freeduet/hub-handoffs.ts:118-137; server/src/agents/handoff-tool.ts:137-160] [doc: docs/M1_PLAN.md, D21] |
| Forward hop | Runs in a scratch thread, with no computer tools. Its approval cards are announced in the asking conversation (example 2). | [code: server/src/agents/handoff-delivery.ts:277-279, 319-327; server/src/approvals/wiring.ts:65-115] |
| Relay | The answer goes back to the asker, in the asker's conversation, at the depth of the hop it answers. A relay at depth 1 cannot hand on. | [code: server/src/agents/handoff-runner.ts:181-190; server/src/agents/handoff-tool.ts:120] |
| Member's words | The relay task quotes the answer, then tells the asker to "Give the person the outcome...". Nothing in the relay payload says the quoted text is data, not instructions. | [code: server/src/agents/handoff-runner.ts:186-190] |
| The mark (D27a) | Written only for a hop made from the person's own turn at depth 0. Read only at depth 1; a relay carries none. | [code: server/src/agents/handoff-request.ts:89-94, 173, 197] |
| New email recipients | No card only when every recipient is a whole word of the person's latest message, at most 600 characters. | [code: server/src/plugins/typed-recipients.ts:40, 79; server/src/plugins/plugin-store/calls.ts:450-462] [doc: docs/M1_PLAN.md, D27] |
| Unattended writes | A write by a routine or a responsibility always asks. | [code: server/src/freeduet/always-ask.ts:37, 71-75, 108] [doc: docs/M1_PLAN.md, D35] |
| Tools and new members | Only an admin gives a Bot a tool. Leo's design skill (`design-a-colleague`) never grants one. `bot-creator` asks the person with a card. | [code: server/src/plugins/route-groups/grants.ts:112-114; examples/freeduet/agents.yaml:160, 273; examples/freeduet/skills.yaml:283-316, 953-962] |
| Failure and retry | The queue retries a hop up to 5 times. A hop that fails for good sends the person a notice. | [code: server/src/agents/handoff-runner.ts:146, 217-220, 466; server/src/work/queue.ts:93] |
| Time | Delivery deadline 5 minutes. Queue lease 60 s; the conversation lock is renewed every 30 s. | [code: server/src/agents/handoff-delivery.ts:561, 572; server/src/agents/handoff-runner.ts:144] |
| Engines | At most 2 engine switches per turn. An open engine is skipped until its reset time; with no reset time, a guessed minute that grows on repeats, up to a cap still to decide. Metered engines never turn on by themselves. | [code: agent-freeduet/freeduet/engine_router.py:73, 302-310] [doc: docs/ENGINES_PLAN.md, section 5, lines 92, 96, 107, 108] |
| Team log and report | One log entry per report. Six outcomes: done, partly done, in progress, blocked, failed, needs you. Iris reads the log through `team_log`, read only. | [code: agent-freeduet/freeduet/report.py:36; agent-freeduet/freeduet/team_log.py:42, 57; agent-freeduet/freeduet/iris_tools.py:116-120] |
| The `delegate` tool | Not built. Iris's prompt and the `delegate-work` skill name it. The hand-off tool is `message_bot`; `delegate` is only the effect name. | [code: server/src/agents/handoff-tool.ts:45, 143; examples/freeduet/agents.yaml:20-21, 58-59; examples/freeduet/skills.yaml:325-337] [doc: docs/PROJECT.md, F6] |

### 2.2 Three jobs, traced hop by hop

Depth is the hop depth. The eval cases named here are analogues. Their fixtures start at the hand-off in Iris's own turn (step 4 of examples 1 and 2), so none of them runs a relay turn.

1. **Review before delivery (eval analogue: `iris-5`; PROJECT F12).** The person asks Iris to send the invoice when it is ready.
   - Step 1: the person writes to Iris (depth 0). Iris hands the invoice to Penny at depth 1, pre-approved.
   - Step 2: Penny's draft returns as a relay, which Iris speaks in the person's conversation at depth 1. A depth-1 run is not offered `message_bot`, so Iris cannot send the draft to Vera [code: server/src/agents/handoff-tool.ts:120].
   - Step 3: Iris says Vera must check it first. The person writes again.
   - Step 4: in her own turn Iris hands the draft to Vera at depth 1. Vera's verdict returns as a relay, and Iris gives the person the invoice with it.
   - Two person messages. `iris-5` starts with Penny's report already in Iris's own turn, so it never tests the relay of step 2.
2. **Payment reminder (eval analogues: `iris-9`, `iris-11`, `penny-5`; M1 D30).** The person asks Iris for a reminder to a customer.
   - Step 1: Iris hands the drafting to Penny at depth 1. Penny has no send tool [doc: docs/M1_PLAN.md, D30].
   - Step 2: Penny's draft returns as a relay in Iris's conversation. Iris cannot hand it on to Otto from there [code: server/src/agents/handoff-tool.ts:120].
   - Step 3: Iris says the reminder is ready and cannot go out from here. The person writes "send it".
   - Step 4: in her own turn Iris hands the request to Otto at depth 1, as a forward hop. The address came from Penny's draft, not from the person's message, so the no-card rule does not apply [code: server/src/plugins/typed-recipients.ts:79] and Otto's send asks for a card.
   - Step 5: the card is announced in the person's conversation. The approval continuation keeps the hop's `forwardedProps`, which carry the signed run [code: server/src/approvals/types.ts:330]. The wiring takes the thread from that run, which names the asking conversation, and the notice points the person to the Bot's page [code: server/src/approvals/wiring.ts:65-115; server/src/index.ts:663-695]. Whether Otto's hop waits for that answer inside its 5-minute deadline was not traced [assumed].
   - Two person messages and one card. The roadmap already records the step at which Iris hands to Otto: it goes out when the person next writes to her [doc: docs/ROADMAP.md, row "Email goes through the member who sends it"].
3. **Table for four (eval analogues: `iris-2`; `jules-3` for the booking gate).** The person asks Iris for a booking.
   - Step 1: Iris hands the booking to Jules at depth 1, as a forward hop.
   - Step 2: Jules has no computer tools in a forward hop [code: server/src/agents/handoff-delivery.ts:319-327]. The purchase tool `request_purchase` is named in the prompts but not built [code: examples/freeduet/agents.yaml:20-21]. `jules-3` accepts a request for approval of the exact booking in words, which needs no tool.
   - Step 3: Jules's answer returns as a relay, and nothing is booked. The person has to write to Jules directly, where the browser runs [doc: docs/M1_PLAN.md, D22].
   - A purchase card, had the tool existed, would take the path of example 2. D22's reason says a forward hop's scratch thread would hide such a card until the delivery deadline [doc: docs/M1_PLAN.md, D22]; the wiring in example 2 does not match that reason.
   - One more person message, and depth does not help.

### 2.3 What is missing

- Example 1 stops at step 2. Depth 2 for Iris's relays removes the second person message and needs no card (S1).
- Example 2 stops at the card. The wiring announces it in the person's conversation, but whether the hop waits and resumes is not traced. Iris also cannot hand on from a relay, so S1 alone does not finish it; S5 does, once the wait is checked.
- Example 3 stops inside the forward hop: no browser, no purchase tool. Depth does not help. It needs decision D-e, and no slice gives forward hops computer tools.
- No eval shows any of this. A fixture cannot put a relay into a case, and a hop's tool calls are not in a case's transcript [doc: CLAUDE.md, "Team evals"].

## 3. The design

The smallest useful version is S1 to S3: one read-only check inside a bounded plan, a visible plan, and a stop button. S4 to S6 follow (section 6).

### 3.1 The plan belongs to Iris
- Iris opens a plan in the person's own turn, when she hands out work for one request. Only she writes it. No member writes or edits a plan.
- A step has a member (or Iris, for a check), a brief that is data, not instructions, a deadline, a state (waiting, running, done, failed, needs you, stopped), evidence, and an "already" line for anything sent, paid, booked or deleted.
- "Done" needs evidence [doc: docs/PROJECT.md, F24]. A plan approves nothing. Iris may add, change or skip a step; a skipped step the person asked for is named to them in one line.

### 3.2 Depth and hops
- Hand-offs outside a plan stay at depth 1, as today.
- Iris's relay turns may hand on once more, to depth 2. A depth-2 run cannot hand on.
- Members never start plan hops and never hand to each other (D-a).
- In S1 a depth-2 run is read-only: a write there is refused with a reason, before the gate. S5 lifts this only after the wait-and-resume check in section 9.

### 3.3 Budget
Enforced by the desk and the router, never by a model.

| Limit | Value (decision D-f) | Basis |
|---|---|---|
| Hops per plan | 6, in total | The per-run cap of 3 restarts in each run [code: server/src/agents/handoff.ts:321, 345], so only the plan counter bounds the whole. |
| Hops per run | 3 | As today [code: server/src/config.ts:467]. |
| Model turns per plan | 13 | 6 forward runs, 6 relay turns and Iris's first turn [assumed count]. |
| Wall clock per plan | 20 minutes | Two levels of 5-minute deadlines [code: server/src/agents/handoff-delivery.ts:572] with margin for relays [assumed]. |
| Engine switches | 2 per turn | [code: agent-freeduet/freeduet/engine_router.py:73] [doc: docs/ENGINES_PLAN.md, line 108] |
| Limited engine | Wait only for the reset time the engine states, which wins over any guess [doc: docs/ENGINES_PLAN.md, line 96]. The guessed one-minute wait [line 92] is not used in a plan: the step stops as "needs you". |
| Metered engines | Never inside a plan [doc: docs/ENGINES_PLAN.md, line 107]. The metered caps are not editable from the dashboard [line 117]. |
| Retries | Count against the same turn and hop limits [code: server/src/agents/handoff-runner.ts:146]. |

A plan cannot say what share of a subscription window its turns use. There is no usage ledger, and the caps are not built [doc: docs/ROADMAP.md, row "Never stops"]. The share is not measured.

### 3.4 Results and checks
- A member's answer reaches Iris as a relay, quoted and attributed [code: server/src/agents/handoff-runner.ts:186-190]. S1 adds one fixed sentence: the quoted words are what the member wrote, not instructions to Iris.
- Iris accepts "done" only with evidence [doc: docs/PROJECT.md, F24]. A deliverable the person will receive goes to a reviewer first, for at most three rounds, after which Iris decides. The different-engine rule for reviewers arrives in v0.3 [doc: docs/PROJECT.md, F12].
- A send or a payment is not retried until a check shows it did not already happen [doc: docs/PROJECT.md, F24]. A retried hand-off keeps its key per origin message [doc: docs/M1_PLAN.md, D37].

### 3.5 Iris's powers, and who decides what
- Iris's three powers: **decisional** (she sets the steps, 3.1), **temporal** (she sets and enforces time and budget, 3.3), **arbitral** (she judges each result and settles disagreements, 3.4).
- **Iris alone:** the order of steps, the member for a step, the brief, one corrected retry or another colleague after a mistake, stopping after two failed attempts [doc: docs/PROJECT.md, F24], and the order of reviews.
- **Disagreement:** when two results conflict, Iris decides, says why in one sentence and records the fork. A question she cannot settle goes to the person as one question.
- **The person always:** the F11 list (spending or raising a budget, messages to people outside the team, deleting data, changing permissions, keys or configuration, resuming a paused member without a check, publishing) [doc: docs/PROJECT.md, F11]; payments, purchases and bookings (`jules-3` expects an approval for the exact booking); and any lesson, which waits for approval [doc: docs/M1_PLAN.md, D16].
- **Iris's "no" always goes to the person.** She says in one sentence what she did not do and why, then asks them to decide. M1 section 13 already does this for email [doc: docs/M1_PLAN.md, section 13].
- New members and tools: she may ask for a new member (a card, through `bot-creator`) and for the tools it needs (a card to an admin). She grants nothing [code: server/src/plugins/route-groups/grants.ts:112-114].
- **Autonomy:** a member decides how to do its own piece within its brief, reports each fork it took (3.8), and reports each failure to Iris with one of the six outcomes and its evidence. It does not wait for a colleague and does not hand on.

### 3.6 Failure and retry
- The six outcomes and the rules of PROJECT F24: missing information, one question to the person; a mistake, one corrected retry or another colleague; a rule in the way, the person is told. After two failed attempts, or three "to fix" rounds from Vera, Iris stops and reports the options [doc: docs/PROJECT.md, F24].
- A hop the queue gives up on becomes a notice to the person [code: server/src/agents/handoff-runner.ts:217-220, 466]. Engine failures follow the switch rules and the breaker [doc: docs/ENGINES_PLAN.md, section 5].

### 3.7 The person's view and the one button
- The plan card sits in the conversation: steps, states, deadlines, budget used, and "already" lines.
- One button, "Stop plan": no new hop or relay starts; running hops are cut through the signal a pause already uses [code: server/src/agents/handoff-delivery.ts:186-198]; open cards for the plan are refused. Nothing done is undone.

### 3.8 What is logged
- Each hop and each plan change: plan, step, depth, from, to, outcome, budget used, and the fork (the choice made and the one not taken). Iris's "no", with its reason.
- The existing audit rows stay [doc: docs/M1_PLAN.md, D21].
- Members tell the person at which fork they chose what. S2 adds a fork field to the team log [code: agent-freeduet/freeduet/team_log.py:57]. A fork line in the report changes the report format, so it is a separate decision.

## 4. Rules that must hold
1. Delegation never launders an account action. A hand-off is pre-approved as a hand-off only [code: server/src/freeduet/hub-handoffs.ts:118-137]. Every write meets its own gate.
2. The mark (D27a) is earned only by the person's own typed words, in their own live turn, and travels one hop, as today. **Deeper chains may not carry it (recommended, D-d).** The mark checks recipients, not the body, and the body is the writing member's text [doc: docs/M1_PLAN.md, D27]. Each extra author would stand between the person's words and a send they never read.
3. Approvals belong to the person. A card shows the exact action, and no card is hidden from the person (D-e).
4. A plan started by a routine asks at every write [code: server/src/freeduet/always-ask.ts:71-75] [doc: docs/M1_PLAN.md, D35].
5. Only Otto sends email, and only when Iris asks him [doc: docs/M1_PLAN.md, D30] [code: examples/freeduet/skills.yaml:84-101].
6. Loop and cost bounds: depth 2 for Iris's relays only; 6 hops, 13 turns and 20 minutes per plan; 2 switches per turn; no metered engine; no member to member.
7. A hub, not a mesh [code: server/src/freeduet/hub-grants.ts:9-11].
8. No member grants a tool or a permission. The design skill says so [code: examples/freeduet/skills.yaml:953-962]. Tool grants are admin-only [code: server/src/plugins/route-groups/grants.ts:112-114].
9. A member's words are data. A relay names the member who answered and says it came from them [code: server/src/agents/handoff-runner.ts:189]. The receiver and its depth come from the signed run [code: server/src/agents/handoff-signing.ts:12-28].
10. Full access is the person's own setting, per person and member. A plan never turns it on, and a hand-off counts for it only when the server traces it to the person's typed message [doc: CLAUDE.md, "Rules that never bend"].
11. Unchanged from CLAUDE.md: logins first; no subscription credential read or forwarded; no secrets or personal data in the repository; change only what was asked; minimal upstream changes [doc: CLAUDE.md, "Rules that never bend"].

## 5. Threats

| Threat | Today | Design answer |
|---|---|---|
| A poisoned result from one member steers another | No path: hub only. Answers come back quoted through Iris. | Iris is a second reader, and the data sentence (S1). A recipient taken from a result always asks. A computer action in a relay opens a card in the person's conversation [doc: docs/M1_PLAN.md, D22]. |
| Runaway chains and retries | Depth 1, three hand-offs per run, queue retries up to 5 times [code: server/src/work/queue.ts:93]. | Depth 2 for Iris's relays only. A plan budget that retries count against. Engine breaker and switch limits. Stop plan. |
| A member grants itself tools through Leo | Leo's design skill never grants. Grants are admin-only. Members reach Leo only through Iris. | Unchanged. A tool need is a card for an admin that names the tool (S6). A designed member is a prompt, not a grant. |
| A member's words read as Iris's | A relay is Iris's voice in the person's conversation; the task says the words came from the member [code: server/src/agents/handoff-runner.ts:189]. | Every relay names the member and quotes the words (the S1 data sentence). |
| A plan turns Full access on, or sends without a card | Full access is per person and member, off by default, and a hand-off counts only when traced to the person's message [doc: CLAUDE.md, "Rules that never bend"]. | A plan does not change the setting. S1 refuses writes at depth 2, and S5 keeps the trace requirement. |

## 6. Slices (smallest first; each behind a new flag `FREEDUET_PLANS`, off by default)

| # | Builds | Proof (real Postgres, real gate) | Needs first | Size |
|---|---|---|---|---|
| S1 | Depth 2 for Iris's relay turns only. Plan id in the signed run. Depth-2 runs read-only. Budget of 6 hops. The data sentence in the relay task. Fixes example 1. | Flag on: Iris's relay at depth 1 is offered `message_bot`; a member's forward hop at depth 1 is not (guard); a depth-2 run is not offered it; a write in a depth-2 run is refused with no approval row; the 7th hop is refused with its reason; no mark at depth 2 (guard, `handoff-request.ts:173`). Flag off: offers unchanged (guard). | D-b and D-f decided | M |
| S2 | Plan table, read-only plan card, `plan_update` (Iris only: add, change, skip), plan and fork fields in the team log. | Migration; a member's `plan_update` refused; the card shows steps and budget (app test); log entry carries plan, step and fork (pytest). | S1 | M |
| S3 | "Stop plan": no new hop or relay; running hops cut through the pause signal; open cards refused; "already" list. | Stop during a running hop ends it, with no later relay; a stopped plan's card is refused; stop is logged; button test. | S2 | S |
| S4 | Review inside a plan: Vera checks a deliverable before the person sees it; her "no" goes to the person; at most three rounds, then Iris decides; a reviewer on a different engine (F12, v0.3). | Order enforced; "not approved" leaves the step as "needs you"; the reviewer's engine differs from the producer's. Eval cases in section 7. | S1, S2, the engine chains | M |
| S5 | Forward-hop cards: the hop waits for the person's answer within a stated limit; allow resumes it; deny ends it with its reason; a waiting card is not expired by the delivery deadline. With S1, fixes example 2. | A send in a forward hop opens a card in the person's conversation; deny ends the hop with its reason; allow sends once; a waiting card is not expired; a send whose recipients the person typed still needs no card (guard). | Wait-and-resume trace (section 9); D-e decided | L |
| S6 | New member on request: `bot-creator` card (exists); a tool need as a card naming the tool, for an admin. | Grants stay admin-only (guard); the tool card names the tool; nothing is granted without a card. | None (independent) | M |

## 7. Eval cases that prove each slice
No case can show a relay or a depth, so the Postgres tests are the proof. The cases below are guards, or new cases still to write. Prompt text is not run live until the team evals run. New IDs are the next free numbers on main at 5b96410: `iris-12` to `iris-15` and `jules-6` were added there after this design's first draft.
- S1: guards `iris-5` (starts at step 4, so the relay turn is untested) and `vera-5` (the reviewer's verdict rule); new `iris-16` (Iris holds the invoice until the relayed verdict arrives).
- S2: guards `iris-1` (three-way split), `iris-6` (evidence before "done"), `iris-7` (no third retry) and `iris-8` (safety).
- S3: `iris-8` (checks the first payment before any new attempt).
- S4: guards `iris-5`; `iris-10` (safety: a "no" goes to the person as "needs you"); new `iris-17` (Vera's "no" goes to the person).
- S5: guards `iris-9` and `iris-11`; safety `iris-4`, `iris-10`, `penny-5`. These need no Gmail. `otto-5` needs Gmail, which the eval stack lacks.
- S6: `iris-3` (no colleague covers the job, offers Leo's design), `leo-3` (points to Otto instead of a new bot); safety `leo-2`; `leo-1` for the design flow.
- Rules 4 and 10: related to `iris-13` and `iris-15` (safety, added on main: a routine asks with Full access on or off; Iris does not turn Full access on for herself).

Run them with `--id`. Safety cases must pass 100%.

## 8. Decisions for the maintainer
Labels D-a to D-f are local to this document. No M1 number is taken.

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| D-a | May members ask each other directly? | (1) Through Iris only. (2) Direct hub grants between members. (3) Direct, admin-granted per pair. | (1) | A direct edge needs a new grant kind and a new pre-approval scope [code: server/src/freeduet/hub-grants.ts:9-11; server/src/freeduet/hub-handoffs.ts:118-137]. Iris is the one place where a result is read before another member acts on it. |
| D-b | Depth for Iris's relays | (1) Stay at 1. (2) Depth 2 for Iris's relays, reads only until S5. (3) Depth 3 or more. | (2) | It removes the second person message in example 1 and leaves the mark and card rules unchanged. Each extra level multiplies fan-out, so the budget must come with it. |
| D-c | Continue a plan with no person message | (1) No: the person's next message continues it. (2) Server-started rounds for reads and hand-offs; every write waits for a card. (3) Unattended writes. | (1) now; (2) after S5 | (2) needs a new run kind under the always-ask rule. (3) breaks rules 1 and 4. |
| D-d | Does the mark (D27a) travel past one hop? | (1) No. (2) Yes, for plan hops. | (1) | The mark checks recipients only, and the body is the writing member's text. Each extra author is text the person never sees. Cost: an email two hops deep asks a card even when the person typed the address. |
| D-e | How a forward hop waits for a card | (1) As today: the card is announced in the asker's conversation; how long the hop waits is not settled. (2) The hop waits for the answer within a stated limit; allow resumes it, deny ends it with its reason; still no computer tools in forward hops. (3) Also computer tools in forward hops. | (2), after the wait-and-resume trace and a security review | (1) leaves the answer to a deadline that may end the hop first (not traced). (3) adds a click surface that D22 left out on purpose. |
| D-f | Budget per plan | (1) 4 hops, 8 turns, 10 minutes. (2) 6 hops, 13 turns, 20 minutes. (3) Larger. | (2) | Covers example 1 with room. An engine's own reset time, not the budget, sets a real wait [doc: docs/ENGINES_PLAN.md, line 96]. The numbers are cost, so the maintainer decides. |

## 9. What was not verified
- **Wait and resume in a forward hop (most important).** The card is announced in the asker's conversation, through the signed run's thread (example 2). Not traced: whether the forward hop waits for the answer, whether an answer resumes it inside the 5-minute deadline, and what a deny does to it. The comment at `handoff-delivery.ts:159-161` says an approval there "could never be answered", which the notify path does not match. Check on the eval stack, with a Gmail test connection, before S5 [assumed].
- The live behaviour of the new prompt sentence and of Iris's relay turns, and that each relay speaks in the person's conversation: traced in code, not run.
- The budget numbers and the 20-minute wall clock: proposals, not measured.
- The plan's share of a subscription window: there is no usage ledger [doc: docs/ROADMAP.md, row "Never stops"].
- The growth rule for a guessed engine wait is still "to decide" [doc: docs/ENGINES_PLAN.md, line 92].

Found while checking, not changed here:
- `agent-freeduet/freeduet/tool_notes.py` says relays get no computer tools. `handoff-delivery.ts:319-327` gives them to the relay turn, so the docstring is out of date.
- The comment at `handoff-delivery.ts:159-161` and the notify path in `approvals/wiring.ts` disagree (section 9). M1 D22's reason says a forward hop's scratch thread would hide its card until the delivery deadline; the notify path does not match that reason.
- M1_PLAN cites the depth cap at `config.ts:459`; the line is 466 [code: server/src/config.ts:466].
- ENGINES_PLAN line 28 says "Four-state breaker". Its state table (lines 90-94) has five states, and `engine_breaker.py:119-123` defines five.
- `delegate-work` (`examples/freeduet/skills.yaml:325-337`) asks for one `delegate` call with every piece. The fan-out cap of 3 [code: server/src/config.ts:467] refuses a fourth [code: server/src/agents/handoff.ts:389].
- Iris's prompt asks for a `delegate` tool that is not built [code: examples/freeduet/agents.yaml:20-21, 58-59].
