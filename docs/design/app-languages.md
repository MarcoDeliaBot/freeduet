# The app in more languages

**Decided 14 November 2026: no translation of the app for now.** Status: Not planned for now. The app stays in English. FreeDuet aims at a worldwide public, English first. Members still answer in the person's language (D26, unchanged). The analysis below stays as it was written.

Design only, no product code. Written 2026-11-14 for the roadmap row [The app in more languages](../ROADMAP.md) (line 53). Checked against origin/main at commit 021cad8.

Markers: [code: path:line] is a line of this repository, read or grepped at 021cad8. A folder marker names a folder. [doc: URL] is an outside page. [assumed] is not checked here. Candidate strings are text that may reach the screen. They are counted by a TypeScript parse (method in section 2).

## 1. What the person gets

- The screens a person uses every day read in the deployment's language: sign-in, chat, approval cards and Settings → Approval rules.
- Text not yet translated shows in English. It never shows as a blank or as a key name.
- Dates and times follow the same language once the deployment sets one. A deployment that sets none keeps today's behaviour.

## 2. What exists today

**No translation layer.**

- The interface has no translation package: the dependency list has none [code: openbot/app/package.json:1-63]. The app builds with Vite 7 [code: openbot/app/package.json:61].
- The document language is fixed to English [code: openbot/app/index.html:2]. No code in the app changes it [code: openbot/app/src/components/theme-provider.tsx:68].
- Strings are literal in JSX and props. A TypeScript parse of the 502 non-test source files finds 2,400 candidate strings in 204 files: 1,123 JSX text nodes, 506 attribute strings, 486 literal JSX children and 285 property strings. The parse counts text with two or more letters. It is an upper bound: not de-duplicated, and some values are data. Example: [code: openbot/app/src/components/approvals/approval-card.tsx:201].
- 202 of the 204 files are upstream. Admin route files hold 620 candidates [code: openbot/app/src/routes/_authed/admin/computers.tsx:176]. Settings components hold 87 in 10 files [code: openbot/app/src/components/settings/].
- The "about 500 strings" figure in the card file [code: openbot/app/src/freeduet/person-language/cards.ts:6] and in the M1 plan [code: docs/M1_PLAN.md:219] comes from a grep. It is about a fifth of the parse.
- The project already states the goal: "the interface is translatable" [code: docs/PROJECT.md:32].

**Two parts are already translated.**

- Cards: an English table of 43 keys [code: openbot/app/src/freeduet/person-language/cards.ts:53-127] and an Italian table typed to the same keys [code: openbot/app/src/freeduet/person-language/cards.ts:136]. `SameShape` rejects a missing or extra key at compile time [code: openbot/app/src/freeduet/person-language/cards.ts:45-47]. The two key sets are identical.
- A code with no table, such as `de`, shows English [code: openbot/app/src/freeduet/person-language/cards.ts:214-220]. Plural forms come from `Intl.PluralRules` [code: openbot/app/src/freeduet/person-language/cards.ts:226-234] [doc: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules].
- The lookup has no per-key fallback [code: openbot/app/src/freeduet/person-language/cards.ts:250]. The compile-time check is what keeps it complete.
- The setting `FREEDUET_PERSON_LANGUAGE` is one language for the whole deployment [code: openbot/server/src/freeduet/person-language.ts:16]. The server reads it [code: openbot/server/src/config.ts:1582], sends it from `/api/capabilities` [code: openbot/server/src/app.ts:547], and adds it to each run [code: openbot/server/src/copilot.ts:1375].
- The app reads it through `PersonLanguageProvider`. The capabilities answer wins, and local storage gives the first paint [code: openbot/app/src/freeduet/person-language/use-card-text.tsx:58-69] [code: openbot/app/src/freeduet/person-language/use-card-text.tsx:60] [code: openbot/app/src/freeduet/person-language/stored-language.ts:16].
- The provider sits inside the signed-in area [code: openbot/app/src/routes/_authed.tsx:27-32]. Its comment gives the reason: the chat runtime needs a session [code: openbot/app/src/routes/_authed.tsx:24-25].
- Nine server sentences exist in English and Italian [code: openbot/server/src/freeduet/person-language.ts:92-129]. `personText` picks Italian only for `it` and English for every other code [code: openbot/server/src/freeduet/person-language.ts:139]. Callers: [code: openbot/server/src/openduet/brief.ts:259], [code: openbot/server/src/openduet/triage.ts:129] and [code: openbot/server/src/proactive/engine.ts:349].

