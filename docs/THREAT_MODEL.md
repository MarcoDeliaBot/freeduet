# Threat model

Written 15 November 2026 from the code on `main` at commit `ddb0cde` (release v0.2.1), by an AI assistant reading the code, for the one maintainer. It is not an audit and nobody outside the project has reviewed it. It is bounded: it covers the single installation FreeDuet is built for (one person, one machine, one Docker host), and what the code does today. The shorter table in [SECURITY.md](../SECURITY.md) is the summary; this page gives the references.

Every statement carries one tag:

- **[code: file:line]** the line is where the control is made, read on this commit. Paths are from the repository root.
- **[test: file]** a test file that exercises the control. It tells you a test exists, not that it is complete. Tests are in CI on every pull request ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).
- **[not verified]** read, believed, or designed, and not shown by a test or by a live run.

Line numbers move; the function names beside them do not.

## 1. What is protected

| Asset | Why it matters | Where it lives |
|---|---|---|
| The subscription login (Claude Code sign-in) | Someone who has it uses the person's plan | A Docker volume that only the Claude Code command reads (`freeduet-claude-login`) [code: openbot/docker-compose.yml:463] |
| The mailbox and other connected accounts | Mail can be read, sent, moved | An app password or OAuth grant held in the server's vault, sealed with the installation's own key [code: docs/M1_PLAN.md D24, D39; openbot/scripts/start.sh] |
| The person's files and the member computers | A member has a shell and a browser | One Docker container per member [code: openbot/supervisor/src/docker.ts:487-496] |
| Approvals | The only thing between a model's mistake and a real action | The approval gate in the server [code: openbot/server/src/approvals/policy.ts:518] and its trail [code: openbot/server/drizzle/0000_schema.sql:403] |
| Money | A purchase cannot be taken back | The approval gate; no spending cap exists yet [code: docs/FULL_ACCESS.md:13] |
| The home or office network | A router, a NAS, a printer | Reachable from a member's computer unless filtered [code: openbot/agent-computer/src/egress.ts:514] |

## 2. Who acts, and how far each is trusted

| Actor | Trusted to | Not trusted to |
|---|---|---|
| The person, at the computer, in their own live chat turn | Decide every approval; change settings; turn Full access on | n/a |
| A remote session (signed in, browser not paired with the computer) | Read, chat, allow an ordinary request once; redeem a code that the person made, for its own person only (D49) | See or make pairings, change settings, approve what a member's computer does, use Full access or the typed-address shortcut [code: openbot/server/src/auth/remote-limits.ts:127; openbot/server/src/freeduet/always-ask.ts:106; openbot/server/src/approvals/remote-answer.ts:41] |
| A member (a model) | Propose actions; hand work to another member along the hub grants | Complete an account action by itself; change its own approvals, Full access or settings |
| Content a member reads: a mail, a web page, a tool result, a file | Nothing. It is data | Any instruction in it |
| Another signed-in person on a shared deployment | Their own data | The first person's data. A shared deployment is not the main case and was not threat-modelled in depth [not verified] |
| A browser paired as a `device` (a phone paired with a code, D49) | What the browser at the computer may do for that person, until it is revoked | Making a code, revoking another pairing, or passing the Engines page's "at the computer" (that also wants this machine's loopback) [code: openbot/server/src/auth/browser-pairing-routes.ts; openbot/server/src/freeduet/at-the-computer.ts] |
| A process on the same machine | Nothing beyond what the operating system gives it | Being taken for the person [code: openbot/server/src/auth/install-secret.ts:167] |
| A container on Docker Desktop | Nothing | Being taken for the person: it arrives as loopback |

## 3. Trust boundaries

1. Browser to server. In single-user mode the person is a loopback TCP peer that also holds the installation's pairing cookie; with sign-in, the session says who, and a live pairing of that same person says where: the cookie is a random token of one browser, kept in the database only as a hash (D49) [code: openbot/server/src/auth/peer.ts:1-27; openbot/server/src/auth/install-secret.ts:1-45; openbot/server/src/auth/browser-pairings.ts].
2. Server to the model. The model is a locked-down Claude Code command with no built-in tools; the only tools are those of FreeDuet's bridge, and each one passes the approval gate [code: openbot/agent-freeduet/freeduet/claude_cli.py:44-58] [test: openbot/agent-freeduet/tests/test_command.py].
3. Server to a member's computer. A token of its own per computer, a container with all capabilities dropped, ports published on loopback only [code: openbot/supervisor/src/computer-token.ts:32; openbot/supervisor/src/docker.ts:487-496; openbot/docker-compose.yml:97,256,432].
4. A member's computer to the network. Everything goes through a filter that checks the address the connection really goes to [code: openbot/agent-computer/src/egress.ts:514].
5. FreeDuet to the provider. The Claude Code command talks to Anthropic with its own sign-in; FreeDuet starts it and reads its output [code: docs/PROVIDERS.md rule 1].

