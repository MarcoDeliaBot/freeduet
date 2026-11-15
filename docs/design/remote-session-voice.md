# Remote session: no voice chats, no microphone, no call

Scope: the first slice of the remote-session rules in `phone-and-remote.md` 3.5. Who is remote, and what a remote
session may reach, are decided there and unchanged here.

## What the person sees

| Browser | Voice chats | Microphone | Call | Errors |
|---|---|---|---|---|
| Paired with the computer (or no sign-in, no secret) | Load, as before | Offered, as before | Offered, as before | A real failure still shows |
| Remote session (signed in, not paired) | Not asked for | Not offered | Not offered | No voice-chats error, no "Couldn't bring in what was said" notice |

Text chat is the same for both. A remote session still sends and reads messages.

## Rules

1. The answer is the server's, asked once: `remote` on `GET /api/me`, computed by `isRemote(pairingGate, request)`
   (`server/src/app.ts`, the `/api/me` route; the function is `server/src/auth/remote-limits.ts:39`). The app reads it
   and never decides it.
2. With no gate (no sign-in, no installation secret, single-user mode) `remote` is `false`, and so is any answer where
   the field is missing.
3. A remote session is refused `ALL /api/voice/*` and `ALL /api/audio/*` (`server/src/auth/remote-limits.ts:273`).
   The app therefore asks for none of them: the chat's voice archive is not queried, the voice history is not loaded
   before a message, the call is not offered, and the microphone is not offered.
4. `GET /api/me` stays on the list for remote sessions (`server/src/auth/remote-limits.ts:159`), so a remote session
   can learn that it is remote. The list itself is not changed.

## Not built

- The other remote refusals (computers, settings, routines, approval rules) are not hidden. A remote session still
  sees the server's sentence when it uses them.
- No sentence replaces the hidden microphone or call. A remote session is simply not offered them.
- The read-aloud control (browser speech, no server call) is unchanged.
- Outbox saves of calls made in the same browser are not gated: they start only after a call, which a remote
  session cannot start.

## Built so far

- Server: `server/src/app.ts` (`/api/me` gains `remote`; one import). Tests: `server/tests/install-secret-signin.test.ts`,
  the describe "/api/me says whether the browser is a remote session" (two cases). `server/tests/guards.test.ts`: the
  exact `/api/me` body it pins gains `remote: false`.
- App: `app/src/lib/auth/queries.ts` (the field on `AuthenticatedUser`, mapped in `currentUser()`),
  `app/src/lib/auth/use-current-user.ts` (the one read of the current user for these screens: the client of the provider,
  or the app's client where no provider is mounted, so `/api/me` is asked once per screen),
  `app/src/lib/voice/archive.ts` (`useVoiceArchive` and `loadVoiceArchive` take `remote`),
  `app/src/components/channels/channel-chat.tsx` (`remoteSession`; the call is not offered to it),
  `app/src/components/channels/composer/use-dictation.ts` (`available` is false for it).
  Tests: `app/tests/remote-session-voice.test.tsx` (four cases).
- Verified on the final code of this branch:
  - Before the change, on main's source: `install-secret-signin.test.ts` 22 pass, 2 fail (the two new cases), and the
    remote case of `remote-session-voice.test.tsx` failed (3 pass, 1 fail).
  - After: `install-secret-signin.test.ts` 24 pass, 0 fail; `guards.test.ts` 4 pass, 0 fail; `remote-session-voice.test.tsx`
    4 pass, 0 fail; `first-day` (three files) 47 pass, 0 fail; `chat-presence` 25 pass, 0 fail; `bun test app/` 2999 pass,
    0 fail in 315 files.
  - Gates from `openbot/`: `bun run typecheck` exit 0; `bun run typecheck:tests` exit 0 (the 239 known errors of the
    baseline, none new); `bunx biome lint .` exit 0; `bun test assertion-shape` 10 pass; `bunx biome format .` exit 0.
  - Not run here: the server files that open a database (`remote-limits.integration`, `remote-limits-ledger`,
    `single-user-adoption-*`, `freeduet-team.integration`). This sandbox had no `TEST_DATABASE_URL` and nothing answered on
    127.0.0.1:5561. Run them on the test database before merging.
  - Not verified live on a phone or a tunnel.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Whether a remote session is told why it has no microphone or call | (a) nothing, as built (b) one sentence in place of the controls | (a) | A sentence needs copy and a place to show it; the refusal sentence already says what a remote session may do |
| Whether the other remote refusals get the same treatment | (a) keep the server's sentence when used (b) hide the entries by the same flag, feature by feature | (a) for now | Each feature needs its own look at what hiding it costs the person |