**Member text already follows the person.**

- Each member's shared rules say to reply in the person's language. The line appears 12 times, first at [code: openbot/examples/freeduet/agents.yaml:108].
- The run carries the language to the member [code: openbot/agent-freeduet/freeduet/person_language.py:25] [code: openbot/agent-freeduet/freeduet/agui.py:77].
- `tool_notes.py` is written for the member, so it can stay English [code: openbot/agent-freeduet/freeduet/tool_notes.py:1-8].

**Fixed English that a person can read.**

- The no-answer sentence [code: openbot/agent-freeduet/freeduet/report_guard.py:217] and the usage-limit sentence [code: openbot/agent-freeduet/freeduet/engine_errors.py:141].
- Four "could not be reached" messages [code: openbot/server/src/http-server.ts:193] [code: openbot/server/src/provider-oauth.ts:332] [code: openbot/server/src/identity/github-oauth.ts:137] [code: openbot/server/src/identity/github-oauth.ts:190].

**The first screens.**

- Sign-in: [code: openbot/app/src/routes/sign.tsx:251] and [code: openbot/app/src/components/passwords/sign-in-form.tsx:176], with 10 and 24 candidates.
- Approvals: "Always allow" [code: openbot/app/src/components/approvals/approval-card.tsx:201], the aria-label "Waiting for your approval" [code: openbot/app/src/components/approvals/approval-card.tsx:111], the rule table [code: openbot/app/src/components/approvals/rules.tsx:46], the page title "Approval rules" [code: openbot/app/src/routes/_authed/settings/approvals.tsx:16] and "Send email" [code: openbot/app/src/lib/approval-view.ts:95].
- Chat: the composer placeholder "Ask anything" [code: openbot/app/src/components/channels/composer/composer.tsx:352] and the menu entry [code: openbot/app/src/components/shell/menu-sheet.tsx:46].

**Dates and numbers follow the browser.**

- 38 call sites use `toLocale…` or `Intl` in the app (non-test). Two pass the person's language and fall back to the browser when none is set [code: openbot/app/src/freeduet/person-language/cards.ts:283] [code: openbot/app/src/freeduet/person-language/cards.ts:292]. The other 36 use the browser's default. One of them only reads the time zone [code: openbot/app/src/components/computer/demonstration-recorder.tsx:69].
- Approval times use `Intl.DateTimeFormat(undefined, …)` [code: openbot/app/src/lib/approval-view.ts:234]. An undefined locale means the browser's own locale [doc: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat].

**Preferences and pairing.**

- A per-person preference route exists [code: openbot/server/src/user-preferences-routes.ts:13], with a client [code: openbot/app/src/components/settings/message-list-preference.tsx:25].
- No pairing screen exists in the app. The roadmap marks pairing "In design" [code: docs/ROADMAP.md:50].

**The upstream registry.**

- FreeDuet is a thin fork of OpenDuet [code: docs/UPSTREAM_TOUCHES.md:3]. Every upstream file changed needs a row [code: CLAUDE.md:49]. Nothing is proposed upstream without the maintainer's approval [code: docs/UPSTREAM_TOUCHES.md:5].
- The registry names 21 of the 202 upstream files that hold candidates. The other 181 have no row. A file counts as named when a row contains its path [code: docs/UPSTREAM_TOUCHES.md:1-198].
- The card work (D26) touched 14 upstream app files in rows 126 to 136, for the 43 card strings [code: docs/UPSTREAM_TOUCHES.md:126-136]. Its rule: no string, order or class of the English render changes [code: docs/UPSTREAM_TOUCHES.md:129].

