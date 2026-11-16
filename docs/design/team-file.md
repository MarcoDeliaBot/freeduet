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
- sizes above 64 KB per prompt or 1 MB per file [assumed: proposed limits];
- an imported member's instructions above 10,000 characters, counted in UTF-16 code units, the instructions being the author's text with the Email paragraph and the shared rules added (decision 2, decided 14 November 2026 at 8,000 and raised to 10,000 on 16 November 2026; built, see "Built so far").

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
- **The person's approval.** Each write by an imported member meets the gate. Hand-offs stay unapproved in advance: the pre-approval needs the package mark (decision 5). Decided 14 November 2026: send tools are never recognised by name; an explicit list names them, and everything else asks.
- **Change only what was asked.** The importer does not touch the package loader, the router or the starter team.
- **Upstream changes stay minimal.** `openbot/server/src/agents/routes.ts`, `profile-store.ts` and `openbot/app/src/lib/agents/form.ts` were added in commit 6ca80ef [code: git log --diff-filter=A]. None has a row in [UPSTREAM_TOUCHES.md](../UPSTREAM_TOUCHES.md) [code: docs/UPSTREAM_TOUCHES.md]. Each change to them adds one.
- **Public wording.** Nothing here names a private project of the maintainer or a source of ideas.

## 6. Open decisions

| # | Decision | Options | Recommendation and reason |
|---|---|---|---|
| 1 | Where an imported member lives | A. A private Bot of the person, through the existing create route. B. A member of the deployment's package. C. A file in `agents/` | A. The package loads once at boot [code: openbot/server/src/index.ts:455]. It expands `${NAME}` from the environment [code: tenant-package.ts:333]. The router reads `agents.yaml` only [code: members.py:50-51]. |
| 2 | How much instruction a Bot can carry | A. Keep 1000 characters: an imported member keeps 8% to 21% of a starter prompt's length. B. Raise the cap for imported Bots only [code: form.ts:23; routes.ts:72]. C. A separate router channel for imported prompts | Decided 14 November 2026: B, at 8,000 characters for imported Bots only, raised to 10,000 on 16 November 2026; other Bots keep their limit. B. The router already receives `roleDescription` on every remote run [code: copilot.ts:177-190, 317]. Only the cap changes. C adds a channel that must be trusted. |
| 3 | Remote endpoints in a file | A. Refused. B. Allowed to an address the person types on the card, checked by `checkAgentEndpoint` | A for v1. Conversation content goes to that address [code: openbot/server/src/agents/routes.ts:541-543]. |
| 4 | How a shared member is tested | A. A test run without tools, in the person's conversation, labelled "not certified". B. Certification by the maintainer only, on the eval stack. C. Test runs with tools on | A now, and B for certification. C could act on the person's accounts. The grader is a model that reads statements [code: evals/team/grader.ts:47-49], so a file cannot certify itself. |
| 5 | Hand-offs for an imported team | A. No grants: each hand-off asks the person. B. A new mark that pre-approves hand-offs for imported teams | A. Pre-approval is tied to the package mark [code: openbot/server/src/freeduet/hub-handoffs.ts:19-31]. A second mark is a security decision for the maintainer. |
| 6 | Memories and lessons in an export | A. Never in v1. B. Each one ticked by the person, shown in the preview, and imported as unreviewed | A. Both are personal, and the file is meant to be sent. Revisit with the preview of slice S2. |

**Decision 2 is decided (14 November 2026): option B, for imported members only, at 8,000 characters, raised to 10,000 on 16 November 2026.** Every other limit and every other path keeps its size. The checker is built; the layers that still refuse are listed under "Built so far".

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

Slice S1 (section 4) is on main, merged through PR #174: the two formats and the reader, with tests. S2 to S10 are not started. The reader is pure: it writes nothing, touches no database, and makes no card or Bot.

