# A token of its own for each Bot's computer

Slice 1, on the branch `per-computer-token` (see "Built so far" at the end). Written 2026-11-14 from a security review finding of the same day. Base: origin/main 975aa52.

Tags: **[code: path:line]** read on origin/main 975aa52 (a line number after the change is marked "now"). Code paths start at `openbot/`; doc paths start at the repository root. **[ran]** run on main with a script, output kept. **[assumed]** my inference, not checked. **[verify]** unknown; a run on a real install must settle it.

## 1. The finding

A Bot's computer is the place where a prompt-injected page, a poisoned file or a hostile reply gets to run commands: the Bot browses and runs a shell there. Until this change every computer took ONE secret, `COMPUTER_TOKEN`, and the container supervisor put that same value in the environment of every computer it made. So the computer where an injected command ran held the secret that opens every other computer, each with its own signed-in browser, its files and its `/exec`.

Reproduced on main with two real computer processes (alpha and beta) started with exactly the environment the supervisor builds [ran]:

1. Alpha's shell ran `env | grep -c COMPUTER_TOKEN`. It printed `0`: the shell is given a filtered environment on purpose [code: agent-computer/src/shell.ts:17].
2. It ran `tr '\0' '\n' < /proc/$PPID/environ | grep '^COMPUTER_TOKEN='`. Status 200, and the token. The shell is a child of the computer process, under the same user, so its parent's environment is readable [code: agent-computer/src/shell.ts:266].
3. It presented that token to beta's `/exec`: status 200, and `id -u` printed `0`.

`openbot/tests/per-computer-token-isolation.test.ts` is that repro, kept as a test. On main it fails with "Expected: 401, Received: 200".

## 2. What exists today in the code

| Question | Answer | Code |
|---|---|---|
| Where is the token read, and who is refused? | Once at start, trimmed; the process exits without one. Every request except `/health` is checked after the Host guard (D40), with a constant-time compare. The token rides `x-openbot-computer-token` or `Authorization: Bearer`, and for the live-screen socket the `?token=` query, because an upgrade carries no headers | [code: agent-computer/src/index.ts:121-127, :822; agent-computer/src/authorisation.ts:17, :33, :51] |
| What did the supervisor give a computer? | `environmentFor` copied the supervisor's own `COMPUTER_TOKEN` into every computer, beside the Bot id, the browser mode and the proxy variables. A container that held another value was replaced by `ensure`, with its volumes kept (D39) | [code: supervisor/src/environment.ts:15, :33; supervisor/src/docker.ts:331, :516-531] |
| What is a computer? | A container, root inside, every capability dropped, `no-new-privileges`, at most 512 processes, its own named volumes for the profile and the workspace | [code: supervisor/src/docker.ts:474, :477] |
| How did the server call a computer? | One `token` from the deployment's configuration, the same for every Bot: the transport, the gateway, the policy push to every running computer, the setup check and the live-screen proxy | [code: server/src/config.ts:1226; server/src/computer/client.ts:239-240; server/src/computer/gateway.ts:286; server/src/computer/policy-network.ts:118, :156, :225] |
| Can one computer reach another by name? | With `COMPUTER_NETWORK` set the computers share a user-defined network and are reached as `openbot-computer-<botId>:4100`, nothing published. Without it each sits on the default bridge with port 4100 published to `127.0.0.1` on an ephemeral port. The egress filter judges what a Bot's browser and shell ask for through the proxy, not a raw socket (D36). So on a shared network a shell can open a connection to another computer's port; what stopped it was the token, and it had the token. Read from code, not run on Docker | [code: supervisor/src/docker.ts:464, :468, :629; supervisor/src/names.ts:89; SECURITY.md, the row "Your home or office network"] |
| Can a Bot's shell read its own computer's environment? | Yes, see 1.2. The shell's own `env` is filtered; the parent's `/proc/<pid>/environ` is not | [ran] |
| How does Kubernetes pass the token? | The chart gives the shared computer and every Sandbox pod the same Secret key, `computer-token`, as `COMPUTER_TOKEN`. The chart's NetworkPolicy is off by default | [code: charts/openbot/templates/_helpers.tpl:746; charts/openbot/templates/computer/statefulset.yaml:147; charts/openbot/values.yaml:690] |

