# Import from other agent tools: design

Design only, no product code. Written 2026-11-14 for two ROADMAP rows: "Bring your data from other agents" [code: docs/ROADMAP.md:45] and "Import from Grok Bot" [code: docs/ROADMAP.md:63]. Base: commit 452e060, where the branch started.

Tags: [code: path:line] = read in this repository at commit 452e060. [doc: URL] = stated by a public page, read 2026-11-14 through a summarising fetch; no text is copied. [assumed] = not checked. Design choices carry no tag: they are proposals.

## 1. What the person gets

- Their agents, skills, facts and schedules from the tools they already use, so they do not start from zero.
- A readable list of what was found, every item in full. They tick what to keep; nothing becomes part of their setup before they confirm (decision 7 covers the staged copy).
- Imported text is data. It cannot give a member a tool, change an approval or start a schedule before the person confirms.

## 2. What exists today in the code

No importer exists. The code names Grok Bot only in comments, for example [code: openbot/server/src/approvals/policy.ts:18]. The settings routes have no import page [code: openbot/app/src/routes/_authed/settings/].

The Grok spec is text only. It asks the other tool for one JSON block, `"format": "freeduet-import/1"`, with agents that have a name, title, instructions, schedule and facts [code: docs/import/grok-export-prompt.md:11-22]. It promises a review screen, facts the person accepts or skips, and nothing saved before confirmation [code: docs/import/grok-export-prompt.md:30-36]. Chat history is never imported [code: docs/import/grok-export-prompt.md:41].

Where an import would land:

| Kind | Code today | What matters for an import |
|---|---|---|
| Skill | `skills`: unique slug, `instructions` prepended to a run, `origin` defaults to `yours` [code: openbot/server/src/db/schema/plugins.ts:704-741] | Package sync updates only rows whose origin is `catalogue` [code: openbot/server/src/tenant-package.ts:1041]. `origin` is plain text, not an enum, so `imported` needs no enum migration [code: openbot/server/src/db/schema/plugins.ts:732] |
| Skill tools | `skillTools`: a row is a declaration, and a declaration is not a grant [code: openbot/server/src/db/schema/plugins.ts:744; plugins.ts:750-755] | Anyone signed in may write a skill, for that reason [code: plugins.ts:751-753] |
| Grants | `pluginGrants`, kinds mcp, skill, bot; absence is a refusal [code: plugins.ts:786-812; openbot/server/src/plugins/plugin-store/model.ts:57] | Skill grant check: [code: openbot/server/src/plugins/plugin-store/skills.ts:287] |
| Bot | `agents`, configuration as jsonb [code: openbot/server/src/db/schema/core.ts:282-293]; a person-made Bot's role goes to `configuration.systemPrompt` [code: openbot/server/src/agents/profile-store.ts:541-559] | Shared rules paragraph: [code: openbot/examples/freeduet/agents.yaml:108-111] |
| Routine | `routines`: instruction, cron, timezone (UTC by default), enabled (true by default) [code: openbot/server/src/db/schema/coworker.ts:96-142] | Cron is validated at the tool boundary [code: coworker.ts:112] |
| Memory | `personalMemories` [code: openbot/server/src/db/schema/memory.ts:49-100] | `provenance` is required text [code: memory.ts:62] |
| Approvals | `approvalRules` [code: openbot/server/src/db/schema/approvals.ts:114]; an "always allow" inserts a row [code: openbot/server/src/approvals/store.ts:172-175] | No import may write these |
| Secrets | `mcpUserCredentials` [code: openbot/server/src/db/schema/plugins.ts:647]; `savedLogins` [code: openbot/server/src/db/schema/passwords.ts:22] | Never imported |