## 4. Threats, controls, tests, residual risk

### T1. A member completes a send, payment, purchase, booking, signature or deletion nobody approved

Control. The gate runs for every tool call that is not a read. A fixed list of words (payments, credentials, security settings) hands the action to the person before any rule, setting or model verdict, and is not configurable [code: openbot/server/src/approvals/policy.ts:176-250,565-570]. A tool that nobody classified as a read is a write [code: openbot/server/src/plugins/catalogue.ts:921]. The reviewer model can only add a hand-off, never remove one; it fails closed: an error, a timeout or an unreadable verdict becomes "ask" [code: openbot/server/src/approvals/policy.ts:431-446,505]. Tests: [test: openbot/server/tests/approvals-policy.test.ts], [test: openbot/server/tests/approvals-safety-floor-it.test.ts], [test: openbot/server/tests/unclassified-tools-ask.integration.test.ts].

Residual risk.
- The floor matches words. A payment described in words the lists do not hold is not caught by it. The list is "deliberately broad" in English and Italian, and no other language [code: openbot/server/src/approvals/policy.ts:176]. [not verified] for any language beyond those two.
- Only three categories are fixed by words: payments, credentials, security settings. For every other write (a send, a signature, a booking, a deletion, a publication) the default installation relies on the reviewer model: "auto-review" is on and "ask before every change" is off by default [code: openbot/server/src/approvals/store.ts:24-34]. The reviewer is told to ask for anything that goes beyond the request, affects an account, shares with someone new or is hard to undo [code: openbot/server/src/approvals/policy.ts:455-457], and it fails closed, but with no rule and no reviewer verdict the gate's last answer for a write is "allow" [code: openbot/server/src/approvals/policy.ts:722-726]. So "a send, booking, signature or deletion asks first" is, by default, a model's judgement plus the classification of the tool as a write, not a rule of code. A person who wants a card for every change switches "ask before every change" on. [not verified] by a live run on a default installation for each kind of action beyond what the team evals cover.
- The person's own "Always allow" for a tool answers future calls of it. That is their choice, and it is the same limit as any approval a person presses without reading.
- Commands on the member's own computer are outside the account-action words, because they reach no account [code: openbot/server/src/approvals/policy.ts:230]. Whatever a command does inside the container is limited by the container and the network filter (T6), not by a card, unless the person's team rules ask.

### T2. Text in a mail, a page or a tool result makes a member act (prompt injection)

Control. There is no way to stop a model from being misled, and this model does not claim one. What the server holds is that a misled model still meets the gate: a new email goes out without a card only when every recipient is typed, word for word, in the person's own latest message of their own live turn, read by the server from the conversation it holds and never from the model [code: openbot/server/src/plugins/typed-recipients.ts:152; openbot/server/src/plugins/plugin-store/calls.ts:459] [test: openbot/server/tests/typed-recipients.test.ts]. A hand-off from another member, a routine, a spoken message and a remote session never earn that [code: openbot/server/src/freeduet/always-ask.ts:106,140]. Approving something in the inbox never gives a member a tool that sends [test: openbot/server/tests/inbox-never-grants-send.integration.test.ts]. Tool arguments with credentials in them (a key, a private key, an authorization header) are refused before the call leaves [code: openbot/server/src/plugins/content-governance.ts:149; openbot/server/src/plugins/plugin-store/calls.ts:393] [test: openbot/server/tests/content-governance.test.ts]. That check looks for credentials, not for personal data in general; the code's own comment says so [code: openbot/server/src/plugins/content-governance.ts:1-9].

Residual risk.
- A model can be misled into reading more than it should, or into producing a harmful card text. A card shows the exact action to the person, who must read it.
- Whether a mail or page was injected is judged by the model reading it, and the member's prompt tells it to report an instruction found in a mail as suspicious [code: docs/design/mail-organise.md section 6]. Whether it does is measured only by team eval cases, and the v0.2.1 eval run did not meet its thresholds before the fixes in the release notes [not verified for the cases added since v0.1].

