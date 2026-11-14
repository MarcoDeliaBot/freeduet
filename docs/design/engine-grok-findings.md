# Grok engine: findings and design (slice 10, desk half)

Design only. No product code. Written 2026-11-14 as the desk half of slice 10 in [ENGINES_PLAN.md](../ENGINES_PLAN.md), "Grok spike, then adapter". Code facts are checked on origin/main 4932d12. Vendor facts come from xAI's public pages, read on 2026-11-14. Section 7 lists what was not checked.

Tags: `[code: path:line]` read in this repository. `[doc: URL]` stated on xAI's public pages. `[assumed]` not checked; a spike must settle it.

## 1. What the person gets

- A member could run on the person's own Grok sign-in, as a Claude member runs on the person's Claude login. No xAI API key or per-token bill would be needed. xAI's overview advises an API key for non-browser environments, so a headless sign-in is not a documented path [doc: https://docs.x.ai/build/overview].
- Nothing is offered until xAI's terms allow it in writing and a test proves the lockdown on the real binary ([PROVIDERS.md](../PROVIDERS.md) rule 5; [ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.2 and section 4, note 2).
- A metered xAI key stays an optional entry the person adds with their own key. It is never first and never on by default ([PROVIDERS.md](../PROVIDERS.md) rule 4).

## 2. What exists today in the code

### 2.1 The engine seam is on main

- The adapter contract has two methods that matter here: `child_env` and `run_turn` [code: openbot/agent-freeduet/freeduet/engine_adapter.py:76-90]. `probe()` and `limit` belong to slice 2 and are not in the contract yet [code: openbot/agent-freeduet/freeduet/engine_adapter.py:8-9].
- `ClaudeEngine` is the only adapter in the package [code: openbot/agent-freeduet/freeduet/claude_engine.py:32]. It starts the process, writes the prompt to stdin, reads stdout into parser items and ends the turn [code: openbot/agent-freeduet/freeduet/claude_engine.py:41-123].
- `run_segment` takes any adapter and defaults to Claude [code: openbot/agent-freeduet/freeduet/segment.py:214-217].
- The golden harness pins the run path. The goldens folder holds 52 recorded scenarios that must stay byte-identical [code: openbot/agent-freeduet/tests/test_engine_goldens.py:1-7].
- No run path imports the slice-2 modules. `engine_breaker.py` imports `failure_classifier` [code: openbot/agent-freeduet/freeduet/engine_breaker.py:101]. No package module imports `engine_breaker` or `json_salvage`.

### 2.2 What an adapter must reproduce from Claude Code