Recall does not check review state. Bot-formed memories are written `unreviewed` [code: openbot/server/src/memory/store.ts:430]. With Intelligence off, `retrieve` returns the rows that `eligibleRows` selects [code: openbot/server/src/memory/store.ts:762-777], and that filter never reads `reviewState` [code: store.ts:321-340]. Only mirroring to Intelligence waits for confirmation [code: store.ts:55]. So a fact written into `personalMemories` before confirmation would already reach a Bot. The app does show a Confirm control for unreviewed rows [code: openbot/app/src/components/memory/memories.tsx:244-251].

Confirmation precedent. Lessons stay `pending` until the person types a line that starts with "approve" and a code [code: openbot/agent-freeduet/freeduet/lessons.py:11-23]. The service says it cannot tell the person's own text from a relayed one, except by marks [code: lessons.py:26-28]. A typed word is a weaker check than a click.

Guards already in code:
- `${NAME}` and `${NAME:-fallback}` are replaced from the process environment; an unset name with no fallback is an error [code: openbot/server/src/tenant-package.ts:330-345]. Only package files pass through it [code: tenant-package.ts:717, 737, 758].
- Skill declarations grant nothing [code: plugins.ts:750-755].
- A connector response over 262,144 bytes is refused, and at most 50 records are kept [code: openbot/server/src/memory/ingestion.ts:21-24, 49]. An uploaded file is capped at 1 MiB [code: openbot/shared/attachments.ts:66].
- Redaction works by field name, in audit payloads [code: openbot/server/src/audit.ts:716-728]. No scanner checks the values of imported text.
- Chat attachments are pictures and text, person to member only [code: CLAUDE.md:109-110]. A folder drop needs a new route.
- The Settings index and the approvals page each take one import line [code: docs/UPSTREAM_TOUCHES.md:20, 176]. FreeDuet keeps its own migration journal [code: openbot/server/src/freeduet/threads/migrate.ts:9, 29].
- Reusable stores: `createRoutineStore` [code: openbot/server/src/routines/store.ts:351]; `catalogueEntry` [code: openbot/server/src/plugins/catalogue.ts:723].
- Leo writes new members, after checking for overlap [code: docs/TEAM.md:82].

## 3. The design

### 3.1 The smallest version worth shipping

1. The person pastes the Grok JSON, or picks a folder of SKILL.md files. No zip. [assumed] A browser folder picker can send file text to the server.
2. The server runs the checks in 3.2 and writes a draft batch. The draft is the only write before confirmation (decision 7). It expires after seven days (proposal).
3. Settings → Import lists each item with its kind, its full text, its warnings, its licence and its provenance. Nothing is ticked by default. The whole text is shown, as the email card shows the whole body [code: docs/M1_PLAN.md:147].
4. Leo proposes, for each skill, one Bot the person owns, or none, with one line of reason. The person picks. A skill never goes on a shared member, because a person's own skill is theirs alone.
5. Confirm writes the ticked items in one transaction. The server compares each item's hash with the hash that was shown, and refuses a changed item.

What confirm writes:
- Instructions: a new private Bot through the profile store [code: openbot/server/src/agents/profile-store.ts:402; openbot/server/src/db/schema/coworker.ts:24-27], with the shared rules appended. The Grok spec promises the same [code: docs/import/grok-export-prompt.md:33]. The F8 acceptance says imported members get the shared rules added automatically [code: docs/PROJECT.md:97-99].
- Skill: a `skills` row with origin `imported`, owned by the importing person (`ownerUserId`), so nobody else sees it in their `/` menu [code: openbot/server/src/db/schema/plugins.ts:709-713; openbot/server/src/plugins/plugin-store/skills.ts:17], and optionally a `pluginGrants` row of kind `skill` to the Bot the person picked, which must be one they own [code: plugins.ts:796-812; plugin-store/skills.ts:287]. No `skillTools` row.
- Fact: a `personalMemories` row, `formedBy` `import`, `reviewState` `confirmed`, provenance naming the export [code: memory.ts:61-80; openbot/server/src/memory/store.ts:425-428]. Who may recall it is decision 1.
- Schedule: a `routines` row, enabled only on confirm, with its cron passed through the same check as the tool boundary [code: coworker.ts:112].
- Connected-app name: a suggestion to connect in the tool's own sign-in flow, as FreeDuet's rule requires. No grant [code: docs/ROADMAP.md:49].

