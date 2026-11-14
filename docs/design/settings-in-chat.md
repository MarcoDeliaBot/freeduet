# Settings changed in chat, with Undo, and a control dashboard

Design only, no product code. Written 2026-11-14 for two rows of [ROADMAP.md](../ROADMAP.md): "Settings changed in chat, with Undo" (row 47) and "A control dashboard" (row 48). Base: origin/main 021cad8.

Tags: **[code: path:line]** read on origin/main. Code paths start at `openbot/`; doc paths start at the repository root. **[assumed]** my inference, not checked. **[verify]** unknown; a spike on a real install must settle it. Nothing tagged [verify] ships unchecked.

Size: S under 300 changed lines, M 300 to 1000, L over 1000. Slices that touch the approval gate are marked [security] and go to a Sonnet executor, as CLAUDE.md asks.

## 1. What the person gets

- You tell a member "send the summary at 7 instead of 8:30" or "pause that routine until Monday", and it is done. An Undo button under that reply puts the old value back, unless something changed it since.
- A list of every change a member made, each with Undo. No member can change an approval, Full access, a connection, a grant, a credential or a security setting.
- One place in the app where you decide which harmless settings members may change in chat. You always have the last word.

## 2. What exists today in the code

### 2.1 Every setting, who changes it, and its proposed class

Classes: **C1** a member may change it in chat, from the person's own words, with Undo. **C2** the person only, in the app. **C3** an admin only.

| Setting | Changed today by | Gate and record today | Class |
|---|---|---|---|
| Routine time, timezone | Member, chat: `update_routine` [code: server/src/plugins/builtin-routines.ts:444-468] | Reviewer model (2.2). The trail keeps the decision, not the values [code: server/src/approvals/service.ts:352-366] | C1 |
| Routine on or off | Member, chat: `update_routine` [code: server/src/plugins/builtin-routines.ts:460]. Person, app: `routes.put("/:id/enabled")` [code: server/src/routines/routes.ts:105] | Reviewer model. The app route writes no audit event; the file audits only a manual run [code: server/src/routines/routes.ts:57-58] | C1 for pause, C2 for resume |
| Routine instruction, channel | Member, chat: `update_routine` [code: server/src/plugins/builtin-routines.ts:453, 459] | Reviewer model | C2: they change what runs or where it posts |
| Trigger pause | Member, chat: `pause_trigger` [code: server/src/responsibilities/trigger-tools.ts:125]. Person, app: `routes.put("/triggers/:triggerId/enabled")` [code: server/src/responsibilities/routes.ts:187] | Reviewer model | C1 [assumed: the roadmap names routines only] |
| Trigger resume | Member, chat: `resume_trigger` [code: server/src/responsibilities/trigger-tools.ts:131] | Reviewer model | C2: it starts automatic work again |
| Notification level: all, needs_input, none | Person, app: `routes.put("/:agentId/notifications")` [code: server/src/agents/lifecycle-routes.ts:187]. Values [code: server/src/agents/lifecycle.ts:31] | App only; no member tool | C1 for all and needs_input; none C2 (Q5) |
| Member name | Package sync overwrites it [code: server/src/tenant-package.ts:881-883]. The app refuses it for package members [code: server/src/agents/profile-store.ts:353-354, 517] | Not editable | C1 as a per-person alias (Q4) |
| Tone | Nothing. A member saves a style profile to memory from the person's samples [code: examples/freeduet/agents.yaml:682] | Not a setting | C1 as three fixed choices (Q4) |
| Language replies use | Deployment variable `FREEDUET_PERSON_LANGUAGE` [code: server/src/config.ts:1581]. A request cannot name it [code: server/src/freeduet/person-language.ts:72] | Deployment only (D26) | C1 per person (Q4) |
| Approval preferences and custom rules | Person, app: `routes.patch("/preferences")` [code: server/src/approvals/routes.ts:91]; `routes.post("/rules")` [code: server/src/approvals/routes.ts:109] | The settings are the gate. Defaults [code: server/src/approvals/store.ts:32-33] | C2 |
| Team rules | Admin: `routes.patch("/team")` [code: server/src/approvals/routes.ts:130-131] | Admin check [code: server/src/approvals/routes.ts:131] | C3 |
| Full access, per member | Person, app: `routes.put("/:botId")` [code: server/src/freeduet/full-access-routes.ts:44] | Each switch writes `configuration.changed` [code: server/src/freeduet/full-access.ts:158] | C2 |
| Connections and grants | Person, app: `routes.post("/servers/:id/connect")` [code: server/src/plugins/route-groups/connections.ts:136]; `routes.post("/grants")` [code: server/src/plugins/route-groups/grants.ts:236] | Session only (`requireUser`) [code: server/src/plugins/route-groups/grants.ts:236] | C2 |
| Cloud computer, browser, network | Admin: `routes.put("/capabilities")` [code: server/src/admin/routes.ts:188] | Admin check [code: server/src/admin/routes.ts:129] | C3 |
| Credentials (keys) | Admin: `app.get("/api/admin/credentials")` [code: server/src/app.ts:1220-1221] | Admin check inside each handler | C3 |
| Person's instructions | Person, app: `app.put("/api/settings/instructions")` [code: server/src/app.ts:825]. 4000 characters [code: server/src/user-instructions.ts:41] | Session only | C2 |
| Iris's lessons | Iris, no approval: `remove_lesson` [code: agent-freeduet/freeduet/iris_tools.py:75-76, 152-161] | Removal kept in the lesson file [code: agent-freeduet/freeduet/lessons.py:185-198] | Not on the roadmap list: keep its rule, add the record (slice 1) |