**Build and tests.**

- `strict` is on [code: openbot/tsconfig.base.json:6]. Neither that file nor `openbot/app/tsconfig.json` sets `resolveJsonModule`, so a JSON catalogue would need that change first [code: openbot/app/tsconfig.json:1].
- Tests to extend: [code: openbot/app/tests/freeduet-card-language.test.tsx:1], [code: openbot/server/tests/freeduet-person-language.test.ts:1] and [code: openbot/agent-freeduet/tests/test_person_language.py:1].
- Models for a ratchet: [code: openbot/server/tests/typecheck-baseline.txt:1] and [code: openbot/server/tests/assertion-shape.test.ts:1].

**The site.**

- Twelve language files sit in `site/src/lang/`. `en.json` holds 172 keys [code: site/src/lang/en.json:1].
- `checklang.js` compares each file's key shape and HTML tags. It does not check placeholders [code: site/tools/checklang.js:1-6]. No CI job covers `site/` [code: CLAUDE.md:156].
- `build.py` loads all twelve (line 8) and writes them into the page script (line 9) [code: site/tools/build.py:8-9].

## 3. The design

### 3.1 The smallest version worth shipping

**Scope.** Four daily areas: sign-in; chat (composer, channel chat, transcript, menu, settings sidebar); approvals (card, waiting, Settings → Approval rules and its tables, approval labels); and the two FreeDuet sections for full access and about. Admin and the rest of settings stay English for now.

**Catalogue.** One new FreeDuet-owned file, `openbot/app/src/freeduet/person-language/ui-text.ts`. It holds an English table keyed by ids such as `approval.alwaysAllow`, and one typed table per language, checked the way the Italian card table is [code: openbot/app/src/freeduet/person-language/cards.ts:136]. Ids mean an English edit does not orphan a translation. A language with no table gets English.

**Language source.** The same as cards: the deployment setting, then the capabilities answer, then local storage for the first paint. Move `PersonLanguageProvider` from `_authed.tsx` [code: openbot/app/src/routes/_authed.tsx:27-32] to `__root.tsx`, beside the theme provider [code: openbot/app/src/routes/__root.tsx:123]. It reads capabilities and local storage only, and mounts no chat runtime. So the comment at [code: openbot/app/src/routes/_authed.tsx:24-25] does not apply to it. Set `document.documentElement.lang` from the same value. The attribute holds one BCP 47 tag, and screen readers use it [doc: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang].

**Missing text.** Two cases, both safe. A language with no table shows English. A key missing from a table fails the type check, so a partial translation cannot ship. No per-key fallback at run time is added, because it would hide the gap.

**Dates and numbers.** When the deployment sets a language, pass it to the date and number calls, as [code: openbot/app/src/freeduet/person-language/cards.ts:283] already does. When it sets none, keep the browser default.

**English stays the same.** A render test checks the approval card and the composer in English against today's strings. This is the rule in [code: docs/UPSTREAM_TOUCHES.md:129].

**Server.** Turn the nine sentences into one typed table per language [code: openbot/server/src/freeduet/person-language.ts:92-129]. `personText` [code: openbot/server/src/freeduet/person-language.ts:134] looks up the code and falls back to English. This removes the test that picks Italian only for `it` [code: openbot/server/src/freeduet/person-language.ts:139].

### 3.2 Where text lives

- FreeDuet-owned files need no registry row: `openbot/app/src/freeduet/person-language/ui-text.ts` and `openbot/server/src/freeduet/person-language.ts`.
- An upstream file changes only where a literal becomes a key lookup. That is one string per edit, with no reordering and no restyling.

