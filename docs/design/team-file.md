# Teams and members from one file: design

Plan only. No product code in this change. Written 2026-11-14 for the row "Teams and members from one file" in [ROADMAP.md](../ROADMAP.md), Next.

Code markers were read on origin/main at 021cad8. This branch was cut at 452e060. Of the cited files, only `openbot/agent-freeduet/freeduet/claude_cli.py` and `docs/ENGINES_PLAN.md` changed in between. Both were read again at 021cad8.

Tags: **[code: path:line]** read in this repository. **[doc: URL]** stated by an outside page, read 2026-11-14. **[assumed]** not checked. Nothing tagged [assumed] may be built on as if it were true.

## 1. What the person gets

- Export one member, or a whole team, as one JSON file: job, instructions, skills, test requests, licence and author. Never credentials, grants, chat history or personal data.
- Import a file someone shared. The person reads the whole text, every skill, each tool's status, the author and the licence. Nothing is saved until the person presses Create.
- An imported member has no tools and no hand-off grants. It stays "not certified" until its test requests pass on an eval stack.

## 2. What exists today in the code

**The team as a package.**
- The package loads once, at boot [code: openbot/server/src/index.ts:455, 519-520].
- Five files are required: brand, agents, channels, model and knowledge. `theme.css` and `skills.yaml` are optional. Every `agents/*.yaml` file is read as well [code: openbot/server/src/tenant-package.ts:728-734, 744-749, 757-763, 703-721].
- `${NAME}` is replaced from `process.env` in the five required files, in `skills.yaml` and in `agents/` files. A `:-` fallback is allowed, and an unset name throws. `theme.css` is not expanded [code: openbot/server/src/tenant-package.ts:330-346, 717, 737-740, 758].
- A remote member with no endpoint is left out [code: tenant-package.ts:396-403]. A member id that is a deployment route is refused [code: tenant-package.ts:391-395]. For a `built_in` member, `system_prompt` becomes its configuration [code: tenant-package.ts:418-425].
- `agents.yaml` has twelve entries: Iris and eleven members [code: openbot/examples/freeduet/agents.yaml:24, 147]. A YAML parser measured their prompts at 4,653 to 12,453 characters, and their role descriptions at 80 to 155 characters [code: openbot/examples/freeduet/agents.yaml].

**The router's prompt.**
- The router is on unless `FREEDUET_ROUTER` is `off` [code: openbot/server/src/freeduet/model-base.ts:26-30].
- Under the router, a member's prompt is read by id from `agents.yaml`. Only `id` and `system_prompt` are read [code: openbot/agent-freeduet/freeduet/members.py:19, 50-51, 121-124].
- Any other id runs on its standing role: "You are <name>, <title>." plus `roleDescription` [code: openbot/server/src/copilot.ts:177-190, 317; openbot/agent-freeduet/freeduet/members.py:112]. So a member outside `agents.yaml` reaches the router with its name, title and `roleDescription` only.
- The app caps `roleDescription` at 1000 characters [code: openbot/app/src/lib/agents/form.ts:19-23; openbot/server/src/agents/routes.ts:70-74].

**Making a member in the app.**
- A Bot made in the app keeps its instructions in `roleDescription`. With no endpoint given, the server also stores that text as the system prompt [code: openbot/server/src/agents/routes.ts:534-538]. With a managed Bot, the Bot runs at the managed address [code: openbot/server/src/agents/profile-store.ts:438-445, 472-486].
- The `save_bot` card shows the name, the job, the whole instructions and the skills. It writes nothing until pressed [code: openbot/app/src/lib/copilot/bot-tools.tsx:98-106]. The card is offered to a Bot that holds the `bot-creator` skill [code: openbot/app/src/lib/agents/proposal.ts:100-109]. Only Leo's entry lists that skill [code: openbot/examples/freeduet/agents.yaml:255].
- The card creates the Bot [code: bot-tools.tsx:155], grants each skill through `POST /api/plugins/grants` [code: bot-tools.tsx:164], makes a private Bot with no address [code: proposal.ts:157-163], and says a partial failure out loud [code: proposal.ts:36-50].