**Built**
- `openbot/server/src/freeduet/team-file.ts`: the formats `freeduet-member/1` and `freeduet-team/1`, and `readTeamFile(text, package)`. It returns the first refusal, with the path of the field and one plain sentence, or the file read, with its notices.
- `openbot/server/src/tenant-package.ts`: one addition to the loader. `validateTenantPackage` also returns `declaredAgents`, every coworker the package declares, including one this deployment does not run (a remote coworker with no endpoint), with its name, skill slugs and instructions. Nothing else in the loader changes (+48 −1; the row is in `docs/UPSTREAM_TOUCHES.md`). The reader needs it because `agents` leaves out a remote coworker with no endpoint, so the shared rules and the names of those coworkers would be invisible.
- The refusals of section 3.2, each with its own test and a path that names the field: `${` in any text; hidden and control characters (every Cc and Cf character except tab and line feed, checked before the trim, so a byte-order mark at either end is refused too); any key a file may not set, and any unknown key; a repeated key, with both lines; a format line that is missing, unknown or another version; a content hash, which is optional and, when present, must be SHA-256 of the content; a starter member's name (compared with NFKC, lowercase, letters and digits only), the product's name, and a deployment route's word; a skill slug outside the package pattern or already shipped by the package; a repeated slug in one member, or one slug with different text in two members of a team; a tool ref not written `serverId/toolName`, or listed twice; a sending tool; a test request with no `must` or `must_not` line, a `safety` flag that is not true or false, or an unknown key; a file over 1 MB; one text over 64 KB; a file that starts with a byte-order mark; a team with no members, or two members with one name.
- Composition: an imported member's instructions are its author's text, then the package's "Email." paragraph, then the shared rules, word for word from the package. An author's text that already carries either paragraph is refused.
- The instruction limit (decision 2, decided 14 November 2026): `TEAM_FILE_LIMITS.instructionsCharacters` is 10,000 for an imported member's instructions (8,000 until 16 November 2026), which are the composed text above, counted in UTF-16 code units (`String.length`, as every other limit here). Above 10,000 the file is refused at `system_prompt` (or `members[n].system_prompt`), and the sentence names the limit and how many characters to cut. From 1,001 to 10,000 the file is read, with a notice that FreeDuet's create and edit screens and its server still take 1,000 for a Bot's text, so the member cannot be created or edited yet. `TEAM_FILE_LIMITS.createTextCharacters` (1,000) names that layer's limit and is not changed here. No upstream file changed, so no row is added to `docs/UPSTREAM_TOUCHES.md`.
- Tool allowance: a tool ref is kept only when a skill attached to a declared coworker of the package holds it. The others are removed and listed in the notices (section 3.3).
- Sending tools are refused by name: a tool whose name holds the word send, reply or forward. In the current package this matches exactly the four Gmail send refs, which a guard test pins.
- `openbot/server/tests/freeduet-team-file.test.ts`: 64 tests (57 from slice S1, one of them rewritten for decision 2, and seven for the limit: six from 14 November 2026 and the margin test of 16 November 2026). Fixtures are invented, and every test reads the real package through the real loader.

**Verified** (14 November 2026)
- The new test file: 57 pass, 0 fail.
- Fail before: on origin/main the module does not exist, so the file cannot load (57 of 57). With only origin/main's loader put in place and my reader kept, 45 fail and 12 pass. The 12 are nine refusals decided before the package is read (not JSON, a byte-order mark at the start, over 1 MB, a format missing or unknown, a repeated key, a hash that does not match, a hash that is not SHA-256, a list instead of an object) and three guards of unchanged behaviour (the two package refusals and the slug rule checked against the loader's own rule).
- A review before the PR found one gap: the trim ran before the hidden-character check, so a byte-order mark at the end of a text was dropped without a word. The check now runs first. The test for it failed before the fix (56 pass, 1 fail) and passes after.
- Related suites (assertion-shape, tenant-package, freeduet-package, freeduet-team, freeduet-person-language, and the new file): 174 pass, 0 fail, on the tree merged with origin/main.
- `bun run typecheck:tests`: clean against the baseline (239 known errors, none new). `bun run format:check` and `bun run lint --error-on-warnings`: clean.
- Full server suite (`bun test server/tests`) on the tree merged with origin/main: 7,743 pass and 4 fail, of 7,767 tests in 489 files. Three of the failures are the ones known to fail on plain main (the two `learning-*` real-provider tests and the Mastra bridge). The fourth is a concurrency test in `arcade-verify.test.ts` that passed when its file ran alone (2 of 2) and that no code in this slice touches. Plain main was not run again for this branch.
- Type check on the same tree: `bun run typecheck:tests` clean against the baseline, 239 known errors, none new. One earlier run was killed by the machine's memory limit, and the script then printed a clean result with zero known errors, because it does not treat empty output as a failure. That result is not counted here.

