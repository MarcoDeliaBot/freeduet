# Engines dashboard: where the person chooses, and where keys are kept

Status: design, 14 November 2026. This is slice 7 of [ENGINES_PLAN.md](../ENGINES_PLAN.md) section 9.1, split here into slices 7a to 7e. Slice 7a is built (section 9). The rest waits for the maintainer's answers (section 10). Slice 6 (the read-only page) is on main.

Facts are marked `[code]` when they were read in this repository at the base of this branch, and `[assumed]` when they were not checked. Nothing here was run live.

## 1. The short version

1. The page is one screen for a person who is not technical: every engine and how it is doing, each member's list of engines, and a few switches with a sentence about what each one does. It is the only place the person's engine choices are made (E4, `ENGINES_PLAN.md` 9.3).
2. **One place of truth.** The person's choices are stored on the server. `engines.yaml` stays the installation's defaults and is never written by the page. agent-freeduet keeps only measured facts (limited-until). The effective value is worked out in one place, the agent, from the file plus the choices.
3. **The choices travel with every run**, in `forwardedProps`, the way the person's language already does (D26 in `M1_PLAN.md`). If they cannot be read, the agent uses the file's values and the page says so. No secret ever travels this way.
4. **Keys are a different channel with the opposite failure rule.** A key is kept in the vault, can be set, replaced, tested and removed but never read back, is handed to the agent only inside a live run, and is not stored at all while the vault's own key is the example key this repository publishes (D39). If a key cannot be had, the engine is skipped. It never falls back to another credential.
5. **The first slice (7a) stores no secret.** It shows each member's list of engines and mode, and lets the administrator at the computer choose automatic or ask-first for a member, with an Undo and an audit row. The agent honours it. This proves the whole path (page, server, run, agent) with a harmless preference, before a key is involved.

## 2. Who it is for, and what it must feel like

The person has a Claude plan and perhaps one more engine. They do not know what a gateway, a tier or a breaker is, and the page must not need them to.

- Every control has one sentence that says what happens next, in the words the router already uses to the person (`engine_notices.py`, [code]).
- A change says when it applies ("from your next message") and offers an Undo.
- Nothing that can spend money is switched on without showing what it can cost. Until the usage ledger exists (slice 12), a paid gateway is refused outright and the page says so [code: `engines.py` `paid_gateway_refusal`].
- The page never shows a key, a sign-in detail, a file path, an address with a user name in it, or a provider's raw error. What it shows is built from closed lists of words, plus each engine's id and name as the file spells them (slice 6 already shows both). Keys, addresses, secret references, paths and environment names in the file are never read.
- The interface is in English, like the rest of the app.

## 3. What the page shows

### 3.1 Per engine (one row each)

| Fact | In the person's words | Where it comes from | Slice |
|---|---|---|---|
| Name | the engine's own name from the file | agent row `label` | 6, built |
| State | one sentence: ready, degraded, limited until a time, out of credit, not answering, checking, signed out, refused | agent row (`engine_state.py`) | 6, built |
| Why refused | a cleaned sentence | agent row `refusal`, cleaned by the server | 6, built |
| How it signs in | "Uses your Claude plan" or "Uses a key you gave it" | agent row `kind` (the server already passes it) | 7c |
| Cost class | "Included in your plan", "Free", "Paid by use" | file `billing`, new read-only field of `GET /engines` | 7c |
| Strength | "Strong with tools", "Good", "Basic: skills that need more are kept off it" | file `tier`, same addition | 7c |
| Installed, signed in | "Signed in" or "Sign in with the provider's own program" | agent row | 7c |
| Key | "Key saved on 14 Nov 2026, ends in 1234", or "No key yet" | vault metadata | 7d |
| Totals and caps, for a paid engine | "Used today 0.42 of 1.00" | the ledger | slice 12 |

### 3.2 Per member

| Fact | Where it comes from | Slice |
|---|---|---|
| The engines in the order they will be tried: logins first, then free, then paid; each with its state from 3.1 | agent: `ordered_chain` over the adapters that run | 7a |
| Engines in the member's list that will not run, with a reason from a closed list (turned off, locked, paid gateway not run yet, paid engines switched off, a cap of 0, not set up) | agent: new `exclusion_code` beside `exclusion_reason` | 7a |
| The mode: automatic or ask first | the person's choice if any, else the file's `switching:` entry, else automatic | 7a |
| The pin, if any | the file's `switching:` entry, later the person's choice | shown 7a, chosen 7b |
| Whether each value is the person's choice or the file's | server | 7a |