### T3. Mailbox changes judged by a model (the reviewer)

Control. Archive, label, mark read or unread, move to Bin, move to Spam. For these the reviewer is always asked, shown only the person's own typed words of this live turn (never a mail, a tool result or the member's words), and a call runs without a card only when it says the person explicitly named the change and what it applies to; any other verdict, no reviewer, or any failure of it is a card [code: openbot/server/src/approvals/policy.ts:396-420,431-446,668-690] [test: openbot/server/tests/mail-organise-approval.integration.test.ts]. Bin is held to a higher bar than the others [code: openbot/server/src/approvals/policy.ts:408]. At most 100 messages per call, nothing is deleted for good, and Gmail empties the Bin and Spam after about 30 days [code: docs/design/mail-organise.md sections 6 and 10].

Residual risk, said plainly. The reviewer is a model deciding what the person "explicitly ordered". It can be wrong in both directions. It sees message ids, not their content, so inside a category that an order names it cannot tell which messages were meant. The v0.2.1 release notes say the same under "Known limits". The harm is bounded by reversibility, not prevented. Spam was run live once on a real mailbox; moving mail to the Bin was not run live [code: CHANGELOG.md, v0.2.1].

### T4. Someone other than the person becomes "the person"

Control, by case.
- A process on the same machine, single-user mode. The person is a loopback TCP peer that also holds the installation secret as a cookie; the secret is made by the first start, written to `.env` readable by you alone, and is in no environment or mount a member's container gets [code: openbot/server/src/auth/install-secret.ts:1-45,167] [test: openbot/server/tests/install-secret.test.ts]. A request that carries a header a proxy or tunnel adds is not "at the computer" for the Engines page [code: openbot/server/src/freeduet/at-the-computer.ts:29-60]. A host name that is not one of this machine's own is refused (421), against a web page that re-points its name at 127.0.0.1 [code: openbot/server/src/auth/host-guard.ts:94] [test: openbot/server/tests/host-guard.test.ts].
- A browser's pairing with sign-in on (D49, 16 November 2026). The cookie is no longer the installation secret: it is one random token per paired browser, HttpOnly, SameSite=Strict, `Path=/api`, with only its SHA-256 in the table `browser_pairings`, tied to the person it was made for, with a kind, a name, a last-seen time, an end date and a revoked time. "At the computer" is true only when the token matches a live pairing of the SAME signed-in person, so a token of person A does nothing for person B, and a revoked or ended pairing is remote on the very next request [code: openbot/server/src/auth/browser-pairings.ts; openbot/server/src/auth/remote-limits.ts] [test: openbot/server/tests/browser-pairings.test.ts; openbot/server/tests/remote-limits.test.ts]. **A stolen cookie no longer reveals the installation secret**: before D49 a copy of the cookie was the secret, worked for whoever signed in, and lasted 400 days; now it opens only that one browser's pairing for that one person, and only together with that person's session. Changing the installation secret ends every pairing at once [test: openbot/server/tests/browser-pairings.test.ts, openbot/server/tests/browser-pairings.integration.test.ts]. A phone is paired from a browser paired as a `computer`, with a code that is made for one person, good once and for two minutes, tried at most ten times a minute per person and thirty per address, burned after five wrong tries, carried in the body of a POST and never in an address; every code made, pairing made, refused code and revoke is a row in the audit trail without the token, the code or the secret [test: openbot/server/tests/browser-pairings.test.ts]. **A stolen paired phone** can do, until the person revokes it from Settings on the computer (or changes the secret), whatever the browser at the computer can do for that person: Full access, approvals, accounts and the rest are open to it, because a paired phone is meant to work like the browser at the computer. It cannot make a code, so it cannot pair a second device, and it cannot revoke a computer pairing. The person's session is still needed with it: a stolen cookie with no session is nobody.
- A remote session (sign-in on, browser not paired). Every route is refused unless a list allows it, and a route added tomorrow is refused until listed; a test holds the list and the design document to each other [code: openbot/server/src/auth/remote-limits.ts:127,409] [test: openbot/server/tests/remote-limits-ledger.test.ts] [test: openbot/server/tests/remote-limits.integration.test.ts]. What a remote run writes asks a card whatever Full access or a saved rule says, and a member's own computer cannot be approved from there [code: openbot/server/src/freeduet/always-ask.ts:1-50; openbot/server/src/approvals/remote-answer.ts:41] [test: openbot/server/tests/remote-limits-approvals.test.ts].
- Another signed-in person. [not verified] as a deliberate target; sign-in can be limited to exact email addresses [code: openbot/server/src/freeduet/signin-allowlist.ts].