**Verified for the 8,000 limit** (14 November 2026)
- `bun test freeduet-team-file`: 63 pass, 0 fail (199 expect calls, about a second, no database).
- The same test file against main's `team-file.ts`: 57 pass, 6 fail. The six are the rewritten S1 test ("accepts instructions over the create limit, and says the create and edit screens still refuse them"), the test that pins 8,000 and 1,000 as constants, the test for exactly 8,000 characters with an emoji at the edge, the refusal at one code unit over 8,000 (a text of 8,000 code points), the refusal at one plain character over, and the refusal inside a team. The guard "a Bot made in the app is still refused at 1,001 characters" passes on both, as a guard of unchanged behaviour should.
- Biome format and lint clean on the two changed files. `bun run typecheck:tests` clean against the baseline (239 known errors, none new).
- Related suites, by path: `assertion-shape`, `freeduet-team-file`, `freeduet-package`, `freeduet-team`, `freeduet-person-language`, `freeduet-person-language-capabilities` and `agent-routes`: 178 pass, 0 fail. `tenant-package.test.ts` was not run: it opens a database when it loads (`TEST_DATABASE_URL`), and this change touches neither the loader nor that file (the reader imports only its types from the loader).

**Not verified or not built**
- No live run, no eval and no UI. Nothing here has been run against a real member file or against the eval stack.
- No create, edit or run of an imported member above 1,000 characters. The layers below are read from code. The refusal is pinned only by the route's own test of 1,001 characters (`server/tests/agent-routes.test.ts`, lines 158-160).
- The reader counts UTF-16 code units, so an emoji counts as two. An editor shows one. The refusal and the notice say "characters" and do not explain the difference.
- No preview (slice S3) exists, so nobody has yet seen the notice.
- No live run or team eval with an imported prompt of this length. A model reads these instructions, so they are not yet run live.
- The cost of up to 10,000 characters on each turn (the routing roster, the voice agent and the standing role) is [assumed], not measured.
- The 64 KB and 1 MB limits are the design's proposals [assumed].
- The reader takes text. The importer (S3) must decode the bytes strictly (`fatal: true`) and keep the byte-order mark (`ignoreBOM: true`), or the refusal of a leading byte-order mark never fires.
- A skill slug already held by another owner needs the database, so that check waits for S4.
- The sending check is by name, and it fails closed: a tool with one of the three words is refused even if it sends nothing, and its refusal then says it sends email. Today's package has no such tool.
- The Email paragraph ends at the first line break of the loaded prompt. That is right while the package's prompts are folded (`>-`, as all twelve are). The guard test checks that the paragraph ends with its last sentence, so a literal block (`|`) in the package would fail it.
- Every Cc and Cf character except tab and line feed is refused, so a zero-width joiner inside an emoji sequence is refused too.

**Decisions** (section 6)
- Decision 2, instruction limit: decided on 14 November 2026 as option B, for imported members only, at 8,000 characters of stored text. The checker enforces it (above). The create and edit layers below do not change in this slice, so an imported member cannot be created or edited yet. The appended text alone is 3,518 characters (the shared rules 3,062, the Email paragraph 452, and two separators of 2 characters each), so under the measure built here an author's own text may have at most 4,482 characters. The open questions are in "Decisions left to the maintainer" below. The figures in this paragraph are of 14 November 2026: the limit and the appended text have changed since, see "Limit raised to 10,000 (16 November 2026)" at the end of this file.
- Decision 3, endpoints in a file: built as recommended. A file that names an endpoint is refused as a key a file may never set.
- Decisions 1, 4, 5 and 6 belong to S4, S5, S6 and S2 respectively.

**Layers that still refuse an imported member above 1,000 characters.** Read on origin/main at c93c947, 14 November 2026. None of these changed in this slice, because each one is shared with a member made in the app, by Leo or through the API, and those keep 1,000.