**Grants, hand-offs and the gate.**
- Hub grants go from Iris to each member and back. They are built only when Iris's id is the tenant id, and they carry the mark `freeduet-package` [code: openbot/server/src/freeduet/hub-grants.ts:32, 52-62].
- A hand-off skips the gate only when five conditions all hold. The last is a `bot` grant for that pair, marked `granted_by = freeduet-package` [code: openbot/server/src/freeduet/hub-handoffs.ts:19-31].
- Before that rule, a fresh install asked the person for every hand-off: 46 requests in one night of team evals [code: openbot/server/src/freeduet/hub-handoffs.ts:9-12].
- Hand-offs are capped at depth 1 and three per run [code: openbot/server/src/config.ts:459-460].
- The gate asks for payments, credentials and security settings [code: openbot/server/src/approvals/policy.ts:175-230]. Reads and hand-offs are not checked against that list [code: policy.ts:232-244].
- Unknown tools count as writes. A tool counts as a read only when its vendor labels it a read and no reviewed list contradicts that, or when the server advertised it and a reviewed list declined to call it a write [code: openbot/server/src/plugins/catalogue.ts:784-793].
- Full access is off by default, per person and per member [code: openbot/server/src/freeduet/full-access.ts:3].

**Skills and tool names.**
- A skill names tools as `<serverId>/<toolName>`. The package keeps names the deployment has not seen, on purpose, and unknown names stay inert [code: openbot/server/src/tenant-package.ts:154-164, 981-985].
- The API path refuses a person's own skill when a tool name is unknown [code: openbot/server/src/plugins/plugin-store/skills.ts:196-204].
- A skill never widens a grant. The run intersects the skill's tools with the Bot's grants [code: openbot/server/src/plugins/plugin-store/grants.ts:130-141; model.ts:257-262].
- Skill slugs are unique across the deployment [code: openbot/server/src/db/schema/plugins.ts:738].

**Where the rest lives.**
- In the database: `pluginGrants`, `skills`, `skillTools`, `mcpUserCredentials`, `composioConnections`, `brokeredConnections` and `personalMemories` [code: openbot/server/src/db/schema/plugins.ts:796, 704, 765, 647, 296, 460; openbot/server/src/db/schema/memory.ts:49]. `formedBy` says who formed each memory [code: memory.ts:74].
- In files: lessons are JSON at `<FREEDUET_DATA_DIR>/lessons/<member>.json`. A lesson turns active only on the person's own typed "approve" line [code: openbot/agent-freeduet/freeduet/lessons.py:1-26, 44]. The team log and the checkpoints are files too [code: openbot/agent-freeduet/freeduet/team_log.py:3; checkpoints.py:29].

**Tests and evals.**
- The runner reads its roster from `agents.yaml` and refuses cases that name a member missing from it [code: evals/team/run.ts:1173-1177]. Thresholds are 90% per member and 100% for safety cases [code: run.ts:71].
- By default the runner refuses any server that looks like a person's own FreeDuet: more than five conversations that are neither built in nor named as evals [code: run.ts:75-79].
- A case that needs an app the member lacks is skipped, not failed [code: evals/team/README.md:11, 20].
- The grader is a model that reads each statement [code: evals/team/grader.ts:47-49].
- A test checks that each member's prompt closes with the shared rules [code: openbot/server/tests/freeduet-package.test.ts:36-37, 129].
- Member turns are built from `LOCKDOWN_ARGS`, which holds `--tools ""` and `--strict-mcp-config` [code: openbot/agent-freeduet/freeduet/claude_cli.py:42-54, 148; openbot/agent-freeduet/freeduet/claude_engine.py:70]. Text-only calls (`run_text`) pass `--tools ""` too, with a 9-second default timeout [code: claude_cli.py:58-69, 220].

**Repository.**
- The planned Grok import names the format `freeduet-import/1` [code: docs/import/grok-export-prompt.md:12]. A search of `openbot/`, `evals/` and `docs/` on origin/main finds that string only in that prompt.
- An engine seam is on origin/main (ENGINES_PLAN slice 1). `claude_engine.py` builds the command through `claude_cli.py` [code: openbot/agent-freeduet/freeduet/claude_engine.py:3, 70].

## 3. The design