Residual risk.
- Docker Desktop (Windows, macOS), single-user mode. A container that calls the host's published port is carried through the VM's proxy and arrives as 127.0.0.1, the same as the person's browser. The peer rule alone cannot tell them apart; the pairing cookie is what does [code: openbot/server/src/auth/install-secret.ts:12-20]. On Docker Desktop the protection therefore rests on that one secret. The per-computer token means a member's shell can read its own computer's token and no other [code: docs/design/per-computer-token.md; openbot/supervisor/src/computer-token.ts:32]; that design was written for Docker but "not yet run on Docker" by the document's own words, and no test starts two real containers [not verified].
- A person who opens the server to a network with `OPENBOT_HOST` makes everybody who can reach it the administrator, as the boot log says [code: openbot/server/src/auth/peer.ts:21-25]. The app listens on localhost by default; SECURITY.md says to put TLS and sign-in in front of it before exposing it.
- A browser paired before D49 holds the old cookie (the secret itself) until its first signed-in request upgrades it to a pairing of its own, which is the one place the secret is read from a browser; that path is to be removed after 16 February 2027. Until then a copy of an old cookie taken before the upgrade is still the secret [code: openbot/server/src/auth/remote-limits.ts, `createLegacyCookieUpgrade`]. Single-user mode (no sign-in) is not changed: its cookie is still the secret, and it has no person to tie a pairing to.
- A tunnel that runs on the machine makes a phone arrive as loopback. With sign-in on, loopback alone is never "at the computer", and a remote browser is limited [code: openbot/server/src/auth/remote-limits.ts:1-40]. With sign-in off, a tunnel with the cookie stripped is refused; one that forwards the cookie is the person's own act.

### T5. Full access removes the cards

Control. Off by default, per member, set only by the person's own signed-in session with no member tool or route that a member can reach. It applies only in the person's own live turn: not routines, check-ins, remote sessions, spoken input, or a hand-off the server cannot trace to the person's typed message [code: openbot/server/src/freeduet/full-access.ts:119-200; openbot/server/src/approvals/policy.ts:293-316]. "Without payments" lifts nothing the floor holds. Credentials and security settings still go to the person in both settings. An admin's team rule that asks still wins. Each action taken with it is in the audit trail with the setting that allowed it [test: openbot/server/tests/freeduet-full-access.integration.test.ts] [test: openbot/server/tests/freeduet-full-access-modes.integration.test.ts].

Residual risk. Plain Full access has no limit on an amount, because spending caps do not exist yet [code: docs/FULL_ACCESS.md:13]. Someone who turns it on has chosen to trust that member's model with their money. A routine always asks a card, even with Full access [code: openbot/server/src/freeduet/always-ask.ts:1-50] [test: openbot/server/tests/routines-always-ask.test.ts].

### T6. A member's computer reaches the home network, the host, or the cloud metadata address

Control. The computer's own network filter resolves a name itself, checks every answer, treats a redirect as a new connection, refuses the private, loopback, link-local and shared ranges in every spelling of an address, and always refuses the metadata address [code: openbot/agent-computer/src/egress.ts:462,514; openbot/agent-computer/src/private-network.ts:1-45] [test: openbot/agent-computer/tests/private-network.test.ts] [test: openbot/agent-computer/tests/egress.test.ts] [test: openbot/agent-computer/tests/private-network-browser.test.ts]. One setting ("Home and office network access") lets the private ranges through. The container drops all capabilities and cannot gain privileges [code: openbot/supervisor/src/docker.ts:487-496].

Residual risk. A command that opens a raw socket and ignores the proxy settings is not covered, and on Docker Compose needs a network-level control that does not exist [code: SECURITY.md, row "Your home or office network"; docs/M1_PLAN.md D36]. On a shared Docker network a shell can open a connection to another computer's port; what stopped it was a token it already holds for its own computer only [code: docs/design/per-computer-token.md]. The member's shell runs as root inside its container [code: CLAUDE.md "Adding a team member"]. A container escape (a Docker or kernel bug) is outside what this repository can control.

### T7. FreeDuet reads, leaks or forwards the subscription login

