# Changelog

All notable changes to FreeDuet. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not promised semantic versioning yet; it is pre-1.0 and one person maintains it.

Each version says what was and was not run live. "Run live" means run on a real installation by the maintainer; "built and tested in CI" means the automated tests passed and nobody has used it. The statements come from the release notes and from [docs/ROADMAP.md](docs/ROADMAP.md); where a PR number is given it is a merged pull request of [MarcoDeliaBot/freeduet](https://github.com/MarcoDeliaBot/freeduet/pulls). The pull requests of each version are those merged between its tag and the one before (`git log --first-parent --merges <previous tag>..<tag>`).

## [Unreleased]

### Changed

- First start: after Check again, the sentence that says Claude is not connected is drawn in coral, the coral of the wide approval card, instead of the problem red. Green when connected and grey while FreeDuet cannot tell are unchanged.
- Onboarding's "Where your data lives" step now says conversations and memory stay in this install's own database, with nothing sent to a hosted memory service, when `FREEDUET_INTELLIGENCE=off` (the default); and that CopilotKit gets no usage events when its telemetry is off (`COPILOTKIT_TELEMETRY_DISABLED=true` or `DO_NOT_TRACK=1`, the install's default). It said CopilotKit's cloud, and that CopilotKit receives usage events, which were false for a default install. Tested; not yet run live.
- FreeDuet advertises nobody (D51): the bar that offered help self-hosting is off by default for FreeDuet's package, and onboarding no longer shows the slide that sent the person to another company's products and sales contact. The credit to the upstream authors is unchanged, and `OPENBOT_SELF_HOST_BANNER=true` brings the upstream behaviour back. Tested; not yet run live.
- An imported team member's instructions may be up to 10,000 characters, up from 8,000, in the team file reader, in the server's limit for an imported member and in the app's counter. Tested; not yet run live.

### Fixed

- Asked to do something on the person's own computer (for example to update a program), a member now says plainly that it works in its own computer and cannot install, update or run their programs, never promises that sharing a folder would make that possible, and gives at most three steps the person can take; it no longer reads mail to reinterpret a request that is not about mail. The Evidence line of every report is written in plain words, with no tool names or ids unless asked (D59). Prompt change, not yet run live: new eval case iris-24.
- On the wide layout the members' faces were cut at the edge of their 40 px circle in a real Chrome (a cap, a coin, a hat or a headset showed as a sliver): the accessory was drawn outside the picture and relied on an overflow that Chrome did not always honour. Each face now draws its whole canvas inside its picture, with the same 40 px in the row. Tested; the maintainer has not yet seen it live.
- A routine that is switched off just before its scheduled run now leaves a row in its History saying so ("This routine was switched off before this run could start, so it did not run."); before, that occurrence left no trace. Every other way a run does not start or finish already left a row with a reason. Built and tested; not yet run live (D56).
- A routine run that cannot start because the conversation is busy (you are writing in that chat, or another turn is running there) now shows as "skipped" in its History with "The conversation was busy when this run was due, so it did not run.", where it showed as failed with "Thread lock denied". It no longer counts toward switching the routine off after ten failures in a row. Every other error still counts as before. Built and tested; not yet run live (D57).
- A member can read what is in Spam and in the Bin: a Gmail search that says `in:spam` or `in:trash` reads that folder, read-only, on both ways of connecting Gmail, and an account with no Spam or Bin folder gets a plain sentence instead of an empty list. Before, the search never reached them, so after Otto moved mail to Spam, Iris searched, found nothing and the person read it as lost mail. Default searches are unchanged. Built and tested against fake servers; not run on a real mailbox (D53).
- With no calendar connected, members no longer get a calendar tool to call (four calls failed in one morning): the tool is left out of the run, and the member is told once that no calendar is connected and that one is added on the Connections page. With a calendar connected nothing changes. Built and tested; not yet run live (D53).

### Added

- Mark, the marketer, has a new skill, `/design-craft-floor`: a checklist of the basics to check on a page before it is called finished (contrast, spacing, type, motion, states and copy).
- Office files (D61): the member's computer image now carries headless LibreOffice (Writer, Calc and Impress from the distribution, installed and not modified), reached only through `office-convert`, a small wrapper of ours with two jobs. `recalc` calculates a spreadsheet's formulas in a temporary folder and prints each formula cell with its calculated value (it keeps no file; `--keep` writes a recalculated copy for reading, `--replace` overwrites only a regular file the member made earlier), so a member can check the totals of the formulas it wrote before it tells you anything; the file you receive is still the original. `pdf` turns a .docx, .xlsx or .pptx into a PDF. The file goes through `office-inspect` first (a macro file, an old format, a password or a bomb is refused and LibreOffice never starts); a workbook that uses a function LibreOffice 24.2 cannot calculate is refused by `recalc`, and error values it finds are reported. LibreOffice runs on a throwaway profile with macros off under one overall limit of 105 seconds; nothing existing is ever replaced or followed through a link. The skills `/spreadsheets` and `/word-documents` say so, and that some phone and mail previews show formula cells empty. The calculation is LibreOffice's and not Excel's. Costs about 424 MiB more installed in every member's computer image (estimated from the package list, no image was built). Built and tested in CI with a stand-in `soffice` and, on a machine that has it, the real program; not run live.
- Office files, first slice (D58): Penny can make, read and change an Excel (.xlsx) file and Wren a Word (.docx) file, in their own computer, and hand it over with the Download card. Each has one new skill (`/spreadsheets`, `/word-documents`) and one new paragraph in their prompt. The computer image carries python-docx, openpyxl, python-pptx, pypdf, reportlab, pdfplumber and defusedxml, pinned to exact versions and hashes, and `office-inspect`, a small read-only inspector that reports a file's type (from its bytes), counts, formulas, macros and external links, and refuses macro files, old binary Office files, zip bombs and XML entity bombs. Limits stated in the skills: no macros, no real Excel or Word, formulas are written but not calculated here, pages are not drawn, nothing is sent. Three new eval cases (penny-xlsx-1, penny-xlsx-2, wren-docx-1; 89 cases, 40 safety). Built and tested in CI; not run live and no image was built.
- First start: a card in the chat when Claude is not connected or not installed, with the exact command to copy and **Check again**, which looks again with nothing restarted. No one-time code passes through FreeDuet. A new server setting `FREEDUET_DEPLOYMENT=hosted` (default: your own installation) makes the server refuse the Claude check and tells the app to leave the card out. Built and tested in CI, not run live. The six decisions of the design note were taken on 16 November 2026.
- On a computer the app uses the whole screen (D55): from 1280 px your team is a column on the left with a mascot face and a short state for each of the twelve members, from 1024 px it folds to faces, and below 1024 px nothing changes. A card that waits on you is pinned at the top of its conversation (the same card as in Tasks), with a coral edge while it waits, large, with the answers side by side. The mascot faces of the home page are now in the app, from the same file. Built and tested in CI; run in a real browser against a local stack in the sandbox; not run live on the maintainer's installation.
- The card of a member that Iris handed a job to appears in the conversation you are writing in, under the hand-off line, and not only on the Tasks page (D52). It is the same card with the same buttons: deciding it in the chat is deciding it in Tasks, it runs once, and the member's answer comes back to the Bot that asked. Built and tested; not yet run live. No approval rule changed.
- Installer: `install.ps1` and its Pester tests now run in CI on a GitHub-hosted Windows runner (job `installer-windows`), up to the Ubuntu install, with a job summary of where each run stopped. The first run found a bug in the script (two lists of WSL names were nested when read), now fixed. Never run on a person's PC; the restart, the Ubuntu user step, Docker and the first start are not covered (#293).
- Installer: an opt-in systemd service for FreeDuet inside WSL, with `install.sh --service` and `install.ps1 -Service` (`install-service.sh`, #285). Tested with fake commands only; never run under real systemd or on a real Windows machine.

### What was run live

Run live on one real installation (the maintainer's), 16 November 2026. This supersedes the note under [0.2.2] that pairing a phone with the code had not been tried yet:

- pairing a phone with the one-time code, shown as a QR code under Settings ("Pair a phone or another browser"): the installation's list holds one `computer` pairing and one `device` pairing, neither revoked. This is the first live run of pairing a phone (#283, D49).

Not checked yet: revoking a pairing, the two-minute expiry of the code, a second phone, and an approval allowed from the paired phone.

## [0.2.2] - 2026-11-16

Commit `bdd8937`, tag `v0.2.2`, published as a GitHub release on 16 November 2026.

### Added

- Standing mail rules: Otto makes a rule from the person's own typed order, and FreeDuet applies it to new mail every few minutes. A rule can label, archive, mark read, move to Spam or move to the Bin; it never forwards, replies, sends or deletes for good. The person sees the rules under Connections and can disable or delete one. The rules come with two new database migrations (0073 and 0074), and the update script copies the database before it changes anything (#274, D46).
- Iris passes a "from now on" mail request to Otto, who keeps it as a standing rule (#279).
- A token for each paired browser: each browser gets its own token, which the person can rename or revoke under Settings, instead of the one secret of the installation. A phone or another browser is paired from the computer with a one-time code, as a link or a QR code, valid for two minutes. The cookie of an older installation is accepted only from the computer itself, and no longer after 16 February 2027. One new database migration (0076). After the update, a browser that reached FreeDuet through a tunnel is paired again once with `bash scripts/open.sh` (#283, D49).
- The messages of an approval card (title, what happens, reason) are shown in the person's language, in eleven languages; buttons and labels stay in English, and the server keeps and audits the English text (#281, D50).
- A notice above the message box when the browser is not paired with the computer. Members and Iris are told in that turn why a card appears (#278, D47).
- Release provenance: a workflow that builds a source archive of a tagged release, a SHA-256 file and a signed build-provenance attestation, and uploads them to the release ([docs/VERIFY.md](docs/VERIFY.md)). It first ran on this release, on 16 November 2026 (#270).
- [docs/VERIFY.md](docs/VERIFY.md) (how to check the project yourself), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) and this changelog (#270).

### Changed

- Documents: the README, the roadmap and the comparison brought to the status after v0.2.1 (#273); stale facts after v0.2.1 corrected and broken links fixed in five documents (#275); broken relative links fixed in the mail-organisation design note (#276).
- Dependency updates: `pytest` in the twelve agent test requirement files, and `zip` in the desktop app (#272); `happy-dom` in the app tests moved to 21.0.4, with its Web Animations methods hidden there (#277).

### Fixed

- A card allowed inside a hand-off runs, and the member's answer comes back to the Bot that asked. A repeated hand-off for the same action gets no second card (#279, D48).
- A card opened in a relay turn is not relayed a second time (#279).
- The automatic reviewer stays on when the person first switches an approval preference: the first saved row left it off. One new database migration (0075) sets the default. An installation that already has such a row can check and repair it with `bun scripts/repair-auto-review.ts`, which changes nothing unless run with `--apply` (#282).

### Security

- Standing mail rules are never lifted by Full access or by a saved "Always allow", and creating one is judged by the reviewer on the person's own typed words (#274).
- Dependency alerts: #272 closed 15 and #277 closed 1. Seven alerts remain open on 16 November 2026: six in the phone app's lockfile and one in the desktop app's `Cargo.lock` (see the Trust table in [docs/ROADMAP.md](docs/ROADMAP.md)).

### What was run live

Run live on one real installation (the maintainer's), 16 November 2026:

- a standing mail rule for one sender domain, created from the person's typed order with no card, applied to the mail already there, then applied by itself to new mail at the next pass (#274);
- Iris handing a "from now on" mail request to Otto (#279);
- the card messages shown in Italian on the Tasks page (#281);
- the update to the per-browser token: the computer's browser paired again with the one-time link, and the list under Settings showing it (#283). Pairing a phone with the code has not been tried yet;
- the notice for a browser that is not paired, seen on a phone (#278).

### Not run live

- The card allowed inside a hand-off (#279).
- The sentences that tell the members why a card appears (#278), not yet observed with a model.
- Rules other than the one above, and the eval cases otto-16 and otto-17 for mail rules (#274).
- Carried over from v0.2.1, still not run live: moving mail to the Bin on a real mailbox, the routine card, "done when", the Undo line, the mailbox button, "Check again", the installers on a clean machine, macOS.
- Release provenance (#270): the release workflow ran on this release for the first time, on 16 November 2026.
- No team-eval run is recorded for this version.

## [0.2.1] - 2026-11-15

Commit `ddb0cde`. Release notes: "Unlike v0.2, parts of it have now been run live on one real installation (the maintainer's)."

### Added

- Otto organises a mailbox: create labels, label, archive, mark read or unread (#254), move to the Bin (#260) and to Spam (#261). Nothing is deleted for good.
- A direct order in the person's own written message runs a mailbox change with no card (#258).
- After a move to the Bin or to Spam over IMAP, the tool checks that the messages left the mailbox (#261).
- Connect a mailbox from the chat in three steps; tools an update adds reach the member who holds the mailbox (#264).
- `scripts/update.sh`: one command that updates FreeDuet and can go back (#245).
- A tool that moves everything made with no sign-in to the address the person signs in with, with a backup first (#220).
- Remote sessions with limited powers, for deployments with sign-in (#221).
- Iris proposes the team in her first message (#239). "Done when" on every hand-off (#243). A routine card in the chat (#241). One line with Undo after a member is added from chat (#265). A person's own name, tone and language for the team, from chat (#222).
- Routines: 90-day history, a conversation link per run, a Missed label (#207).
- Engines page redesigned as cards, "Who uses what" and "Keys and Spending" (#215). Team file export for an administrator (#216). An import preview that saves nothing (#214). An imported member may hold 8,000 characters of instructions (#218).
- First start: "Check again" re-detects the engine with no restart, and plain-words messages for a missing or signed-out Claude (#266).
- The site in 12 languages (#249 to #253, with the front page and site brought level in #206, #212, #235).
- Desktop crate built in CI on Linux (#219). Five team-eval cases for the 14 November rules (#209). The four cases that fail every run were fixed (#269).

### Changed

- The desktop app generates the database password instead of a default (#213).
- Comparison, README and plan documents brought to the state of each version (#206, #211, #212, #233, #234, #235, #242, #263, and the roadmap pull requests #236 to #238, #244, #246, #247, #255 to #257, #259, #262, #267). A green tick in the comparison means available today (#242). The price of cloud FreeDuet is not set (#256).
- Tests: explicit timeouts for load-sensitive tests and two races fixed (#224); a test of reads of a page that keeps navigating made stable (#225).
- CLAUDE.md: the Haiku swarm rule (#248).
- Dependency updates: zod 4.6.7 (#223), `rustls` (#232), mobile app packages (#185, #186, #227, #230, #231).

### Fixed

- A remote session is no longer shown a false "Couldn't load voice chats" error (#268).
- Reads of a page that keeps navigating count each navigation once and bound the snapshot (#225).

### Security

- Approving a request in the inbox never gives a member a tool that sends (#208).
- Settings are never changed in a run nobody is attending (#210).
- Words from the microphone never earn the typed-recipient shortcut or Full access (#217).
- A remote session earns neither the typed-recipient shortcut nor Full access, and what it writes asks a card (#221).
- A mailbox change is judged by a model that reads only the person's own typed words; the release notes name this as a known limit: it can be wrong in both directions ([docs/design/mail-organise.md](docs/design/mail-organise.md)).
- Dependency updates listed under Changed; #223 is the branch `zod-security-bump`. The pull request titles do not say which of the others fix an advisory.

### What was run live

Run live on one real installation (Windows with WSL2, Gmail through an app password):

- the update, four times, each with a database backup first;
- the move from no sign-in to Google sign-in (1,699 rows moved, backup taken);
- Otto moving spam to the Spam folder on a real mailbox, ordered through Iris, with no card.

Team evals, live, 15 November 2026 (84 cases, 38 safety cases): one full run, 66 of 73 scored cases passed, 11 skipped. That run did not meet the thresholds (each member at least 90%, safety cases 100%). The seven failures were re-run three times each: penny-5 passed 3 of 3, iris-1 and cam-6 passed 2 of 3, and four failed every time; those four were cases added after v0.1 that had never passed (three a missing sentence in a member's prompt, one a line that demanded one exact wording), were fixed with no safety requirement lowered, and then passed 12 of 12 runs. A full three-run certification has not been repeated on this version, and the public report for this run was not published at release.

### Not run live

Moving mail to the Bin on a real mailbox, the routine card, "done when", the Undo line, the mailbox button, "Check again", the installers on a clean machine, macOS.

## [0.2] - 2026-11-14

Release notes: "everything below is built and tested in CI (26 checks green on this commit). None of it has been run live on a real installation yet, and the team evals have not been re-run since v0.1." The release notes do not list pull request numbers; see `git log --first-parent --merges v0.1..v0.2`.

### Added

- Two new members: Mark (marketing) and Cam (video).
- "Full access without payments" as a second setting.
- A Download button for files a member makes.
- An Engines page: each engine's state, each member's chain, automatic or ask-first switching.
- A second engine kind (an Anthropic-compatible endpoint you name), off by default; a key-free local endpoint entry, never yet run with a real model.
- A spend ledger with caps. Paid gateways stay closed.
- Settings changed in chat with an Undo button; routines with Next runs and History.
- A first-step install script for Ubuntu and one for Windows through WSL2. No double-click installer.
- Sign-in can be limited to exact email addresses.
- A read-aloud button with a local voice, off by default.

### Changed

- Only one member sends email; the others go through Iris.

### Security

- Each installation makes its own secrets (tokens, worker secret, database password) instead of the example values.
- A separate token for each member's computer.
- With no sign-in, only this machine's own names are answered (server, member computers, supervisor).
- Member computers cannot reach the home or office network unless switched on; open connections close when it is switched off.
- A tool nobody classified asks first. Routines always ask with a card, even with Full access.
- A tool to replace the vault key on an installation that already holds saved logins.
- GitHub secret scanning, push protection, Dependabot, CodeQL and OpenSSF Scorecard are on.

### What was run live

Nothing. Built and tested in CI only. The team evals were not re-run since v0.1.

## [0.1] - 2026-11-13

The first public version. The release was published on 14 November 2026 (the notes say "the first public version of FreeDuet, 13 November 2026"). "An early release, built and used by one maintainer: not everything has been tested." The release notes do not list the features beyond a self-hosted team of AI assistants on the person's own Claude subscription login, so this entry does not either: see [README.md](README.md) at tag `v0.1`.

### What was run live

The team evals, on 13 November 2026: 43 of 43 scored cases passed (2 skipped), every member at 100% of its cases, the safety cases 45 runs out of 45, after a first full run of that night had failed on one member (a browser fault, then a turn that ended in silence; fixed in #92 and #93). The public report is [evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md](evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md). Two cases were graded again from saved answers, in code instead of by the grader model, and the report says so. The clean start was run by CI on Linux; whether the maintainer ran the rest of the stack on a real installation is not stated in the v0.1 release notes.

[Unreleased]: https://github.com/MarcoDeliaBot/freeduet/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/MarcoDeliaBot/freeduet/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/MarcoDeliaBot/freeduet/compare/v0.2...v0.2.1
[0.2]: https://github.com/MarcoDeliaBot/freeduet/compare/v0.1...v0.2
[0.1]: https://github.com/MarcoDeliaBot/freeduet/releases/tag/v0.1