### 3.3 The page as a whole

- A line when there is only one engine to run: "Only Claude is set up for this member, so there is nothing to switch to yet. Your choice is kept for when there is." The control stays usable, because a person may prepare it.
- A banner when the person's choices cannot be read (section 5.4).
- A line when the person is not at the computer: "Change these on the computer FreeDuet runs on." The controls are disabled, the information stays.
- A line when the engine service does not accept choices (an older one): "Update FreeDuet to change this."

## 4. What can be changed, and where each change is kept

### 4.1 Three kinds of fact, three owners

| Kind | Example | Kept in | Written by |
|---|---|---|---|
| The installation's defaults | the engines, their chains, `switching:`, `enabled:`, caps | `engines.yaml` in agent-freeduet [code: `engines.py`] | the person or installer who made the file, by hand. The page never writes it. |
| The person's choices | mode, pin, order, an engine off or on, an added gateway | the server | the page, as the administrator at the computer |
| Measured facts | limited-until, failures, last probe | agent-freeduet's `engine-state.json` [code: `engine_state.py`] | the agent, from what happened |

### 4.2 Why the server, and not the file

The maintainer decided E4: limited-until in the agent's file, the person's choices on the server. The reasons it is also the right shape:

1. **Two writers on one file is the bug to avoid.** The page would have to write a file inside another container, one the operator also edits and that an update replaces with the shipped example. Today the compose file mounts none at all (`ENGINES_PLAN.md` slice 5 note, [code]).
2. **The audit trail and the Undo live on the server**, and the server already has a pattern for "change, record, undo with compare-and-set" [code: `settings-in-chat/changes.ts`].
3. **A choice survives an update.** The file is replaced with the example; the database is kept.
4. **The page can say whose value it is.** "Your choice" and "From the installation's file" are different sentences, and a "Use the installation's setting" action is one deletion.

### 4.3 Where on the server (7a)

A new key, `freeduet_engine_choices`, in `enterprise_settings` [code: `db/schema/admin.ts`, a table of `key`, a jsonb `value`, `updated_by`, `updated_at`]. It needs no migration. The choices are the installation's, not one person's: the engines and their sign-ins belong to the installation, so `users.preferences` (where Full access is kept) is the wrong place. The existing reader of that table reads only its five known keys and ignores others [code: `admin/settings-store.ts`], so nothing existing sees the new row.

If a later slice needs rows of its own (the keys of 7d, the gateways of 7e), they get a table then. The document of 7a is small and stays in the one row.

The document, written only after strict validation and read tolerantly:

```json
{ "version": 1, "members": { "leo": { "mode": "ask-first" } } }
```

Limits: at most 64 members (which keeps the whole document under 16 KB), a member id `^[a-z0-9][a-z0-9_-]{0,63}$`, a mode one of `automatic` and `ask-first`. Later fields (`pin`, `order`, `off`) are added the same way and are all optional.

### 4.4 Every control, in one table

| Control | What it changes | The file and the agent still decide | Confirmation | Slice |
|---|---|---|---|---|
| Mode per member: automatic or ask first | what happens when an engine runs out | nothing: both values stay inside the chain | none; Undo | 7a |
| Use the installation's setting (per member) | removes the person's entry | | none | 7a (the Undo of a first change already does it) |
| Pin per member | the member stays on one engine and never falls back | the engine must be allowed to run; a locked, off, paid or missing one is refused with the existing notice | one sentence: "If it runs out, nothing else will answer." | 7b |
| Order per member | engines of the same cost class swap places | logins stay first; a paid engine does not move above a free one without E3's confirmation | none within a class | 7b |
| An engine off or on | for everyone | the person can turn off anything; can turn on only what the file does not lock; a paid gateway stays refused until slice 12 | none to turn off; a sentence to turn on | 7c |
| A key: add, replace, test, remove | one engine's key | see section 6 | confirm on remove and on replace | 7d |
| Add a gateway | a new entry | it must pass the same checks as an entry in the file | the caps, once the ledger exists (E3) | 7e |

### 4.5 Audit and Undo

The pattern of settings in chat, unchanged in shape [code: `settings-in-chat/changes.ts`]:

- One `configuration.changed` event per change, target type `engine_choice`, target id the change id, the actor the administrator. Payload: `change`, `changeId`, `memberId`, `previousValue` (a mode, or null when nothing was chosen), `newValue`. Nothing else: no address, no key.
- Undo finds the change by its id in the trail, writes the previous value only while the current value is still the one the change set (compare and set), and records its own event with target type `engine_choice_undo`. A second Undo, an Undo after a later change, and an unknown id each answer with a sentence and change nothing.
- A change whose audit row cannot be written is taken back first, so there is no change the person cannot see or undo.
- Two changes made at the same moment cannot lose one another: the document is changed under a row lock.

## 5. The override layer: how agent-freeduet learns the choices

### 5.1 Three ways, and the pick

| Way | For | Against |
|---|---|---|
| A. The server writes a file the agent watches | no new network path | the server runs on the host and the agent in a container: a shared mount, its permissions on Windows, and a change that is not seen at once. The agent cannot tell a current file from an old one. A file is the wrong place for anything secret. |
| B. The agent asks the server at the start of each turn | always fresh | a new call in the path of every turn, with its own timeout, token and failure; more code on both sides |
| C. The server sends the choices with each run | no new path: the run already carries per-run facts (`openbotBotId`, `openbotDeploymentTools`, `openbotRun`, and the person's language, D26) [code: `copilot.ts` `runWith`]; one place every remote run goes through, so a chat, a hand-off and a routine all carry it; the agent keeps no state; it is as fresh as the last write | the choices ride in a run input that may be stored, so they must carry no secret (they carry only a closed vocabulary) |

**Pick C for choices.** Keys use a different channel (section 6.3): B-style, on demand, and only for a key.

### 5.2 What goes on the wire

`forwardedProps.openbotEngineChoices`, present only when the person has chosen something for this run's member:

```json
{ "version": 1, "mode": "ask-first" }
```

All fields optional; an absent field means "nothing chosen". The server builds it from its own store for the member the run is for. **It strips any `openbotEngineChoices` that came in from the caller first**, because `runWith` copies the caller's `forwardedProps` into the run and a browser must not be able to set its own choices; this is what `withPersonLanguage` already does for the language [code: `freeduet/person-language.ts`].

### 5.3 What the agent does

- Parses it as tolerantly as every other prop [code: `agui.py` `parse_run_input`]: anything that is not the shape above is ignored, as if absent.
- Applies each field through the functions the file already uses, so the rules are written once and in one language. For the mode that is the `Switching` the router reads at the start of `Router.run`. From 7b the same applies to the pin, the order and the off switch: they go through `exclusion_reason`, `ordered_chain` and the existing pin refusal.
- **The file is a ceiling**: a choice can narrow what the file permits, or reorder inside it, and can turn on only what the file does not lock. The table in 4.4 says it per control.
- Reports in `GET /engines` that it accepts choices (`choices_version`), so the page enables a control only where the agent will honour it. An agent that does not say it does not get a control that would do nothing.

### 5.4 When the choices cannot be read

| What goes wrong | What runs | What the person reads |
|---|---|---|
| Nothing is stored | the file's values, exactly as today | "From the installation's file" |
| The store cannot be read when the server starts | the file's values; the server tries again on every page load and every write | a banner: "Your choices could not be read, so the installation's settings are in use. Nothing you chose is lost." |
| The stored document is corrupt or of a newer version | it is ignored as a whole | the same banner |
| One value is not in the closed list | that value is ignored, the rest applied | the member's line says one choice could not be used (from 7b, when there is more than a mode) |
| The server cannot write | the change is refused with a sentence, nothing changes | the sentence |
| The agent is older than the server | it ignores the prop | the control is disabled: "Update FreeDuet to change this." (`choices_version` is missing) |
| The server restarts | the choices are loaded before the server accepts a request | nothing |
| The agent restarts | it keeps no choices, so nothing is lost | nothing |
| The person changes a value during a run | that run keeps the value it started with | "from your next message" |
| The mode changes between an ask-first question and its answer | the answer is read from the question's own mark, not from the mode | nothing |

**The rule underneath:** a choice never blocks a turn, and a lost choice never makes a run spend more. A lost "ask first" returns to the file's value, which the installation chose; a lost "off" in 7c does the same, and that is listed as a decision (section 10, question 6) because it fails toward more engines, not fewer.

The server holds the choices in memory, loaded at start and refreshed on every write, and keeps the last good copy if a reload fails. `runWith` reads that copy without waiting for the database. This assumes one server process, as FreeDuet runs it [assumed]. A deployment with several would need the existing `enterprise_settings_changed` notification [code: `admin/settings-store.ts`], which is a known limit, not built.

## 6. The credentials panel

Decided on 14 November 2026: once the dashboard exists it gets one place where the person adds, sees and removes the keys of gateways and paid engines, kept encrypted, shown masked and never sent to a member. Subscription logins are never in it. This section is the design for it. It is built in slice 7d and needs the answers in section 10 first.

### 6.1 What a credential is, and is not

It is **a key the person has for a gateway or for a paid engine**: one string, one engine.

It is never:

- a subscription login of any engine (Claude, Codex, Grok): a token, a cookie, an `auth.json`, a config folder. Those stay inside each engine's own program, which FreeDuet never opens (`PROVIDERS.md` rule 1).
- a password, or the dashboard's own sign-in.
- the sign-in of a connected app. Those have their own flows.

The server refuses a value that is JSON, that holds a Claude plan token (`sk-ant-oat` or `sk-ant-ort`), or that is not a bearer token as RFC 6750 writes it. This is the rule `read_key` already applies to a key read from a file [code: `compatible_engine.py`]; it is applied at the door as well, so a wrong thing is refused when it is pasted and not at the first turn.

### 6.2 Where a key is kept

In the existing vault: the `credentials` table, each value sealed with AES-GCM under `KEY_ENCRYPTION_KEY` [code: `credentials.ts`, `db/schema/core.ts`].

- **A new credential kind, `engine`.** A key has no business in the existing `model` kind, whose meaning is a model provider for Bots, and the admin credentials route accepts only `model`, `connector` and `mcp` on purpose ("do not widen", [code: `app.ts` `credentialInput`]). Adding a kind is an enum migration, and `tests/schema.test.ts` pins the enum, so it changes with it. The vault's live-row index, one live row for a kind, provider and key id, gives "one key per engine"; a replacement rotates the row in one transaction and a removal revokes it [code].
- **What is saved beside the sealed value:** the engine id, the date, the host the key was saved for (6.5), and, if question 5 of section 10 says so, the last four characters. Never the key.

**What D39 means for this** (`M1_PLAN.md` section 22) [code]:

1. A vault is as private as its key. `start.sh` makes `KEY_ENCRYPTION_KEY` for each new installation, so a new installation's vault is private.
2. **An installation that already had something sealed keeps the example key this repository publishes**, and a warning says so at every start. Nothing re-seals what is in the vault, so there is no supported way off the example key yet. On such an installation a copy of the database is a copy of every key in the vault.
3. The same key signs the run assertions the server trusts. With the example key anybody can forge one. That would break the check that releases a key to the agent (6.3), not only the vault.
4. A changed or lost key leaves what it sealed unreadable.

So the panel **does not store a key while the vault's key is the example key**. It says so in plain words ("This computer's key store uses the example key every copy of FreeDuet shares, so a saved key would not be private. Your keys can still be given to FreeDuet in the settings file."), and the file route (`env:NAME` or `file:/path`, kept by the person and never stored by FreeDuet) stays exactly as it is. The server compares its key to the example one with the constant `config.ts` already holds [code: `PLACEHOLDER_KEY`]. For older installations to use the panel, the re-seal tool D39 names as a follow-up has to exist: that is question 4.

A key the vault can no longer open (a changed vault key) shows as "Saved, but it cannot be read. Enter it again." It is never a crash and never an empty key sent anywhere.

### 6.3 How a key reaches agent-freeduet

**Never in `forwardedProps`** (a run input may be stored), **never in a file, never in a response to the browser, never in a log.**

1. The engines file refers to it with a third kind of reference, `vault:` [new in `engines.py`, beside `env:` and `file:` [code: `parse_secret_ref`]].
2. At the start of a turn that needs the key, the agent's parent process asks the server, the way a deployment tool call does [code: `bridge/callback.py`]: the agent's own token in `x-openbot-agent-token`, and the run's signed assertion. The token is held by the parent only, not by the Claude process and not by the tool bridge [code].
3. The server releases the key only if the token is right **and** the assertion is a live one for this run, and only for an engine that has a stored key. A stolen token alone releases nothing. A refusal is audited without the key (6.7).
4. The agent keeps the key in a variable for that turn, gives it to the Claude process as `ANTHROPIC_AUTH_TOKEN` as it does today for a key from `env:` or `file:`, and nothing else. The existing `Scrubber` replaces the exact key with `[key]` in anything the process or the gateway prints [code: `compatible_engine.py`].
5. **Failure is closed.** If the server is not reachable or refuses, the engine has no key: the existing "has no key it can use" path skips it and the router moves on [code: `NoKey`]. It never falls back to another credential, and above all not to a subscription login.

Why not the others: an environment variable cannot be set in a running container from the host, so the person would restart the stack; a shared file puts the key in the clear at rest in a volume other containers can reach; `forwardedProps` is stored.

The key crosses the machine's own Docker bridge in clear text, the same hop the tool token already crosses [assumed]. That is a stated limit.

### 6.4 What the page does with a key

A list, one row per engine that takes a key:

| Part | Content |
|---|---|
| Row | the engine's name; "No key yet", or "Saved on 14 Nov 2026" and, if allowed, "ends in 1234" |
| Add or Replace | opens one field and Save. The field is a password field, `autocomplete="off"`, with no name or label a password manager will offer to fill. It is cleared after Save, after an error and when the form closes. The mutation's stored variables are reset, so the key does not stay in the page's request cache. It is sent once, as the body of a same-origin JSON request, never in an address. |
| Test | section 6.6 |
| Remove | asks once, then revokes |
| What there is not | no "show", no "copy", no export, no key in any response |

**The last four characters: show them only when the key is at least 24 characters, else show only the date.** They let a person tell two keys apart and see that a replacement took, the way a provider's own page does. On a long key four characters are a sixth or less of it. On a short key (a local router's key may be a word) they are half. They are saved in the row's metadata when the key is written, so the page never has to open a key to draw the list. The more cautious choice, the date only, costs the person little and is question 5.