Never imported: credentials, tokens, passwords, cookies, API keys and iCal secrets [code: CLAUDE.md:31-33; docs/ROADMAP.md:44]; chat history [code: docs/import/grok-export-prompt.md:41]; approval rules, Full access, grants (`pluginGrants`, every kind), connected accounts, members' permissions and paid engines [code: docs/ROADMAP.md:47; openbot/server/src/db/schema/plugins.ts:786-812].

### 3.2 Checks on imported text

The server runs these before the review screen. Each adds a warning or refuses the item.

| Check | Result |
|---|---|
| Unknown kind or key | Listed as "not imported", by name |
| `tools`, `allowed-tools`, approval, grant, policy or full-access keys | Dropped. The public spec calls `allowed-tools` "pre-approved" [doc: https://agentskills.io/specification]; FreeDuet gives it no meaning |
| `${` in any text | Kept literal and flagged. Expansion runs only on package files [code: openbot/server/src/tenant-package.ts:717, 737, 758] |
| Zero-width or bidirectional control characters, HTML comments | Refused, so the reviewer sees what the member reads |
| Phrases that ask for approval changes or tool grants ("always allow", "do not ask") | Flagged in red. A heuristic, not a boundary |
| Key-shaped strings, card-number-shaped digit runs, long base64 | Refused, with the line number |
| Caps (proposed): 64 KiB per item; 1 MiB per file [code: openbot/shared/attachments.ts:66]; 50 items per batch [code: openbot/server/src/memory/ingestion.ts:49] | Refused above the cap |
| A `license` field, or non-commercial wording | Shown. Non-commercial marks the item restricted: kept for the person, excluded from any export or share. No licence: shown as "none stated" |
| A `scripts/` folder | Listed. Never read by the server, never run, never copied [doc: https://agentskills.io/specification] |

What the member sees at run time:
- The imported text is quoted inside a fixed frame. The frame says it is the person's own chosen instruction, and that it cannot change the member's rules or approvals.
- The shared rules come after it [code: openbot/examples/freeduet/agents.yaml:108-111].
- The frame is an instruction to the model, not a boundary. The boundary is the approval gate on each action [code: docs/PROJECT.md:124]. The roadmap's automation rule covers routines: nothing is sent, paid, signed, booked or deleted without approval [code: docs/ROADMAP.md:46]. Full access never applies to routines [code: CLAUDE.md:43-47].

### 3.3 Provenance and licence

Each item stores: source tool, export format, file name, SHA-256 of its text at import, import time, author if the file names one, licence as found, and the restricted flag. Facts also write provenance into `personalMemories.provenance`, capped at 500 characters as `formMemory` caps it [code: openbot/server/src/memory/store.ts:425-428]. Each item row keeps the id of the row it created, so "remove this import" can undo it. Each write also gets an audit row [code: openbot/server/src/db/schema/core.ts:466].

### 3.4 Input formats of other tools (public documentation)

| Tool | Route and format | Named contents | Not named or not included | Use here |
|---|---|---|---|---|
| ChatGPT | Settings export: an archive with an `index.html` viewer, a `chat.html` in some older exports, JSON conversation files and other data files [doc: https://help.openai.com/articles/7260999] | Conversations and other account data | Memory and custom instructions are not mentioned | Not in v1 |
| Claude | Data export; an emailed link that lasts 24 hours [doc: https://support.claude.com/en/articles/9450526-how-can-i-export-my-data] | Conversations, account information, voice recordings | Original attachments; memory and projects not mentioned | Not in v1 |
| Gemini | Google Takeout archive, as .zip or .tgz, split by size if the person sets a maximum [doc: https://support.google.com/gemini/answer/16920332] | Gems data, Gemini Apps activity, generated media, uploaded files | The file format of Gems is not named | Later, if a sample shows a persona format [assumed] |
| Grok Bot | No file export named. Template links carry identity, description, skills and routines; a duplicate, described for iPhone only, leaves out past chats, learned memory and attachments [doc: https://docs.x.ai/grok-bot/bots] | Bot identity and setup | No file format | The paste route in grok-export-prompt.md |

Two more public routes:
- A vendor's memory import has the person paste the other assistant's reply into a box in Claude's memory settings. Claude saves each extracted item as its own entry, needs no approval first, and lets the person review afterwards. No size limit is stated [doc: https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-other-ai-providers]. FreeDuet's rule is the opposite: nothing is saved without confirmation [code: docs/ROADMAP.md:45].
- The SKILL.md format: a folder with a SKILL.md file. Its frontmatter needs `name` and `description`; `license`, `compatibility`, `metadata` and `allowed-tools` are optional. Optional folders are `scripts/`, `references/` and `assets/` [doc: https://agentskills.io/specification].

### 3.5 After v1

- A later team file, for whole teams, as the ROADMAP row plans [code: docs/ROADMAP.md:44]. Restricted items stay out of it.
- Gemini Gems, once the format is known.
- Harmless settings (language, tone, names), once settings in chat exist [code: docs/ROADMAP.md:47].
- Importing Intelligence conversations: "a possible later phase" [code: docs/M1_PLAN.md:111].
- Chat history only as its own decision, opt-in. The default stays never [code: docs/import/grok-export-prompt.md:41].

## 4. Slices (one PR each)

| # | Slice | Builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|---|
| S1 | Parsers | `freeduet-import/1` and SKILL.md parsers; the checks in 3.2; the caps | The Grok example in grok-export-prompt.md:11-22 parses; `${NAME}` stays literal; `allowed-tools` is dropped; a zero-width character is refused; a file of 1 MiB + 1 byte is refused | nothing | M |
| S2 | Draft store | A FreeDuet migration (own journal) for a batch table and an item table; create, list, discard, seven-day expiry | Row counts of skills, personal memories, routines, agents and approval rules are unchanged by a draft; another person cannot read a batch; the migration is recorded by name | S1, decision 7 | M |
| S3 | Review screen | `settings/import.tsx`, one line in `settings/index.tsx`, the folder picker | Full text shown; nothing ticked by default; confirm sends only ticked ids; the upstream row is added | S2 | M |
| S4 | Confirm: Bots and facts | Instructions become Bots with shared rules; facts become confirmed memories; an audit row per write | A changed text after review is refused; a fact is not recalled before confirm; the Bot prompt ends with the shared rules; a static test: the import code names no approval or Full-access table | S2, decision 1 | M |
| S5 | Confirm: skills | `skills` row (origin `imported`); optional skill grant | No `skillTools` row; the grant offers no tool (run through the real gate); a slug clash is refused; `${` is literal in the database; another person's `/` menu does not list it | S4 | S |
| S6 | Schedules | Routine created enabled only on confirm | An invalid cron is refused; no routine before confirm; a routine's send still asks | S4, decision 5 | M |
| S7 | Leo's proposal | Mapping proposal; the server accepts only ids of Bots the person owns | An unknown or another person's id is refused; proposal text is shown as data | S5 | S |
| S8 | Docs and rows | `docs/import/` update, README line, upstream rows, NOTICE rows for any third-party text | A check that every upstream row names a real file | S3 | S |

## 5. Rules that must hold

- **Logins first.** Leo's proposal is an ordinary member turn on the person's login. No import step calls a metered API [code: CLAUDE.md:26-28].
- **Subscription credentials.** The importer reads no login directory and stores nothing from another tool's sign-in [code: CLAUDE.md:31-32].
- **No secrets or personal data in the repository.** Test fixtures are synthetic. The docs describe public formats only [code: CLAUDE.md:33].
- **The person's approval for account actions.** An import is not an account action. A new email, a payment, a routine's send and a sign-in still ask. Imported text approves nothing, and the typed "approve" rule is not reused [code: CLAUDE.md:36-42; openbot/agent-freeduet/freeduet/lessons.py:26-28].
- **Change only what was asked.** No existing table changes. The staging tables live under FreeDuet's own migration journal [code: openbot/server/src/freeduet/threads/migrate.ts:9; CLAUDE.md:48].
- **Minimal upstream changes.** The review screen is one new file and one import line. Each gets a row in docs/UPSTREAM_TOUCHES.md [code: CLAUDE.md:49].
- **Public wording.** The import docs cite public pages neutrally and name no private project [code: CLAUDE.md:34-35].

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| 1 | Who may recall an imported fact | (a) all the person's Bots; (b) only the Bot it came from | (b) | A fact without a source reaches every Bot of the person [code: openbot/server/src/memory/store.ts:308-316]; a Bot-formed row reaches only its Bot [code: store.ts:293-297] |
| 2 | What v1 accepts | (a) pasted JSON; (b) plus a SKILL.md folder; (c) plus zip | (b) | SKILL.md is the common format; zip adds an archive parser and no named need |
| 3 | Non-commercial licences | (a) refuse; (b) import for the person, show the licence, exclude from any export; (c) import silently | (b) | The person decides their own use, and FreeDuet still never redistributes. The repo's licence rule limits the code FreeDuet ships [code: docs/PROJECT.md:134] |
| 4 | How confirmation is given | (a) a click on the review screen, against stored hashes; (b) a typed "approve" line, as for lessons | (a) | A click cannot be written by a model or relayed; the typed rule cannot tell the person from a relay [code: lessons.py:26-28] |
| 5 | Schedules | (a) Leo proposes a cron, the person confirms with the next three runs shown; (b) the person writes it; (c) keep as text | (a) | The export gives schedules in plain words [code: docs/import/grok-export-prompt.md:18] |
| 6 | Other tools in v1 | (a) paste route and SKILL.md only; (b) Gemini Gems, after the maintainer checks a sample export; (c) ChatGPT or Claude archives | (a) now, (b) later | The ChatGPT and Claude pages name no agent or memory list [doc: https://help.openai.com/articles/7260999]; the Gems format is not named [doc: https://support.google.com/gemini/answer/16920332] |
| 7 | Staged copy before confirmation | (a) a staging table, visible only to the person, expires after seven days; (b) no server copy: the browser keeps the file and sends it again at confirm | (a), if the confirmation rule means that nothing becomes theirs; otherwise (b) | The ROADMAP row sets the confirmation rule [code: docs/ROADMAP.md:45]. A staged copy is written before confirmation, so the maintainer must say whether the rule covers it. (b) keeps the literal reading, at the cost of a second upload |

## 7. What was not verified

- Nothing was built or run: no test, no migration, no live Grok export (no account was used).
- The public pages were read through a summarising fetch, not verbatim. File names and fields are as the summary gave them.
- Grok Bot's "Skills and routines" page came back titled "Skills and routines | SpaceXSI Docs", not as the Grok Bot docs. Nothing from it is relied on. No official Grok export format was found.
- Gemini Gems: the format is not named on the page.
- Whether a browser folder picker sends file text to the server: [assumed].
- Whether any reader of `origin` breaks on a value other than `catalogue` or `yours`: [assumed], not checked.
- Whether a person-made Bot gets the shared rules today: [assumed] it does not; the importer must add them.
- Recall with Intelligence on: not read.
- Licence detection by wording: a heuristic, not yet tested on real skills.
- origin/main had moved to b6541e6 when this was checked. The citations refer to 452e060 and were not read again at the new head.

## Built so far

Slice 1 (parsers), on branch `import-slice-1`, from origin/main 99ff3e8. Nothing is stored, routed or shown yet: a parse writes no row, sends no request and runs no code.

**Built**

- `openbot/server/src/freeduet/import/freeduet-json.ts`: reads a `freeduet-import/1` export pasted as text. Each agent becomes a Bot item and each non-empty fact a fact item. One code fence around the JSON is accepted.
- `openbot/server/src/freeduet/import/skill-folder.ts`: reads a folder of `SKILL.md` files. The frontmatter is YAML in the failsafe schema, so every value is text, and aliases and duplicate keys are refused. The body is the instructions. `scripts/` is listed and its files are never read. Other files are listed as not read.
- `openbot/server/src/freeduet/import/checks.ts`: the checks of 3.2. Hidden and direction characters, HTML comments, key-shaped strings, card numbers (confirmed with the Luhn check), long base64 runs and the line of each refuse the item. `${` is kept and flagged. Approval wording is flagged in red. Non-commercial wording marks the item restricted. Keys that would grant a tool, an approval, a policy or Full access are dropped; other unknown keys are listed.
- `openbot/server/src/freeduet/import/model.ts`: the item shape, the caps, and a SHA-256 digest over the fields as shown, for confirm to compare.
- `openbot/server/tests/freeduet-import-parse.test.ts`: 38 tests. Every fixture is invented.

**Caps as built**

| Limit | Value | Source |
|---|---|---|
| One file (a pasted reply or one `SKILL.md`) | 1 MiB | `MAX_FILE_BYTES`, `openbot/shared/attachments.ts` |
| One item (each text field of it) | 64 KiB | section 3.2 |
| One batch | 50 items; each Bot, skill and fact counts once | section 3.2; `openbot/server/src/memory/ingestion.ts` uses 50 |
| One fact | 6,000 characters | the memory store's content limit (`memoryInputSchema`) |

The 500-character provenance limit applies when a fact is stored, so it is slice 4's.

**Memory store, as found**

- A memory the person writes (`memoryInputSchema`): content up to 6,000 characters, provenance up to 500 (`openbot/server/src/memory/types.ts`). A member writes one only when the person asks, through `remember_personal_fact` (`openbot/server/src/memory/tools.ts`).
- A memory a Bot observes (`formedMemorySchema`): content up to 2,000 characters. `formMemory` cuts provenance to 500 (`openbot/server/src/memory/store.ts:425-428`) and writes `reviewState` `unreviewed`.
- `formedBy` already has the value `import` (`openbot/server/src/memory/types.ts:91`), and connector sync writes it (`openbot/server/src/memory/store.ts:732`). Slice 4 needs no enum change.

**Decisions**

- Built as recommended: 2 (pasted JSON and a SKILL.md folder, no zip), 3 (non-commercial items shown and restricted, excluded from any export, of which there is none yet) and 6 (the paste route and SKILL.md only).
- Not built, left to slices 2 to 6: 1 (who may recall a fact), 4 (confirm), 5 (schedules, kept as the text the export gave), 7 (the staged copy).

**Verified**

- `bun test tests/freeduet-import-parse.test.ts` in `openbot/server`: 38 pass, 0 fail.
- Before: with the module absent, the test file does not load and none of its tests run.
- Sixteen one-rule mutations (a check switched off, or a cap doubled) each fail at least one test. The source was restored after each.
- `biome format` and `biome lint --error-on-warnings`: clean.
- The new files under the project's test configuration, narrowed to those files: no type errors.
- `assertion-shape.test.ts`: 10 pass, with a 120-second per-test timeout. The default 5-second timeout failed two tests on the loaded sandbox.

**Not verified or not built**

- Slices 2 to 8: no table, no route, no review screen, no confirm, no routine, no proposal, no documentation changes.
- The full `bun run typecheck:tests` gate did not complete on this shared sandbox: `tsc` was killed under memory pressure, and the gate reports a run that prints nothing as clean.
- Nothing was run on a real export or on a real `SKILL.md` from outside the repository. The licence check is a heuristic and is untested on real skills (section 7).
- Whether the folder picker sends file text to the server is [assumed] and belongs to slice 3.
- No upstream file changed, so `docs/UPSTREAM_TOUCHES.md` has no new row.