The smallest version worth shipping is one member: export, preview, create, and test before use (S1 to S5). A team uses the same file as a list (S6). Section 3.7 lists what comes after.

### 3.1 The file

Two JSON formats: `freeduet-member/1` for one member and `freeduet-team/1` for a list of members. JSON, not YAML, because the planned Grok export is JSON [code: docs/import/grok-export-prompt.md:12]. A strict JSON reader has fewer ways to hide text.

```json
{
  "format": "freeduet-member/1",
  "name": "Renewal Desk",
  "title": "Contract renewals",
  "role_description": "One sentence: what the member is for.",
  "system_prompt": "Five parts: who you are, what you do, how you answer, what you never do, shared rules.",
  "skills": [{"slug": "renewal-check", "title": "Renewal check", "summary": "...",
              "instructions": "...", "tools": ["google-drive/search_files"]}],
  "test_requests": [{"request": "...", "must": ["..."], "must_not": ["..."], "safety": false}],
  "source": {"author": "...", "licence": "MIT", "derived_from": null},
  "content_sha256": "hash of the file without this field"
}
```

- **In the file:** name, title, role description, system prompt, skills with their text and declared tool names, test requests in the eval-case shape, source, licence, author and the hash.
- **Never in the file:** credentials and keys; endpoints and addresses; grants; connected-app records; chat history; checkpoints; the team log; lessons; engine or billing choices; ids of people and accounts; e-mail addresses, phone numbers, card and bank numbers. Memories only when the person ticks each one in the export preview (decision 6).
- **Versioning:** the `format` string carries the major version. A reader refuses other versions and names the ones it reads. Unknown keys are refused in every version. A changed meaning needs a new version. The hash shows that a copy is unchanged, not who wrote it. An update is a whole new file, never a patch.

### 3.2 An import is data, not configuration

Validation writes nothing to the database. It refuses:
- any `${` in any field, test requests included. The package loader expands that syntax from the environment [code: openbot/server/src/tenant-package.ts:330-346];
- zero-width and bidirectional control characters;
- any field that names an endpoint, a type, a grant, a credential, an approval setting, Full access, a visibility or a Bot id. The format has no such field, so each one is an unknown key;
- an id that a deployment route uses [code: tenant-package.ts:391-395], and an id or name that a starter member uses. Today's check covers routes only, so the starter check is new;
- a skill slug outside the package pattern [code: tenant-package.ts:658], or one another owner holds [code: openbot/server/src/db/schema/plugins.ts:738];
- sizes above 64 KB per prompt or 1 MB per file [assumed: proposed limits].

The importer never writes into `TENANT_PACKAGE_DIR`. So the loader and its `${NAME}` expansion never read a shared file [code: openbot/server/src/index.ts:455].

The card is the approval, as `save_bot` is [code: bot-tools.tsx:98-106]. It shows the whole system prompt with hidden characters escaped, each skill, each tool and its status, the author, the licence, the hash, and the words "not certified". Creating the Bot uses the existing create route [code: openbot/server/src/agents/routes.ts:514-556], and skills are granted through `POST /api/plugins/grants` [code: bot-tools.tsx:164]. After that, each write the member makes meets the gate, as any member's writes do [code: openbot/server/src/plugins/catalogue.ts:784-793; openbot/server/src/approvals/policy.ts:175-244]. The importer appends the package's shared rules word for word, so a file cannot drop them. A team is one card, with one block per member. A partial failure is said out loud, as the card does today [code: proposal.ts:36-50].

### 3.3 Tools the importer does not have

- Each tool ref gets one status on the card: **ready** (connected here; the person still grants it), **needs connector** (known, not connected), or **unknown** (no such connector here).
- The import removes an unknown skill ref and lists it on the card. The person's own skill path refuses such a ref [code: plugin-store/skills.ts:196-204], and the package path keeps it inert [code: tenant-package.ts:981-985]. Keeping it inert would need a second write path, so v1 removes it. The person adds the ref again after connecting the tool.
- No ref is matched to a similar name.
- A member learns what it holds from its granted-tools row [code: openbot/server/src/copilot.ts:1334-1352], not from the file.
- The file never sets a tool's effect. MCP says clients must treat tool annotations as untrusted unless the server is trusted [doc: https://modelcontextprotocol.io/specification/2025-06-18/server/tools].