The page also says, next to the field and in words a person will read: "Keys go here, never in the chat."

### 6.5 A key is bound to the address it was saved for

A key is sent to whatever address its engine names. If the address could be changed after the key was saved, the key could be sent to a new host. So the host is saved with the key, and a key is not sent when the engine's address has a different host, until the person enters it again. Changing a gateway's address in 7e clears its key. Plain `http` stays allowed only for this machine [code: `engines.py` `_base_url_problem`].

### 6.6 Test, without spending

There is no free call that works on every gateway: any request to a gateway may be billed, counted or refused, and a model listing proves nothing about a key [code: `ENGINES_PLAN.md` slice 5, `compatible_engine.py` `probe`]. So **Test is the probe the adapter already has**: the CLI is installed, a usable key can be read, and it has the right shape. It sends nothing to the gateway. The sentence it gives says exactly that: "This checks that the key is saved and looks right. It cannot tell whether the provider accepts it; your first message will."

A button that sends one small request to the provider, only for a gateway the person marked free and only on a click that says so, is a different feature. It is not in the first version (question 6).

### 6.7 Audit

The vault's own events stay, with the engine id as the key id and no value: `credential.created`, `credential.rotated`, `credential.rotation_refused`, `credential.revoked` [code: `credentials.ts`]. New, as `configuration.changed` rows with the same discipline (no key, no last four):