## 3. The design

### 3.1 Rules

1. Each computer the Docker supervisor makes takes a token of its own: `hex(HMAC-SHA256(key = SUPERVISOR_TOKEN, message = "openbot/computer-token/v1" NUL namespace NUL botId))` [code now: supervisor/src/computer-token.ts:32].
2. Only the supervisor makes it. Neither `SUPERVISOR_TOKEN` nor `COMPUTER_TOKEN` goes into any computer's environment [code now: supervisor/src/environment.ts:34].
3. The server learns a Bot's token from the supervisor, over the channel it already uses (the supervisor's bearer), and never from a computer. `ensure` says it, and a new read, `GET /computers/:botId/token`, says what the container holds for a computer the server did not just ensure [code now: supervisor/src/index.ts:150, :201]. A listing never carries a token.
4. A computer accepts only its own token. This needs no change: the check in 2 above compares one offered secret with the one secret the process started with. The new guard test asks it of two computers.
5. Where a provider gives each Bot a token, that is the ONLY token ever presented to that Bot's computer. The deployment's `COMPUTER_TOKEN` is never a fallback, even when the supervisor cannot answer: a token that opens other computers must never be sent to a computer a shell may be reading [code now: server/src/computer/provider.ts:118, :144].
6. The one shared computer (the default Compose layout with no supervisor in use) and a Kubernetes Sandbox keep taking `COMPUTER_TOKEN`.

### 3.2 Why derived, and not random and stored

| | Random per Bot, kept in the container | Derived with an HMAC (chosen) |
|---|---|---|
| New storage | None: the container's environment can hold it and the supervisor can read it back. But a copy in a label is readable by anything that can read labels | None |
| A computer made again (an image upgrade, a reset) | A new value each time, which the server must learn again | The same token, by arithmetic |
| Replacing a computer that holds the old shared token | The supervisor must know what to compare with, so it would have to be handed the old shared token, the very value being taken out of reach, or replace every computer blindly | The existing rule is enough: a container whose token is not the derived one is replaced (D39) |
| What one leaked token reveals | Nothing else | Nothing else, if the key is strong: an HMAC output tells nothing of another output or of the key |
| Rotation | Per Bot | All at once, by changing `SUPERVISOR_TOKEN`; each computer is replaced at its Bot's next use |
| Who can make every token | Whoever can read the store | Whoever holds `SUPERVISOR_TOKEN`. That secret already can cycle every computer, and only the server and the supervisor hold it |

The price of deriving is that `SUPERVISOR_TOKEN` is now a key, so a weak one matters. `scripts/start.sh` makes 64 hex characters. A shorter one, typed by a person, is accepted with a warning at start, because a computer holds a value (its own token) to test guesses against [code now: supervisor/src/index.ts:78].

### 3.3 What the server does with it

- The provider remembers each Bot's token from the last `ensure`, and on a miss asks the supervisor once. Several callers that miss together share one question [code now: server/src/computer/supervisor.ts:279].
- The memory is bounded: at most 1024 Bots (the one remembered longest ago goes first), and a token is believed for at most 60 seconds [code now: server/src/computer/supervisor.ts:54-55]. It is forgotten when a computer is reset, and an older answer never overwrites a newer one from `ensure`.
- Every caller goes through one helper: the transport [code now: server/src/computer/client.ts:246], the policy push every 30 seconds [code now: server/src/computer/policy-network.ts:121, :235], the setup check [code now: server/src/openduet/computer-check.ts:61] and the live-screen proxy [code now: server/src/http-server.ts:199].
- A read never wakes a computer. A supervisor too old to answer gives an error that says to update it to the same release; it does not fall back to `COMPUTER_TOKEN`.
- Configuration no longer carries `COMPUTER_TOKEN` into the Docker supervisor's settings, though it may be set for the shared computer [code now: server/src/config.ts:1230].