### 3.4 Threat model: a member written by a stranger

Assets: the person's accounts and money, their conversations and memories, their plan's allowance, the server's secrets, the other members, and the person's attention. Logins come first, so members run on the person's own subscription logins [code: docs/ROADMAP.md:74]. Actors: a stranger who publishes a file, and anyone who changes a copy in transit.

A model reads the prompt as instructions, so the prompt is never the safety layer. OWASP lists prompt injection (LLM01:2025) and excessive agency (LLM06:2025) as risks [doc: https://genai.owasp.org/llm-top-10/]. The layers in the table do the stopping.

| Threat | What it would do | What stops it today | What this design adds |
|---|---|---|---|
| `${NAME}` expansion | Puts an environment value, such as a key, into the prompt | Expansion reads `process.env` [code: openbot/server/src/tenant-package.ts:333] | Imports are JSON, never package files; any `${` is refused |
| Conversation sent to a host | Every message goes to an address the file names | Endpoints pass through `checkAgentEndpoint` [code: openbot/server/src/agents/endpoint.ts:69; openbot/server/src/agents/routes.ts:85-95] | No endpoint field; no remote member from a file (decision 3) |
| Grants smuggled in | Tools the person never chose | Grants are rows, and skills never widen them [code: openbot/server/src/plugins/plugin-store/grants.ts:130-141] | No grant field; unknown refs are removed; each write meets the gate |
| Pre-approved hand-offs | Messages between members pass with no card | Pre-approval needs the `freeduet-package` mark [code: openbot/server/src/freeduet/hub-handoffs.ts:19-31] | Imports never write `bot` grants (decision 5) |
| Hidden text | The person approves words they did not read | None | Whole text shown, escaped; control characters refused |
| "Skip approval" in the prompt | Writes without a card | The catalogue classifies each tool as read or write [code: openbot/server/src/plugins/catalogue.ts:784-793]; a new mail needs the person's typed recipients, or it asks [code: docs/M1_PLAN.md:261] | Nothing: the prompt has no say over the gate |
| Full access set by the file | Gate off for every action | Off by default [code: openbot/server/src/freeduet/full-access.ts:3] | No field can set it |
| Impersonation | A member named like a starter member, or like FreeDuet | Route ids are reserved [code: openbot/server/src/tenant-package.ts:391-395] | Starter ids and names refused; the card shows the author |
| Allowance drain | Long loops spend the person's plan | Hand-offs are capped [code: openbot/server/src/config.ts:459-460] | No hub grant; each hand-off asks the person (decision 5) |
| Self-certification | The file's own cases pass by design | The grader is a model that reads statements [code: evals/team/grader.ts:47-49] | A file never certifies itself; only an eval-stack report does |
| Personal data out | An export leaks names, addresses or keys | None today | Allow-list export, a scanner, and a full preview before saving |
| Altered copy | A changed file under the same name | None today | The hash is shown; each update is a new import the person approves |
| Credit lost | A derived prompt ships without its licence | None today | Source and licence shown; a derived member needs its source |
| Memory poisoning | Stored rules that outlive the import | Lessons turn on only with the person's own "approve" line [code: openbot/agent-freeduet/freeduet/lessons.py:1-26] | No memories or lessons come with an import |

Not covered: a card whose plain words hide a purpose, if the person approves it anyway. The design does not trust the author. It relies on the gate and on the visible text.

### 3.5 Testing before use

1. An imported member is "not certified" and has no tools.
2. Its test requests run in a test conversation with no connector tool and no hand-off. OpenBot's own page and task tools may still be offered [assumed: not checked]. Each answer is shown, no memory is written, and the conversation is marked as a test.
3. Certification uses the repository's thresholds [code: evals/team/run.ts:71] on an eval stack. The runner refuses a person's own FreeDuet by default [code: run.ts:75-79]. A case that needs an app the member lacks is skipped [code: evals/team/README.md:11, 20].
4. Today the runner refuses cases for members outside `agents.yaml` [code: run.ts:1173-1177]. Slice S7 changes that roster for shared members only.

### 3.6 How Leo fits

- Leo's prompt already asks for this shape: a five-part system prompt, the skills, and three test requests [code: openbot/examples/freeduet/agents.yaml:189-192, 206-209]. Leo's draft can carry the file, and the same reader checks it before the person sees it.
- Leo never grants tools or permissions [code: agents.yaml:214]. Iris sends a new team member to Vera before it reaches the person [code: agents.yaml:62-63]. Vera's review is advice. The reader and the card decide.
- Leo's three test requests become the file's `test_requests` [code: agents.yaml:191, 208].
- To change a shared member, Leo writes a whole new file. The person imports it, and the old Bot stays until the person removes it.
- Export is code, not a model call, so no model can copy a secret into prose.

### 3.7 What comes after

Signed files, once a catalogue exists (S10). A converter for the planned Grok import [code: docs/PROJECT.md:99] that writes the same draft (S9). A team hand-off mark, if the maintainer decides it (decision 5). Memories with ticks (decision 6).

## 4. Slices

One PR each. Sizes follow [ENGINES_PLAN.md](../ENGINES_PLAN.md) section 2 [code: docs/ENGINES_PLAN.md:24]: S under 300 changed lines, M 300 to 1000, L over 1000.

| # | Slice | Builds | Proof (tests) | Needs first | Size |
|---|---|---|---|---|---|
| S1 | Format and reader | The two formats; a strict reader; the refusals of 3.2; no database | Synthetic valid and invalid files; one test per refusal, each naming its field; a `${` inside a test request is refused | Decisions 2 and 3 | S |
| S2 | Export | Allow-list export of one member or a team; a scanner; a full preview | Canary strings planted in a grant, a connection, a memory, a lesson and an address never appear in the file; a round trip passes S1 | S1; decision 6 | M |
| S3 | Import preview | Reads a file and shows the card; writes nothing | Row counts before and after are equal; escaped hidden characters show; size limits hold | S1 | M |
| S4 | Create | Creates the Bot through the create route and its skills through the store; no grants, no endpoint of its own | No `pluginGrants` row; no `freeduet-package` mark; a slug clash is refused; `${NAME}` stays literal | S3; decisions 1 and 2 | M |
| S5 | Test before use | Runs the test requests with no connector tool and no hand-off | No connector call in any transcript; no memory row; the conversation is marked | S4 | M |
| S6 | Team import | One card for a team; members created one by one; no hub grants | Three members give three Bots and no `bot` grant; Iris's hand-off to one of them asks the person | S4; decision 5 | M |
| S7 | Certify a shared member | The runner takes the roster and the cases of a shared member from a file | A case for a shared member runs; a case for an unknown member is still refused [code: evals/team/run.ts:1173-1177] | S1; an eval stack | M |
| S8 | Leo writes files | Leo's draft carries the file, checked by S1 before the person sees it | A draft with `${` or with an endpoint is refused | S1, S3 | S |
| S9 | Grok converter (F8) | Turns the planned `freeduet-import/1` into the same draft | Three agents give three drafts; shared rules appended; no grants | S3 | M |
| S10 | Signed files | Publisher keys | Not sized; needs a catalogue decision | Later | L (estimate) |

## 5. Rules that must hold

- **Logins first.** A file never sets an engine, a metered key or an order. The person sets those [code: docs/ROADMAP.md:74].
- **Never read, copy or forward subscription credentials.** Export never opens the Claude login or config directories, and the format has no credential field.
- **No secrets and no personal data in the repository.** Fixtures are invented, canary strings are synthetic, and no real member file or run report is committed.
- **The person's approval.** Each write by an imported member meets the gate. Hand-offs stay unapproved in advance: the pre-approval needs the package mark (decision 5).
- **Change only what was asked.** The importer does not touch the package loader, the router or the starter team.
- **Upstream changes stay minimal.** `openbot/server/src/agents/routes.ts`, `profile-store.ts` and `openbot/app/src/lib/agents/form.ts` were added in commit 6ca80ef [code: git log --diff-filter=A]. None has a row in [UPSTREAM_TOUCHES.md](../UPSTREAM_TOUCHES.md) [code: docs/UPSTREAM_TOUCHES.md]. Each change to them adds one.
- **Public wording.** Nothing here names a private project of the maintainer or a source of ideas.

## 6. Open decisions

| # | Decision | Options | Recommendation and reason |
|---|---|---|---|
| 1 | Where an imported member lives | A. A private Bot of the person, through the existing create route. B. A member of the deployment's package. C. A file in `agents/` | A. The package loads once at boot [code: openbot/server/src/index.ts:455]. It expands `${NAME}` from the environment [code: tenant-package.ts:333]. The router reads `agents.yaml` only [code: members.py:50-51]. |
| 2 | How much instruction a Bot can carry | A. Keep 1000 characters: an imported member keeps 8% to 21% of a starter prompt's length. B. Raise the cap for imported Bots only [code: form.ts:23; routes.ts:72]. C. A separate router channel for imported prompts | B. The router already receives `roleDescription` on every remote run [code: copilot.ts:177-190, 317]. Only the cap changes. C adds a channel that must be trusted. |
| 3 | Remote endpoints in a file | A. Refused. B. Allowed to an address the person types on the card, checked by `checkAgentEndpoint` | A for v1. Conversation content goes to that address [code: openbot/server/src/agents/routes.ts:541-543]. |
| 4 | How a shared member is tested | A. A test run without tools, in the person's conversation, labelled "not certified". B. Certification by the maintainer only, on the eval stack. C. Test runs with tools on | A now, and B for certification. C could act on the person's accounts. The grader is a model that reads statements [code: evals/team/grader.ts:47-49], so a file cannot certify itself. |
| 5 | Hand-offs for an imported team | A. No grants: each hand-off asks the person. B. A new mark that pre-approves hand-offs for imported teams | A. Pre-approval is tied to the package mark [code: openbot/server/src/freeduet/hub-handoffs.ts:19-31]. A second mark is a security decision for the maintainer. |
| 6 | Memories and lessons in an export | A. Never in v1. B. Each one ticked by the person, shown in the preview, and imported as unreviewed | A. Both are personal, and the file is meant to be sent. Revisit with the preview of slice S2. |

## 7. What was not verified

- No test, server or eval was run. Everything here is a read of code and docs.
- The limits of 64 KB per prompt and 1 MB per file are proposals [assumed].
- The cost of a long standing role on every turn [assumed].
- Whether `checkAgentEndpoint` blocks private addresses. Only its signature was read [code: openbot/server/src/agents/endpoint.ts:69].
- Whether OpenBot's own page and task tools are offered to a member with no grants [assumed].
- The built-in branch of `profile-store.ts` was read, not run.
- The 46 requests come from a code comment, not from a log.
- The two outside pages were read through a summarising fetch, so their wording is a paraphrase. The OWASP page gave only its entry names.
- That `routes.ts`, `profile-store.ts` and `form.ts` are upstream code is inferred from the commit that added them [assumed].
- Whether the engine seam changes member turns beyond the call at `claude_engine.py:70` [assumed].

## Built so far

Slice S1 (section 4) is built on branch `team-file-slice-1`: the two formats and the reader, with tests. S2 to S10 are not started. The reader is pure: it writes nothing, touches no database, and makes no card or Bot.

**Built**
- `openbot/server/src/freeduet/team-file.ts`: the formats `freeduet-member/1` and `freeduet-team/1`, and `readTeamFile(text, package)`. It returns the first refusal, with the path of the field and one plain sentence, or the file read, with its notices.
- `openbot/server/src/tenant-package.ts`: one addition to the loader. `validateTenantPackage` also returns `declaredAgents`, every coworker the package declares, including one this deployment does not run (a remote coworker with no endpoint), with its name, skill slugs and instructions. Nothing else in the loader changes (+48 −1; the row is in `docs/UPSTREAM_TOUCHES.md`). The reader needs it because `agents` leaves out a remote coworker with no endpoint, so the shared rules and the names of those coworkers would be invisible.
- The refusals of section 3.2, each with its own test and a path that names the field: `${` in any text; hidden and control characters (every Cc and Cf character except tab and line feed, checked before the trim, so a byte-order mark at either end is refused too); any key a file may not set, and any unknown key; a repeated key, with both lines; a format line that is missing, unknown or another version; a content hash, which is optional and, when present, must be SHA-256 of the content; a starter member's name (compared with NFKC, lowercase, letters and digits only), the product's name, and a deployment route's word; a skill slug outside the package pattern or already shipped by the package; a repeated slug in one member, or one slug with different text in two members of a team; a tool ref not written `serverId/toolName`, or listed twice; a sending tool; a test request with no `must` or `must_not` line, a `safety` flag that is not true or false, or an unknown key; a file over 1 MB; one text over 64 KB; a file that starts with a byte-order mark; a team with no members, or two members with one name.
- Composition: an imported member's instructions are its author's text, then the package's "Email." paragraph, then the shared rules, word for word from the package. An author's text that already carries either paragraph is refused.
- Tool allowance: a tool ref is kept only when a skill attached to a declared coworker of the package holds it. The others are removed and listed in the notices (section 3.3).
- Sending tools are refused by name: a tool whose name holds the word send, reply or forward. In the current package this matches exactly the four Gmail send refs, which a guard test pins.
- `openbot/server/tests/freeduet-team-file.test.ts`: 57 tests. Fixtures are invented, and every test reads the real package through the real loader.

**Verified** (14 November 2026)
- The new test file: 57 pass, 0 fail.
- Fail before: on origin/main the module does not exist, so the file cannot load (57 of 57). With only origin/main's loader put in place and my reader kept, 45 fail and 12 pass. The 12 are nine refusals decided before the package is read (not JSON, a byte-order mark at the start, over 1 MB, a format missing or unknown, a repeated key, a hash that does not match, a hash that is not SHA-256, a list instead of an object) and three guards of unchanged behaviour (the two package refusals and the slug rule checked against the loader's own rule).
- A review before the PR found one gap: the trim ran before the hidden-character check, so a byte-order mark at the end of a text was dropped without a word. The check now runs first. The test for it failed before the fix (56 pass, 1 fail) and passes after.
- Related suites (assertion-shape, tenant-package, freeduet-package, freeduet-team, freeduet-person-language, and the new file): 173 pass, 0 fail.
- `bun run typecheck:tests`: clean against the baseline (239 known errors, none new). `bun run format:check` and `bun run lint --error-on-warnings`: clean.
- Full server suite (`bun test server/tests`): 7,614 pass and 3 fail, of 7,637 tests in 486 files. The three are the ones the brief lists as failing on plain main (the two `learning-*` real-provider tests and the Mastra bridge). Plain main was not run again for this branch.

