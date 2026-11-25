# Connect your AI: OpenBot's sign-in, any provider or none

Design for decision D155 ([M1_PLAN.md](../M1_PLAN.md), section 109). Written 2026-11-25. **Design only: no runtime code, nothing built, nothing run.** It supersedes the 16 November 2026 decision (wait for Anthropic's written answer) in [ROADMAP.md](../ROADMAP.md) row 15 and D5 of [first-start.md](first-start.md).

Markers. **[up: ref]** read in the bare clone of upstream OpenBot (MIT), by commit and path. **[code: path]** read on `origin/main` at 9005392d. **[assumed]** my inference; nothing marked so may be built on as if true. **[not verified]** I could not check it.

## 0. The decision, in the maintainer's words

On 25 November 2026, after being told the account risk, the maintainer decided: adopt OpenBot's sign-in method for FreeDuet. The sign-in finishes with no paste, and FreeDuet's server keeps the resulting sign-in exactly as OpenBot keeps it. And: 99.9% of people have no Claude plan, so the first start offers Claude, ChatGPT, Gemini, Grok (xAI), GLM, or **nothing**; with nothing, FreeDuet starts on free engines (OpenRouter's free models, or Ollama on the person's computer) at no cost. FreeDuet is not a Claude add-on.

Two things this does not touch: the rule in `CLAUDE.md` about coding sessions (a session never opens the maintainer's own login directories) and every approval rule. A person's own sign-in is kept on that person's own server; it never reaches the repository, a log, a browser page or a member's prompt. A real account action still meets the approval gate exactly as before.

## 1. What upstream does (OpenBot, MIT)

**Licence.** OpenBot's `LICENSE` is MIT, "Copyright (c) 2026 CopilotKit" [up: LICENSE at HEAD]. MIT code may be ported, modified and shipped, if the copyright and permission notice travel with it: FreeDuet already carries third-party code in `NOTICE.md`, and each ported file gets a line there. Nothing here is AGPL. Two limits: (a) the *server half* of the plan sign-in is not in the clone (below), so there is nothing to port and it is written new; (b) the client ids the flows use (Claude Code's, Codex's, xAI's) are the providers' own public clients, not OpenBot's code, and MIT says nothing about the providers' terms (section 9).

**Commits read.** `b4632913` (#2039, "inside OpenBot Desktop, Claude and ChatGPT finish their sign-in with no paste"), `3fa4768f` (#2047, a Copy button beside the sign-in code), `44e7b3ab` (#2069, several AI connections, one per provider) and `0b7cf15f` (#2194, "Connect your AI connects several, each with a check"). The server source was removed in `f71b0f4b` (#1530); I read its last version with `git show f71b0f4b^:<path>`.

**The server half of the plan sign-in is not recoverable.** `server/src` at `f71b0f4b^` holds `provider-oauth.ts`, `provider-oauth-lock.ts`, `credentials.ts` and `google-oauth-transport.ts`, but no file for the Claude or ChatGPT plan sign-in. A comment in the desktop code names it as `sign-in-providers.ts` (`startClaude`, `exchangeClaude`) [up: desktop/src-tauri/src/claude_sign_in.rs], which is not in the tree at `f71b0f4b^` or in the later snapshot [not verified: whether it ever was in this repository]. What is known of it is its API, in `api/openapi/model-connections.yaml` at `0b7cf15f`, and the desktop code that mirrors it.

### Flows, provider by provider

| Provider | Flow upstream | Where the code is |
|---|---|---|
| **Claude plan** | OAuth with PKCE and a `state`, using Claude Code's own public client (`9d1c250a-...`). Consent at `claude.com/cai/oauth/authorize`; the code is exchanged at `platform.claude.com/v1/oauth/token` for a plan token (`sk-ant-oat01-...`) valid for a year; scope `user:inference`. The browser comes back to a listener on loopback, any port, path `/callback`. The manual way stays for an older page: the redirect is Claude's own code page, which shows `code#state` for the person to paste. A token that does not start with `sk-ant-oat01` is refused, so an API key is never written by this path. | [up: desktop/src-tauri/src/claude_sign_in.rs] |
| **ChatGPT plan** | Browser sign-in: the redirect is always `http://localhost:1455/auth/callback` (registered by OpenAI for its client); the address that arrives is handed on whole, as a person would paste it. Or a device code: the server asks for `device_auth_id`, `user_code`, `interval`; the person types the code on OpenAI's page; no `verification_uri_complete`, so the page cannot be opened with the code filled in (#2047). A plain browser (not the desktop app) starts with the code. Port 1455 is shared with the Codex CLI, which can ask for it back with `GET /cancel`. | [up: desktop/src-tauri/src/sign_in_redirect.rs], [up: app/src/lib/ai-connection/sign-in-redirect.ts] |
| **xAI (Grok)** | RFC 8628 device authorization at `auth.x.ai/oauth2/device/code`; refreshable credentials; the API is `https://api.x.ai/v1` (OpenAI format). The flow follows xAI's own public coding-tool integration. | [up: desktop/PROVIDER_OAUTH.md], [up: desktop/src-tauri/src/provider_oauth.rs] |
| **Google (Gemini)** | Desktop-app OAuth client registered by whoever builds the app; it gives the **Gemini Developer API** on a Google Cloud project's quota, *not* a Google AI Pro or Ultra subscription. Needs a registered client id and a quota project. | [up: desktop/PROVIDER_OAUTH.md] |
| **Unbiased AI** | Device authorization that mints an API key once. Not in FreeDuet's list. | [up: desktop/PROVIDER_OAUTH.md] |
| **API-key providers** | Google, xAI, Unbiased AI, TrustedRouter and "any OpenAI-compatible endpoint" each have a preset (address, model, key page); the person types only the key. | [up: app/src/lib/ai-connection/providers.ts] |
| **GLM, Ollama, OpenRouter** | Not in upstream's list except as "any OpenAI-compatible endpoint" (Ollama is named in its summary). | [up: same file] |

### App files and desktop commands

- `app/src/components/settings/ai-connection-chooser.tsx` (the chooser, a step per provider, the "several connections" list with a check each), `app/src/components/onboarding/ai-step.tsx` (the first-run step), `app/src/lib/ai-connection/{providers,mutations,queries,paths,describe,desktop}.ts`, `app/src/lib/ai-connection/sign-in-redirect.ts` (the rules for when the redirect is taken and every fallback), `app/src/components/copy-button.tsx`.
- Tauri commands, in `desktop/src-tauri/src/sign_in_redirect.rs`: `begin_sign_in_redirect(provider)` (binds a loopback listener: any port for Anthropic, 1455 for OpenAI; returns `attemptId` and `port`), `await_sign_in_redirect(attemptId, state)` (waits up to 15 minutes for the redirect that carries that `state`), `cancel_sign_in_redirect(attemptId)`. The code passes through once and is never logged, kept or shown.

### Server endpoints they call

All under `/api/v2/organizations/{organizationId}` [up: api/openapi/model-connections.yaml at 0b7cf15f]:

- `POST /people/{personId}/ai-connection/sign-ins` (`startPersonalAiSignIn`; body `provider`, optional `method` (`device` for ChatGPT) and `loopbackPort`, which tells the server where Claude's redirect goes), `GET .../sign-ins/{signInId}` (`getPersonalAiSignIn`, polled), `POST .../sign-ins/{signInId}/code` (`finishPersonalAiSignIn`, body `{code}`: Claude's `code#state` or ChatGPT's whole address). An older server refuses `loopbackPort` with 400 and the page retries without it. The answer says where the sign-in stands and never carries a key.
- `PUT/GET/DELETE .../ai-connection`, and since #2069 `GET/POST .../ai-connections`, `DELETE .../ai-connections/{id}`, `POST .../ai-connections/{id}/make-default`, plus the organization's twins under `.../ai-connection-sign-ins`.
- Provider sign-in data for Google and xAI is kept in "a private credential file" with mode checks, `O_NOFOLLOW`, a size cap and a cross-process lock [up: server/src/provider-oauth.ts, provider-oauth-lock.ts at f71b0f4b^]; the record holds `accessToken`, `refreshToken`, `expiresAt`, `scope`, `clientId` and a `proxyToken`. Other secrets go through AES-GCM with a 12-byte random IV under `KEY_ENCRYPTION_KEY` [up: server/src/credentials.ts, `encryptSecret`/`decryptSecret`]. How the server keeps a Claude or ChatGPT plan token is **not visible** in what I could read; the issue statement "keeps the sign-in exactly as OpenBot keeps it" is therefore taken as: server-side, never to the browser, in a private file or encrypted row, renewed by the server. Section 5 fixes what FreeDuet does.

### What may be ported

Allowed (MIT, with a `NOTICE.md` line per file): the desktop's PKCE and exchange logic (`claude_sign_in.rs`), the loopback listener rules (`sign_in_redirect.rs`, `loopback_redirect`), the provider list and presets (`providers.ts`), the fallback rules (`sign-in-redirect.ts`), the private-file reading code and the AES-GCM helper. It is Rust and TypeScript: FreeDuet's server half is TypeScript (`openbot/server`) and Python (`openbot/agent-freeduet`), so the Rust is **re-written in TypeScript from its description**, with the notice, and the TypeScript pieces are taken with the smallest change (upstream touches, D150).

## 2. How FreeDuet runs a member today

[code: openbot/agent-freeduet/freeduet/engines.py] The engine kinds are `cli`, `app-server`, `acp`, `anthropic-api`, `openai-compatible` and `anthropic-compatible`. A member runs on the Claude Code CLI (`claude -p`, locked down): the `claude-code` login engine, or an `anthropic-compatible` entry, which runs the same CLI against an Anthropic-format address (OpenRouter free, D107; a router the person runs, D113). The OpenAI format works only for the light assistants (D100). `codex` (`app-server`) and `gemini-cli` (`acp`) are declared in `engines.example.yaml` and refuse clearly. The Engines page (D109, D112, D115, `engine_panel.py`) has one card per provider, writes a key to `<FREEDUET_DATA_DIR>/keys/<provider>` (mode 600 in a folder with mode 700, never shown again), and keeps the order of each member's engines. The installation secret is `FREEDUET_INSTALL_SECRET` (D28, D39), made by `start.sh`.

### Which provider can run a member today, and what is new

| Choice | Member engine today | What is needed | Size |
|---|---|---|---|
| **Claude** | Yes: `claude-code`, signed in through Claude's own program (the card of first-start.md, S5). | New: the server sign-in (section 3), the stored plan token, and the run passing it to `claude -p` as `CLAUDE_CODE_OAUTH_TOKEN` in that one process's environment [assumed: how `claude -p` takes a plan token; this is the variable upstream's token was written as, and PROVIDERS.md names it]. The CLI's own login stays as the other way. | M |
| **ChatGPT** | No: `codex` is declared, and refuses. | New: the sign-in; a Codex engine that runs a member (app-server protocol, tool calls, lockdown: the hands-on check PROVIDERS.md asks for); the sign-in written as Codex's own private auth file in a private `CODEX_HOME` [assumed; not verified]. Until it runs members, the sign-in can serve the light assistants only through an OpenAI-format address, which a plan token does not give [not verified]. | L |
| **Gemini** | Light assistants: yes, with a Google AI Studio key (`google` card, free tier). Members: no, except through a router. | Cheapest honest path: a key card with the preset and a link to the key page (D109). OAuth gives Developer API access, not the person's Google AI plan, needs a registered client id and project, and Google's `gemini-cli` terms forbid driving its OAuth from third-party software (PROVIDERS.md). So: **key, not OAuth, first.** | S (key) |
| **Grok (xAI)** | Light assistants only, through `api.x.ai/v1` with a key. | The device flow is portable (S/M), but its token serves an OpenAI-format address: a member needs an Anthropic-format address [not verified whether xAI offers one]. | M |
| **GLM (Z.ai)** | Light assistants with a key through the OpenAI-compatible engine. | Z.ai documents an Anthropic-format address for Claude Code [assumed; not verified], which would make GLM an `anthropic-compatible` member engine with a key and no new kind. Z.ai's coding plan may be used only inside listed tools (PROVIDERS.md): a key on the metered API is the safe route; the plan is not offered. | S |
| **Nothing** | Yes: OpenRouter's free models as a member engine (D107, D116), off by default today; Ollama for light assistants (local), and for members through Ollama's Anthropic-format address (PROVIDERS.md, "Local models"). | New: the first-start screen turns the right card on and puts it in the chain, with D101's warning; "Try FreeDuet before you connect an engine" (sample mode, ROADMAP Later) as the zero-account first minute. OpenRouter needs a free key from the person's own free account. | M |

## 3. The first-start screen

One page, shown on the first start and from **Settings, Connect your AI** later. It replaces the Claude-only card of first-start.md section 5 (the card in the chat stays, as the place a missing engine is said).

```
Connect your AI
Pick what you already have. FreeDuet works with any of them, or with none.

  [ Claude ]  [ ChatGPT ]  [ Gemini ]  [ Grok ]  [ GLM ]
  [ I have none: use free models ]          [ Look around first ]
```

- Each of the five says in one line what is connected (a plan, or a key), the first line of the risk sentence of section 9 for plan sign-ins, and, for a key provider, where the key comes from.
- "I have none" is as large as the others and is not framed as second best. It finds Ollama on this computer (a request to the loopback address of the Engines card, no key) and, when it is there, turns it on (one click). When it is not, it offers **OpenRouter's free models** (a free account, one key) and the one-line way to install Ollama. Free cloud models carry D101's warning. Nothing costs money: no paid engine is switched on, ever, by this page.
- "Look around first" is the sample mode (ROADMAP, Later): prepared answers, labelled, nothing sent or changed.
- Several can be connected, each with a check, one default (as #2194); the order of a member's engines stays the Engines page's and D115's. Logins first still decides the default chain.
- The same engines appear on the Engines page (D109); this page writes through the same code, under D106's authority (the administrator at the computer or a live `computer` pairing). A phone or a remote session sees the status and cannot sign in.

## 4. Each flow, step by step, with clicks

Clicks are counted from the open FreeDuet page, as D125 and first-start.md section 0 count them; typing and pasting are not clicks. Target: three.

**Claude plan, same computer (no paste).** (1) Click **Claude**, then **Sign in with my plan** [one click if the screen goes straight to it; I count two]. The server starts the sign-in with a loopback port and opens Claude's consent page in a new tab. (2) Click **Approve** on Claude's page. The browser returns to `127.0.0.1:<port>/callback`, which the FreeDuet server itself listens on; it checks `state`, exchanges the code, stores the token, and shows "Connected" in the first tab. **Total: 3 clicks, 0 paste.** Fallback: when the port cannot be reached (a remote server, a tunnel, a phone), the page shows the manual way: Claude's page shows `code#state`, the person pastes it into a box (one paste, 3 clicks plus one paste).

**ChatGPT plan, same computer (no paste).** (1) **ChatGPT**, (2) **Sign in with my plan**, (3) **Continue** on OpenAI's page. The redirect to `localhost:1455/auth/callback` is caught by the FreeDuet server (port 1455 published to the computer's loopback). **3 clicks.** Fallbacks: 1455 busy (the Codex program): the device code, shown with a Copy button, typed on OpenAI's page (4 clicks, one typed code).

**xAI (Grok).** Either the device flow (**Grok**, **Sign in**, approve and type the displayed code: 3 clicks, one typed code, shown with Copy) or a key (**Grok**, paste key, **Save**, **Test**: 3 clicks, one paste). First build: the key, with the sign-in as a later phase.

**Gemini.** **Gemini**, paste the AI Studio key (a link opens the key page), **Save** and **Test**: 3 clicks, one paste. Free tier exists; the data warning of D101 shows.

**GLM.** **GLM**, paste the key, **Save** (the page tests it as it saves): 2 clicks, one paste.

**Nothing.** Ollama found: **I have none**, **Use Ollama on this computer**: 2 clicks. Ollama not found: **I have none**, **Use OpenRouter's free models**, paste the key from the person's own free account, **Save**: 3 clicks, one paste, and a link that opens OpenRouter's key page. Zero-account: **Look around first**: 1 click.

What the page never does: type a password for the person, read the page the provider shows, send a message, or switch on a paid engine.

## 5. Where each sign-in is stored and how it is protected

**Decision proposed (inside D155).** The person's sign-in lives on the person's own server, in `<FREEDUET_DATA_DIR>/connections/<provider>.json`:

- one file per provider and per person, in a folder with mode 700 and a file with mode 600, written by a rename from a temporary file (as `engine_panel.py` writes keys); a link in its place is refused (`O_NOFOLLOW`, as upstream's record reader); a size cap of 64 KiB; a lock for the renewal, so two processes never renew one refresh token at once [up: server/src/provider-oauth-lock.ts];
- **encrypted at rest** with AES-256-GCM, a 12-byte random IV for each write, under a key derived (HKDF) from `FREEDUET_INSTALL_SECRET` with the provider id as context. This is the same primitive as upstream's `encryptSecret` [up: server/src/credentials.ts] with FreeDuet's own per-installation secret in place of `KEY_ENCRYPTION_KEY`. A file copied away alone, an unencrypted backup of the data folder, or a screenshot of a folder is not enough to use the token. **It does not defend against someone who holds both the data folder and the install secret on the same computer**: no scheme on a computer that must decrypt the token to use it can. This is said on the page and in the docs, in those words;
- **never** returned by any route (a status says "connected", the provider, the expiry and the last check, nothing else), never in the browser's storage, never in a log, an audit row, an error text or the chat, and never in a member's prompt or a tool's output. The audit trail records "signed in", "renewed", "removed", with no token;
- the run reads it only to start one process: the engine adapter decrypts it in memory and places it in the environment of that one `claude -p` (or Codex) process, in an empty home; no member container, tool or MCP server sees it. The install-secret crawl and the redaction tests (D39) are extended to cover it;
- **Disconnect** deletes the file and, where the provider has a revoke address, asks it to revoke; the Engines page shows it as off at once;
- one person, one login (PROVIDERS.md rule 2): a sign-in belongs to the person who made it; a second person on a shared install signs in with their own, and a member run for person A never uses person B's.
- per-person file names follow D28 and D106: the signed-in administrator, or the live `computer` pairing, may start a sign-in; a non-administrator, a phone and a remote session cannot, and a hand-off (Iris to a member) can never start one.

## 6. Ported or new

| Piece | Source | Notes |
|---|---|---|
| PKCE, authorize URL, token exchange (Claude) | **Port, MIT**, from `claude_sign_in.rs`, re-written in TypeScript with a `NOTICE.md` line | The client id is Anthropic's public Claude Code client. |
| Loopback listener rules, `state` check, 15-minute wait, 1455 and cancel | **Port, MIT**, from `sign_in_redirect.rs` | In FreeDuet the *server* listens, not a desktop app. |
| ChatGPT redirect and device-code flow | **New**, from the behaviour described in the upstream commits and the public description of the Codex login | No server source exists to port. |
| xAI device flow | **Port, MIT**, from `provider_oauth.rs` | Phase 4. |
| Provider list, presets, copy button, fallback rules | **Port, MIT**, from `providers.ts`, `sign-in-redirect.ts`, `copy-button.tsx` | FreeDuet's list is different (section 3). |
| Server routes for start, status, finish, remove | **New**, in `openbot/server/src/freeduet/` | Upstream's are in a source not available; the shape follows the API file. |
| Encrypted store, the lock, `O_NOFOLLOW` read | **Port of the helper's design**, new code | Section 5. |
| Passing the token to `claude -p` or Codex | **New** | `engine_adapter.py`, `claude_engine.py`. |
| The screen, "Nothing", the sample mode | **New** | The upstream chooser is not copied: FreeDuet's has "Nothing". |
| Tauri commands | **Not used** | FreeDuet is a browser page and a server; the desktop app is only reused later (D5 of the installer). |

Upstream touches (D150): the smallest possible; the new server files are FreeDuet's own (`server/src/freeduet/`) and each upstream file changed gets a row in `UPSTREAM_TOUCHES.md`.

## 7. Test plan

Fail before, pass after, with a real gate (never only a helper).
- Store: a token is written encrypted (the bytes on disk do not contain it), mode 600/700, a link in its place is refused, a wrong secret fails to read, a file edited by one byte fails the GCM check, two writers take turns.
- Leak tests: the token, the code, the state and the verifier appear in no route answer, log line, audit row, error text, SSE event, member prompt or tool output; the install-secret crawl covers the new folder.
- Flow, against a stub provider on loopback (never a real address): PKCE and `state` are checked; a wrong `state` is refused; a code is exchanged once; a replayed redirect is refused; an `sk-ant-api` key is refused as a plan token; the listener stops on cancel, timeout and a second start; port 1455 busy falls back to the device code.
- Authority: a phone, a remote session, a non-administrator and a hand-off cannot start, finish or remove a sign-in; the hosted switch (D6) refuses plan sign-in.
- Approvals: a member run on a stored sign-in meets the gate exactly as one on the CLI's login; a test pins that no sign-in path lifts an approval or a Full access setting.
- Router: logins first and D115 unchanged; a stopped sign-in (expired, revoked) is a router reason, with the notice and the Engines page's "Sign in again".
- Screen: the six choices; "Nothing" with Ollama found, with it missing, and with sample mode; the click counts above are asserted in the browser test.
- Whole server suite (`bun run test:server:sharded`) before each phase's pull request; the agent suite for the adapter.
- Live (the maintainer's run, never CI): one real Claude sign-in, one real ChatGPT sign-in, one real Ollama start, one real OpenRouter free start. Until then each phase says "built, not run live".

## 8. Prompts and tool texts

None change in phases 1 to 4. The first-start card's words and the notices are person-facing texts, not model prompts. Eval cases to run when a member runs on a new engine: the team evals for Iris, Otto and Leo on that engine (docs/dev/evals.md), compared with their Claude baseline.

## 9. Risks

1. **Provider terms (said once, plainly).** Some providers' terms may forbid a third-party program from using a consumer plan: Anthropic's published rule is that developers may not offer Claude.ai login in their apps or route requests through plan credentials on users' behalf, and may not collect, store or intermediate plan credentials or session tokens (PROVIDERS.md). The maintainer decided on 25 November 2026, after being told, to go ahead. The consequence can be a limit, a refusal or a suspension of the person's own account, and it falls on the person, not on FreeDuet. So the screen says, before the first plan sign-in, in one plain sentence, that the provider's terms may not allow a plan to be used through another program and that an API key or a free model avoids it, with a link to PROVIDERS.md. The rest of this document does not repeat it.
2. **A leaked sign-in is a full plan.** Section 5's protection is real but local (a computer that holds both the folder and the install secret can read it). Disconnect and revoke are one click.
3. **Upstream is not the same product.** Its server half is missing, so the behaviour of a plan token's renewal, expiry and error codes is learned by running it. Claude's year-long token has no refresh; ChatGPT's does [assumed].
4. **Client ids belong to the providers' own tools.** A provider can change or block a client id at any time; the flows would then stop, and the screen falls back to the key path and says so.
5. **Port 1455 and loopback.** A server in a container needs the port published to the computer's loopback only (never to the network); a wrong mapping would expose the listener to the home network. The listener binds loopback, accepts one `state`, and stops after use.
6. **Hosted FreeDuet.** A hosted service holding many people's plans is the clearest "third party using a consumer plan"; D6's `FREEDUET_DEPLOYMENT=hosted` keeps refusing plan sign-in (decision below).
7. **Free engines are not private** (D101) and may stop (limits of OpenRouter's free tier are in PROVIDERS.md); the page says so and the router moves on.
8. **Cost.** A metered key still needs `metered:` on and caps above 0 (D98, PROVIDERS.md rule 4); the page switches nothing paid on.

## 10. Phased plan

| Phase | What | Effort | Executor | Needs |
|---|---|---|---|---|
| 0 | This design, the docs changes, D155 | S | Opus (this pull request) | The maintainer's read |
| 1 | The first-start screen with the six choices and "Nothing": Ollama detection, OpenRouter free card turned on and put in the chain, key cards for Gemini and GLM (presets), the click counts, the risk sentence; sample mode as a separate pull request | M | Haiku for the cards and texts, Sonnet for the chain writing; a review | Nothing from a provider; no sign-in code |
| 2 | The encrypted store, its routes and the leak tests; the install-secret crawl | M | **Sonnet + review** | Phase 1 not required; start in parallel |
| 3 | Claude plan sign-in: PKCE, loopback listener in the server, manual fallback, the token to `claude -p`, Disconnect; live run by the maintainer | L | **Sonnet + review** | Phase 2; the compose file publishes the callback port to loopback only |
| 4 | ChatGPT plan sign-in (redirect on 1455, device code) and a Codex engine that runs a member, after the hands-on check of tool calls and lockdown | L | **Sonnet + review** | Phases 2 and 3's listener; a decision on Codex |
| 5 | xAI device flow and, if an Anthropic-format address exists, a Grok member engine | M | **Sonnet + review** | Phase 2 |
| 6 | The Engines page shows each sign-in's state and "Sign in again"; docs and site wording | S | Haiku | Phases 3 to 5 |

Each pull request opens with "built, not run live" until the maintainer has run it.

## 11. Open decisions for the maintainer

| Decision | Options | Recommendation | Reason |
|---|---|---|---|
| Where the sign-in is kept | (a) encrypted file under the install secret; (b) the CLI's own login folder; (c) the database | (a) | One primitive, one place, a per-installation key (D28), and no contact with the CLI's own folders. |
| Hosted FreeDuet and plan sign-in | (a) keep refusing (D6); (b) allow | (a) | A hosted service keeping many people's plans is the largest terms risk; D6 is a cheap line. |
| Gemini: key or OAuth first | (a) key; (b) Google OAuth | (a) | OAuth gives the Developer API, not the person's plan, needs a registered client, and Google's terms for its CLI's OAuth are against it. |
| ChatGPT before a Codex member engine exists | (a) sign-in only when the engine can run a member; (b) sign in now, light assistants only | (a) | A sign-in that runs nothing is a disappointment and a stored credential for nothing. |
| GLM | (a) key only; (b) also the Coding Plan | (a) | Z.ai's plan may be used only inside listed tools. |
| Order of work | (a) phase 1 first, plan sign-ins after; (b) Claude sign-in first | (a) | Most people have no plan; phase 1 is the larger part of D155 and carries no credential. |

## 12. Built so far

Nothing. This is a design. Not verified: every flow above (none was run), the behaviour of the providers' endpoints today, how a plan token is handed to `claude -p` and to Codex, whether xAI and Z.ai offer an Anthropic-format address, and the server half of upstream's plan sign-in (not in the clone).
