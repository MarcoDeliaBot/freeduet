# Phone and remote access: design

Plan only, no product code. Written 2026-11-14 for two roadmap rows, "Phone" and "Remote access to your own FreeDuet" ([ROADMAP.md](../ROADMAP.md)). Read with [M1_PLAN.md](../M1_PLAN.md) and [SECURITY.md](../../SECURITY.md). Open pull request 129 is treated as a neighbour. Nothing here needs it merged.

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
- The only sign-in allowlist is a list of domains, `SIGNIN_ALLOWED_EMAIL_DOMAINS` [code: openbot/server/src/config.ts:881]. It matches exactly, and an empty list admits everybody [code: openbot/server/src/auth/email-domain.ts:17-18; openbot/docs/configuration.md:556-559]. It is checked at sign-in [code: openbot/server/src/auth/index.ts:399, 467]. No per-address list exists [code: a search for SIGNIN_ALLOWED finds only the domain list].
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
- The app's screens show no session list and offer no way to end one session [code: a search of openbot/app/src finds none]. The server ends sessions in one place: turning SSO-required on ends sessions made without SSO [code: openbot/server/src/auth/sso-required.ts:16; openbot/server/src/admin/routes.ts:275]. Better Auth's own session routes were not checked [assumed].
- No session length is set in `openbot/server/src/auth/` [code: a search for expiresIn and updateAge finds none]. The library default was not checked [assumed].

### 2.6 Full access and approvals

- Only the person changes Full access, through `PUT /api/approvals/full-access/:botId`, behind the user guard and the same-origin guard [code: docs/FULL_ACCESS.md:17-19]. A phone signed in as the person would pass both [assumed].
- A new email goes out without a card when the person typed the recipient in the live turn [code: docs/M1_PLAN.md D27]. A phone's typed message would count the same way [assumed].

### 2.7 PR 129 (open, not merged; head c41cbabe)

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

- Must be built: slice 1 before any exposure; slice 2 if PR 129 is not merged; slice 3; docs.
- Lost phone: until slice 3 ships, the person cannot end one phone's session from the computer (2.5).
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
- Lost phone: removing it from the tailnet cuts its reach. Its FreeDuet session stays valid until slice 3 ships.
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

## 4. Slices

Size: S under 300 changed lines, M 300 to 1000, L over 1000.

| # | Builds | Proof | Needs first | Size |
|---|---|---|---|---|
| 1 | An exact-address sign-in list, `SIGNIN_ALLOWED_EMAILS`, checked where the domain list is checked (`openbot/server/src/auth/index.ts:399, 467`). Unset means unchanged. | Extend `openbot/server/tests/email-domain.test.ts`: a non-listed address is refused at sign-in; unset admits as before. | none | S |
| 2 | Refuse the implicit administrator for a request that carries forwarding headers (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`). If PR 129 merges, this becomes a test of its guard. | `openbot/server/tests/single-user-peer.test.ts` and `openbot/server/tests/dev-actor.integration.test.ts`: a forwarded loopback request gets 401; container tool calls still pass. | decision 6; PR 129 status | S |
| 3 | "Sign out other sessions": one endpoint and one button in Settings. | Integration test: after the call the other session gets 401; the current session still works. | Better Auth session routes [assumed] | M |
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