Control. The Claude Code command is started with only the arguments of the lockdown and an environment allow-list that never carries an API key or this service's tokens [code: openbot/agent-freeduet/freeduet/claude_cli.py:44-58,89-120] [test: openbot/agent-freeduet/tests/test_command.py]. A test starts the package with decoy credential folders and an audit hook on file opens and fails on any touch, and a static scan fails if any module names those paths [test: openbot/agent-freeduet/tests/test_credentials_untouched.py].

Residual risk. The test covers the Python service. The server and the app are TypeScript, and no equivalent audit-hook test exists for them [not verified]. The Claude Code command itself reads its sign-in; that is the point. The login sits in a volume that the service mounts, so a vulnerability in the Claude Code command or in the service's container would reach it [not verified]. The sign-in is the provider's; whether using it this way is allowed is the provider's terms, read and dated in [docs/PROVIDERS.md](PROVIDERS.md).

### T8. Secrets of the installation are guessable or shared

Control. The first start makes each secret of its own (tokens, database password, vault key, installation secret), writes them to `.env` readable by you alone and shows none [code: openbot/scripts/start.sh; docs/M1_PLAN.md D39]. A tool re-keys an installation that already holds saved logins, by hand, after a backup [test: openbot/server/tests/vault-rekey.integration.test.ts]. Saved logins and connections are sealed with that key. Audit rows redact credential-like keys [code: openbot/server/src/audit.ts:15-40] [test: openbot/server/tests/audit.test.ts].

Residual risk. An installation that existed before D39 and holds saved logins keeps the example vault key until the person runs the re-key tool [code: SECURITY.md, "Safe defaults"]. `.env` readable by you alone means anything running as you can read it. An installation that is backed up copies its secrets with the data [not verified].

### T9. The record of what happened is rewritten

Control. `audit_events` refuses every UPDATE, DELETE and TRUNCATE in a trigger [code: openbot/server/drizzle/0000_schema.sql:403; openbot/server/drizzle/0012_truncate_is_not_a_way_around_append_only.sql] [test: openbot/server/tests/audit.test.ts]. Residual risk: anyone with the database owner's rights can drop the trigger; there is no off-machine copy [not verified].

### T10. A bad release, or a hijacked repository

Control. Every workflow action is pinned to a full commit SHA, the workflows are checked by zizmor, and CodeQL runs on every pull request [code: .github/workflows/security_zizmor.yml; .github/workflows/codeql.yml]. A branch rule on `main` requires a pull request and a passing `verify` check [code: GitHub branch protection, `gh api repos/MarcoDeliaBot/freeduet/branches/main/protection`]. Releases from now on carry a signed provenance attestation for the source archive [code: .github/workflows/release-provenance.yml], checked as in [VERIFY.md](VERIFY.md).

Residual risk. One maintainer: the branch rule requires zero reviews, so the person who writes a change also merges it, and the Scorecard "Code-Review" check scores 0 for that reason. An attacker with the maintainer's GitHub account is the maintainer. The attestation shows how an archive was built; it does not show the code is good. Releases v0.1 and v0.2 have no attestation. The workflow that makes the attestation has not run on a release yet [not verified]. Dependencies: Scorecard reports known vulnerabilities in dependency lockfiles, and Dependabot is on [not verified as to how many are reachable].

### T11. Telemetry and data leaving the machine

Control. Off by default [code: openbot/server/src/freeduet/telemetry-off.ts:19; docs/telemetry.md]. The member's model calls go to Anthropic through the person's own Claude Code sign-in, as the person asked. Conversations stay in the installation's database unless CopilotKit Intelligence is switched on by the person, which is off by default [code: openbot/scripts/freeduet-clean-start-check.sh, the `mode: local` check] [test: openbot/server/tests/telemetry.test.ts].

Residual risk. Whatever a member reads goes to Anthropic as part of the prompt. That is how the product works, and it is not something the controls above limit.

## 5. What this model leaves out

- Anything that needs a second person to be hostile on a shared deployment.
- The Windows installer, the desktop app, the phone app and the Kubernetes path. Only the Docker Compose stack of the README's Quick start was read.
- Supply chain below the lockfiles: what each dependency does.
- Social attacks on the maintainer.
- A real penetration test. There has been none [not verified].

## 6. How to change this page

When a control changes, change the line number or the tag, and say what you ran. A statement that nobody checked stays "[not verified]"; do not promote it without a test or a run.
