# Connecting from the chat in three steps, and tools an update adds

Written 2026-11-15 on origin/main 2d49770. Decisions D44 and D45 in `docs/M1_PLAN.md`, section 26. Product rule: "Three steps at most" (`docs/ROADMAP.md`). Code paths start at `openbot/`.

## 1. What the person sees

- Asked to connect Gmail, Iris answers with one short line and a card with one button ([agents.yaml], Iris's "Connecting an app" paragraph; Otto's missing-tool sentence). No list, no technical names.
- The button opens the app's form with the member who will use it already named: "Otto will use this mailbox." The person's own steps: press the button, paste the app password, press Connect. (The app password itself is made at Google first; the form says how, and that step is Google's, not this product's.)
- After Connect, the member can read the mail: no request to approve, no grant by hand.
- A password or a key is typed only in the form, never in the chat and never by a member.

## 2. How it is built (reused, nothing new in the transport)

- The card already existed: `show_app_access` (`server/src/plugins/app-access-tool.ts`) draws `AppAccessCard` (`app/src/components/channels/app-access-card.tsx`), whose Connect for an app connected with a typed key links to `/connections/$key` (`app/src/components/plugins/app-access-action.tsx`, `ConnectAction`). Changed: the tool takes an optional `member` so the card is about the member who will use the app (it was always about the Bot that asked, Iris); the link carries `?bot=<member>`.
- `app/src/routes/_authed/_app/connections.$key.tsx` accepts `bot`; `SecretConnectionPage` says who will use the mailbox and sends `botId` beside the typed values (`app/src/lib/plugins/secret-connection.ts`).
- `POST /api/plugins/servers/:id/secret-connection` (`server/src/plugins/route-groups/connections.ts`) reads only the member's id from `botId`. For an administrator, and a member that exists, it gives that member the catalogue-declared tools of the app under the automatic mark. For anyone else the connection is made and nothing is given. No new route: `ALL /api/plugins/*` stays on the remote deny list (`server/src/auth/remote-limits.ts`).

## 3. Automatic grants (D45)

- The mark is `plugin_grants.granted_by = "freeduet-automatic"` (`server/src/plugins/plugin-store/automatic.ts`), the column the hub grants already use for their own mark (`server/src/freeduet/hub-grants.ts`). No schema change.
- Written by: the connect button above, and approving an access request WITHOUT choosing tools (`route-groups/app-access.ts`). A set chosen tool by tool, and a grant made by hand on the Bot's page, carry the person's address and are never marked.
- At start (`server/src/freeduet/automatic-grants.ts`, called from `server/src/index.ts`; FreeDuet's package only): every member that holds a marked tool of an app is given the tools the catalogue declares for that app that it lacks. Idempotent, one audit row per tool added, `onConflictDoNothing` so no existing row is relabelled.
- What may be given: the entry's `readTools` and `writeTools` minus `sendTools` (`automaticToolRefs`). A tool that sends is never given by this; the person turns it on in settings, as before (`docs/design/inbox-never-grants-send.md`).
- A person revoking a tool by hand turns what is left of that member's marked set on that app into a hand-made set (`keepTrimmedSetByHand`), so the next start does not hand the tool back.
- A GRANT GIVES A TOOL, NOT AN APPROVAL. Every write still meets the approval gate when it is used, exactly as before (`approvals/policy.ts` is untouched).

## 4. Existing installations

Rows made before the mark carry a person's address or nothing, and cannot be told from a set somebody trimmed by hand, so nothing guesses. A person who knows the set was never trimmed runs, once per member and app, from `openbot/`:

```
bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap           # dry run: lists, writes nothing
bun scripts/mark-automatic-grants.ts --bot inbox --server google-imap --apply   # marks them
```

It changes the mark of existing rows, skips rows already marked and the hub mark, writes one audit row per change, and with `--apply` then adds the declared tools the member lacks at once; every later start does the same. See `docs/configuration.md`.

## 5. Not built

- The OAuth Gmail entry's form (`google-workspace`) is a consent screen in a new tab; its member is not carried through the vendor's redirect. Its Connect button is unchanged.
- No top-up for an app with no catalogue entry (nobody can say what its writes do).
- `docs/design/mail-organise.md` still says Otto points at Plugins and the Connections page when a tool is missing; the prompt now says one line and the card. That doc is another feature's and was not edited.

## Built so far

Built and tested (see the PR): the marks, the top-up, the one-off, the tool's `member`, the link's `?bot=`, the form's member line and `botId`, the route's grant, the prompts. Verified against a real PostgreSQL: top-up adds once and nothing the second time, leaves unmarked and hand-made sets alone, the one-off dry run writes nothing. NOT verified: the prompts live (they are not certified until the team evals run: Iris and Otto cases about connecting a mailbox), a real Gmail connection, and a restart of a real installation.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Top-up also gives the organising writes (label, archive, Bin, Spam), not only reads | (a) every declared non-send tool; (b) reads only | (a) | It is what the maintainer asked for after Otto lacked them; each still asks at the gate, and a send is never given |
| An access request approved with the default set becomes automatic | (a) yes; (b) only the connect button writes the mark | (a) | Otherwise the inbox path never receives new tools; a set chosen tool by tool stays hand-made |