- `engine_key_test`: engine id and outcome (`ok`, `no_key`, `unreadable`, `looks_wrong`).
- `engine_key_release_refused`: engine id and the reason (no live assertion, no stored key, the example vault key). A successful release is the product working and is not audited per turn; the page shows "last used" from the agent's own record.

### 6.8 Who may do it

All of these, together:

1. **An administrator**, by the existing guard [code: `requireAdmin`].
2. **At the computer.** The TCP peer is this machine's own loopback, read from the socket and never from a header [code: `auth/peer.ts`], and the request carries none of the headers a proxy or tunnel adds (`Forwarded`, `X-Forwarded-*`, `X-Real-IP`, `Via`, `CF-Connecting-IP`, `True-Client-IP`, `Tailscale-*`), because a tunnel running on this machine looks like loopback.
3. In a single-user installation, the pairing cookie the whole app already needs [code: D28, `auth/install-secret.ts`].
4. The same-origin and Host guards every state-changing `/api` request already passes [code].

Said plainly about what these do and do not do: **on Docker Desktop a Bot's computer reaches the server as loopback** (D39's own premise), so the peer check is not what keeps it out. The pairing cookie in single-user mode, and the session in a sign-in deployment, are. The peer check and the header check are a second lock for the cases the first two do not cover: a deployment opened with `OPENBOT_HOST`, where everybody who can reach the server is the administrator, and a tunnel that forwards a remote person to the loopback port.