### 3.3 Tests that stop a string being forgotten

1. Compile time: a missing key fails the type check. `SameShape` already does this for cards [code: openbot/app/src/freeduet/person-language/cards.ts:45-47].
2. Ratchet: a test counts literal text in the files already translated and compares the count with a baseline list. The list may only shrink, as `typecheck-baseline.txt` does. A new English literal in a translated file fails.
3. Parity: every table has the same keys (compile time) and the same `{name}` placeholders as English. `checklang.js` does not check placeholders, so this needs its own test.
4. Render tests in English and Italian for screens without popups. Menus and popups do not open under happy-dom [code: CLAUDE.md:178-179].
5. English unchanged: the render test in section 3.1.

### 3.4 How a contributor adds a language

1. Copy the English table and the nine server sentences. Translate the values and keep every `{name}`.
2. Type the new table against the English one. The type checker lists each missing key.
3. Add the table to the lookup, one line per file.
4. Use one of the 98 dictation codes [code: openbot/server/src/dictation/languages.ts:11]. The setting accepts only those.
5. Run the tests in section 3.3. A table written by a model is a draft until a native reviewer approves it (decision 5).

### 3.5 What comes after v1

- Per-person language. The preference route already exists [code: openbot/server/src/user-preferences-routes.ts:13], and the deployment setting stays the default. The roadmap already lists language under "Settings changed in chat" [code: docs/ROADMAP.md:47]. Size L.
- Admin pages (620 candidates): size L. Rest of settings (87 candidates): size M.
- Server sentences the person reads (section 2): size S to M.
- Agent-freeduet text: size S. `tool_notes.py` can stay English.
- Pairing: no code yet, so its screens will be new files.
- The site is already multilingual and stays separate.

## 4. Slices

| # | Builds | Proved by | Needs first | Size |
|---|---|---|---|---|
| S1 | `ui-text.ts` (English table, typed tables, lookup); `lang` set from the provider; provider moved to `__root.tsx` | Type check; lookup test with English fallback; sign-in page sends no runtime request | D2, D3 | S |
| S2 | Server: nine sentences as one typed table per language; `personText` falls back to English | Every table has every key; English output unchanged; `freeduet-person-language.test.ts` passes | D3 | S |
| S3 | Sign-in: `routes/sign.tsx` (10 candidates) and `sign-in-form.tsx` (24) | English and Italian render tests without popups; existing sign-in tests pass | S1, D1, D4 | S |
| S4 | Approvals: nine upstream files (81 candidates) and the FreeDuet full-access and about sections (21) | Render tests for card and waiting; each button keeps its action; approval-time test | S1, D1, D4, D5, D6 | M |
| S5 | Chat: composer, channel chat, transcript, menu sheet, settings sidebar (61 candidates in five files) | Render tests for composer and transcript; menu test without popups | S1, D1, D4 | M |
| S6 | Ratchet and parity tests with a baseline list | Ratchet fails on a new English literal; placeholder test fails on a changed `{name}` | S1 to S5 | S |
| S7 | Contributor guide and a dry run with a test language | A table with one key missing fails; a complete one passes | S6 | S |

Counts per file come from the parse in section 2 [code: openbot/app/src/routes/sign.tsx:251] [code: openbot/app/src/components/approvals/approval-card.tsx:201] [code: openbot/app/src/components/channels/composer/composer.tsx:352]. S1 to S5 touch 18 upstream files. Nine already have a registry row. Nine need one: `sign.tsx`, `sign-in-form.tsx`, `rules.tsx`, `bot-rules.tsx`, `team-settings.tsx`, `shared-use-requests.tsx`, `menu-sheet.tsx`, `settings-sidebar.tsx` and `__root.tsx` [code: docs/UPSTREAM_TOUCHES.md:1-198]. Moving the provider out of `_authed.tsx` also changes that file's D26 row [code: docs/UPSTREAM_TOUCHES.md:126-136].