| Behaviour | Where it lives today | What Grok must do |
|---|---|---|
| Prompt on stdin, never on the command line (decision D7) | [code: openbot/agent-freeduet/freeduet/claude_cli.py:41]; written at [code: openbot/agent-freeduet/freeduet/claude_engine.py:77-81] | The documented example passes the prompt as an argument, `grok -p "<prompt>"` [doc: https://docs.x.ai/build/cli/headless-scripting]. Stdin is not documented, so it must be proven. |
| Lockdown: no session, no built-in tools, one MCP server, no slash commands, dontAsk | [code: openbot/agent-freeduet/freeduet/claude_cli.py:42-55]; flags checked against one version's `--help` (2.1.311) [code: openbot/agent-freeduet/freeduet/claude_cli.py:12-13] | `--tools` and `--disallowed-tools` control built-in tools [doc: https://docs.x.ai/build/cli/reference]; the value syntax is [assumed]. No flag sets MCP servers for one run [doc: reference]. `dontAsk` is named but its selection is not stated [doc: https://docs.x.ai/build/features/permissions]. No flag disables session saving [doc: reference]. |
| Child environment from an allowlist; key and plan-token names removed | [code: openbot/agent-freeduet/freeduet/claude_cli.py:75-83, :99-109] | The same shape. Drop `XAI_API_KEY`, `GROK_AUTH_PROVIDER_COMMAND` and `GROK_CLI_CHAT_PROXY_BASE_URL`, which change where login and API calls go [doc: https://raw.githubusercontent.com/xai-org/grok-build/master/crates/codegen/xai-grok-pager/docs/user-guide/02-authentication.md]. Set `GROK_CLAUDE_MCPS_ENABLED=0` and `GROK_CURSOR_MCPS_ENABLED=0` [doc: https://docs.x.ai/build/settings/reference]. |
| Auto-update and auto-memory off | [code: openbot/agent-freeduet/freeduet/claude_cli.py:84-89] | `--no-auto-update` [doc: https://docs.x.ai/build/cli/headless-scripting] and `--no-memory` [doc: https://docs.x.ai/build/cli/reference]. Their effect is untested. |
| MCP file for the run, owner-only, with the bridge secret | [code: openbot/agent-freeduet/freeduet/claude_cli.py:112-133]; used at [code: openbot/agent-freeduet/freeduet/claude_engine.py:69] | Project servers come from `.grok/config.toml`, read from the current folder up to the git root. User servers come from `~/.grok/config.toml`. `~/.claude.json`, `.cursor/mcp.json` and `.mcp.json` are merged in [doc: https://docs.x.ai/build/features/mcp-servers]. No documented switch covers project `.mcp.json` [doc: https://docs.x.ai/build/settings/reference]. |
| Own session and process group, stopped as a group | [code: openbot/agent-freeduet/freeduet/claude_cli.py:160-171, :174-186] | The same. |
| Stream read into parser items; bridge tools carry the prefix `mcp__freeduet__` | [code: openbot/agent-freeduet/freeduet/stream_json.py:21, :25, :130, :160, :192] | A different event list: text, thought, tool_call, tool_call_update, usage, plan, available_commands, end, error. The list is non-exhaustive [doc: https://raw.githubusercontent.com/xai-org/grok-build/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md]. The tool-name prefix is [assumed]. A new parser is needed. |
| Tool calls: deployment calls answered, others announced, refused calls handed over | [code: openbot/agent-freeduet/freeduet/segment.py:1-31] (contract); [code: openbot/agent-freeduet/freeduet/segment.py:336, :384-388] | The contract is engine-neutral, so the Grok parser feeds the same items. |
| Bridge: loopback only, one secret per run, constant-time check; proxy variables not read | [code: openbot/agent-freeduet/freeduet/bridge/ipc.py:22, :69, :97]; [code: openbot/agent-freeduet/freeduet/bridge/callback.py:53] | Reuse as is. |
| Sign-in loss and limits become error events | [code: openbot/agent-freeduet/freeduet/claude_cli.py:33-34, :194]; [code: openbot/agent-freeduet/freeduet/engine_errors.py:20-22, :26-37, :61, :112] | Exit 1 covers authentication, network and runtime errors [doc: raw headless guide]. No plan or quota limit is documented. `max_tokens`, `max_turn_requests` and the event `max_turns_reached` are run budgets, not account limits [doc: raw headless guide]. Limit and sign-in text is [assumed] until captured. |
| Member notes name Claude Code | [code: openbot/agent-freeduet/freeduet/tool_notes.py:111, :135] | Make the wording engine-neutral before a second engine is offered. |

Short server-side text calls use a list with no MCP server and no tools [code: openbot/agent-freeduet/freeduet/claude_cli.py:57-67]. The report guard calls the Claude CLI directly [code: openbot/agent-freeduet/freeduet/report_guard.py:205].

### 2.3 Credentials, config and upstream code

- The credential test covers `.claude`, `.codex`, `.gemini`, `.config/claude` and `.claude.json` [code: openbot/agent-freeduet/tests/test_credentials_untouched.py:33-35]. It has no `.grok` entry. Its decoys name Claude, Codex and Gemini paths only [code: openbot/agent-freeduet/tests/test_credentials_untouched.py:225-227]. The static scan patterns have no Grok path either [code: openbot/agent-freeduet/tests/test_credentials_untouched.py:293-298, :351-358].
- Claude's child keeps `HOME`, so the CLI finds its own sign-in there. FreeDuet passes `CLAUDE_CONFIG_DIR` through and never reads that folder [code: openbot/agent-freeduet/freeduet/claude_cli.py:14-15, :79-80].
- The Claude child gets only the names in `PASSED_ENV`, so an xAI key never reaches it today [code: openbot/agent-freeduet/freeduet/claude_cli.py:78-83]. The example env file names `XAI_API_KEY` in a commented voice line [code: openbot/.env.example:297]. An operator may define it, so a Grok child must drop it explicitly.
- A login engine needs a `command` and cannot carry `credential_secret_ref` [code: openbot/agent-freeduet/freeduet/engines.py:240-248]. An API kind cannot be `billing: subscription` [code: openbot/agent-freeduet/freeduet/engines.py:249-253]. Metered engines run only when switched on and neither cap is 0 [code: openbot/agent-freeduet/freeduet/engines.py:418-421]. Logins sort first [code: openbot/agent-freeduet/freeduet/engines.py:442-444].
- The example file has no Grok entry. Its Gemini entry is locked, because the provider's terms do not allow third-party software to use its sign-in [code: openbot/agent-freeduet/engines.example.yaml:29-35].
- Upstream OpenBot has an xAI token route. It stores an access token and a refresh token [code: openbot/server/src/provider-oauth.ts:25-26]. It refreshes them at xAI's token endpoint [code: openbot/server/src/provider-oauth.ts:58, :162] and writes the file owner-only [code: openbot/server/src/provider-oauth.ts:114, :121]. It mounts only when `OPENBOT_MODEL_OAUTH_FILE` is set [code: openbot/server/src/index.ts:2696-2697]. FreeDuet does not ship the app that writes that file [code: docs/SERVER_MODEL_CALLS.md:40].

## 3. The design

### 3.1 What xAI publishes

**CLI and sign-in.** xAI publishes Grok Build, run as `grok` [doc: https://docs.x.ai/build/overview]. On first launch it opens a browser to sign in. The CLI reference lists `--device-auth` for `grok login` [doc: https://docs.x.ai/build/cli/reference]. The overview names no subscription plan, and it advises an API key in non-browser environments [doc: https://docs.x.ai/build/overview].

**The one subscription sign-in for a third-party program.** xAI says a SuperGrok or X Premium subscription works inside OpenCode, a third-party agent [doc: https://x.ai/news/grok-opencode]. It offers a browser sign-in and a code-based sign-in for SSH or remote hosts [doc: https://x.ai/news/grok-opencode]. The post does not say whether the Grok CLI may be used the same way. It is the nearest precedent, and the reason to ask xAI (O2).

**Non-interactive mode.** `grok -p "<prompt>"` runs one prompt, with the prompt as an argument [doc: https://docs.x.ai/build/cli/headless-scripting]. The headless page says to pass `--no-auto-update` to skip background update checks [doc: headless]. Its ACP example says "Run `grok login` first, or set XAI_API_KEY" [doc: headless]. `grok agent stdio` "runs Grok as an ACP agent over JSON-RPC on stdin/stdout" [doc: headless].

**Output and events.** `-p` takes `plain`, `json` or `streaming-json` [doc: headless]. The streaming events are text, thought, tool_call, tool_call_update, usage, plan, available_commands, end and error [doc: https://raw.githubusercontent.com/xai-org/grok-build/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md]. The `end` event carries a `stopReason`: end_turn, max_tokens, max_turn_requests, refusal or cancelled [doc: raw headless guide]. Exit codes are 0 (success), 1 (authentication, network or runtime error), 130 (SIGINT) and 143 (SIGTERM) [doc: raw headless guide].

**Tools and approvals.** `--tools` and `--disallowed-tools` control built-in tools [doc: reference]. Allow and deny rules exist, and `deny` always wins over `allow` [doc: https://docs.x.ai/build/features/permissions]. `--always-approve` (alias `--yolo`) turns approvals off, and deny rules and PreToolUse hooks still apply [doc: reference; permissions]. `permission_mode = "always-approve"` under `[ui]` and the legacy `yolo = true` also work, but only in user or managed config [doc: permissions]. `--dangerously-skip-permissions` appears only in a list of Claude Code aliases, with no target named [doc: reference].

**MCP servers.** Servers are declared as `[mcp_servers.<name>]` in `~/.grok/config.toml` or a project `.grok/config.toml`. A project server with the same name replaces the user server entirely [doc: https://docs.x.ai/build/features/mcp-servers]. Compatibility files are merged below `config.toml` [doc: mcp-servers]. The switches are `[compat.claude] mcps` and `[compat.cursor] mcps`, and the variables `GROK_CLAUDE_MCPS_ENABLED` and `GROK_CURSOR_MCPS_ENABLED` [doc: https://docs.x.ai/build/settings/reference]. No documented switch covers project `.mcp.json`. The project search walks up to the git root, and the behaviour outside a git repository is not stated [doc: mcp-servers]. No flag sets MCP servers for one run [doc: reference].

**Managed settings.** `/etc/grok/requirements.toml` is the highest-priority layer. Settings there cannot be overridden by user config or remote settings. Pinned values also resist environment variables [doc: https://docs.x.ai/build/enterprise]. `disable_api_key_auth` "forces interactive IdP login". `disable_bypass_permissions_mode = true` under `[ui]` turns always-approve off across the deployment, and the bypass lock is honoured only from root-owned sources [doc: enterprise].

**Login storage.** Credentials sit in `~/.grok/auth.json`, owner-only (0600 on Unix). MCP OAuth tokens sit in `~/.grok/mcp_credentials.json` [doc: https://raw.githubusercontent.com/xai-org/grok-build/master/crates/codegen/xai-grok-pager/docs/user-guide/02-authentication.md]. A stored session token takes precedence over `XAI_API_KEY`, which is a backup used only when no session is present [doc: auth guide]. `GROK_HOME` (default `~/.grok`) holds config, auth, sessions, skills, plugins and logs [doc: https://docs.x.ai/build/settings/reference]. So an empty `GROK_HOME` would probably hide the login too [assumed].

**Limits and reporting.** No plan or quota limit and no rate-limit message is documented [doc: raw headless guide]. The `end` event carries usage and cost fields. A drain timeout of up to 120 s sets `usage_is_incomplete` [doc: raw headless guide].

**Terms about automated use.** The acceptable-use policy bars "unauthorized automated or non-human means" and "circumventing any rate limits" [doc: https://x.ai/legal/acceptable-use-policy]. The copy read is a previous version dated August 14, 2026 [doc: same]. The consumer terms could not be read (7.3). xAI documents headless use of its own CLI [doc: headless]. Nothing read says whether a subscription sign-in may run a program headless.

**Routes without a subscription.** The metered API has two base addresses: `https://api.x.ai/v1` (OpenAI-compatible) and `https://api.x.ai` (Anthropic-compatible). The integrations page does not list Claude Code [doc: https://docs.x.ai/api/integrations]. The pricing page, dated October 10, 2026, lists grok-build-0.1 at $1.00 input and $2.00 output per million tokens, and grok-4.7 at $2.00 and $6.00 [doc: https://docs.x.ai/docs/pricing]. The tier reading is [assumed].

Unofficial clients and third-party guides were not used as evidence.

### 3.2 Why this is not an adapter yet

- The prompt route is open. The documented example passes the prompt as an argument, and D7 forbids that [code: openbot/agent-freeduet/freeduet/claude_cli.py:41].
- The MCP set cannot be fixed from the documented switches alone. Project `.mcp.json` and the `[mcp_servers]` table in user config have no documented off switch. A per-run `GROK_HOME` would isolate config but probably take the login with it [assumed]. Pinning in `/etc/grok/requirements.toml` may work, but which keys can be pinned is not stated.
- Plan and quota limits and the sign-in failure text are not documented. The classifier needs real captures (slice 2).
- Without a session token, `XAI_API_KEY` takes over [doc: auth guide]. The child environment must drop it, or a missing login turns into metered use without notice.

### 3.3 The smallest version worth shipping

Once the gates in 7.4 are passed:

1. One locked entry, `grok-cli`: kind `cli`, billing `subscription`, `enabled: false`, and a `locked_reason`. It follows the Gemini entry [code: openbot/agent-freeduet/engines.example.yaml:29-35].
2. A `GrokEngine` beside `claude_engine.py`, with the same two methods [code: openbot/agent-freeduet/freeduet/engine_adapter.py:76-90]. Its environment is an allowlist built the way the Claude child's is [code: openbot/agent-freeduet/freeduet/claude_cli.py:75-109]. It keeps `HOME`, sets `GROK_CLAUDE_MCPS_ENABLED=0` and `GROK_CURSOR_MCPS_ENABLED=0`, and drops `XAI_API_KEY`, `GROK_AUTH_PROVIDER_COMMAND`, `GROK_CLI_CHAT_PROXY_BASE_URL` and every `ANTHROPIC_*` name.
3. Its `run_turn` writes a bridge-only project config, owner-only, into the work folder. It starts `grok` with the lockdown flags, feeds the prompt on stdin, reads the stream and stops the process. The shape follows [code: openbot/agent-freeduet/freeduet/claude_engine.py:41-123].
4. Grok events become the parser items the sink takes [code: openbot/agent-freeduet/freeduet/engine_adapter.py:65-73].
5. Before any offer, the tests of slice 10.4 (section 4) must pass: the lockdown test on the real binary, the environment test, recorded scenarios in the style of the goldens [code: openbot/agent-freeduet/tests/test_engine_goldens.py:1-7], and sign-in and limit fixtures.

### 3.4 What comes after

- Sign-in and limit patterns from real captures, in the classifier once slice 2 is wired [code: openbot/agent-freeduet/freeduet/engine_errors.py:61, :112].
- ACP (`grok agent stdio`), if it proves cleaner than the headless stream. It needs its own parser and tests.
- A metered xAI entry as configuration, after slices 8 and 11. Assistants are text only today [code: openbot/agent-freeduet/freeduet/assistants.py:3].
- The report guard still calls Claude, so a Grok-only member needs a decision first [code: openbot/agent-freeduet/freeduet/report_guard.py:205].

## 4. Slices

| Step | What it builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|
| 10.0 | This note only | Markers present; one new file; under 220 lines | none | S (this PR) |
| 10.1 | A written question to xAI (O2). The xAI row of PROVIDERS.md gets the answer, and the private reference on its line 29 is removed (CLAUDE.md, public wording). | Answer recorded; no private reference left in the repository | the maintainer | S (no code) |
| 10.2 | Guard PR: `.grok`, `GROK_HOME` and `.grok/mcp_credentials.json` added to the credential test lists and the static patterns | A test that opens `~/.grok/auth.json` fails; a module naming `.grok/auth.json` fails the static scan (lines 293-358) | none; can go before 10.1 | S |
| 10.3 | Spike on a disposable machine, pinned binary and checksum. Notes and captured fixtures, no account data | Each item of 7.2 has its command, output and binary version | the written answer (10.1); O3 | S |
| 10.4 | `GrokEngine` beside `claude_engine.py`, entry locked. Lockdown, stream parser, sign-in and limit mapping from 10.3 fixtures | Lockdown test on the real binary (plan section 4, note 2); parser fixtures; environment test (`XAI_API_KEY` absent); recorded scenarios; the entry is never first | plan slices 3 and 4; 10.3 | M |
| 10.5 | Limit and sign-in patterns in `engine_errors.py` from real captures | One fixture per pattern; `classify` returns the right kind | 10.3 captures; slice 2 | S |
| 10.6 | Metered xAI entry as configuration: openai-compatible, base `https://api.x.ai/v1` [doc: https://docs.x.ai/api/integrations], metered, off, capped | `engines.py` tests: metered needs enabled and two caps above zero; never first | slices 8 and 11 | S |

Only 10.4 adds Grok code, and a member is offered the engine only when the maintainer enables the entry.

## 5. Rules that must hold

| Rule | What it means for Grok | How it is kept true |
|---|---|---|
| Logins first (CLAUDE.md) | The subscription entry comes before any metered one. The metered xAI key is last, off by default and capped. | Order and cap tests [code: openbot/agent-freeduet/freeduet/engines.py:418-421, :442-444] |
| Never read, copy or forward subscription credentials | The adapter never opens `~/.grok` or `GROK_HOME`, never copies `auth.json` or `mcp_credentials.json`, and passes no token. The CLI reads its own login [doc: auth guide]. | Credential test with `.grok` decoys (10.2) [code: openbot/agent-freeduet/tests/test_credentials_untouched.py:33-35, :256] |
| No secrets and no personal data in the repository | Spike logs, device codes, account names and login files stay out of git. Fixtures are written by hand or cut to the event shape. | Each fixture is read before commit |
| The person's approval stays for real account actions | Built-in tools off through `--tools` or `--disallowed-tools` (value to be proven). No bypass name in the command or config (`--always-approve`, `--yolo`, `permission_mode`, legacy `yolo`). Every call goes through the bridge and OpenBot's gate. | Lockdown test on the real binary (plan section 4, note 2) |
| Change only what was asked | Claude output stays byte-identical. The Grok steps add their own files. | Recorded scenarios unchanged [code: openbot/agent-freeduet/tests/test_engine_goldens.py:1-7] |
| Upstream changes stay minimal | `OPENBOT_MODEL_OAUTH_FILE` stays unset, so the upstream xAI token route stays off [code: openbot/server/src/index.ts:2696-2697]. Any upstream file changed for Grok gets a row in `docs/UPSTREAM_TOUCHES.md`. | Review of each upstream change |
| Terms first ([PROVIDERS.md](../PROVIDERS.md) rule 5) | The Grok entry stays locked until xAI's terms are clear in writing. | Locked-entry test, as for the Gemini entry [code: openbot/agent-freeduet/engines.example.yaml:29-35] |
| Gateways are configuration only (CLAUDE.md) | A metered xAI route is a configuration entry. No gateway code is shipped. | Review of the 10.6 change |
| Public wording (CLAUDE.md) | This note and its PR never describe a private project or private source of the maintainer. | Read before commit |

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| O1 | Route for Grok now | (a) wait for xAI's answer and a spike; (b) build the adapter now, locked; (c) add a metered xAI key now | (a) wait | xAI's overview advises an API key for non-browser environments, and no headless subscription terms are documented ([PROVIDERS.md](../PROVIDERS.md) rule 5). An adapter now would guess the fields, flags and MCP set ([ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.2). |
| O2 | What to ask xAI, in writing | (a) Three questions now: may a self-hosted program run `grok -p` under a person's own subscription sign-in on a headless host; may a spike use a subscription on a disposable machine; which plan does that sign-in need. (b) Ask after a spike. (c) Do not ask. | (a) now | The acceptable-use policy bars unauthorized automated access [doc: https://x.ai/legal/acceptable-use-policy]. xAI already offers a subscription sign-in for headless hosts in OpenCode [doc: https://x.ai/news/grok-opencode], so the question can be specific. |
| O3 | Spike environment | (a) disposable machine, pinned binary and checksum, no member offered; (b) the maintainer's own computer; (c) no spike | (a) | Keeps the person's real login out of the spike. A pinned binary makes results repeatable. |
| O4 | Upstream xAI token route in OpenBot | (a) keep off, `OPENBOT_MODEL_OAUTH_FILE` unset; (b) turn it on for xAI; (c) remove it from the fork | (a) now; (c) later, as a minimal upstream change | It stores the person's access and refresh tokens on the server [code: openbot/server/src/provider-oauth.ts:25-26]. The plan already says Codex uses its own login, not the token program ([ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.3, E1). |
| O5 | Metered xAI route | (a) none; (b) an openai-compatible entry for `https://api.x.ai/v1`, the person's own key, off, capped; (c) an Anthropic-compatible entry for `https://api.x.ai` | (b), after slices 8 and 11; not (c) | Metered engines are never first and never on by default ([PROVIDERS.md](../PROVIDERS.md) rule 4). xAI does not list Claude Code for its Anthropic-compatible base [doc: https://docs.x.ai/api/integrations]. |
| O6 | If xAI says no, or does not answer | (a) no Grok subscription route; (b) keep the spike notes only; (c) offer it with the person accepting the terms risk | (a) | PROVIDERS.md rule 5 ships the route off when terms are unclear. Option (c) asks each person to carry a terms risk the project cannot assess. |

## 7. What was not verified, and the recommendation

### 7.1 Requirements of the plan, how Grok meets them, confidence

| Requirement | How Grok meets it | Confidence |
|---|---|---|
| Logins first; metered never first or on by default ([ENGINES_PLAN.md](../ENGINES_PLAN.md) section 1, row 1) | A subscription entry sits in the login part. The metered key is a separate, last, off entry. | High for the order; low for whether subscription use is allowed |
| Terms clear in writing before a route is on ([PROVIDERS.md](../PROVIDERS.md) rule 5) | Not met. No written answer; consumer terms not read. | Low (not met yet) |
| Never read, copy or forward a subscription credential (plan section 1, row 3) | The adapter passes `HOME` and never opens `~/.grok`. The CLI reads its own login. Isolating config through `GROK_HOME` would probably hide the login too [assumed]. | Medium: the spike must show no token is needed in the environment |
| The engine sees only the freeduet bridge (plan section 1, row 2) | `--tools` and `--disallowed-tools` exist. The Claude and Cursor loaders have switches. Project `.mcp.json` and user `[mcp_servers]` have no documented off switch. | Low until the spike shows the real tool and server sets |
| Built-in tools off | Flags exist [doc: reference]. The value that disables all of them is [assumed]. | Medium |
| Every call through OpenBot's gate (plan section 1, row 2) | Deny rules win over allow rules and still apply under always-approve [doc: permissions]. How to select `dontAsk` is not stated. | Medium |
| Lockdown proven by a test before any offer (plan section 4, note 2) | Possible on the real binary. Not run. | Low until run |
| Stateless segments (no session kept between runs) [code: openbot/agent-freeduet/freeduet/claude_cli.py:47] | Sessions live under `GROK_HOME` [doc: settings]. No documented flag stops session saving [doc: reference]. | Low |
| Stream turned into the seam's items [code: openbot/agent-freeduet/freeduet/engine_adapter.py:65-73] | Event types and stop reasons are documented [doc: raw headless guide]. The tool-name prefix is not [assumed]. | Medium |
| Sign-in loss and limits detected (slice 2) | Exit 1 covers authentication and runtime errors. No plan or quota limit is documented. | Low |
| Usage reported for the ledger (plan slice 12) | The `end` event carries usage and cost fields. `usage_is_incomplete` marks an incomplete drain [doc: raw headless guide]. | Medium |
| Child environment built from one allowlist (plan slice 1) | Our own allowlist. Auth variables are documented [doc: auth guide]. | High |
| No auto-update, no memory [code: openbot/agent-freeduet/freeduet/claude_cli.py:84-89] | `--no-auto-update` [doc: headless] and `--no-memory` [doc: reference] exist. Their effect is untested. | High for the flags; medium for the effect |
| Metered, capped, off by default (plan section 1, row 1; [PROVIDERS.md](../PROVIDERS.md) rule 4) | Endpoints and prices are published [doc: integrations] [doc: pricing]. | High |
| Pinned binary with a checksum (design requirement of this note) | Not checked. No install page was read. | Low |

### 7.2 What only a spike can settle

1. Whether the prompt can go on stdin in headless mode. The documented example uses an argument. If not, there is no engine (D7).
2. The value that disables every built-in tool: `--tools` with an empty value, or `--disallowed-tools` with names.
3. Whether a project `.grok/config.toml` with the bridge alone is the only MCP server, given `~/.grok/config.toml`, `~/.claude.json` and `.mcp.json`.
4. Whether `GROK_CLAUDE_MCPS_ENABLED`, `GROK_CURSOR_MCPS_ENABLED` and the `[compat.*] mcps` settings stop their loaders, and whether anything stops project `.mcp.json`.
5. Whether `/etc/grok/requirements.toml` can pin the MCP switches, and whether the pin holds in a headless run.
6. Whether `GROK_HOME` moves `auth.json`. The settings page lists auth under `GROK_HOME`; the auth page does not say.
7. How to select `dontAsk`, whether allow rules naming the bridge tools work with it, and what a refused call looks like.
8. The real event fields for bridge tools, and the MCP tool-name prefix in `tool_call`.
9. Whether a run keeps a session under `GROK_HOME`, and whether any setting stops it.
10. The output, stop reason and exit code for a usage limit and for a lost sign-in. Exit 1 covers both today.
11. The device-code login (`--device-auth`) on a headless host: which file appears, and where.
12. Whether `disable_bypass_permissions_mode` blocks `--always-approve` and `--yolo` in headless runs.
13. Which hosts the binary contacts, whether telemetry can be switched off, and whether usage arrives per run for the ledger [assumed].
14. Whether ACP (`grok agent stdio`) is a better route than the headless stream, and whether a pinned release with a checksum exists.

### 7.3 Not read or not checked

- The consumer terms of service could not be read in this session.
- The acceptable-use policy text read is a previous version (3.1).
- Which plan the CLI sign-in needs, and the limits: not stated on the pages read.
- The user-guide pages were read from xAI's public source repository, not from the docs site.
- Flags, field names and prices come from summaries of the pages. The spike checks them against real output.
- Whether Claude Code works on xAI's Anthropic-compatible base: not listed, not tested.
- Nothing was installed, run or signed into. No unofficial client or third-party guide was used as evidence.
- The upstream xAI token code was read, not run.

### 7.4 Recommendation

**Wait, and ask first.**

1. Send the three written questions in O2 now.
2. If xAI answers yes in writing, run the spike (10.3) on a disposable machine, with no member offered.
3. Build the adapter (10.4) only after the spike proves the lockdown and plan slices 3 and 4 are on main. Until then the entry stays locked.
4. The guard PR (10.2) does not depend on the answer, so it can go first.
5. If xAI says no, or does not answer, Grok has no subscription route. A metered xAI entry (10.6) stays a separate choice with the person's own key. It does not answer the subscription question.

Building an adapter now would guess the event fields, the tool flags and the MCP set. The plan says Grok is offered only after its spike ([ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.2).