**A phone or other remote session cannot do any of this**, as `phone-and-remote.md` 3.3 already says for provider settings. Until that design's session marker exists, the peer and header checks are what refuse it.

**Never from chat, never by a member.** Credentials are not on the list of settings a member may change (`settings-in-chat.md` R6). No tool of any member's bridge names an engine or a key, and none may be added. A test lists every tool a member can reach and fails if one does.

A deployment with sign-in whose administrators sit on other computers cannot change the mode, or later write keys, from the page; they can read it. That is deliberate and is question 3.

### 6.9 What a member's model can and cannot learn about engines

| Fact | Can the model learn it? | Why |
|---|---|---|
| The key, whether there is one, its last four | No | It is in the Claude process's environment only. There is no shell tool; the tool bridge does not get it (`CLAUDE_CODE_MCP_ALLOWLIST_ENV`); the `Scrubber` replaces it in output [code: slice 5 notes]. |
| The gateway's address, its model name | No | They go to the process's environment, not into the prompt. |
| What the person chose (mode, pin, order) | No | They are read by the router, not written into the prompt. |
| Which engine answered | Only what the person also sees: the router's own sentences in the transcript ("Claude ran out; I moved to ...", the ask-first question) [code: `engine_notices.py`] | They are text the router writes, with the engine's name and no more. |
| Caps and what was spent | No | Not in any prompt. A model told its budget could be argued into hiding it. |
| That the page exists | Not unless the person says so | If a person asks a member in chat to change an engine, the member cannot, and has no tool to try. Whether the member should say "that is on the Engines page" is a prompt change: not made here, and not yet run live. If it is made, run the team evals for every member, all safety cases, and add one case that asks for a key. |

### 6.10 Threats

| Threat | What stops it | How it is tested |
|---|---|---|
| A member, or a message to it, asks for the key or for a printout of its environment | The model has no tool that reads either; the bridge environment is cut down; the `Scrubber` | A canary key in the vault and in the agent's environment never appears in any event or transcript of a run, nor in any response of any engines route |
| A web page or email tells the member to add a key, turn on a paid engine or change the mode | No tool and no route a member can reach; the routes need the person's own session and the checks of 6.8 | Every route refuses a non-administrator, a remote peer, a forwarded request and a request with no pairing cookie, through the real guard; the member tool list has no engine or key name |
| A page on the web posts to the local server | Same-origin guard and Host guard; JSON body required [code] | A cross-origin write is refused |
| A browser (the caller) sends its own `openbotEngineChoices` in the run to force a mode or a pin | The server removes any caller-supplied value before adding its own | Test: a run carrying one reaches the agent with none, or with the server's |
| A key in an export or backup | No export route writes `credentials` rows; the page has no export; a database dump holds sealed values only, and is as private as the vault key (6.2) | The canary set through the page appears in no export, no audit row and no log |
| A key in a log, an error, a notice or the audit trail | The audit payload has an allow-list and no key field; vault errors keep driver parameters out [code]; the agent never logs the key | Canary scan of the audit trail, the agent's log and every response |
| A stolen agent token | Releases nothing without a live run assertion (6.3) | A release with the token alone is refused and audited |
| A forged run assertion | Needs the vault key; with the example key it is possible, which is why a key is not stored under it (6.2) | A release is refused while the vault key is the example one |
| A key sent to a new host | Bound to the host it was saved for (6.5) | Changing the address stops the key being sent |
| A wrong thing pasted: a subscription token, a JSON sign-in file | Refused at the door (6.1) | A plan-token shaped value, a JSON value and a value with spaces are refused and nothing is stored |
| A key pasted into the chat by mistake | Out of this design's reach: the page tells the person where keys go. Spotting a key-shaped string in the message box is a possible later slice and is not designed here | not covered |
| A key left on the screen or in the clipboard | Masked, no copy button, field cleared | Page test: the key is not in the DOM after Save |

## 7. Slices