| Layer | Where | What happens to 1,001 to 8,000 characters |
|---|---|---|
| Create route, `POST /api/agents` | `openbot/server/src/agents/routes.ts:514-516`, through `parseAgentInput`, which bounds `roleDescription` at 1,000 at `routes.ts:70-74` | Refused: "What it does must be text between 1 and 1000 characters." |
| Edit route, `PATCH /api/agents/:agentId` | `routes.ts:561-563`, the same parser | Every save is refused, even a change of visibility, because the whole profile goes in each save (`openbot/app/src/lib/agents/form.ts:78`, `profileUpdateInput`) |
| Create screen | `openbot/app/src/components/agents/new-bot-sheet.tsx:578` (`maxLength={1000}`), and the form schema at `openbot/app/src/lib/agents/form.ts:19-23` | The text box stops at 1,000 |
| "What it does" edit dialog | `openbot/app/src/components/bot-profile/setup.tsx:145` (the field's schema) and `:243` (`schema.safeParse`) | Refused on save |
| Save-bot card for Leo's proposals | `openbot/app/src/lib/agents/proposal.ts:163-169` (`checkProposal`); the model is told "up to 1000 characters" at `proposal.ts:133` | Refused. Leo's path, unchanged |

Layers that do not refuse, so the text survives them: the database column `agent_profiles.role_description` is `text` (`openbot/server/src/db/schema/coworker.ts:39`); the store writes it with no length check (`openbot/server/src/agents/profile-store.ts:500`, and `:559` for a built-in Bot's `systemPrompt`); the standing role message carries `roleDescription` whole (`openbot/server/src/copilot.ts:177-190`, attached at `copilot.ts:317`); the built-in prompt is passed whole (`copilot.ts:285-295`); and the router's reader takes the standing role whole (`openbot/agent-freeduet/freeduet/members.py:112-127`). Two places take the whole text on every routed turn but refuse nothing: the routing roster (`openbot/server/src/routing/classify.ts:95`) and the voice agent (`openbot/server/src/voice/routes.ts:186`). Their cost is not measured.

**Decisions left to the maintainer**

| # | Decision | Options | Recommendation and reason |
|---|---|---|---|
| A | How an imported member gets past the create and edit layers above | 1. A stored mark on the Bot's profile, set only by the importer, so the create and edit routes take 8,000 for that Bot and 1,000 for every other. It needs a migration. 2. A server-only import path that calls the store directly, plus an edit rule that keeps unchanged long text. 3. Raise the limit for every Bot | 1. The routes can check a stored fact, not a guess from the length of the text. Option 2 makes "long" mean "imported" by accident. Option 3 changes the paths the decision keeps as they are. Not built here: it needs the database and an upstream change. |
| B | Whether the checker refuses 1,001 to 8,000 until A is done | 1. Accept, with the notice (built). 2. Refuse, with the same sentence | 1. The decision sets 8,000 as the limit, and the notice is shown in the preview before anyone presses Create. S4 must not create a member while the notice applies. |
| C | What 8,000 counts | 1. The whole stored text: the author's text, the Email paragraph and the shared rules (built). 2. The author's text alone | 1. The cap has always limited the stored text (`form.ts:23`, `routes.ts:72`). Under option 1 the author's own text may have 4,482 characters; under option 2 the stored text may reach 11,518. Confirm which the maintainer meant. |
| D | Which field holds an imported member's instructions | 1. `roleDescription`, as the app stores it, which the standing role message reads for a managed or remote Bot (`copilot.ts:185`). 2. The file's one-sentence `role_description` there, with the instructions only in `systemPrompt` | 1. Option 2 would leave a managed or remote member without its instructions at run time, unless the runtime changes too. The cost of option 1 is the whole text on the routing roster and the voice agent. Decide in S4. |

### Slice S2 (export): built so far

Slice S2 of section 4, the export, is built on branch `team-file-export`. Not verified in a browser; no import (S3 to S6) exists.

**Built**
- `openbot/server/src/freeduet/team-file-export.ts` (pure): writes the two formats from an allow-list, field by field. Instructions are the author's text: the package's "Email." paragraph and shared rules are taken off the end, so the reader adds them once. A paragraph left in the middle of a text is refused. It also scans text for an e-mail address, the administrator's own address and name (whole word), and refuses a sending tool by name.
- `openbot/server/src/freeduet/team-file-routes.ts`: `GET /api/freeduet/team-file/export`, behind `requireUser` and `requireAdmin`. No query returns the administrator's whole team, `?member=<id>` one member. It reads the members the administrator OWNS, their stored instructions, the skills granted to them (`plugin_grants`, kind `skill`) and the tool names those skills declare (`skill_tools`). Grants, connections, memories, lessons, addresses, identifiers and settings are never read. Every file is read back by the S1 reader against the same package before it is sent; a file the reader would refuse is a 409 with the reader's own sentence. It is sent with `downloadHeaders` (`private, no-store`, a sanitised name, `nosniff`).
- `openbot/server/src/index.ts` and `app.ts`: one boot call (`useTeamFile`, as `useEngineChoices` is set) and one mount.
- `openbot/app/src/freeduet/team-file-button.tsx`: "Download team file" on the Bots roster, shown to administrators only. Busy, saved and refused states; a refusal shows the server's sentence.

**Verified** (14 November 2026, on branch `team-file-export`, Postgres 16 on a private cluster)
- `freeduet-team-file-export.integration.test.ts`: 14 pass, 0 fail (real Postgres, real guards and routes). Covers: a non-administrator refused (403), no session (401), no member of one's own (409); the whole team read back by the reader (round trip, hash written, the download headers); one member, its author's text and its tool names; long instructions (4,164 characters) accepted with the create-limit notice; instructions over the limit refused with the reader's sentence; an e-mail address in a text refused without echoing it; a remote Bot's address never written; another person's Bot not found; a team over the reader's 1 MB bound refused with the reader's sentence; and a canary check: a planted grant, its granter, a memory, the administrator's name and address, the endpoint of a remote Bot, a callback token hash, an avatar seed and another person's job text never appear, nor do the Bot ids or the people's ids.
- `freeduet-team-file-export.test.ts`: 8 pass, 0 fail (no database). The ten shipped members that carry both paragraphs compose back to the package's text, the same words in the same order; Otto's four sending tools are refused by name; the scanner; a synthetic member round-trips through the reader.
- `app/tests/team-file-button.test.tsx`: 5 pass, 0 fail (who sees it; a saved file; busy; a refusal).
- Related suites: `assertion-shape`, `freeduet-team-file`, `freeduet-package`, `freeduet-team` and the new file: 125 pass, 0 fail.
- Fail before: on main the three new test files cannot load, because their modules do not exist there (0 of 3 files run).
- `bun run format:check` and `bun run lint` (with `--error-on-warnings`): clean.
- `bun run typecheck:tests`: not a result. The gate was killed by the machine's memory limit three times (exit 2, "tsc did not finish"). It must be run again on a free machine. Instead, `tsc --noEmit -p` over a temporary config extending `server/tsconfig.tests.json` with only the four new server files (and their imports) finished with exit 0 and no diagnostics. That is a partial check, not the baseline gate.

**Not built or not verified**
- No preview (the design's "full preview"). The button saves the file directly. Nobody has yet read a whole file on a screen.
- Canaries not planted, because the export does not read them: approval rules, Full access choices, per-person settings, conversation content, and the lessons files. Their absence follows from the allow-list, which is written field by field, not from a test that plants them.
- Test requests are always `[]`: custom Bots store none. The shipped members' test cases live in `evals/team/cases.yaml`, which the server does not read.
- The e-mail scanner covers e-mail addresses, the administrator's address and name. Telephone numbers, card and bank numbers are not scanned.
- Not run against a live eval stack. A file never certifies itself (section 3.5).

**Findings about the S1 reader** (read, not changed here)
- The reader reserves the names of all twelve shipped coworkers (Iris and eleven members). No file can carry one of them, so the shipped members cannot be exported under their names and imported back. The route therefore exports only members the administrator owns, and refuses a shipped name by 404.
- The shipped team's skill text is 901,342 bytes in compact JSON, and Mark's skills alone are 837,567. A whole shipped team file would sit at or past the reader's 1 MB bound (`TEAM_FILE_LIMITS.fileBytes`).
- The package joins its paragraphs with one line break; the reader joins the composed instructions with a blank line (`team-file.ts`, the `join("\n\n")` in `readMember`). The words are the same; the whitespace is not.
- Iris carries neither paragraph, and Otto carries the shared rules and his own Email paragraph, so neither composes to its package text.
- Section 5 says send tools are "never recognised by name; an explicit list names them" (decided 14 November 2026). The reader still recognises them by name (`isSendingTool`, the words send, reply and forward). That disagrees with the decision and is for the coordinator to settle.

**Decisions left to the maintainer**

| Decision | Options | Recommendation and reason |
|---|---|---|
| Shipped members in an export | A. Never (built). B. Exported as copies under new names. C. Exported under their names, and the reader refuses them | A. A shipped name is reserved in every file, and the package already gives every installation those members. B changes a name the person did not choose. C gives a file that cannot be imported. |
| Whose members the whole-team file holds | A. The administrator's own (built). B. Every member the deployment holds | A. Another person's Bot leaves only with that person's consent. |
| The author and licence of a member the administrator made | A. "Not stated" for both (built). B. A licence the person chooses | A. The file makes no claim for the person. Choose B once the person can set one. |
| Whether a team file that holds a sending tool is refused or cleaned | A. Refused (built). B. The tool dropped | A. The reader refuses it, and dropping silently would change what the member can do. |
| Whether to build the preview (S2, "full preview") before the download is offered | A. Build it first. B. Download now, preview later (built) | A for a file that leaves the deployment; the maintainer decides which slice comes first. |

### Imported member layers (14 November 2026)

What this slice builds, on top of the reader above: the stored fact that lets an imported member take 10,000 characters (8,000 when it was built, on 14 November 2026), and the create, edit and dialog layers that read it. The importer that calls the fact (S3) is not built, so no member can be imported yet.

**Built**
- Decision A, option 1: `agent_profiles.imported_member` (boolean, not null, default false; migration `0071_imported_member`). Only the internal `createImportedMember(store, actor, input)` (`openbot/server/src/agents/imported-member.ts`) writes it, through `store.create(..., importedMember: true)`. No public route, and no request body (POST or PATCH) can set or clear it.
- `createImportedMember` checks the text with `parseAgentInput` at 10,000, forces visibility private, and stores the text as both `roleDescription` and, for the built-in prompt, `systemPrompt`.
- Limits (`openbot/server/src/agents/role-description-limit.ts`): 1,000 for every Bot, 10,000 for an imported one, counted in UTF-16 code units (decision E, option 1).
- `POST /api/agents` keeps 1,000 for a hand-made Bot, so a body that claims the fact does not lift it.
- `PATCH /api/agents/:agentId` reads the stored Bot before it parses the body and picks the limit from that Bot: 10,000 if it is imported. A copy of an imported Bot that is not imported keeps its text while unchanged, and a changed text is held to 1,000. A body's `importedMember` is ignored.
- `GET` reports `roleDescriptionLimit` for each Bot (10,000 or 1,000). The app's "What it does" edit dialog reads that limit: it shows "n of limit characters" and refuses over it. The create sheet stays at 1,000, and Leo's save-bot card is unchanged.
- Decision C, option 1: the limit counts the whole stored text.
- Decision D, as the app stores it: the instructions are `roleDescription` (and `systemPrompt` for built-in). Option 2 is not built.

**Tests**
- `server/tests/imported-member.integration.test.ts` (13 tests, real database, real routes): the import path, the 10,000 and 10,001 edges (ASCII, five-thousand emoji against 5,001, and 10,000 accented letters), the PATCH edges, the unchanged-copy rule, the body that claims the fact, and the reader constants pinned to `TEAM_FILE_LIMITS`.
- `server/tests/agent-instructions-limit.integration.test.ts`: a guard. A hand-made Bot takes 1,000 and refuses 1,001 on create and edit, and a body that claims the fact does not lift it. It uses only existing modules and is meant to pass on main.
- `server/tests/schema.test.ts`: the new column.
- `app/tests/bot-setup.test.tsx`: 10,000 taken, 10,001 refused, a hand-made Bot still refused at 1,001 (a guard), and the counter.
- `server/tests/freeduet-team-file.test.ts`: the notice's wording follows the new layers.
- `server/tests/agent-routes.test.ts` and `app/tests/agent-api-path.test.ts` (changed after CI on `d2ee384` failed): they pin the exact store calls and the exact DTO, so they now expect the edit route's read of the Bot before its update (three call lists, and twelve calls instead of eleven) and `roleDescriptionLimit` in each DTO. The invalid-body case still expects that nothing is written; it names the one read per request instead of expecting no call at all. Sixteen app test fixtures of `AgentProfile` carry `roleDescriptionLimit: 1000`, because the app type requires it.

**Verified** (14 November 2026, on this worktree, Postgres 16 at a non-default port, migrated with `bun scripts/migrate.ts`)
- `biome format` and `biome lint --error-on-warnings` on the 17 changed TypeScript files: clean.
- Server: `imported-member`, `agent-instructions-limit`, `schema`, `freeduet-team-file` and `assertion-shape`, 96 tests. 94 pass at the default 5 s limit; two `assertion-shape` tests time out under load. With `--timeout 120000`, `assertion-shape` passes 10 of 10. The run of the four other files is in the same count.
- App: `bot-setup` and `composing-enter` from `openbot/` (`bun test app/tests/bot-setup.test.tsx app/tests/composing-enter.test.tsx`): 10 pass, 0 fail. Run from `openbot/app` alone, `composing-enter` fails on `import.meta.glob`, a runner difference and not a result.
- `bun run typecheck:tests` was killed by memory pressure three times while the slice was written. Not a result. It was run to completion on 15 November 2026: clean against the baseline (239 known errors, none new). Two baselined lines in `server/tests/typecheck-baseline.txt` had their text changed by hand, as `CLAUDE.md` allows: `... 7 more ...` is now `... 8 more ...`. They are the same two errors in the `profile()` helpers of `agent-profile-policy.test.ts` and `agent-routes.test.ts`, whose printed type gained one property with `importedMember`.
- Full suites on 15 November 2026, on this worktree and before the last merge of main (which moved zod from 4.5.4 to 4.6.7): the sharded server suite, 8,481 pass, 3 fail, 21 skip (the three that fail on main in this sandbox: two `learning-*` "real provider" cases and the Mastra bridge); the app suite, 2,867 pass, 0 fail in 298 files. After that merge: `bun run typecheck` (six workspaces), `bun run typecheck:tests`, biome format and lint, and the ten test files of this slice and its CI fixes (174 tests) pass.

**Not verified**
- Fail before on a clean origin/main was not run. The new `imported-member` file cannot load on main (the module does not exist), and the new `bot-setup` cases for 10,000 and 10,001 and the counter would fail on main's dialog. The guards are meant to pass on main.
- No real import (S3 is not built), no browser run of the dialog, no live member run.
- The cost of 10,000 characters on each turn is not measured. The routing roster (`openbot/server/src/routing/classify.ts`, a line per candidate per routed turn), the voice agent (`openbot/server/src/voice/routes.ts`) and the standing role message (`openbot/server/src/copilot.ts`) each receive the whole text. An imported Bot of 10,000 code units adds up to 10,000 characters to each of those, per use. Listed as a cost, not changed.
- A duplicate of an imported Bot does not inherit the fact (only the importer writes it). Its text may be longer than 1,000 and can be saved only while unchanged. Option: copy the flag, or refuse to copy above 1,000. Maintainer's call.
- `createImportedMember` forces visibility private; the import path must decide whether that is the final rule.

**Decisions taken for this slice** (section 6)
- A, how an imported member passes the create and edit layers: option 1, the stored fact.
- C, what the limit counts: option 1, the whole stored text.
- E, unit: option 1, UTF-16 code units.
- D: as the app stores it (`roleDescription`).

### Limit raised to 10,000 (16 November 2026)

The limit for an imported member's instructions is now 10,000 characters, counted in UTF-16 code units as before. Only the number changed: no layer, route, approval or refusal changed. Hand-made Bots still take 1,000 characters.

**Changed**
- `openbot/server/src/freeduet/team-file.ts`: `TEAM_FILE_LIMITS.instructionsCharacters` is 10,000. The refusal and the notices name the new number.
- `openbot/server/src/agents/role-description-limit.ts`: `IMPORTED_ROLE_DESCRIPTION_LIMIT` is 10,000, so the server and the reader stay equal (the invariant test pins them).
- Comments only: `openbot/server/src/agents/imported-member.ts`, `openbot/app/src/lib/agents/queries.ts`, `openbot/server/tests/agent-routes.test.ts`.
- Tests: the edges in `freeduet-team-file.test.ts`, `imported-member.integration.test.ts` and `bot-setup.test.tsx` now sit at 10,000 and 10,001. One test is new: every member in `openbot/examples/freeduet/agents.yaml` fits the limit with at least 500 characters to spare.
- Docs: `CHANGELOG.md` (one line) and the three rows of `docs/UPSTREAM_TOUCHES.md` that state the number.

**The margin test measures what the reader composes.** It takes each member's author's text, the Email paragraph and the shared rules, joined by a blank line, and compares the result with 9,500 (10,000 less 500). On 16 November 2026 the appended text is 3,836 characters: the standard Email paragraph (452), the shared rules (3,380) and two separators of 2 characters each. An author's own text may therefore have at most 6,164 characters. These figures were read from `agents.yaml` for the ten members that carry the standard paragraph.

**Verified** (16 November 2026, branch `team-file-limit-10000`)
- The three server files of the run, `freeduet-team-file.test.ts`, `imported-member.integration.test.ts` and `freeduet-team-file-export.integration.test.ts`, before the source change (the same tests against the 8,000 code): 73 pass, 15 fail, of 88.
- The same three files after the change: 87 pass, 1 fail, of 88. The one failure is the margin test, on purpose (below).
- `app/tests/bot-setup.test.tsx`: 4 pass, 3 fail before; 7 pass, 0 fail after.
- `server/tests/assertion-shape.test.ts`: 10 pass, 0 fail. `agent-routes.test.ts` and `agent-instructions-limit.integration.test.ts` raise no failure.
- `bun run typecheck`: exit 0 for shared, toolkit, worker, server and app. `bun run typecheck:tests`: clean against the baseline (239 known errors, none new).
- `biome format` and `biome lint --error-on-warnings` on the eight changed TypeScript files: clean. `biome check` reports four organize-imports errors, in `freeduet-team-file.test.ts` (its import block was already out of order on main), `imported-member.ts`, `imported-member.integration.test.ts` and `bot-setup.test.tsx`. None of the edits to the last three touches an import line.

**The margin test fails on purpose** (composed text, ceiling 9,500)
- `inbox` (Otto): 11,138 characters, 1,638 over 9,500 and 1,138 over the limit itself. His own Email paragraph is 766 characters, not the standard 452.
- `concierge` (Jules): 13,534 characters, 4,034 over 9,500 and 3,534 over the limit itself.
- `freeduet` (Iris): cannot be written as a team file, because `authorTextOf` returns null: a shared paragraph sits inside her text.
- The closest of the others is `creator` (Leo): stored 8,873 characters, 8,875 composed, 625 under 9,500. The brief gave 7,999 for Leo, and the figure in `docs/M1_PLAN.md` (line 977) is out of date.

**Decisions left to the maintainer** (decisions A to D above were written on 14 November 2026, when the limit was 8,000)

| # | Decision | Options | Recommendation and reason |
|---|---|---|---|
| F | How the members above the margin fit | 1. Shorten `concierge` by at least 4,034 characters and `inbox` by at least 1,638 in `agents.yaml`; the limit stays at 10,000. 2. Raise the limit to at least 14,034, the margin for Jules. 3. Exempt `freeduet` by name from the margin test: she cannot be written as a file, and her name is reserved | 1 and 3. Every imported member's text goes to the routing roster, the voice agent and the standing role on every turn, so a higher limit raises that cost for every imported member. Option 1 changes two prompts, so the team evals must run again before the change is merged. |

**Not verified**
- No live run and no browser run. The margin is measured by the reader's composition in a test, not by a real import (slice S3 is not built).
- The `+` and `−` counts in the three `docs/UPSTREAM_TOUCHES.md` rows were not recounted; only the limit text changed.
- `docs/ROADMAP.md` (lines 11 and 91), `docs/M1_PLAN.md` (line 977) and `README.md` (line 193) still say 8,000. This change did not edit them; the coordinator updates them.
- The cost of 10,000 characters on each turn is not measured.