### 2.2 How a member's change is decided today

- Under default settings, ask-before-changes is off and auto-review is on [code: server/src/approvals/store.ts:32-33; server/src/approvals/service.ts:347-348]. So a routine change that no rule covers goes to the reviewer model [code: server/src/approvals/policy.ts:474-476], and its verdict decides: proceed, ask or hand off [code: server/src/approvals/policy.ts:508-525]. When the reviewer cannot answer, the person is asked [code: server/src/approvals/policy.ts:362-374].
- Full access is decided before the reviewer [code: server/src/approvals/policy.ts:446-449]. `fullAccessOutcome` allows any non-read action that matches no safety category, or only payments, unless an admin's team rule asks or hands off [code: server/src/approvals/policy.ts:265-279]. The three categories are credentials, security settings and payments [code: server/src/approvals/policy.ts:184-207]. A time change or a pause has no words that match them [assumed: read, not tested].
- Full access applies only in the person's own turn, or in a hand-off the server traces to the person's words [code: server/src/freeduet/full-access.ts:108-112]. Routine runs always ask [code: docs/FULL_ACCESS.md, "When it applies"].
- The reviewer skips reads, memory references, and `bot/` references about settings or preferences [code: server/src/approvals/policy.ts:285-289]. A built-in tool's reference is the call's own `ref` [code: server/src/plugins/plugin-store/calls.ts:563-567]. That it is not under `bot/` is [assumed].
- The person's own typed words already replace a card in one case: a new email, where every recipient must appear in the person's latest message [code: server/src/plugins/typed-recipients.ts:79; server/src/plugins/plugin-store/calls.ts:386-420]. No setting uses this check.

### 2.3 The three findings that matter most

1. **Members can already change routine times, pause routines and pause triggers, with no record of the old values and no Undo.** Under default settings the reviewer model decides each change. The delete tool tells the model there is "nothing to undo" [code: server/src/plugins/builtin-routines.ts:200]. No eval case covers a routine or setting change [code: evals/team/cases.yaml].
2. **Full access lifts the same changes in the person's own turn, before the reviewer runs.** F11 says configuration stays with the person under Full access [code: docs/PROJECT.md, row F11]. docs/FULL_ACCESS.md says only the payments category is lifted [code: docs/FULL_ACCESS.md, "What stays"]. The code and both documents disagree. This is Q3.
3. **Names, tone and language cannot be set per person.** Package sync overwrites member names [code: server/src/tenant-package.ts:881-883], and the app refuses to rename a package member [code: server/src/agents/profile-store.ts:353-354]. Language is one deployment variable [code: server/src/config.ts:1581]. Tone exists only as a style profile a member saves to memory [code: examples/freeduet/agents.yaml:682]. Nothing reads or writes the `override` column [code: server/src/db/schema/core.ts:290]; my search covered `server/src/agents/`, `tenant-package.ts` and `server/src/db/`.

## 3. The design

### 3.1 Rules