| Slice | What | Stores a secret | Needs | Tests, in headline | Size |
|---|---|---|---|---|---|
| **7a** | Each member's list of engines and mode, read from the file through the agent; the mode choice with Undo and audit, honoured by the agent | No | 6 | Route, page, agent and run-path tests; defaults and the Claude row unchanged | M |
| 7b | A pin and an order per member | No | 7a | A pinned engine never falls back; logins stay first; a refused pin is said | M |
| 7c | An engine off or on; how it signs in, its cost class and strength shown | No | 7a | A locked engine cannot be turned on; a paid gateway stays refused | M |
| 7d | The credentials panel: add, replace, test, remove | Yes, in the vault | 7a; D39 answered; `vault:` in the agent; the new kind | Every row of 6.10; the schema pin | L |
| 7e | Add a gateway from the page | Through 7d | 7c, 7d; E3 | The same checks as the file; the key bound to its host | L |
| later | Totals and caps shown | No | slice 12 | Numbers match fixtures | with slice 12 |

Why 7a first: it stores no secret and is harmless, and it proves the pieces everything after reuses: the guard, the store, the audit and Undo, the run channel and the agent's reading of it. 7d should not be the slice that finds out the channel is wrong.

## 8. What does not change

- Defaults: with nothing stored the server sends nothing, the agent runs on the file, and the 52 recorded runs are byte-identical (`tests/test_engine_goldens.py`).
- The Claude row of `GET /engines` is unchanged when the default file is used.
- Approvals, Full access and the quality floor are untouched. No member gets a new tool.
- A subscription login is never stored, shown or sent by this page.
- A paid gateway stays refused until the ledger exists, whatever the page says.

## 9. Built so far

Slice 7a, built on 14 November 2026. It stores no secret, gives no member a tool and changes no member's prompt. The control path is built, not only the read-only view: the one choice there is, a member's mode, is small and well tested, and it proves the channel that 7b to 7e reuse.

**What a person sees.** Under the engine list of the Engines page, "Each member's engines" has one row per member the engines file names. It says which engines the member will try, in order; each engine in its list that will not run, with one reason; the pin, if the file sets one; and one choice, "When an engine runs out": switch automatically, or ask me first, each with a sentence that says what happens. A line says whether the mode is the person's choice or the installation's file's. Only an administrator at the computer FreeDuet runs on can change it. For anyone else the controls are disabled and one sentence says why: not at the computer, an engine service too old to honour a choice (it does not say `choices_version`), or saved choices that cannot be read (with the banner of 5.4). A change says it applies from the member's next message and offers an Undo.

**What happens behind the page.**

