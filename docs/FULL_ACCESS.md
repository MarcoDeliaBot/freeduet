# Full access

_Decided by the maintainer on 2026-11-14; its second setting, "without payments", the same day (D29 in [M1_PLAN.md](M1_PLAN.md)). Status: built, off by default, tested with a real database and the real gate; not yet run live on the eval stack._

**Safe by default. If you want, you can turn on Full access.** It is an optional setting the person chooses for one member, in Settings → Approval rules → Full access. Each member has three choices:

| Choice | Sends, signs, books, publishes, deletes | Pays and buys | Still asks the person |
|---|---|---|---|
| **Off** (the default) | asks first | asks first | everything on this row |
| **Full access without payments** | without asking | **asks first** | payments and purchases; passwords, credentials, security settings |
| **Full access** | without asking | without asking | passwords, credentials, security settings |

**Plain Full access has no limit on the amount.** Spending caps do not exist yet (planned for v0.4, [ROADMAP.md](ROADMAP.md)), so a member in plain Full access that is asked to pay can pay any amount. The confirmation in Settings says so before the person accepts it. Full access without payments is the choice for a person who wants a member to act without cards and still hold every payment in their own hands. Both are chosen one member at a time, never for the whole team, and apart from payments they behave the same way.

## Where the gate lives

Every account action a member takes reaches `approvalService.gate` (`openbot/server/src/approvals/service.ts:430`, which calls `evaluate` at `:320` and then the pure `decideAction`, `approvals/policy.ts:446`): connector tools (`plugins/plugin-store/calls.ts:564`), the computer (`computer/gateway.ts:669`), host commands (`host-access/broker.ts:299`) and hand-offs (`agents/handoff-tool.ts:139`). The safety floor, team and personal rules, auto-review and "ask before making changes" all live there. One more place asks: the private-share check on a connector send, which asks for every new email (`calls.ts:471`, D24 and D27).

## The change

- `decideAction` takes `fullAccess`, the setting in force for this action: absent (off), `full` or `no_payments` (`FullAccessMode`, `approvals/types.ts`). When one is set, `fullAccessOutcome` (`policy.ts:271`) answers `allow` with `source: "full_access"`, unless a hard stop applies. `evaluate` fills it in with `fullAccess.effective(...)`, never for a read.
- **Plain Full access** lifts one safety requirement, payments. **Without payments** lifts none: a payment gets no answer from `fullAccessOutcome`, so it falls through to the safety floor, which hands it to the person with `source: "safety"` and the same card as with the switch off. A mode this build does not know answers nothing, so the gate carries on as if the switch were off.
- **What counts as a payment** is the existing `payments` category of `SAFETY_REQUIREMENTS` (`policy.ts:176`), not a new classifier: the words of the call (tool, scope, arguments, target) in English and Italian, such as pay, payment, checkout, purchase, place order, buy now, wire, bank or card details, billing, and tool names that move money (transfer, transaction, subscription, gift card). The floor is deliberately broad: a message that only talks about a payment asks too.
- `index.ts` wraps the connector send check once (`withFullAccess`), so the member's emails and posts do not stop there, in either setting. A payment in an email is still held, because the approval gate behind that check finds it. The group-chat check and the check on a hand-off to another person's Bot are not wrapped: showing the person's private conversation to someone else stays a question.

## Storage

`users.preferences.freeduetFullAccess`, a map from member id to an entry, merged in Postgres like `freeduetTeam`. No table, no migration, no new enum. Per person and per member (`freeduet/full-access.ts`).

| Setting | Before the second setting | Now |
|---|---|---|
| Off | no entry | no entry |
| Full access | `{ "since": "<time>" }` | the same, unchanged: every entry already stored still means Full access, nothing is rewritten |
| Full access without payments | does not exist | `{ "mode": "no_payments", "at": "<time>" }` |

The new entry is written with `at` and without `since` on purpose: a build from before the second setting reads only `{ since }`, so it reads the new entry as off. Putting an older build back never turns a member into plain Full access. A value this build cannot read (a bare `true`, a number for the date, a mode it does not know, a mode with no date) is off for that member and for no other.

## Who can change it

Only the person: `PUT /api/approvals/full-access/:botId` (`freeduet/full-access-routes.ts`) behind `requireUser` and the same-origin guard, with `{ enabled, mode?, confirm? }`. `mode` is `full` (the default, so the body that was always valid, `{ enabled: true, confirm: true }`, still means plain Full access) or `no_payments`. `GET` returns each member that has it with `{ since, mode }`. Anything that raises what a member may do without asking needs `confirm: true`, which the app sends only after its warning:

| Change | Needs `confirm: true` |
|---|---|
| Off → Full access without payments | yes |
| Off → Full access | yes |
| Full access without payments → Full access | yes, it adds payments |
| Full access → Full access without payments | no, it takes payments back |
| Anything → Off | no, immediate |