- **R1. The person's own live turn only.** A C1 change needs its new value in the person's latest typed message, checked on the server as the email check is [code: server/src/plugins/typed-recipients.ts:79]. When the value is not there, the person gets a card. A routine run, a check-in, or a hand-off the server cannot trace to the person's words cannot change a setting.
- **R2. The list lives in code.** A member can change only keys on a server list, whatever the model asks. The reviewer is not asked about a setting: its `preApproved` answer is a model's judgement [code: server/src/approvals/policy.ts:388].
- **R3. Every change is recorded.** One `configuration.changed` event per change, with the old value, the new value, the turn and the actor [code: server/src/audit.ts:51]. Secret values are never written; redaction keys on field names [code: server/src/plugins/catalogue.ts:919]. The trail is append-only [code: server/src/db/schema/core.ts:471].
- **R4. Undo is compare-and-set.** It restores the old value only while the current value is still the one the change set. Otherwise it refuses and says what changed. Undo is the person's button, so it may resume a trigger that a member paused.
- **R5. The list only narrows.** A member never widens it. The person's switch can only narrow it: the stricter of the two applies, as the host-command cap does [code: server/src/approvals/policy.ts:580-581]. Proposed cap: three setting changes per turn [assumed: to be measured].
- **R6. Never on the list:** approvals, Full access, connections, grants, members' permissions, paid engines, credentials, security settings [code: docs/ROADMAP.md, row 47].

### 3.2 The smallest version worth shipping

The first version adds controls to two changes members can already make: a routine's time and pause, and a trigger's pause. It adds no new power.

- `update_routine` and `pause_trigger` follow R1 and R3. Full access no longer lifts them (Q3). The instruction and channel fields keep their card.
- An Undo card appears under the reply that made the change. It can follow the pattern of the morning brief card [code: app/src/lib/copilot/morning-brief-tool.tsx].
- Nothing else changes: no tone, no names, no dashboard, no new tool.

### 3.3 What comes after

- Notifications (all or needs_input), tone (three fixed choices) and language, per person, through one new tool with its own list. Names as a per-person alias. The run note follows the D26 pattern: a forwarded prop and a line for the member [code: server/src/freeduet/person-language.ts:72] (slices 4 and 5).
- A change list in the app that reads the record, with Undo (slice 6).
- The control dashboard: one row per setting, with a switch that lets members change it in chat. The effective permission is the stricter of the server list and the switch. It builds on the Engines dashboard [docs/ENGINES_PLAN.md, section 2] (slice 7).
- The credentials panel (row 48), after the Engines work. Subscription logins are never stored there [docs/ROADMAP.md, row 48] (slice 8).
- Automations written in chat share this mechanism [docs/ROADMAP.md, row 47].

### 3.4 What it never does

No member opens the dashboard, reads another person's settings or undoes a change. No change happens in a routine run.

## 4. Slices

One PR each. Slice 2 is security work: Sonnet, as CLAUDE.md asks.

| # | Slice | What it builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|---|
| 1 | Record | One `configuration.changed` event per change to a routine time, on/off or trigger pause, and per Iris lesson removal, with old and new values | One event per change with both values; a refused change writes none; no secret values in the payload | none | S |
| 2 | Own-turn gate [security] | A settings class in the approval gate: no card only when the new value is in the person's latest typed message, otherwise a card. Full access does not lift it. `update_routine` keeps a card for its instruction and channel | Tests through the real gate (`decideAction` with Full access on): typed value allowed; routine run asks; untraced hand-off asks; time change with no typed value asks; instruction change asks | Q2, Q3 | M |
| 3 | Undo | Undo endpoint with compare-and-set; Undo card in the chat turn | Undo restores; refused after a later change; only the owner can undo (cross-person test); the restored time still passes the 15-minute floor [code: server/src/routines/schedule.ts:4, 15] | 1, 2 | M |
| 4 | Change tool | `change_setting` with its own list: notifications (not none), tone (three choices), language | Key not on the list refused even when asked; `none` refused for members; unknown tone refused; per-turn cap holds | 2, Q4, Q5 | M |
| 5 | Names | Per-person alias in the person's preferences; run note; the app shows it | Package sync leaves aliases alone; aliases are per person; the team's names stay in the package | 4, Q4 | S |
| 6 | Change list | App screen of the person's own changes, with Undo (same endpoint) | Only the person's changes are listed; Undo is compare-and-set; paging works | 3 | M |
| 7 | Dashboard | Settings page: one row per setting; member switch; effective permission = stricter of list and switch | A member cannot widen the list; a switch set to off removes the tool from the next run; only the person's session can write | 4, 6, Engines dashboard | L |
| 8 | Credentials panel | Gateway and metered keys: add, see, remove | A stored key is never returned in full; no subscription login is stored (test: no such path in the store) | 7, docs/ENGINES_PLAN.md | L |

