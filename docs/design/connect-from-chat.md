# Connecting from the chat in three steps, and tools an update adds

Written 2026-11-15 on origin/main 2d49770. Decisions D44 and D45 in [`docs/M1_PLAN.md`](../M1_PLAN.md), section 27 ("Connecting from the chat in three steps, and tools an update adds (D44, D45)"). Product rule: "Three steps at most" (`docs/ROADMAP.md`). Code paths start at `openbot/`.

## 1. What the person sees

- Asked to connect Gmail, Iris answers with one short line and a card with one button ([agents.yaml], Iris's "Connecting an app" paragraph; Otto's missing-tool sentence). No list, no technical names.
- The button opens the app's form with the member who will use it already named: "Otto will use this mailbox." The person's own steps: press the button, paste the app password, press Connect. (The app password itself is made at Google first; the form says how, and that step is Google's, not this product's.)
- After Connect, the member can read the mail: no request to approve, no grant by hand.
- A password or a key is typed only in the form, never in the chat and never by a member.

## 2. How it is built (reused, nothing new in the transport)

- The card already existed: `show_app_access` (`server/src/plugins/app-access-tool.ts`) draws `AppAccessCard` (`app/src/components/channels/app-access-card.tsx`), whose Connect for an app connected with a typed key links to `/connections/$key` (`app/src/components/plugins/app-access-action.tsx`, `ConnectAction`). Changed: the tool takes an optional `member` so the card is about the member who will use the app (it was always about the Bot that asked, Iris); the link carries `?bot=<member>`.
- `app/src/routes/_authed/_app/connections.$key.tsx` accepts `bot`; `SecretConnectionPage` says who will use the mailbox and sends `botId` beside the typed values (`app/src/lib/plugins/secret-connection.ts`).
- `POST /api/plugins/servers/:id/secret-connection` (`server/src/plugins/route-groups/connections.ts`) reads only the member's id from `botId`. For an administrator, and a member that exists, it gives that member the catalogue-declared tools of the app under the automatic mark. For anyone else the connection is made and nothing is given. No new route: `ALL /api/plugins/*` stays on the remote deny list (`server/src/auth/remote-limits.ts`).

## 3. Automatic grants (D45), the narrow reading

- The mark is `plugin_grants.granted_by = "freeduet-automatic"` (`server/src/plugins/plugin-store/automatic.ts`), the column the hub grants already use for their own mark. No schema change.
- Written ONLY by the Connect button with a `botId` (above). A grant by hand, and the approval of an access request, carry the person's address.
- THE APPROVAL PATH IS UNCHANGED (`route-groups/app-access.ts` is as on main): approving a request gives reads only and never marks, because anything that marks is later topped up, and approving a read must never later add writes.
- Top-up, at start (`server/src/freeduet/automatic-grants.ts`, FreeDuet's package only): only for `google-imap` and `google-workspace`, only for a member of FreeDuet's package (an agent row of the `freeduet` package; a Bot a person made or imported is never one), and only when EVERY NON-SEND `mcp` row of that Bot and app carries the mark (the rows for the sends, which the mailbox member holds by hand, are ignored by the rule and never given, relabelled or changed). One non-send row with any other mark skips the whole Bot and app. Idempotent, one audit row per tool, `onConflictDoNothing`.
- The Bot and the app named by the button are checked the same way (`automaticEligible`). The form asks `GET .../secret-connection?bot=` (`botEligible`) and names the member only when true; a crafted `?bot=` claims nothing and sends nothing.
- What may be given: the entry's `readTools` and `writeTools` minus `sendTools`. A tool that sends is never given by this.
- A person revoking a tool by hand turns what is left of that member's marked set on that app into a hand-made set (`keepTrimmedSetByHand`). A non-send tool a person later grants by hand also makes the set not all-automatic, so updates stop adding tools to it; a send granted by hand does not.
- A GRANT GIVES A TOOL, NOT AN APPROVAL. Every write still meets the approval gate when it is used (`approvals/policy.ts` is untouched).

## 4. Existing installations

Rows made before the mark carry a person's address or nothing, and cannot be told from a set somebody trimmed by hand, so nothing guesses. A person who knows the set was never trimmed runs, once per member and app, from `openbot/`:

```
bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap           # dry run: lists, writes nothing
bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap --apply   # marks them
```

It works only on a member of FreeDuet's package and on `google-imap` or `google-workspace`; it refuses an unknown Bot, a non-member and any other app (exit 2, nothing changed). It marks the member's existing rows on the app, never relabels a row for a tool that sends (it names them and leaves them as they are), skips rows already marked, writes one audit row per change, and with `--apply` then adds the declared tools the member lacks, by the same rules as at start. With nothing to mark it says so. See `docs/configuration.md`.

## 5. Not built

- The OAuth Gmail entry's form (`google-workspace`) is a consent screen in a new tab; its member is not carried through the vendor's redirect. Its Connect button is unchanged.
- No top-up for an app with no catalogue entry (nobody can say what its writes do).
- `docs/design/mail-organise.md` still says Otto points at Plugins and the Connections page when a tool is missing; the prompt now says one line and the card. That doc is another feature's and was not edited.

## Built so far

Built and tested (see the PR): the marks, the top-up, the one-off, the tool's `member`, the link's `?bot=`, the form's member line and `botId`, the route's grant, the prompts. Verified against a real PostgreSQL: top-up adds once and nothing the second time, leaves unmarked and hand-made sets alone, the one-off dry run writes nothing. NOT verified: the prompts live (they are not certified until the team evals run: Iris and Otto cases about connecting a mailbox), a real Gmail connection, and a restart of a real installation.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Top-up gives the organising writes (label, archive, Bin, Spam) to a mailbox connected with the button | (a) every declared non-send tool; (b) reads only | (a) | It is what the maintainer asked for after Otto lacked them; each still asks at the gate, and a send is never given |
| A mailbox approved through the inbox (reads only) never receives an update's new tools by itself | (a) as now, the person approves again; (b) mark it too | (a) | Decided in review: approving a read must never later add writes |
