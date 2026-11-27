# Phone and remote access: design

Slices 1 and 4 have product code, merged as PR #195 and PR #221 (see "Built so far"). Written 2026-11-14 for two roadmap rows, "Phone" and "Remote access to your own FreeDuet" ([ROADMAP.md](../ROADMAP.md)). Read with [M1_PLAN.md](../M1_PLAN.md) and [SECURITY.md](../../SECURITY.md). Pull request 129 was treated as a neighbour; it is merged.

Tags: **[code: path:line]** read on origin/main at 452e060. **[doc: URL]** a public page or pull request, read on 2026-11-14. **[assumed]** my inference, a behaviour I did not run, or a page I could not read. Nothing tagged [assumed] may be built on as if it were true.

## 1. What the person gets

- **Phone.** Open FreeDuet on a phone, read a conversation, and decide an approval: allow it once, or deny it. First version: the phone's browser, with no alert while the page is closed. Later: a push notification.
- **Remote access.** Reach your own FreeDuet from outside the home network, after you sign in, over HTTPS.
- **Hard rule.** Never exposed publicly without a login. Being on a network never proves who you are.

## 2. What exists today in the code

### 2.1 Single-user mode and the loopback rule

- `.env.example` switches single-user mode on [code: openbot/.env.example:65]. With no identity provider, the server refuses to start unless that flag is set [code: openbot/server/src/auth/dev-actor.ts:68-86].
- A configured provider turns single-user mode off [code: openbot/server/src/auth/dev-actor.ts:72; openbot/server/src/config.ts:1454-1456].
- The one administrator in single-user mode is a request whose TCP peer is loopback. No header takes part [code: openbot/server/src/auth/peer.ts:13-19]. Any other peer gets 401 [code: openbot/server/src/auth/dev-actor.ts:96-111].
- The server listens on loopback, plus the Docker bridge address where it exists [code: openbot/server/src/config.ts:1494-1511; openbot/shared/listen-host.ts:36-40]. Setting `OPENBOT_HOST` admits every peer that reaches the address. The code comment calls that a deliberate decision [code: openbot/server/src/auth/peer.ts:21-23].
- A configured public address makes the server refuse to start in single-user mode [code: openbot/server/src/config.ts:574-585]. A private address only gets a boot warning [code: openbot/server/src/config.ts:592-597]. The deployment guide lists a Tailscale or VPN address as a private case, where anybody on that network is the administrator [code: openbot/docs/deployment.md:148-150].
- A proxy or tunnel on this machine connects from loopback, so what it forwards would look like the administrator [assumed: reasoning from peer.ts:13-19]. The same-origin guard checks only changes and WebSocket upgrades, so reads pass [code: openbot/server/src/auth/same-origin.ts:17-21].
- On Docker Desktop, a member's container looks like this machine [code: CLAUDE.md:175-176]. PR 129 says it closes that gap [doc: https://github.com/MarcoDeliaBot/freeduet/pull/129].

### 2.2 Sign-in modes the base offers