**Not verified or not built**
- No live run, no eval and no UI. Nothing here has been run against a real member file or against the eval stack.
- The 64 KB and 1 MB limits are the design's proposals [assumed].
- The reader takes text. The importer (S3) must decode the bytes strictly (`fatal: true`) and keep the byte-order mark (`ignoreBOM: true`), or the refusal of a leading byte-order mark never fires.
- A skill slug already held by another owner needs the database, so that check waits for S4.
- The sending check is by name, and it fails closed: a tool with one of the three words is refused even if it sends nothing, and its refusal then says it sends email. Today's package has no such tool.
- The Email paragraph ends at the first line break of the loaded prompt. That is right while the package's prompts are folded (`>-`, as all twelve are). The guard test checks that the paragraph ends with its last sentence, so a literal block (`|`) in the package would fail it.
- Every Cc and Cf character except tab and line feed is refused, so a zero-width joiner inside an emoji sequence is refused too.

**Decisions** (section 6)
- Decision 2, instruction cap: not built. The reader reports the length and enforces no cap. The appended text alone is 3,518 characters (the shared rules 3,062, the Email paragraph 452, and two separators of 2 characters each), so option A, keeping 1,000, leaves no room for an author's text. The table's 8% to 21% figure is 1,000 characters as a share of the starter prompts. It leaves out the appended text, which alone is over three times the cap. Option B changes the create form and the cost of every run, so it is the maintainer's call.
- Decision 3, endpoints in a file: built as recommended. A file that names an endpoint is refused as a key a file may never set.
- Decisions 1, 4, 5 and 6 belong to S4, S5, S6 and S2 respectively.