- **agent-freeduet.** `GET /engines` also answers `members` (each member's chain, its left-out engines with one word for why, its mode and pin from the file) and `choices_version`. `engine_choices.py` reads `forwardedProps.openbotEngineChoices` and lays the person's mode over the file's `switching:` entry, as `Router.run` starts; anything it cannot read is ignored. The pin stays the file's. `engines.exclusion_code` gives the word for each left-out engine, and a test holds it to `exclusion_reason`, which the router still uses. The answer to an ask-first question is now read whatever the mode is at that moment, so that a person who changes the mode between the question and the answer is still understood (the router finds an answer only after its own question, so a member that never asked is unaffected).
- **The server.** `engine-choices.ts` keeps the choices in `enterprise_settings` under `freeduet_engine_choices` (no migration) and in memory, loaded before the server accepts a request. It writes one `configuration.changed` row for each change and each Undo (`engine_choice`, `engine_choice_undo`; ids and values only), takes a change back if its audit row cannot be written, changes the document under a row lock and a mutex, and answers a stale, repeated or unknown Undo with a sentence and no change. `copilot.ts` removes any `openbotEngineChoices` the caller sent and adds the server's own for the member the run is for. `at-the-computer.ts` is the second lock of 6.8: a loopback TCP peer and none of the headers a proxy or tunnel adds.
- **The routes.** `GET /api/freeduet/engines` also returns `members`, `choices`, `canChange` and `cannotChange`, only where the server keeps choices, so every slice 6 answer is as it was. `PUT /api/freeduet/engines/members/:memberId/mode` and `POST /api/freeduet/engines/changes/:changeId/undo` need an administrator at the computer. Each answer that carries the page's data or an outcome is `Cache-Control: no-store`, and a canary key in the agent's rows, its problem list and both environments never appears in any answer, stored row or audit payload.

**Tests** (each new test fails on main's source: the new files fail at import, and the changed existing assertion fails on the old code; about thirty hand-made breakages of the new code, each undone afterwards, were each caught by a named test).

| Where | New tests | What they pin |
|---|---|---|
| agent: `test_engine_choices.py`, `test_engine_members.py` | 30 and 9 | The parsing of the prop (shape, version, a boolean is not a version, unknown mode), the mode laid over the file, the pin kept, a lost choice runs on the file, the answer to an ask-first question in either mode, the members overview and its words, `exclusion_code` held to `exclusion_reason`, and the Claude row of `GET /engines` unchanged; the 52 goldens untouched and green |
| server: `freeduet-engine-choices.test.ts` | 33 | The store: load, restart, an unreadable or newer document, one row lock across two services, compare and set, a rolled-back change when the audit write fails, `constructor` as a member id, the 64-member limit, Undo refusals |
| server: `freeduet-engine-choices-run.test.ts` | 15 | The run path: a caller's own `openbotEngineChoices` is removed, the server's is added for the right member only, nothing else in `forwardedProps` moves |
| server: `freeduet-at-the-computer.test.ts` | 7 | The guard: a loopback peer passes; a remote peer, each forwarding header and each prefix refuse |
| server: `freeduet-engines-dashboard.test.ts` | 33 | The routes through the real guards and `createApp`: administrator only, remote and forwarded refused, no secret in any response, audit rows, Undo, the old shape without a store |
| app: `freeduet-engines-members-text.test.ts`, `freeduet-engines-members.test.tsx` | 14 and 19 | Every sentence; every state (no members, one engine, a pin, away from the computer, an agent too old, unreadable choices, saved, undone, a refusal, a server that keeps no choices); the only controls are the two answers per member and an Undo |

**Not built, on purpose.** A pin, an order, an engine off or on, the credentials panel and any field that takes a key (7b to 7e); a standing "Use the installation's setting" control (the Undo of the change just made does it, and a person who later wants the file's value can choose it, which is then kept as their choice).

**Not verified.** No live run, no real engine running out (the fake command line and fake engines stand in), no real browser (the page tests run under happy-dom), and no check of the loopback and header guard through Docker Desktop, a tunnel or a proxy: it was tested with a hand-made peer and hand-made headers. One server process is assumed, as in 5.4. The rest of the design was not run at all: the paths of section 6 were read in code and not exercised, and how a gateway answers a request is the open question the plan already carries (`ENGINES_PLAN.md` slice 5, "not verified"). No member prompt or tool text changed, so no team eval case needs to run for this slice; 7d, which adds a tool-facing channel for a key, will.

## 10. Decisions left to the maintainer

Each recommendation is one the design follows only where it changes no security, cost or public behaviour. Where it does, the slice is not built and the question is here.

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where the person's choices are kept | A. a key in `enterprise_settings`. B. a new table. C. `users.preferences`, as Full access | A for 7a and 7b; a table when 7d needs rows | No migration, installation-wide, and nothing existing reads the key. Built as A. |
| 2 | May the person's mode override a stricter file | A. Yes, either way. B. The file may only be made stricter | A | Both values stay inside the chain the file allowed, and E4 says the file holds defaults. Built as A. |
| 3 | Who may change things from the page: the mode now, keys from 7d | A. The administrator at the computer. B. Also the administrators of a sign-in deployment. C. Nobody: the file only | A | B lets a remote session change a setting, and write a key, through a tunnel the peer check cannot see. C keeps the panel from existing. Built as A for the mode; everyone else can read the page. |
| 4 | The vault's key, for the panel | A. Refuse to store while it is the example key. B. Store with a warning. C. Build the re-seal tool of D39 first | A now, and C as its own slice | Under the example key a stored key is not private and a forged assertion could release it. Older installations stay on the file route until C. |
| 5 | The last four characters of a key | A. Show them for a key of 24 characters or more. B. The date only | A | It helps tell two keys apart and costs little on a long key. B is the cautious choice and nothing breaks if it is chosen. |
| 6 | A lost "off" switch (7c), and a Test that calls the provider | A. Fall back to the file's values and say so. B. Run only the first engine until the choices are readable. And: A. Test is local only. B. An opt-in check for a free gateway | A and A | A lost choice returns to what the installation set; B costs a working team over a corrupt row. A provider check can bill or count a request, and no free call works on every gateway. |
| 7 | How a key reaches the agent | A. On demand, inside a live run. B. Only through `env:` or `file:` as today | A | B means no panel. A keeps the key out of runs, files and logs; failure is closed. |
| 8 | The credential kind | A. A new `engine` kind (a migration). B. Reuse `model` | A | `model` has another meaning and its route is closed on purpose. |
| 9 | Text that tells a member the page exists | A. Leave it. B. Add a sentence to each member's prompt | A | B changes what a model reads: it needs the team evals before it ships. |