- Three identity providers exist: Google, Microsoft and Okta [code: openbot/server/src/config.ts:113]. The redirect address has the form `<BETTER_AUTH_URL>/api/auth/callback/<provider>` [code: openbot/docs/configuration.md:596-597].
- Better Auth runs the sign-in, with social providers [code: openbot/server/src/auth/index.ts:370], enterprise SSO [code: openbot/server/src/auth/index.ts:250] and SCIM [code: openbot/server/src/auth/index.ts:223]. That file has no password sign-in [code: openbot/server/src/auth/index.ts; a search for "password" finds nothing].
- `BETTER_AUTH_SECRET` must be at least 32 characters [code: openbot/server/src/config.ts:848-849].
- The only sign-in allowlist is a list of domains, `SIGNIN_ALLOWED_EMAIL_DOMAINS` [code: openbot/server/src/config.ts:911-914 at ccfffad; 881 when written]. It matches exactly, and an empty list admits everybody [code: openbot/server/src/auth/email-domain.ts:17-18; openbot/docs/configuration.md:528, "Empty means no opinion", at ccfffad]. It is checked at sign-in [code: the `user.create.before` and `session.create.before` hooks of openbot/server/src/auth/index.ts, the domain checks at lines 404 and 483 at ccfffad; 399 and 467 when written]. No per-address list exists [code: a search for SIGNIN_ALLOWED finds only the domain list, when written]. **Status, 17 November 2026: the two sentences above that say the domain list is the only one, and that no per-address list exists, are superseded.** `SIGNIN_ALLOWED_EMAILS` is an exact-address list, built in slice 1 (PR #195): `openbot/server/src/freeduet/signin-allowlist.ts` (`SIGNIN_ALLOWED_EMAILS_VARIABLE`, `signInAllowedEmails`), read in `openbot/server/src/config.ts` (`AuthConfig.allowedEmails`, lines 973-997 at ccfffad), and checked by both hooks above after the domain check, at lines 419 and 502 at ccfffad. An address has to pass both lists.
- The members share one Claude login for the whole deployment [code: docs/M1_PLAN.md D9]. A stranger who signed in would reach members on that same login [assumed].
- Google's redirect rules: https only, no raw IP address, and a top-level domain from the public suffix list [doc: https://developers.google.com/identity/protocols/oauth2/web-server]. So a LAN address, which is a raw IP, cannot be the redirect address.
- The code comment says Google can narrow sign-in to Workspace domains, and that a deployment should use that setting as well, not instead [code: openbot/server/src/auth/email-domain.ts:4-8].

### 2.3 TLS and exposure

- SECURITY.md tells the reader to put TLS and sign-in in front of the app before any exposure to a network [code: SECURITY.md:37]. The deployment guide says the same, and adds that sign-in cookies want `Secure` [code: openbot/docs/deployment.md:153-156].
- A page on plain http cannot set a `Secure` cookie, except on localhost [doc: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie].
- A phone that opens `http://<computer>:3010` gets no microphone [code: openbot/docs/configuration.md:347-350].

### 2.4 Phone client

- The layout is responsive: a viewport tag [code: openbot/app/index.html:5] and a hook that reports phone width at 768 pixels [code: openbot/app/src/hooks/use-mobile.ts:3, 11]. It has not run on a phone [assumed].
- It is not a PWA. There is no manifest link [code: openbot/app/index.html:3-10], and a search of openbot/app finds no service worker.
- The base has a native app in `openbot/mobile/`, built with Expo. Its name and bundle id are still OpenBot's [code: openbot/mobile/app.config.ts:5-10]. Push needs an EAS project and APNs or FCM credentials [code: openbot/mobile/src/notifications.ts:17-23].
- Outside development, the native app needs an https server address [code: openbot/docs/configuration.md:820-823]. `EXPO_PROJECT_ID` switches on native sign-in and push [code: openbot/server/src/auth/index.ts:211-219; openbot/docs/configuration.md:812].
- The release table lists a type check for the native app and nothing else for it [code: openbot/docs/releasing.md:123].

### 2.5 How approval requests reach the person

| Path | What happens today | Where |
|---|---|---|
| Chat card | The run pauses at the approval. The stream sends a keep-alive every 5 s. | [code: openbot/server/src/freeduet/keep-alive.ts:27-30; openbot/server/src/delivery/opentag.ts:424] |
| Approvals page | Polled every 10 s. | [code: openbot/app/src/lib/approvals.ts:106, 116] |
| Storage | The request is stored before the run pauses. A dropped connection should not lose it [assumed]. | [code: openbot/server/src/approvals/wiring.ts:63-64] |
| Whole request | The app's own card shows the whole request. A chat card has room for ten rows of 300 characters, and says when it cut a request. | [code: openbot/server/src/delivery/opentag.ts:382, 387-388] |
| Push (native app only) | The server posts to Expo. The text names the bot and the tool reference, not the arguments. The body is clipped to 200 characters. | [code: openbot/server/src/delivery/router.ts:168-179; openbot/server/src/delivery/push.ts:51, 57; openbot/server/src/approvals/wiring.ts:105] |
| Slack or Teams | Through the OpenTag pairing. A card click runs the agent again with the decision. | [code: openbot/server/src/delivery/opentag.ts:1-19] |

- Bun closes a connection after 10 s of silence [code: openbot/server/src/freeduet/keep-alive.ts:4; openbot/server/src/delivery/opentag.ts:425-426]. The server wrapper writes every 5 s [code: openbot/server/src/freeduet/keep-alive.ts:27-30]. M1 D8 has the agent's own stream send a keep-alive every 15 s [code: docs/M1_PLAN.md D8].
- A device registers only for a signed-in person, and only with the matching Expo project id [code: openbot/server/src/delivery/routes.ts:92, 199-212]. A signed-in person can also delete a device [code: openbot/server/src/delivery/routes.ts:225-226].
- The app's screens show no session list and offer no way to end one session [code: a search of openbot/app/src finds none]. The server ends sessions in one place: turning SSO-required on ends sessions made without SSO [code: openbot/server/src/auth/sso-required.ts:16; openbot/server/src/admin/routes.ts:275]. Better Auth's own session routes were not checked [assumed]. **Status, 17 November 2026 (D74):** a Revoke on a paired browser's row now also ends that browser's sign-in session, when the pairing recorded one (`PairingStore.revoke`, section 3.5.6), so a paired browser's session can now be ended from Settings. The server's own code ends a session in that function as well as in the SSO-required rule. There is still no session list.
- No session length is set in `openbot/server/src/auth/` [code: a search for expiresIn and updateAge finds none]. The library default was not checked [assumed].

### 2.6 Full access and approvals

- Only the person changes Full access, through `PUT /api/approvals/full-access/:botId`, behind the user guard and the same-origin guard [code: docs/FULL_ACCESS.md:17-19]. A phone signed in as the person would pass both [assumed].
- A new email goes out without a card when the person typed the recipient in the live turn [code: docs/M1_PLAN.md D27]. A phone's typed message would count the same way [assumed].

### 2.7 PR 129 (merged)

- It adds an installation secret. In single-user mode, a loopback request counts as the person only with that secret. The browser gets a cookie (HttpOnly, SameSite=Strict, Path=/api) from a one-time link (256 bits, 120 s, single use) [doc: https://github.com/MarcoDeliaBot/freeduet/pull/129].
- Containers never get the secret. Multi-user, `OPENBOT_HOST` and no-secret installs stay as they are [doc: https://github.com/MarcoDeliaBot/freeduet/pull/129].
- The cookie lasts 400 days, a maintainer decision recorded in the PR [doc: https://github.com/MarcoDeliaBot/freeduet/pull/129].
- It touches `dev-actor.ts`, `config.ts`, `http-server.ts`, `app.ts`, `app/src/routes/sign.tsx`, `scripts/open.sh` and `scripts/start.sh`, and adds `auth/install-secret.ts` [doc: https://github.com/MarcoDeliaBot/freeduet/pull/129, file list].
- Two consequences [assumed]. The one-time link would set the admin cookie in whichever browser opens it, so a phone must never receive that link. The guard would also refuse a proxied request that carries no cookie, which would close the proxy gap in 2.1.

## 3. The design

### 3.1 The smallest version worth shipping: sign-in in front of HTTPS

The phone uses the same web app in its browser. There is no pairing, no new secret and no push.

1. Create an OAuth client with the provider. Register `https://<name>/api/auth/callback/<provider>` as its redirect address [code: openbot/docs/configuration.md:596-597].
2. Set `BETTER_AUTH_URL` and `OPENBOT_PUBLIC_URL` to that https address, and `TRUSTED_ORIGINS` to the same origin [code: openbot/server/src/config.ts:575-577, 835]. Also set `BETTER_AUTH_SECRET`, the provider's client id and secret, `INITIAL_ADMIN_EMAILS` [code: openbot/server/src/config.ts:865], and the exact-address list (slice 1).
3. Put HTTPS in front: the person's own tailnet (decision 1), or a reverse proxy with a certificate on a name the person owns.
4. Open that address on the phone and sign in.
5. Decide approvals on the approvals page or in the chat.

Why it is safe: with a provider set, single-user mode is off [code: openbot/server/src/auth/dev-actor.ts:72]. The loopback rule then decides nothing about who the person is. A proxy on this machine is only as trusted as the session cookie it forwards [assumed].

Why it is small: it reuses the sign-in the base already has. It adds no secret, and one mechanism serves the phone and remote access.

Before anyone uses it from outside the home network, slices 1 to 3 must ship. Not in v1: pairing, push, the native app, a PWA.

### 3.2 Three options, compared

**Option 1. Pairing link on the computer, same network only, a revocable device credential.**

1. In Settings on the computer, the person opens "Phones" and shows a QR code.
2. The person scans it on the phone. Both screens show the same six-digit code.
3. The person confirms on the computer. The phone gets its own random credential. The server keeps only a hash of it.
4. Removal happens on the computer.

- Must be built: a credential table (hash, name, created, last used, revoked); an enrolment route that only a computer holding PR 129's cookie can call, with its own one-time secret (256 bits, 120 s, single use) that never sets the admin cookie; a device branch in the guard, next to PR 129's check (both edit `dev-actor.ts`); a route list for devices; a list and revoke screen; a LAN rule separate from `OPENBOT_HOST`, which admits every peer; TLS on the LAN, or plain http with its risks.
- Lost phone: the credential works on the LAN until it is revoked from the computer.
- Shared link: a photographed QR works for 120 s. Single use and the typed code limit that. The RFC's phishing section warns that a user can be tricked into entering a code [doc: https://www.rfc-editor.org/rfc/rfc8628, section 5.4]. A code shown on both screens lets the person spot a wrong pairing [assumed].
- Replay: over plain http, other devices on a shared network may read the one-time secret and the credential [assumed]. TLS comes first.
- A member's container: on the bridge network it is a non-loopback peer [assumed: from config.ts:1494-1511]. On Docker Desktop it looks like this machine [code: CLAUDE.md:175-176]. Enrolment needs PR 129's cookie, and containers never get the secret. Device credentials stay out of container environments, mounts, URLs and logs.
- No remote access and no push.

**Option 2. Real sign-in in front of TLS, on a name the person owns or through a tunnel.**

1. Follow 3.1 with a public name: an own domain, a reverse proxy and port 443, or a tunnel the person runs.
2. Sign in on the phone.

- Must be built: slice 1 before any exposure; slice 2 only as a test of PR 129's guard, since PR 129 is merged (section 2.7); slice 3; docs.
- Lost phone: until slice 3 ships, the person cannot end one phone's session from the computer (2.5). **Status, 17 November 2026 (D74):** for a phone that holds a pairing this is no longer so: a Revoke from the computer also ends the phone's sign-in session, when the pairing recorded one (section 3.5.6). A phone with a session and no pairing is not ended by Revoke, and the sign-out-other-sessions button of slice 3 is not built.
- Shared link: a sign-in page gives nothing without the account. A session left on a shared phone is the risk, and slice 3 covers it.
- Replay: a `Secure` cookie is sent only over https [doc: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie]. How this code sets its cookie flags was not read [assumed].
- A stranger with a provider account is admitted until slice 1 exists. The code comment says Google can narrow sign-in to Workspace domains, and that a deployment should use that setting too [code: openbot/server/src/auth/email-domain.ts:4-8].
- A member's container: no sign-in there, only tool tokens [code: docs/M1_PLAN.md D5]. No change.
- The provider's own protections, such as two-step verification, apply [assumed].

**Option 3. A private network app on the phone (Tailscale or similar).**

1. Put the computer and the phone on one tailnet. Turn on MagicDNS and HTTPS certificates [doc: https://tailscale.com/docs/how-to/set-up-https-certificates].
2. Serve the app on the machine's tailnet name with `tailscale serve`, which proxies to `http://127.0.0.1` [doc: https://tailscale.com/docs/reference/tailscale-cli/serve].
3. Sign in as in 3.1, then open the name on the phone.

- Must be built: slices 1, 2 and 3, and docs. Whether the provider accepts a tailnet name as a redirect address is not checked [assumed].
- Critical: the app would see the proxy's connection as loopback [assumed: from the serve reference and peer.ts:13-19]. The deployment guide already accepts a Tailscale address in single-user mode, where anybody on that network is the administrator [code: openbot/docs/deployment.md:148-150]. With a tailnet, sign-in must be on.
- Names: the machine and tailnet names appear in public certificate logs, and certificates expire after 90 days [doc: https://tailscale.com/docs/how-to/set-up-https-certificates].
- Lost phone: removing it from the tailnet cuts its reach. Its FreeDuet session stays valid until slice 3 ships. **Status, 17 November 2026 (D74):** removing the phone from the tailnet still ends no session. If the phone holds a pairing, a Revoke from the computer now also ends its sign-in session (section 3.5.6).
- Shared link: sharing a device with another user gives that user reach. Sign-in still gates the app.
- The tailnet is a third-party service. Its traffic is encrypted end to end [assumed].

### 3.3 What a phone may do (all options)

- May: read, chat, see the whole approval request, allow it once, deny it.
- May not, in v1: change Full access, approval rules, connected accounts, sharing, provider or sign-in settings, or security settings; create standing approval rules; send a new email without a card because its own message named the address (decision 5).

### 3.4 After v1, in this order

1. A device list, with sign-out per device, replacing slice 3's single button.
2. The native app with push (slice 6). Expo passes each push on to Google (FCM) and Apple (APNs) [doc: https://docs.expo.dev/push-notifications/sending-notifications/]. The Expo access token is optional [code: openbot/docs/configuration.md:813], and Expo treats it as opt-in [doc: https://docs.expo.dev/push-notifications/sending-notifications/].
3. Same-network pairing, only if decision 4 says yes.
4. A web app manifest and service worker, for install and possibly web push. Both need https.

### 3.5 Slice 4: what a remote session may reach

Decided 14 November 2026: decision E, option (a), and decision 5, option (a). This section is the design of slice 4 and the list its code is held to. `openbot/server/src/auth/remote-limits.ts` holds the same list as data, and `openbot/server/tests/remote-limits-ledger.test.ts` fails when the two differ.

#### 3.5.1 Who is remote

Only a deployment with sign-in and an installation secret has the question. The secret is `FREEDUET_INSTALL_SECRET`, which `scripts/start.sh` writes (D28).

| Deployment | A request is |
|---|---|
| No sign-in (single-user mode) | Not changed. D28 stays as it is: a loopback peer that holds the cookie. |
| Sign-in, no installation secret (a hand-started server, the Helm chart) | Not limited. Nothing tells a browser at the computer from one elsewhere. The boot log says so. |
| Sign-in and a secret: a session, and a cookie that is the token of a live pairing of the same person | At the computer. Nothing is limited. |
| Sign-in and a secret: a session, no cookie, or a cookie that is no live pairing of the person the session names (another person's token, a revoked or expired pairing, one made under an earlier secret, the old cookie that is the secret itself) | Remote. Limited to the list below. |
| Sign-in and a secret: no session | Nobody. The route's own guard answers as it always did: 401, or its own credential (a member's tool token, the worker's secret, a signature). |

What the sender cannot forge: the classification reads the session, which the server holds and which says WHO, and the value of one cookie, a random token that the database knows only as a hash, with the person it was made for. It never reads a header, the user agent or the peer address. A tunnel or reverse proxy on the same machine makes a far-away request arrive from loopback, so with sign-in on, loopback alone is never "at the computer". The cookie alone signs nobody in: a request that has the cookie and no session is still nobody.

**Since D49 (16 November 2026) the cookie is not the installation secret.** Until then it was `freeduet_install_<port>` with the secret itself in it, for 400 days, tied to no person: a copy of the cookie was the secret, and worked for whoever signed in. Now each paired browser has its own token in `freeduet_pair_<port>`, and the table `browser_pairings` holds, for each: an id, the person, a name the person can edit, a kind, only the SHA-256 of the token, a tag of the installation secret it was made under, when it was made and last seen, when it ends, and when it was revoked. A pairing is LIVE when it is not revoked, has not ended, and its tag is the tag of the secret now in force, so **changing the secret ends every pairing at once** (and the server also marks them revoked at the next start, with one audit row). "At the computer" is true only when the cookie's token matches a live pairing of the SAME signed-in person: a token of person A never makes person B at the computer. Kinds: `computer`, paired by the link below on the machine, and `device`, paired with a code (3.5.6).

The first pairing of a browser is made by a link, redeemed under three conditions together: the request arrives from this machine's loopback; it carries the session of a signed-in administrator; and the link is a live one-time link, minted by `POST /internal/pairing` with the secret as bearer (the secret stays the launcher's credential). The session is checked before the link is used up, so a link survives the minute it takes to sign in. The administrator's browser gets its own `computer` pairing and the cookie that holds its token. The cookie is HttpOnly and SameSite=Strict, host-only, `Path=/api`, lasts 400 days, and is Secure when the app's address is https.

A browser paired before D49 still holds the old cookie. On its first signed-in request it is upgraded once, in silence, to its own `computer` pairing for the person signed in, and the answer sets the new cookie and clears the old one (`createLegacyCookieUpgrade`). Requests that arrive together share one upgrade. It is done only for a request directly at this machine (loopback peer, no intermediary header: `auth/direct-request.ts`, the same test as `atTheComputer`); from another address or through a tunnel the old cookie pairs nothing and the session is remote, so a copy of it cannot bring a revoked pairing back. A person behind a tunnel on this machine runs `bash scripts/open.sh` once and the browser that opens the link, signed in as the administrator, gets a `computer` pairing with the new token. **After 16 February 2027 the old cookie is refused in code** (`LEGACY_UPGRADE_ENDS`) and the path is to be deleted; until then it is the one place the secret is read from a browser, and only to be compared.

The Engines page (PR 200) asks "at the computer" too, and since D106 (20 November 2026) it also takes the administrator's own paired browser through a tunnel (see the end of this section). There is one notion, not two: `atTheComputer` takes the pairing gate and the person as its third and fourth arguments, and where there is a gate, it adds a live pairing of that person to its own two conditions (loopback, and none of the headers a proxy adds).

#### 3.5.2 The list

A remote session is refused everything that is not on this list. A route added later is refused until someone adds it here, and the test fails until they do. The list is matched on the method and the path, as every spelling of the path the server could read (as sent, decoded once, decoded fully); all must be on the list. `HEAD` follows `GET`.

The table gives every route family the app registers, in `createApp` and `http-server.ts`, and the reason for its verdict. `allowed` means the routes named; `partly` means the routes named are allowed and the rest of the family is refused; `refused` means all of it.

<!-- remote-ledger:start -->
| Family | Routes | Remote session | Why |
|---|---|---|---|
| `app` | `GET` and `HEAD` of any path outside `/api` and `/internal` | allowed | The app's own files hold no person's data, and the app has to load before it can ask for anything. |
| `health` | `GET /health` | allowed | Liveness, no data. |
| `keys` | `GET /.well-known/http-message-signatures-directory` (only when Web Bot Auth is on) | allowed | The public key, public by design. |
| `capabilities` | `GET /api/capabilities` | allowed | What the deployment offers, with no person's data and no secret. The app draws itself from it. |
| `sign-in` | `/api/auth/*`: `get-session`, `sign-out`, `sign-in/social`, `sign-in/sso`, `callback/:id`, `sso/callback`, `sso/callback/:providerId`, `sso/saml2/sp/acs/:providerId`, `error`, `ok` | partly | These sign a person in or out. Every other call acts on the account (link or unlink, change email or password, update or delete the user, sessions, tokens, SSO registration) and is refused. A new Better Auth call is refused until it is listed. |
| `directory` | `PUT`, `PATCH`, `DELETE /api/auth/scim/*` | refused | Directory provisioning, with its own bearer token and never a person's session. |
| `pairing` | `GET /api/pair` allowed; `POST /internal/pairing` refused | partly | `GET /api/pair` is how a browser becomes the computer's, and checks loopback, an administrator session and a one-time link itself. The launcher's call carries the secret and never a session. |
| `pairings` | `POST /api/pairings/redeem` allowed; every other call under `/api/pairings/*` refused | partly | D49 (3.5.6). A phone, which is a remote session until it is paired, redeems a code for ITS OWN person: the route takes the person from the session and nothing in the body names anybody. Seeing the pairings, making a code, renaming and revoking are done from a paired browser, so a remote session sees nothing of them and mints nothing. |
| `me` | `GET /api/me`, `POST /api/me/onboarding` | allowed | Who is signed in, and the person's own progress marker. |
| `conversations` | `GET /api/channels`, `GET /api/channels/events`, `GET /api/channels/:channelId`, `POST /api/channels`, `POST /api/channels/first-day`, `POST /api/channels/morning-brief`, `POST /api/channels/:channelId/activity`, `POST /api/channels/:channelId/busy`, `PUT /api/channels/:channelId/read`, `POST /api/channels/:channelId/attachments` allowed; `PUT /api/channels/:channelId/pin` and `DELETE /api/channels/:channelId` refused | partly | Reading and chatting. Deleting a conversation destroys it and pinning arranges the person's own list, so both wait for the computer. |
| `attachments` | `GET /api/attachments/:id` allowed; `DELETE /api/attachments/:id` refused | partly | A picture or a file in a conversation is read like the conversation. Deleting is not. |
| `groups` | `GET /api/groups/:channelId` allowed; `POST /api/groups/:channelId`, `POST /api/groups`, `POST /api/groups/:channelId/members`, `DELETE /api/groups/:channelId/members/:userId` refused | partly | A group conversation is read from a remote session, not written to: a post is queued and answered by the members in turns that carry no mark of the session that sent it, so a member with Full access would act on it with no card (3.5.5). Who is in it is sharing. |
| `chat` | `/api/copilotkit`: `GET info`, `POST agent/:agentId/run`, `POST agent/:agentId/connect`, `POST agent/:agentId/stop/:threadId`, `GET threads`, `GET threads/:threadId/messages`; `POST /api/route`; `POST /api/threads/mint`; `GET /api/threads/:threadId` allowed; the rest of the runtime refused | partly | Chatting with the members. Exact shapes only, because the runtime routes on the last words of a path. Refused: `transcribe`, `agent/:agentId/suggest`, `inspector-metadata`, `inspector-learning`, `cpk-debug-events`, `trajectory/*`, and every `threads` call that subscribes, clears, archives, renames or deletes. |
| `roster` | `GET /api/agents`, `GET /api/agents/:agentId` allowed; the rest of `/api/agents` refused | partly | Names and pictures, to draw a conversation. A member's setup, its callback token and its hand-off reach are the computer's. |
| `bots` | `GET /api/bots/attention`, `GET /api/bots/:agentId/activity`, `POST /api/bots/:agentId/activity/handoffs/stop` allowed; routing, lifecycle, pause, resume, notifications, reset and follow-ups refused | partly | What needs the person, what a member is doing, and the Stop button. Pausing, resetting and routing change how the team works. |
| `approvals` | `GET /api/approvals`, `POST /api/approvals/:id/decision` (section 3.5.3), `POST /api/approvals/questions/:id/respond` allowed; Full access (read and write), `computer`, `preferences`, `rules`, `team` settings and rules refused | partly | See the whole request and answer an ordinary one once. Everything that changes what the assistants may do is done at the computer. |
| `shared-use` | `/api/approvals/shared-use/*` | refused | Approving a member's use of a team account is sharing. |
| `drawer` | `GET /api/openduet/channels` allowed; create, rename, archive, unarchive, keep refused | partly | The list of conversations. Arranging it is not chatting. |
| `work` | `/api/openduet/pages`, `/api/openduet/setup`, `/api/openduet/tasks` | refused | Not a conversation. The phone screens of slice 1 do not need them [assumed]. Decision G. |
| `admin` | `/api/admin/*`, `/api/admin/enterprise/*` | refused | The administrator is the person, so the role cannot keep a remote session out, and the list has to. |
| `engines` | `/api/freeduet/engines/*` | refused | It changes how the team's engines run (PR 200). The list still refuses it for a REMOTE session, which is a browser with no live `computer` or `device` pairing of its own person. A browser that does hold a `computer` pairing is not remote and, since D106, may change the engine choices even through a tunnel (below). |
| `settings` | `GET /api/settings/preferences` allowed; every other call under `/api/settings/*` and `/api/settings-changes/*` refused | partly | The person's own display preferences are read, because the conversation view loads them. Changing any setting, and the standing instructions, shape every conversation and wait for the computer. |
| `accounts` | `/api/identity/*`, `/api/plugins/*`, `/api/components/*`, `/api/delivery/*` except the webhooks | refused | Connected accounts and apps, and the channels that reach the person outside the app. |
| `secrets` | `/api/sign-in-requests/*`, `/api/passwords/*` | refused | The saved sign-ins of the members. |
| `computers` | `/api/computers/*`, `/api/host-access/*`, `/api/programs/*` | refused | They drive a member's computer, and the person's own, from the browser. The routes answer to the computer policy, and the card for a change comes from the app's tool wrapper and from `POST /api/approvals/computer/:botId`, not from the route [assumed: read in `computer/routes.ts` and `app/src/lib/copilot/approval-tools.tsx`; no live run]. |
| `automation` | `/api/routines/*`, `/api/responsibilities/*`, `/api/proactive/*`, `/api/demonstrations/*` | refused | Routines, triggers, suggestions and recorded demonstrations are standing instructions that act later. |
| `memory` | `/api/memory/*` | refused | What the assistants remember. |
| `import` | `/api/freeduet/import/*` | refused | The preview of an import compares what is pasted with what the assistants remember about the person and says which lines they already hold, so it reads the memory like `/api/memory/*` does. Bringing the person's facts in from another tool is done at the computer. |
| `build` | `GET /api/freeduet/build` | partly | Which build is running (version, commit, start time, D162): read-only, signed in, no secret, so a phone session sees it too. Nothing else under that path is served. |
| `work-status` | `GET /api/freeduet/work-status` | partly | Who is working and on what (D168): the person's own hand-offs, a state, times and a plain step label made from a tool name (never an argument). Read-only, signed in, no secret, so a phone session sees it too. Nothing else under that path is served. |
| `handoff-files` | `/api/freeduet/handoff-files` | refused | The files a colleague offered while working on a hand-off (D177), drawn as a card whose Download goes through the computer route, which a remote session is refused. The list is refused with it. |
| `team-file` | `/api/freeduet/team-file/*` | refused | A team file is the administrator's team written out as a download, so it leaves the installation. A remote session, which is a browser not paired with the computer, never asks for one. |
| `team` | `/api/team-bots/*` | refused | Publishing a Bot to a team is sharing. |
| `voice` | `POST /api/audio/transcriptions`, `/api/voice/*` | refused | Not one of the three powers. Decision G. |
| `sandboxed` | `/api/sandboxed/*` | refused | Pages that run what the assistants wrote. |
| `doors` | `POST /api/agent-tools/call`, `POST /api/model-provider/v1/chat/completions`, `POST /internal/routines/run`, `GET /api/desktop/connection-failure`, `/api/events/*`, `/api/delivery/webhooks/*` | refused | Doors with a credential of their own: a member, the worker, a signed sender, the desktop shell. Never a person's session. |
| `rest` | any other path under `/api` or `/internal` | refused | A route added later. |
<!-- remote-ledger:end -->

The refusal is a 403 with one plain sentence and the code `remote_session_limited`. The sentence says that this browser is not paired with the computer FreeDuet runs on, so it can read, chat and answer a plain request once, and that the rest is done at the computer; it ends with how to pair (section 3.5.4). The app already shows the `error` text of a refused call.

The live screen is a WebSocket the server upgrades itself in `http-server.ts`, outside `createApp`, so the middleware never sees it. It asks the same question where it already has the actor: a signed-in request without the cookie is refused with the same sentence, a request with no session still gets "Sign in first."

**Engine choices through a tunnel (D106, 20 November 2026).** `mayChangeEngines` (`freeduet/at-the-computer.ts`) is asked only by the routes under `/api/freeduet/engines` that change something (the per-member mode, its Undo, "Check again"). It lets the request through when `atTheComputer` does, or, where there is a gate (sign-in and an installation secret), when the session is an administrator's and the browser's cookie names a live, unrevoked pairing of kind `computer` of that same person (`pairings.standing`, the one definition), whether or not the request came through a tunnel or a proxy on this machine. A `device` pairing (a phone), no pairing, another person's pairing and a failing lookup are refused. Every other route that asks `atTheComputer` (programs, pairing, secrets, connections, Full access, approval rules) is unchanged and still refuses a tunnel. Without a gate (single-user mode, sign-in with no secret) a tunnel is still refused. A change that came through a tunnel is written to the audit row with `via: "tunnel"`. The risk is named in [`M1_PLAN.md`](../M1_PLAN.md), section 68 ("The Engines page through a tunnel, from the administrator's paired browser (D106)").

#### 3.5.3 Which approvals a remote session may answer

A remote session may answer only with `allow once` or `deny`, and only a request that is an ordinary card. It is refused, with a sentence that says to answer at the computer, when any of these holds:

- The answer is `allow always` (it saves a rule) or `handled` (it says the person did the thing).
- The gate's verdict on the request was `hand_off`: the person must do it themselves (credentials, security settings, payments, legal commitments), or the request was settled by a built-in safety requirement.
- The built-in safety check, run again at the moment of answering with the same function the gate uses, matches the action: a payment or purchase, a credential, a security or sharing setting.
- The action sets up a routine or a trigger, changes a setting from chat, changes Full access, or connects or authorises an app.
- The action is on a member's computer or the person's own (`computer_*`, `host/*`), or its tool name says it connects, authorises, installs, grants, invites or shares.
- The request has no recorded verdict from the gate, or a verdict this build does not know, or anything else cannot be classified. It fails closed.

The person can still read every request in full. A refused answer leaves the request pending, so it is there at the computer. `deny` is refused for these too (decision I). `POST /api/approvals/questions/:id/respond` is a reply to a question a member asked and is allowed as chat.

#### 3.5.4 An installation that already has sign-in

An installation started by `scripts/start.sh` already has the secret, because start.sh wrote it on the first start after D28, and no browser holds the cookie, because only single-user mode ever used it. After the update every browser is remote, including the administrator's at the computer. They see the app load and conversations and chat work, and ordinary requests can be answered once. Any other screen, settings or accounts or Full access or routines, answers with the one sentence. To pair, on the computer FreeDuet runs on, sign in as the administrator in the browser to pair, and run once:

```
bash scripts/open.sh
```

It asks the server for a link that is good once and for two minutes, and opens it in that browser, at the app's own address. A browser that is not signed in as the administrator gets a sentence that says so and the link survives. The same command pairs another browser at the computer. A phone is paired from Settings in a browser that is already paired (3.5.6), and an installation that had paired browsers before D49 keeps them: each is upgraded the first time it is used (3.5.1).

Every person who signs in is remote unless their browser is paired, and only an administrator at the loopback can pair one. In a deployment that several people use, that makes all of them remote. Decision F.

#### 3.5.5 What is not changed

- Single-user mode, byte for byte: the pairing routes, the guard, the Host guard and the same-origin guard behave as before, and the new middleware is not mounted without sign-in.
- A remote chat cannot use a member's computer tools. The browser runs them, through `/api/computers/*` and, for a change, `POST /api/approvals/computer/:botId`; both are refused, so a member asked to use its computer from a remote session is told it cannot, with the sentence. Server-side tools (mail, calendar and the other connected apps) are not affected: they run on the server and raise their cards in the conversation. Decision J.
- A chat a remote session starts has no shortcut that skips a card (decision H, built in the review of PR 221). The server marks the run `remote`: an initiator kind of its own, set in `createRequestAgents` from the pairing cookie and from nothing the browser sends. It travels on every path an initiator already does: the approval context a tool runs in, the signed run a member hands back, a hand-off's root, and the saved question an answer typed in a remote session resumes. For a run so marked, Full access (either setting), the typed-recipient shortcut (D27, D27a), the person's saved rules and the reviewer's "proceed" do not apply: every write asks a card, with its reason on it. The card is answered by the rule in 3.5.3, so from the same browser it can be allowed once or denied and nothing more. A colleague asked from such a run, and the colleague's own run, are held to the same. A member's own workspace and commands ask too, and their card is answered at the computer only (`remote-answer.ts` refuses a computer tool from a remote session), so no road leads from a remote chat to a member's computer without somebody at it (decision J). A read is not asked. The member's memory tools read and change nothing there, for the reason the list refuses `/api/memory/*`: what the assistants remember is read back in the person's own turns at the computer. Posting to a group conversation is refused from a remote session, because a group's message is queued and carries no mark of where it came from. The person's own live turn at the computer, a routine and a hand-off from the person are as they were.

#### 3.5.6 Pairing a phone or another browser (D49)

The person at the computer pairs a phone from Settings, section "Pair a phone or another browser". Only a browser paired as `computer` sees the button.

1. They press "Make a code". The server makes a one-time code of ten characters (shown as `ABCDE-FGHJK`, no look-alike letters), good for 2 minutes, one live code per person (a new one replaces the last). The page shows it as a link, `<app address>/settings#pair=<code>`, as a QR code of that link, drawn in the page by a small function of the app (no external service, no new dependency), and as the code to type.
2. On the phone, signed in as the same person, they open the link or open Settings and type the code. The code is in the link's FRAGMENT, which a browser never sends to a server and never puts in a Referer; the page reads it, removes it from the address bar at once, and only then offers "Pair this browser" with a name field (default "Phone or other browser"). Pressing it sends the code in the body of a POST to `/api/pairings/redeem`. The server takes the person from the session, matches the code only against the code THAT person made, and answers with the phone's own `device` pairing and its cookie.
3. Settings lists every pairing of the person: name, kind, made, last seen, and a Revoke button. A `computer` pairing may rename and revoke any of the person's; a `device` only itself. Revoking takes effect on the next request, because every request looks the token up. A `device` cannot make codes, so a lost phone cannot pair another.

Limits and audit. A code is used up by the first success, refused after 2 minutes, and burned after 5 wrong tries in a row. Redeem attempts are limited to 10 a minute per person and 30 a minute per address (the socket's address, never a header). Every code made, every pairing made (by link, by code or by upgrading the old cookie), every refused code and every revoke is a row in `audit_events` (`pairing.minted`, `pairing.redeemed`, `pairing.redeem_failed`, `pairing.revoked`) with the pairing's id, kind and how, and never the token, the code or the secret. Codes are held in the server's memory, so a restart ends the codes made before it.

What a thief of a paired phone can do until the person revokes it: what the browser at the computer can do for that person. Full access, approvals, connected accounts and the rest are open to it. That is the price of "works like the browser at the computer"; revoking from the computer, or changing the installation secret, ends it. A `device` pairing is "at the computer" in the sense of this section but never in the sense of the Engines page, which wants a `computer` pairing, or a direct request from this machine's loopback (3.5.1; D106).

**Status, 17 November 2026 (D74).** A Revoke now also ends the sign-in session that browser's pairing recorded, so a revoked phone whose session was recorded is signed out at its next request, unless it shares that session with the browser doing the revoking. A session the pairing did not record, as after a sign-in again with no request since, is not ended by the revoke and stays signed in as a remote session. The session ended is the one the pairing recorded (`PairingStore.revoke`, and the `DELETE /:id` route in `browser-pairing-routes.ts`). A pairing never seen with a session ends none, and the revoking browser's own session is kept unless it revokes itself. Changing the installation secret still ends every pairing and no session, so a phone that keeps its session is remote after such a change, with the limits of section 3.5.2. Checked by reading the code on main as of 17 November 2026; not run live. The limits are in section 53 ("Revoking a paired browser also signs it out (D74)") of [`M1_PLAN.md`](../M1_PLAN.md).

## 4. Slices

Size: S under 300 changed lines, M 300 to 1000, L over 1000.

| # | Builds | Proof | Needs first | Size |
|---|---|---|---|---|
| 1 | An exact-address sign-in list, `SIGNIN_ALLOWED_EMAILS`, checked where the domain list is checked (`openbot/server/src/auth/index.ts:399, 467`). Unset means unchanged. | Extend `openbot/server/tests/email-domain.test.ts`: a non-listed address is refused at sign-in; unset admits as before. | none | S |
| 2 | Refuse the implicit administrator for a request that carries forwarding headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`). PR 129 is merged, so this is a test of its guard. | `openbot/server/tests/single-user-peer.test.ts` and `openbot/server/tests/dev-actor.integration.test.ts`: a forwarded loopback request gets 401; container tool calls still pass. | decision 6; PR 129 status | S |
| 3 | "Sign out other sessions": one endpoint and one button in Settings. **Part built (D74, section 53 ("Revoking a paired browser also signs it out (D74)") of [`M1_PLAN.md`](../M1_PLAN.md)):** revoking a pairing also ends the sign-in session that browser was last seen with; the button and the endpoint are not built. Not run live. | Integration test: after the call the other session gets 401; the current session still works. | Better Auth session routes [assumed] | M |
| 4 | Phone scope: a session marked as a phone cannot reach Full access, approval rules, connected accounts, sharing or security settings. | Route tests through the real guard, as the Full access tests do. | slice 3; decision 5 | M |
| 5 | Docs: the 3.1 recipes for a tailnet and for a domain, and a manual checklist. | Manual, on a real phone over https: sign in; a wrong account is refused; sign-out cuts the phone. | slices 1 to 3 | S |
| 6 | Native app with push, on the person's own Expo project. | Existing `openbot/server/src/delivery` tests; a device run; push text has no arguments. | own EAS project; builds [assumed] | L |
| 7 | Same-network pairing (only if decision 4 says yes). | Enrolment refused without PR 129's cookie; single use; 120 s; a container cannot enrol; revoke works; plain http refused. | slice 2; PR 129; TLS decision | L |
| 8 | Web app manifest and service worker. | Manual install on a phone. | slice 5 (https) | M |

## 5. Rules that must hold

- From CLAUDE.md "Rules that never bend": logins first; never read or forward subscription credentials; no secrets or personal data in the repository; the person's approval for real account actions; change only what was asked; upstream changes kept minimal, each with a row in `docs/UPSTREAM_TOUCHES.md`.
- No route reachable from the internet without a sign-in, except the sign-in and status pages.
- No device or session credential in a container's environment, mount, URL, log or command line.
- Device credentials never reach `/api/agent-tools/*`, `/internal/*`, `/api/events/*` or `/api/delivery/webhooks/*` [code: openbot/server/src/app.ts:1341, 1652, 1775, 1860].
- A pairing secret is 256 bits, lasts 120 s, works once, shows only on the computer's screen, and is never the installation secret.
- Push text names the bot and the tool reference. It carries no arguments, and no token appears in any log.
- A sign-in allowlist matches exact addresses. A domain list is a filter, not a boundary [code: openbot/server/src/auth/email-domain.ts:10-15].
- The docs say what a third party sees: the tailnet's certificate log; Expo, Apple and Google for push.
- Each upstream file touched gets a row in `docs/UPSTREAM_TOUCHES.md`: for example `auth/email-domain.ts`, `auth/index.ts`, `auth/dev-actor.ts`, `config.ts` and `delivery/*`.
- **Member computers and the home network.** Decided 14 November 2026: a member's computer cannot reach devices on the person's home network unless the person switches that on. Off by default; one switch, which the person turns on.

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| 1 | Remote route for v1 | (a) Own tailnet with HTTPS. (b) Own domain, reverse proxy, port 443. (c) A tunnel the person runs. | (a), if the provider accepts a tailnet name; test that first. Otherwise (b). | (a) exposes nothing to the internet. (b) makes the login page public, so it needs sign-in and slice 1. |
| 2 | Who may sign in | (a) Exact-address list. (b) Domain list only. (c) No list: anyone the provider accepts. | (a). Unset means unchanged. | A domain list admits every account at that domain, and a public domain such as gmail.com admits every such account. Members share one Claude login. |
| 3 | Phone client in v1 | (a) Browser, responsive. (b) Native app with push. (c) Web app with manifest and service worker. | (a) now; (b) as slice 6. Decided 14 November 2026: (a), the phone's browser, with a real sign-in (section 3.1). | (a) needs no build. (b) needs an EAS project and builds, and push text passes through Expo, Apple and Google. |
| 4 | Pairing without sign-in | (a) Not in v1. (b) Same-network pairing, with TLS on the LAN. | (a). | Pairing gives no remote access. It needs a new admission path beside PR 129, and TLS on the LAN. Sign-in gives the phone the same access, with less new code. |
| 5 | What a phone may do | (a) Read, chat, allow once, deny. (b) Also Full access, rules, accounts, sharing, security, and sending without a card. | (a). Decided 14 November 2026: (a), limited powers (section 3.3). | A lost or unlocked phone must not change what the assistant may do, or send mail without a card. |
| 6 | Forwarded requests in single-user mode | (a) Refuse the implicit administrator when forwarding headers are present. (b) Keep as is. | (a), even after PR 129, as a second line. | Without it, a request forwarded from this machine is treated as the administrator for reads [assumed]. Common reverse proxies add forwarding headers, so the check catches them; a proxy that adds none is not caught [assumed]. |

## 7. What was not verified

- Better Auth's session list, single-session revoke and session length: not checked [assumed].
- Whether Google, Microsoft or Okta accept a tailnet name as a redirect address: not tested.
- Tailscale identity headers: the serve reference did not say.
- How a tunnel the person runs places TLS: not checked [assumed].
- The app on a real phone: responsiveness is from code only [assumed].
- The native app: no EAS project, no push sent.
- PR 129: the description and file list only; its diff was not read in full.
- Bun's 10 s limit: from code comments, not from Bun's documentation.
- Outside pages: the cited pages were read with the fetch tool earlier in this task. A final link check from the shell was refused by the egress proxy, so the URLs were not checked again.
- Nothing was run: no server, no tests, no proxy, no sign-in.

## Built so far

Slice 1 (section 4) is merged as PR #195: the exact-address sign-in list, `SIGNIN_ALLOWED_EMAILS`, with tests. Slice 4 is merged as PR #221 (see below). Slices 2 to 3 and 5 to 8 are not started. Single-user mode, the Host guard, the installation secret and the way sign-in itself works are not changed. Section 6, decision 2 is still marked open: the slice builds its recommendation, (a), as an opt-in, so a deployment that does not set the variable behaves exactly as before.

**Status, 17 November 2026.** The sentences above that say the installation secret and sign-in are not changed, and that slices 2 to 3 and 5 to 8 are not started, describe 14 November. Checked on origin/main ccfffad:

| Item | Status | Evidence |
|---|---|---|
| D49, browser pairing (PR #283, merge `7fd239d`) | Built. Each paired browser holds its own token, and the browser's cookie is no longer the installation secret. A phone is paired from Settings with a one-time code (section 3.5.6). Changing the secret still ends every pairing. | `openbot/server/src/auth/browser-pairings.ts`; `openbot/server/src/auth/browser-pairing-routes.ts` (`/code` at line 68, `/redeem` at 97); `openbot/server/drizzle/0076_browser_pairings.sql`; `openbot/app/src/components/settings/pair-devices.tsx`; [`docs/M1_PLAN.md`](../M1_PLAN.md), section 31 ("Each paired browser has its own revocable token, and a phone is paired from the computer (D49)") (D49) |
| Slice 2, refuse the implicit administrator behind forwarding headers | Not built. In single-user mode a loopback request that carries forwarding headers is still the administrator. The header check in `openbot/server/src/auth/direct-request.ts` is the 'at the computer' test, not this refusal. | `openbot/server/src/auth/peer.ts:16` (no header takes part); `openbot/server/src/auth/dev-actor.ts` calls `personVerdict` (`openbot/server/src/auth/install-secret.ts:169-180`), which reads the socket peer and the installation-secret cookie, and no header |
| Slice 3, sign out other sessions | Not built. No route or screen. The app's only sign-out call is `/api/auth/sign-out` (`openbot/app/src/lib/auth/mutations.ts:5-8`). Revoking a pairing ends its 'at the computer' status, not its sign-in session. | No session write in `openbot/server/src/auth/browser-pairings.ts` or `browser-pairing-routes.ts`; no "other sessions" text in `openbot/app/src` or `openbot/server/src` |
| Slice 5, recipes and checklist | Not built. Tailnets appear only as a private address that single-user mode allows. | `openbot/docs/configuration.md:555`; `openbot/docs/architecture.md:392` |
| Slice 6, native app with push | Not started. Changes under `openbot/mobile` since 14 November are dependency updates only (9 commits). | `git log --since=2026-11-14 -- openbot/mobile` |
| Slice 7, same-network pairing | Not built. No enrolment route. | `grep -i enrol` over `openbot/server/src` finds only `plugins/catalogue.ts` and `plugins/google-drive-rest.ts` |
| Slice 8, manifest and service worker | Not built. No manifest link and no service worker. | `openbot/app/index.html` has no manifest link; no service worker under `openbot/app` |

Slices 1 and 4 are built, as above (PR #195 and PR #221).

**Status, 17 November 2026, after D74 (PR #366).** The slice 3 row of the table above was checked before D74, and its session part is out of date: slice 3 is part built. Revoking a pairing now also ends the sign-in session that browser was last seen with. The code is `PairingStore.revoke` in `openbot/server/src/auth/browser-pairings.ts`, the route is in `openbot/server/src/auth/browser-pairing-routes.ts`, and migration `openbot/server/drizzle/0078_browser_pairing_session.sql` adds the column. Checked by reading the code on main as of 17 November 2026; the tests named in section 53 ("Revoking a paired browser also signs it out (D74)") of [`M1_PLAN.md`](../M1_PLAN.md) were not run for this status. Not built: the sign-out-other-sessions endpoint and button, and a list of sessions.

**Built**
- `openbot/server/src/freeduet/signin-allowlist.ts` (new): the rule. `normalizeAddress` reduces an address to one spelling (split on the last `@`; the domain lower-cased, IDNA, no trailing dot; the local part lower-cased and otherwise left alone, so `a.b`, `ab` and `a+tag` are three addresses). It refuses what is not a plain address: whitespace or a control, format or unassigned character, a display name, a quoted local part, a second `@`, a comma or semicolon list, a wildcard (`*`, `?`), a path, query, port or literal after the domain, more than 254 characters. `emailAddressAllowed` admits everybody when no list is set, and refuses an address it cannot read once one is. `signInAllowedEmails` reads the variable.
- `openbot/server/src/config.ts` (+28): `AuthConfig.allowedEmails`, present only when the variable is set, so a deployment without it keeps the shape it had [code: `AuthConfig.allowedEmails` in config.ts, line 153 at ccfffad, read by `signInAllowedEmails` at lines 973-997; 145 and 953-982 when written].
- `openbot/server/src/auth/index.ts` (+32): one check in `user.create.before` and one in `session.create.before`, straight after the domain-list check, the two places this section's slice names [code: the `user.create.before` and `session.create.before` hooks in auth/index.ts, the checks at lines 419 and 502 at ccfffad; 418 and 499 when written]. A refusal is `FORBIDDEN` with one sentence that names no list, and a `session.refused` row with the address and the reason. The audit write is guarded, so a trail that cannot be written logs and still refuses.
- Meaning. Unset or blank: no field, no check. Both lists set: an address must pass each list that exists, so this can only narrow the domain list. Asked when an account is made (a refused address leaves no user row and no linked account) and again when a session is made for an account that exists (an address taken off the list gets no new sign-in). It does not end a session that already exists; People, Remove access still does that.
- Start-up refusals, each with a test: a set value that names no address (`,`), which would otherwise read as no list; an entry that is not an address (a domain, `Name <a@b.c>`, two addresses, a wildcard); an administrator in `INITIAL_ADMIN_EMAILS` who is not on the list; an address at a domain `SIGNIN_ALLOWED_EMAIL_DOMAINS` does not admit; `MICROSOFT_OAUTH_TENANT_ID` of `common`, `organizations` or `consumers`, which includes the default when only the client id and secret are set. With no sign-in provider the variable does nothing.
- Docs: `openbot/.env.example`, `openbot/docs/configuration.md`, three rows in `docs/UPSTREAM_TOUCHES.md`.
- Tests, 92 in three new files. `freeduet-signin-allowlist.test.ts` (73): the rule and the start-up refusals. `freeduet-signin-allowlist.integration.test.ts` (15): the two hooks against a real database and the real `createAuth`, and the audit rows. `freeduet-signin-allowlist-callback.integration.test.ts` (4): the OAuth callback over HTTP through the real handler, with a stand-in provider written in the test file. Slice 1's proof line says to extend `email-domain.test.ts`; the rule lives in its own module, so its tests sit beside it and no line of an existing test file moved.

**Verified** (14 November 2026)
- The three new files: 92 pass, 0 fail, against a real PostgreSQL.
- Fail before: on origin/main the module does not exist, so all three files fail to load. With the module in place and `config.ts` and `auth/index.ts` as on main, 20 of the 92 fail (11, 7 and 2): the start-up refusals, the refusals at the two hooks, the audit rows, and the callback turning an unlisted address away. The other 72 are the rule's own tests and guards of unchanged behaviour: no list admits everybody, `config.auth` keeps its shape, no provider means no change, the domain list is as it was, a removed person stays out.
- Three holes found while writing the tests, and fixed: Node's domain normaliser reads its input like a URL host, so `a@x.test/path` and `a@x.test?q` came out as `a@x.test` (the part after the `@` is now checked for plain characters first); `*@x.test` was read as an address, and now stops the start. The first quirk is also in the existing domain list (`auth/email-domain.ts`); it was not changed here.
- Single-user mode and sign-in as they were: `install-secret`, `host-guard`, `same-origin`, `single-user-peer`, `config`, `email-domain`, `dev-actor.integration` and `auth-mobile-scheme.integration`: 271 pass, 0 fail, the same as on main before the change. Four more auth suites pass with them: 307 in twelve files.
- `tsc --noEmit` in `openbot/server`: clean. `bun run typecheck:tests`: clean against the baseline (239 known errors, none new). `bun run format:check` and `bun run lint`: clean. `assertion-shape`: 10 pass.
- Full server suite (`bun test server/tests`) on the tree merged with origin/main: 8,000 pass, 20 skip and 9 fail, of 8,029 tests in 501 files. Three of the failures are the ones known on plain main (the two `learning-*` real-provider tests and the Mastra bridge). The other six are 5-second timeouts of tests that start a process or wait on one (four in `tool-selection-environment-restoration.test.ts`, one in `production-loader-boundary.test.ts`, one in `composio-transport.test.ts`), on a machine whose load average was 11 to 19. They fail the same way, 114 pass and 6 fail in those four files, with main's `config.ts` and `auth/index.ts` put back. Plain main was not run as a whole. `typecheck:tests`, `format:check` and `lint` were run again on the merged tree: clean. `tsc --noEmit` was not run again; the merge changed no server source.

**Not verified or not built**
- No real identity provider. The callback test uses a stand-in that serves discovery, token and userinfo and verifies no ID token. Google, Microsoft and Okta were not contacted. The Google, Microsoft, registered-SSO and SCIM paths reach the same two hooks [assumed]; only the hooks themselves and the Okta path were run.
- No real phone, no tunnel, no reverse proxy, no HTTPS. Nothing here is reached from outside this machine.
- A session that exists is not ended when its address leaves the list. A session lasts as long as Better Auth's default, seven days renewed while in use [assumed: OpenBot sets no `expiresIn`, `auth/index.ts`]. Until then the remedy is People, Remove access (decision A below).
- The list is checked against the address the provider returns, and OpenBot never requires that to be a verified one (section 5, the rule on domain lists). That holds for Google, Okta and one Entra directory, where the address is the account's own, and is why multi-tenant Entra is refused. An address changed at the provider is a new address and is refused until the list is changed.
- The Helm chart has `config.allowedEmailDomains` and no `config.allowedEmails`. On the host, `scripts/start.sh` starts the server with the whole `.env` (`bun --env-file`), so the variable reaches it there [code: openbot/scripts/start.sh:47-48, 813]; read, not run.
- Slice 4 (phone scope) is merged as PR #221; see the next block.

**Decisions left to the maintainer**

| | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| A | A list change and sessions that already exist | (a) Next sign-in only, as built. (b) Check the list on every request, so a change cuts an open session at once. (c) At start-up, delete the sessions of accounts not on the list. | (c), as a small follow-up. | A list change is read at start, so (c) makes the edit mean what it says at the restart that applies it, and adds nothing to the request path. (b) puts a check in the guard every route passes. (a) leaves a lost phone signed in for up to seven days unless the person also uses Remove access. |
| B | Whether a reachable deployment must have a list | (a) Opt-in, as built. (b) Refuse to start when sign-in is on, the deployment is reachable beyond loopback and neither list is set. | (a) now; revisit with slice 5's recipes, which tell the person to set it. | (b) breaks the sign-in deployments running today on the next upgrade, and the exposure is the person's own choice of tunnel. |
| C | Both lists set | (a) The address must pass both, as built. (b) Either list admits. | (a). | The domain list is a filter, so (a) can only narrow it and adding the exact list never widens access. With (b) a stray domain entry silently admits a whole domain. A person who wants a few named addresses at several domains leaves the domain list unset. |
| D | Entra `consumers` | (a) Refused with `common` and `organizations`, as built. (b) Allowed, because personal Microsoft accounts are the account's own address. | (a) until someone needs it. | I have no evidence that the address of a personal Microsoft account is verified [assumed], and a refused start-up is cheap to relax later. |
| E | How the server knows a request is "at the computer", for slice 4 | (a) Extend D28's installation secret cookie to deployments with sign-in: a request is local only if it holds the cookie, and every other signed-in request is remote. (b) Mark sessions as phone sessions at sign-in. (c) Read the browser's user agent. | (a), if the maintainer agrees to change D28's "a deployment with sign-in is exactly as it was". Not (c). | (a) cannot be claimed by the sender: a phone that does not hold the cookie is remote whatever it says. (b) needs the phone to declare itself, so it fails open. (c) is spoofable. (a) changes a recorded decision, so it is the maintainer's call, and slice 3 comes before slice 4 in section 4 as it stands. |

**Slice 4, merged as PR #221 (15 November 2026)**

*Built.* With sign-in configured, a request is "at the computer" only if it holds the installation-secret cookie (D28, extended: this changes D28's sentence "a deployment with sign-in is unchanged"). Every other signed-in session is remote and may read conversations, chat with members, see a whole approval request, and allow it once or deny it. Everything else is refused with 403 and one sentence. The list is data (`openbot/server/src/auth/remote-limits.ts`), one deny-by-default middleware in `createApp`, plus the live-screen upgrade in `http-server.ts`; a route nobody listed is refused, and a test fails when the app gains a route the list does not decide. The approval answer has its own rule (`approvals/remote-answer.ts`): only allow-once or deny, and never for a hand-off, a safety request, a setting, a connection, a routine, or a computer or host tool. Pairing works with sign-in: `bash scripts/open.sh`, run in the administrator's browser, redeems the link (loopback, then a signed-in administrator). PR #200's `at-the-computer.ts` is the one notion of "at the computer"; there is no second one. After the update, every browser of an existing sign-in deployment is remote until that command is run once. Without sign-in nothing changes.

*Verified.* Against a real PostgreSQL, through the real app and the fake-provider sign-in recipe. New tests: 85 in five files (`remote-limits` 15, `remote-limits-ledger` 19, `remote-limits-approvals` 12, `remote-limits.integration` 17, `install-secret-signin` 22). Fail before, on main's source: the classification tests fail to load (the module does not exist); the integration file has 8 named guards that pass and 8 tests that fail without the wiring in `app.ts` and `http-server.ts`; the approval-answer file has 10 that pass (guards) and 2 that fail without its wiring. The proof suites for single-user mode (`install-secret`, `host-guard`, `same-origin`, `single-user-peer`, `dev-actor.integration`) pass unchanged, 221 tests in 12 files with the new ones. `typecheck:tests` clean against the baseline, biome format and lint clean, `assertion-shape` passes. Full server suite on the merged tree: 8,485 pass, 29 fail; 24 were routine tests that passed alone once the database was migrated, and the other five are the known Mastra bridge and `learning-*` real-provider tests plus two 5-second process timeouts (the loader boundary test fails the same way on main).

*Not verified.* No real phone, no real Google or Okta, no tunnel, no HTTPS: the cookie's Secure flag follows the configured app address and was tested only by value. How the phone app shows a refused read is not known. The app address and the API must share a host for the cookie to travel. Sign-in without an installation secret is not limited. No prompt or tool text was run live.

**Slice 4: decisions left to the maintainer**

| | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| F | Who is remote in a deployment several people use | (a) As built: every browser that is not paired is remote, and only an administrator at the loopback can pair one; the secret is the switch, so a deployment with no secret is unlimited. (b) An explicit setting that turns the limits off for a deployment started by `scripts/start.sh`. (c) Limit only the administrator's account. | (a) now. | Only a deployment that has the secret is affected, and `scripts/start.sh` is the personal installation, which has one person. A team deployment (Helm, hand-started) has no secret and is unchanged. (b) is an off switch for a security rule and can wait until a team runs through start.sh. |
| G | Reads and writes a phone's screens may need that the three powers do not name | (a) As built: refused (tasks, pages, setup, suggestions, pinning, deleting, voice and dictation, memory, the app status in a conversation). (b) Add read-only entries for tasks and pages. (c) Also dictation. | (a) until slice 1's screens say what they use. | Each one is a line in the list and a test. Dictation is the first to add: it runs on the same provider as chat. A refused read only shows the sentence, and nothing breaks. |
| H | Chat from a remote session and the shortcuts that skip a card | (a) What slice 4 first did: Full access and the typed-recipient shortcut (D27, D27a) still apply. (b) The run carries a server-set marker that the session was remote, and every write it makes asks a card, whatever Full access, the person's saved rules or the reviewer would have said. (c) Turn both off for remote chat and leave the rest as it was. | (b), built in the review of PR 221 (slice 4b below); the maintainer confirms. | Section 3.3 says a lost phone must not send mail without a card, and with (a) it could, in a conversation with a member that has Full access. (b) is stricter than the first recommendation (a card for a send, and for a payment under plain Full access): a remote chat that could delete an event or write a file with no card would be the same hole under another name, and on a phone a card costs one tap. (c) is simpler and also removes a feature the person chose. |
| I | A remote session answers `deny` to a request it may not allow | (a) As built: refused with the rest. (b) Allowed: a denial lets nothing happen. | (b) later. | A phone that sees a payment card and cannot say no is odd. It was kept out of v1 only because the maintainer's list names what a remote session may answer and `deny` of these is not on it. |
| J | Computer tools in a chat from a remote session | (a) As built: refused, because the browser runs them. (b) Allow only `POST /api/approvals/computer/:botId`, which goes through the gate and raises its card. | (a) now. | (b) lets a lost phone start a member's browser work, with Full access on a member that has it and no card. It should come after (H). Direct `/api/computers/*` calls are not on any option: they carry no card. |

**Slice 4b, the chat hole and an independent review of PR 221 (15 November 2026)**

*The review.* A second reader, who had not written the code, tried to break slice 4 on the branch merged with origin/main, in five areas: how a request is classified, whether the list covers every route and upgrade path, the chat hole (decision H), the approval answers, and an installation that already has sign-in. What was small and server-side was fixed, each with a test that fails without the fix. The rest is under "Left open".

*Found and fixed*
- **The chat hole (decision H).** A chat a remote session starts reached the gate as the person's own live turn (no initiator). A member with Full access, in either setting, wrote with no card; the typed-recipient shortcuts (D27, D27a), a rule the person had saved and the reviewer's "proceed" applied too. Shown through the real gate, a real database and real Full access (`remote-run-mark.integration.test.ts`).
- **A route family main added after the PR**, `/api/freeduet/import/*`, was decided only by the catch-all. The ledger test caught it on the merged tree (4 failures). It is listed as refused: its preview reads the memory.
- **Posting to a group conversation** from a remote session. The post is queued and the members answer in turns that carry no mark of where it came from, so it was the same hole by another door. Refused until a group turn carries the mark.
- **An answer typed to a saved question** from a remote session resumed a run as the person's own turn. The answer now carries the mark.
- **A member's memory tools** (`remember_personal_fact`, `save_observed_memory`, `forget_personal_memory`) ran with no card in any chat, though `/api/memory/*` is refused to a remote session: a stolen phone could leave an instruction in memory for the person's own turns at the computer, or wipe it. They refuse in a remote run; reading is unchanged.
- **A member's workspace and commands** (`computer_write_file`, `computer_run_command`) were left out of the card rule, as they are for a routine, so a saved "allow" rule answered them in a hand-off relay a remote chat started, which is a server-run turn. They ask now, and the card is the computer's to answer (decision J holds on that road too).
- **The Audit screen** read an initiator kind it did not know as "A person". It says what it is.

*Built.*
- A new initiator kind, `remote` (`toolkit/src/initiator.ts`, `audit.ts`), set by the server in `createRequestAgents` from the pairing cookie and from nothing the browser sends (`remoteRunQuestion`, `auth/remote-limits.ts`: the cookie alone, with no second session lookup, so a session that ends between two lookups cannot make a run the person's own). It travels on every path an initiator already does: the tools' approval context, the signed run a member hands back, a hand-off's root, a saved question's answer.
- Every reader of an initiator reads it as itself (`readOrigin`, `readInitiator`, the hand-off tool's root schema, the question schema, the policy dry run). One that read an unknown kind as a person would have undone the rest at the callback door. The two `Decides` tables the compiler forces (settings-in-chat, shared use) decide it: a setting asked for in chat from a remote session is refused; shared use treats it as the actor, whose writes ask.
- The rule that asks a card (`freeduet/always-ask.ts`, a fourth case beside D35's three) asks for every write of a run that began remote, or of a hop made from one, whatever Full access, a saved rule, the reviewer or the typed-recipient shortcuts would say. Full access refuses such a run at its source too (`freeduet/full-access.ts`, `effective`). A card is answered by the rule in 3.5.3: once, or deny, never always, never for a hand-off, a safety request, a setting, a connection, a routine or a computer tool.
- Tests: `remote-run-mark.test.ts` (20), `remote-run-mark.integration.test.ts` (18), `remote-question-answer.integration.test.ts` (5), `remote-memory.test.ts` (9), and 4 in `remote-limits-approvals.test.ts` for the question route.

*Verified* (15 November 2026, a real PostgreSQL, the real gate, the real approval store, the real app)
- Nine files hold the slice: 141 tests, all pass, against 85 in five files before the review. Fail before: with the production source as it was, the three new run-mark and memory files do not load (`remote` is not a kind), 3 of the 5 question-answer tests fail, 3 of the 4 new route tests fail, and 4 ledger tests and 1 integration test fail. With the source in place and one part switched off at a time, each is caught by named tests, of the 68 in the five files that test it: the card rule 15 fail, Full access's own refusal 1, the mark set in `createRequestAgents` 5, the mark on a saved question 2, the signed run's reader 1, a hop origin's reader 1, the workspace exclusion 3, the memory refusal 3, the cookie question replaced by a session lookup 3, and each of the two call sites of the memory tools 1.
- Single-user mode and sign-in as they were: `install-secret`, `host-guard`, `same-origin`, `single-user-peer`, `single-user`, `dev-actor.integration` and `auth-mobile-scheme.integration`, with the remote delivery suites that read an initiator: 198 pass, 0 fail. Without sign-in nothing is passed and every call is the call it was.
- Full server suite (`bun run test:server:sharded`, 528 files in 10 shards): 8,608 pass, 21 skip, 3 fail. The three are the known ones on this machine, the two `learning-*` real-provider tests and the Mastra bridge test; with the production source as it was before the review, the same three fail the same way (0 pass, 3 fail).
- `tsc --noEmit` in `openbot/server` and in `openbot/app`: clean. `bun run typecheck:tests`: clean against the baseline (239 known errors, none new). Biome format and lint: clean. `assertion-shape`: 10 pass.

*Not verified.* No real phone, no tunnel, no real identity provider. No member was run live: a Full-access member with a real connector, and the card as a phone shows it, were not seen. The Audit screen's new label was not looked at in a browser.

*Left open.*
- **Chat from outside the app.** SMS, Slack and Teams through OpenTag run the person's turn as `person` (`index.ts`, the delivery router's `runTurn`), and a card clicked or a question answered there is decided as the person, `allow always` included. Not changed: the binding is the person's own, and what a stolen phone with Slack on it may do is the maintainer's call. The mark makes it one line per door (`REMOTE_INITIATOR` for `PERSON_INITIATOR`); the cost is that a person who chats with Full access through Slack is asked a card for each write.
- **Group posts** from a remote session are refused until `GroupTurn` carries the mark.
- **A server on another machine.** Pairing needs the loopback of the machine FreeDuet runs on, so a person who reaches it only by its public address pairs a browser through an SSH tunnel to that loopback. The sentence a remote browser is shown does not say so.
- **A private-share hold** in a remote chat waits durably, as an unattended turn does, instead of answering in the conversation (`agents/handoff-tool.ts` reads "not a person"). Fail closed, and rare.
- The runtime's own Learning from conversations was not examined.