## 5. Rules that must hold

- **Logins first.** No paid engine joins the member list. Paid engines stay in docs/ENGINES_PLAN.md and are never C1.
- **Never read, copy or forward subscription credentials.** The record and Undo hold setting values only, never login state or CLI configuration.
- **No secrets and no personal data in the repository.** This file has none. Aliases, tone choices and the record live in the database. Tests use synthetic names.
- **The person's approval for real account actions.** A setting change is not an account action. A changed routine still asks before it sends, pays, signs, books or deletes [docs/ROADMAP.md, row 46].
- **Full access never lifts a setting** (Q3). It stays with the person's own turn, as docs/FULL_ACCESS.md sets out.
- **Change only what was asked.** The first version changes the gate for two tools only. It does not change the reviewer.
- **Upstream changes stay minimal.** Slices touch `server/src/approvals/policy.ts` (rows exist) and six files with no row in docs/UPSTREAM_TOUCHES.md today: `server/src/plugins/builtin-routines.ts`, `server/src/routines/routes.ts`, `server/src/responsibilities/trigger-tools.ts`, `server/src/agents/lifecycle-routes.ts`, `server/src/agents/profile-store.ts` and `server/src/user-preferences-routes.ts`. Each slice that touches one adds its row. Whether each is an upstream file FreeDuet changed is [assumed]; each has one commit in this repository's history, 6ca80ef.
- **Public wording.** This file names no private project of the maintainer and cites no other product.
- **Roadmap follows decisions.** When the maintainer decides Q1 to Q6, rows 47 and 48 change in the same session [CLAUDE.md, "Roadmap follows decisions at once"]. This file does not edit the roadmap.

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| Q1 | How long Undo lasts, and who may use it | (a) until the setting changes again; (b) 24 hours; (c) 7 days. Person only, or member too | (a), and never longer than 7 days; the person only | The person keeps the last word. A member that can undo can also redo a change silently |
| Q2 | Does a harmless change need a card? | (a) no card when the new value is in the person's latest typed message, checked on the server; (b) a card every time | (a); a card whenever the value is not in the person's words | Keeps "done in chat" (row 47). A server check replaces a model's judgement |
| Q3 | Full access and configuration | (a) Full access never lifts a routine or trigger change; (b) keep the code and amend F11 and docs/FULL_ACCESS.md | (a) | F11 says configuration stays with the person. The code lifts it [code: server/src/approvals/policy.ts:265-279]. A real-gate test must prove the change |
| Q4 | Names, tone and language | (a) per-person alias, three tone choices and language in the person's preferences, with a run note (the D26 pattern); (b) use the unused `override` column for names; (c) let a member rename the package row and skip it on sync | (a); the three tones are the maintainer's choice | Sync overwrites package names. Language moves from the deployment to the person, which changes D26 [docs/M1_PLAN.md, D26] and needs a yes |
| Q5 | Notification level `none` | (a) members choose all or needs_input; `none` is the person's choice in the app; (b) members choose any of the three | (a) | `none` stops every ping, approvals included. The web inbox still shows them [code: server/src/agents/lifecycle.ts:385-387] |
| Q6 | Dashboard default for member switches | (a) every switch starts off until the person turns it on; (b) starts on, and the person turns it off | (a) | The person sees a setting before a member may change it. The switch is the only thing the dashboard adds to the rules |

## 7. What was not verified

- The built-in tool's reference string at run time (`routines/update_routine` or other) [assumed]. The reviewer rule depends on it not starting with `bot/`.
- That a time or pause has no safety word: read, not tested [assumed]. Slice 2's tests will show it.
- That the update path calls the 15-minute floor: the constant and the message were read [code: server/src/routines/schedule.ts:4, 15]; the call site was not [assumed].
- Whether a value in a message (for example "7" or "8:30", in Italian or English) can be matched reliably [verify].
- How often the reviewer approves routine changes: no eval case covers them [code: evals/team/cases.yaml] [verify].
- The Engines dashboard's state: docs/ENGINES_PLAN.md is a plan, and I did not check the app [assumed: not built].
- No test, app or eval was run. Anchors were read on origin/main 021cad8, by reading, not by a build.
- ROADMAP.md was not edited, as the brief requires. When Q1 to Q6 are decided, rows 47 and 48 must change in the same session.