## 5. Rules that must hold

- **Logins first** [code: CLAUDE.md:26]. No model call translates text at run time. Drafts are made once and checked in. The language setting selects no engine.
- **Never read, copy or forward subscription credentials** [code: CLAUDE.md:31]. The language provider reads one capabilities value and one stored code, nothing else.
- **No secrets, no personal data** [code: CLAUDE.md:33]. Catalogues hold generic text. Any new field in `/api/capabilities` is projected explicitly, as the comment at [code: openbot/server/src/app.ts:503-505] requires.
- **Public wording** [code: CLAUDE.md:34]. Docs, catalogues and PR text name no private projects and no sources of ideas.
- **The person's approval for real account actions** [code: CLAUDE.md:36]. Translation changes no action, and a label keeps the action it names. Approval wording gets a native reviewer before release (decision 5).
- **Change only what was asked** [code: CLAUDE.md:48]. v1 changes only the listed strings, and the English render stays the same.
- **Upstream changes stay minimal** [code: CLAUDE.md:49]. One registry row per upstream file. Nine files need a new row (section 4).
- **Roadmap follows decisions** [code: CLAUDE.md:77]. When the maintainer decides, row 53 of [code: docs/ROADMAP.md:53] changes in the same session.

## 6. Open decisions

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| 1 | Scope of v1 | (a) four daily areas; (b) plus admin; (c) whole app | **(a)**, now superseded. Decided 14 November 2026: no translation of the app for now; it stays in English, and members still reply in the person's language (D26). | It covers what a person sees every day. Admin alone holds 620 candidates, and the whole app about 2,400. |
| 2 | Where the language comes from | (a) deployment setting now, per person later; (b) browser language on sign-in only; (c) per person now | **(a)** | One language per deployment is the chosen design [code: openbot/server/src/freeduet/person-language.ts:16]. The capabilities answer is public by code and by test [code: openbot/server/src/app.ts:503-505]. |
| 3 | Catalogue format and library | (a) typed TypeScript tables; (b) JSON files; (c) a library such as i18next or FormatJS | **(a), no library** | `SameShape` already checks keys [code: openbot/app/src/freeduet/person-language/cards.ts:45-47]. JSON needs `resolveJsonModule`, which is off [code: openbot/tsconfig.base.json:6]. No new dependency. |
| 4 | Upstream strategy | (a) wrap strings in place, one row per file; (b) copy screens into FreeDuet folders; (c) propose a text layer to the upstream project first | **(a)** | One row per file is the rule [code: CLAUDE.md:49]. Copies drift apart. A proposal upstream needs the maintainer's approval first [code: docs/UPSTREAM_TOUCHES.md:5]. |
| 5 | Who checks translated approval wording | (a) model drafts accepted and marked; (b) reviewed before release | **(b)** for approvals and new languages; (a) for other text | "Always allow" is consent, and the maintainer reads Italian only [code: docs/M1_PLAN.md:197]. |
| 6 | Dates and numbers | (a) deployment language when set, browser otherwise; (b) browser always, as today | **(a)** | Dates then match the language on screen. A deployment that sets nothing changes nothing [code: openbot/app/src/freeduet/person-language/cards.ts:283]. |

## 7. What was not verified

- No browser run. Nothing was rendered, and popups need a real browser (the happy-dom limit, [code: CLAUDE.md:178-179]).
- Counts come from a parse: an upper bound, not de-duplicated. The 181 registry gaps use a path match on each row.
- `/api/capabilities` answers with no session: the capabilities test calls it with none [code: openbot/server/tests/freeduet-person-language-capabilities.test.ts:21]. The test was not run here. The order of the gate at [code: openbot/server/src/app.ts:683] is [assumed].
- Italian wording has no native reviewer yet. No live member reply in Italian was run.
- No merge trial against upstream edits. origin/main may have moved past 021cad8.
- The MDN pages were read through a fetch, not in a browser.
