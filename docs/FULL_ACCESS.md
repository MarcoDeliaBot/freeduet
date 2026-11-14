# Full access

_Decided by the maintainer on 2026-11-14. Status: built, off by default, tested with a real database and the real gate; not yet run live on the eval stack._

**Safe by default. If you want, you can turn on Full access.** It is an optional switch the person sets for one member, in Settings → Approval rules → Full access. That member then acts without approval cards, payments and purchases included. Until the person turns it on, nothing changes: sending, paying, signing, booking, publishing and deleting still ask first.

## Where the gate lives

Every account action a member takes reaches `approvalService.gate` (`openbot/server/src/approvals/service.ts:428`, which calls `evaluate` at `:320` and then the pure `decideAction`, `approvals/policy.ts:432`): connector tools (`plugins/plugin-store/calls.ts:564`), the computer (`computer/gateway.ts:669`), host commands (`host-access/broker.ts:299`) and hand-offs (`agents/handoff-tool.ts:139`). The safety floor, team and personal rules, auto-review and "ask before making changes" all live there. One more place asks: the private-share check on a connector send, which asks for every new email (`calls.ts:471`, D24 and D27).

## The change

- `decideAction` takes `fullAccess`. When it is true, `fullAccessOutcome` (`policy.ts:265`) answers `allow` with `source: "full_access"`, unless a hard stop applies. `evaluate` fills it in, never for a read.
- `index.ts` wraps the connector send check once (`withFullAccess`), so the member's emails and posts do not stop there. The group-chat check and the check on a hand-off to another person's Bot are not wrapped: showing the person's private conversation to someone else stays a question.
- Storage: `users.preferences.freeduetFullAccess`, a map from member id to `{ since }`, merged in Postgres like `freeduetTeam`. No table. Per person and per member (`freeduet/full-access.ts`).

## Who can change it

Only the person: `PUT /api/approvals/full-access/:botId` (`freeduet/full-access-routes.ts`) behind `requireUser` and the same-origin guard. Turning on needs `confirm: true`, which the app sends only after its one warning ("this member will send, pay, sign, book and delete without asking"). Turning off needs nothing and is immediate. `createFullAccess().set` is called from that route only; no member tool, routine, hand-off, skill, connector or text in a mail can make a request as the person. The preferences routes are strict objects and refuse the key. A test reads the source and holds all of this.

## When it applies

- **The executing member only** (`candidate.botId`). Another member of the same person asks. Another person's member asks.
- **The person's own live turn only**: no run initiator, or `person` (the app's own computer calls). **Routines, check-ins, memory runs, tasks and the deployment always ask**, even with Full access. That is the choice for unattended runs: they read mail and pages nobody watches.
- **A hand-off** (the person asks Iris, Iris hands the work to a member) applies it to the receiver only when the server itself traces the hop to the person's own typed message (the D27a mark, loaded by `createHandedRequestLoader`, which asks again if the person has spoken since). A relay, a hop made by a routine and a hop from a hop ask. A hand-off from a Full-access member to a normal one asks, because the normal member is the one gated (D21).

## What stays

- **Hard refusals.** `SAFETY_REQUIREMENTS` credentials (passwords, passcodes, two-factor, recovery codes, API keys) and security settings (sharing, admin) are still handed to the person. FreeDuet still never reads or forwards subscription credentials. Only the payments category is lifted.
- **Team rules** an admin made (`ask` or `hand_off`) still apply, and so does the computer's own admin policy. Full access overrides the person's own rules, "ask before making changes" and auto-review (the reviewer is not called).
- **Commands on the person's computer** keep their own setting (ask, allow, never), and the desktop app still shows them.
- The person's earlier "no" in the same conversation, and the hand-off rules (grants, depth).

## Audit

Every non-read action taken under Full access writes `approval.evaluated` with `outcome.source: "full_access"` (member, tool, effect, scope; never the arguments), and each change of the switch writes `configuration.changed`. The person sees the last 20 under "Done without asking".

## Limits and risks

- A Full-access member can be steered by what it reads. That is the trade; the warning says so.
- A request already waiting when the switch goes on stays waiting until the person answers it.
- Duplicate sends are not guarded beyond D27's one-per-request.
- When spending caps arrive (v0.4) they are limits, not cards, so Full access should not lift them. Not built, so not tested; the maintainer should confirm.
- Not run live: the tests drive the real gate, plugin store, private-share check, hand-off desk and runner on Postgres, with the vendor faked.