### 3.4 Installations that already exist

A container made before this holds the shared token. The first `ensure` for its Bot after the update sees that its token is not the derived one and replaces it, as it already does for a changed image or documents folder: the container is removed with `{ force: true, v: false }`, so the named volumes (the Bot's profile, its logins and its workspace) survive, and it is made again with the derived token [code on main: supervisor/src/docker.ts:331, :516-531]. What is lost, once per Bot, is what the old computer held in memory: an open page and an outstanding request for a person to take the wheel.

Until a Bot is used its old computer keeps working with the token it has, and `GET /computers/:botId/token` says what the container really holds, so the server's periodic policy push still reaches it. Every action goes through `ensure` first, so any Bot that can run a command has already been replaced when it runs. The old shared token stays valid on idle old computers until they are used; see Q4.

Rotating `SUPERVISOR_TOKEN` has the same effect on every computer, and nothing else has to be done by hand.

### 3.5 What this does not change

- The Host guard (D40) and the egress filter are untouched.
- **Kubernetes and Helm are left as they are.** Every Sandbox pod gets the same Secret value, so a shell in one pod can read the token that opens the others. A chart NetworkPolicy limits who may reach a pod, but it is off by default. The fix is a token per Sandbox, a larger change (chart, provider, pod template) that is Q9.
- A Bot's shell can still read its OWN computer's token, because the computer needs it to check its callers. That is the same reach it already has by running commands there, and it opens that computer and no other.
- Anyone who holds `SUPERVISOR_TOKEN` can make every computer's token. It is in the server's and the supervisor's environment, and in no computer's (tested).
- A raw socket from one computer to another's port is still possible where computers share a network (D36). It now meets a port that opens only for a token the Bot does not hold. The supervisor's port also needs `SUPERVISOR_TOKEN`, which no computer holds.
- The container boundary is assumed: that a shell in one container cannot read another container's `/proc`. Docker gives each container its own process table [assumed]. The tests start two processes of one user, so they cannot show it, and they do not need to: they show that nothing alpha can read opens beta.

## 4. Built so far

On the branch, not merged. Nothing here has run on Docker or with a model (see 4.4).

### 4.1 What is built

- **The derivation** (`supervisor/src/computer-token.ts`). One function and one constant (32 characters, the length below which `SUPERVISOR_TOKEN` is warned about).
- **The supervisor** (`environment.ts`, `docker.ts`, `index.ts`). `environmentFor` gives each computer its derived token and throws without `SUPERVISOR_TOKEN`; it never reads `COMPUTER_TOKEN`. `ensure` answers the token the container holds. New: `GET /computers/:botId/token` behind the same bearer, 404 for a Bot with no computer and for a container that only has the name. A boot warning for a short key.
- **The server** (`computer/provider.ts`, `supervisor.ts`, `client.ts`, `gateway.ts`, `policy-network.ts`, `openduet/computer-check.ts`, `http-server.ts`, `config.ts`). The provider's optional `tokenFor`, the helper `tokenForBot`, the bounded memory, and every caller above going through it.
- **Compose** (`docker-compose.yml`). The supervisor service no longer receives `COMPUTER_TOKEN`; the shared `agent-computer` service still does.
- **Docs**: this file, the threat-model row of `SECURITY.md`, `openbot/docs/configuration.md` and `openbot/.env.example`, and the rows of `docs/UPSTREAM_TOUCHES.md`.

### 4.2 Files

- New: `supervisor/src/computer-token.ts`; tests `supervisor/tests/computer-token.test.ts`, `computer-token-ensure.test.ts`, `computer-token-http.test.ts`; `server/tests/computer-per-bot-token.test.ts`, `computer-per-bot-token.integration.test.ts`, `computer-stream-token.test.ts`; `agent-computer/tests/per-computer-token.test.ts`; `tests/per-computer-token-isolation.test.ts`.
- Changed, with a row each in `docs/UPSTREAM_TOUCHES.md`: the sources and docs named in 4.1, the CI step that runs the new supervisor HTTP test, and the tests that pinned the old behaviour.
- `agent-computer/src` is not touched.

### 4.3 Tests and checks

"Before" is origin/main with this branch's test files copied over it; each file below was run there.

| Test file | Tests | Before (main's source) | After |
|---|---|---|---|
| `tests/per-computer-token-isolation.test.ts` (the repro, two real computers) | 5 | 4 fail, 1 passes (the control: a computer opens for its own token) | 5 pass |
| `supervisor/tests/computer-token-ensure.test.ts` (fake Docker: two Bots differ, a recreated container gets its token, an old one is replaced with its volumes kept, no secret in any container's environment) | 12 | 11 fail; 1 passes (a listing carries no token: a guard of unchanged behaviour) | 12 pass |
| `supervisor/tests/computer-token-http.test.ts` (the real supervisor process: the route, its bearer, a short-key warning) | 10 | 7 fail; 3 pass (guards of unchanged behaviour: the route answers only the supervisor's own bearer, a listing carries no token, a long key starts without a word) | 10 pass |
| `supervisor/tests/computer-token.test.ts` (known answers; separation by Bot and namespace) | 8 | the module does not exist | 8 pass |
| Supervisor tests changed to pin the new behaviour (`environment` 2, `environment-hardening` 5, `install-secret` 4, `host-guard-http` 13) | 24 | 7 fail (2, 3 and 2); `host-guard-http` passes: its fake container only had to hold the new token | pass |
| `server/tests/computer-per-bot-token.test.ts` (each Bot is sent its own token on every path; the bounds; no fallback) | 27 | the file cannot load: `tokenForBot` is not exported | 27 pass |
| `server/tests/computer-per-bot-token.integration.test.ts` (real Postgres, two replicas: each computer reached with its own token, a miss asked once, an old computer asked and then replaced) | 3 | 3 fail | 3 pass |
| `server/tests/computer-stream-token.test.ts` (the live screen) | 2 | 2 fail | 2 pass |
| `server/tests/config.test.ts`, `connector-tokens-never-reach-computer.test.ts` (one test each) | 2 | 2 fail | pass |
| `tests/compose.test.ts` (one test) | 1 | 1 fails | pass |
| `tests/computer-network-callers.test.ts` (one test) | 1 | 1 fails | pass |
| `agent-computer/tests/per-computer-token.test.ts` (two real computers: every route and method, `/exec` in nine spellings of a wrong token, the live-screen upgrade: all refused, 401) | 7 | **passes: a guard of unchanged behaviour**, labelled so in its header | 7 pass |
| `server/tests/computer-provider.test.ts`, `computer-session-guard.test.ts`, `computer-session-guard-replicas.integration.test.ts` (fakes updated to say a token on `ensure`) | | **pass: guards of unchanged behaviour** | pass |

Suites run once at the end, on the branch merged with origin/main:

- Supervisor, all: 141 pass, 1 skip (the real-Docker lifecycle test needs a daemon), 0 fail.
- agent-computer, all, with no browser: 636 pass, 73 skip, 2 fail. The two are `EAFNOSUPPORT` on an IPv6 listen in this sandbox and fail the same way on main.
- Server, the 88 files that touch the computer or its token: 1877 pass, 1 skip, 2 fail. `production-loader-boundary.test.ts` times out at 5 s under this machine's load (load average 13) and fails the same way on main's source; `plugin-store.integration.test.ts` "an answer this deployment could not read..." timed out in that run and passes alone.
- `tests/compose.test.ts`, `tests/computer-network-callers.test.ts`, `tests/host-guard-copies.test.ts`, the isolation test, `scripts/start-restart-guard.test.ts`, `scripts/stop-computers.test.ts`: 189 pass. `scripts/install.test.ts`: 91 pass.
- `bun run typecheck:tests` exits 0 against the baseline (239 known errors, not changed). `tsc --noEmit` for the supervisor, agent-computer and server is clean. Biome `format` and `lint --error-on-warnings` are clean over the whole of `openbot/`. `server/tests/assertion-shape.test.ts`: 10 pass (at its default 5 s limit one test timed out at 6 s under load; with a 60 s limit all pass).

### 4.4 Not verified

- No Docker daemon was available. `supervisor/tests/docker.integration.test.ts` skipped here; its shared fixture (`tests/fixtures/docker-lifecycle.ts`) now also checks tokens and runs only where a daemon exists [verify].
- The reach between computers over a Docker network was read from the code, not run [verify].
- The Compose stack was not started. `docker compose config` ran inside `tests/compose.test.ts` only.
- The Helm chart was not rendered or installed, and no Kubernetes cluster was used.
- No model ran, and no live eval: nothing a model reads changed. The new error sentences ("update it to the same release") are operator-facing and not yet run live.
- A shell in one real container cannot read another's `/proc`: assumed from Docker's process isolation, not tested (see 3.5).
- Docker Desktop on Windows or macOS was not tried.

### 4.5 Decisions left to the maintainer

| # | Decision | Built now | Options | Recommendation | Why |
|---|---|---|---|---|---|
| Q1 | Derived or random tokens | Derived with an HMAC | (a) derived; (b) random per Bot, kept in the container | (a) | Nothing to store, a recreated computer gets the same token, and the existing replace-on-mismatch rule recognises an old computer without being told the old shared token. The cost is that `SUPERVISOR_TOKEN` becomes a key |
| Q2 | The key | `SUPERVISOR_TOKEN` | (a) as built; (b) a separate key that `start.sh` makes | (a) | (b) adds a secret to make, mount and explain, and does not help against a leak from the server, which holds both. Revisit if the supervisor's bearer has to be rotated apart from the tokens |
| Q3 | A short `SUPERVISOR_TOKEN` | Accepted, with a warning at start below 32 characters | (a) warn; (b) refuse to start | (a) now, (b) after one release | `start.sh` makes 64 characters, so only a hand-set value is affected; refusing would stop such an installation at the upgrade |
| Q4 | Idle old computers | Replaced at their Bot's next use; until then they keep the shared token | (a) lazy; (b) the supervisor replaces every owned computer whose token differs, at start | (a), and (b) by hand if a computer is suspected: remove the owned containers, volumes kept (the recipe in `openbot/docs/configuration.md`) | (b) closes every Bot's open page at the upgrade, idle ones too. A Bot that can run a command has been replaced before it runs. The old shared token matters only for an installation that already lost it |
| Q5 | The server's memory of tokens | At most 1024 Bots, 60 seconds | other numbers | as built | A team is far below 1024. 60 s is the longest a stale token can be believed on a path that does not call `ensure` (the policy push, the live screen) |
| Q6 | A stale token after another replica replaced a computer | Not built: nothing re-asks on a 401; the window is at most 60 s, and the next action refreshes it | (a) as built; (b) on a 401, forget the token and try once with a fresh one | (a); (b) if a multi-replica deployment reports errors after an upgrade | The window opens once per Bot at an upgrade or a rotation. A retry on an authentication failure has its own risks (loops, extra calls) |
| Q7 | A server with a supervisor too old to say tokens | Fails with a message; never falls back to `COMPUTER_TOKEN` | (a) as built; (b) fall back | (a) | (b) would put the shared token back in front of a computer a shell may be reading. The cost is that the server and the supervisor are updated together, which `start.sh` and Compose do |
| Q8 | `scripts/start.sh` still hands `COMPUTER_TOKEN` to the server when a supervisor is used | Left: the server ignores it there | (a) leave; (b) stop passing it | (b), in a later cleanup | Misleading and harmless; the script and its tests are outside this slice |
| Q9 | Kubernetes Sandboxes | Unchanged: one Secret for every pod | (a) leave; (b) a token per Sandbox, derived by the provider from a key the server holds and written into the pod template | (b) when a cluster deployment is in view; turn the chart's NetworkPolicy on meanwhile | The same finding applies to a pod. It is a chart, provider and template change, larger than this slice |