`enabled: false` with a mode is refused. `createFullAccess().set` is called from that route only; no member tool, routine, hand-off, skill, connector or text in a mail can make a request as the person. The preferences routes are strict objects and refuse the key. A test reads the source and holds all of this.

## When it applies

- **The executing member only** (`candidate.botId`). Another member of the same person asks. Another person's member asks.
- **The person's own live turn only**: no run initiator, or `person` (the app's own computer calls). **Routines, check-ins, memory runs, tasks and the deployment always ask**, even with Full access. That is the choice for unattended runs: they read mail and pages nobody watches. Since D35 a routine's or a trigger's write asks on the server's own account, whatever the person's settings say, and "Always allow" does not exist for it.
- **A hand-off** (the person asks Iris, Iris hands the work to a member) applies it to the receiver only when the server itself traces the hop to the person's own typed message (the D27a mark, loaded by `createHandedRequestLoader`, which asks again if the person has spoken since). A relay, a hop made by a routine and a hop from a hop ask. A hand-off from a Full-access member to a normal one asks, because the normal member is the one gated (D21).
- **For payments, the stricter of the two members holds.** A receiver that is "without payments" asks about a payment whatever the sender is. A receiver in plain Full access also asks about a payment when the member that handed the work on is "without payments": handing a payment to a colleague does not get round a member that was set to ask. A sender with Full access off adds nothing, as before: the receiver's own setting stands.

## What stays

- **Setting up, changing or deleting a routine or a trigger** (every write of the Routines connector) asks in the person's own live turn too, in both settings (D35, `freeduet/always-ask.ts`): Full access is for what a member does now, and these set up what runs later with nobody there. "Always allow" does not exist for it, and no rule answers it.
- **Hard refusals.** `SAFETY_REQUIREMENTS` credentials (passwords, passcodes, two-factor, recovery codes, API keys) and security settings (sharing, admin) are still handed to the person in both settings. FreeDuet still never reads or forwards subscription credentials. Plain Full access lifts only the payments category; Full access without payments lifts none.
- **Team rules** an admin made (`ask` or `hand_off`) still apply, and so does the computer's own admin policy. Both settings override the person's own rules, "ask before making changes" and auto-review (the reviewer is not called).
- **Commands on the person's computer** keep their own setting (ask, allow, never), and the desktop app still shows them.
- The person's earlier "no" in the same conversation, and the hand-off rules (grants, depth).

## Audit

Every non-read action taken under Full access writes `approval.evaluated` with `outcome.source: "full_access"` and `outcome.fullAccessMode` (`full` or `no_payments`), which says which setting decided (member, tool, effect, scope; never the arguments). A payment held back from a member "without payments" is an ordinary card with `outcome.source: "safety"`, in the person's approvals like any other. Each change of the setting writes `configuration.changed` with `change` set to `full_access_on`, `full_access_no_payments_on` or `full_access_off`. The person sees the last 20 actions under "Done without asking"; the list does not show the setting, the audit row does.

## Limits and risks

- A Full-access member can be steered by what it reads. That is the trade; the warning says so.
- **Plain Full access has no limit on the amount** until spending caps exist (v0.4). When they arrive they are limits, not cards, so neither setting should lift them. Not built, so not tested; the maintainer should confirm.
- **"Without payments" holds back what the safety floor recognises**, by its words and tool names. The reviewer model that auto-review uses to catch a payment the words miss is not asked in either Full access setting, so a payment worded in an unusual way, by a tool the floor does not know, goes through without a card. With the switch off the reviewer adds a second look when auto-review is on. The Settings confirmation says this.
- **What the floor does not recognise today** (probed on 2026-11-14 with the real function): a click on a plain "Buy", "Donate" or "Charge my card", and tools named `create_charge` or `create_order`. It does recognise "Buy now", "Place order", `create_payment_intent`, `transfer_funds` and an email that asks to pay. With the switch off the first group usually still asks, through the person's "ask before making changes" default; in either Full access setting it goes through. Widening the word list would change the cards of every setting, so it is the maintainer's decision, not made here.
- The same breadth means an email that only mentions a payment, an invoice or billing asks, in "without payments", exactly as it does with the switch off.
- **A command in the member's own computer is not read by the floor.** `computer_run_command` and the file tools of the computer are exempt (`NOT_ACCOUNT_ACTIONS`, `policy.ts:230`), as they always were, so a payment made through a command-line call would not be held in "without payments". The floor reads what a member does to an account, not what it runs in its own sandbox.
- A request already waiting when a setting changes stays waiting until the person answers it.
- Duplicate sends are not guarded beyond D27's one-per-request.
- Not run live: the tests drive the real gate, plugin store, private-share check, hand-off desk and runner on Postgres, with the vendor faked.
