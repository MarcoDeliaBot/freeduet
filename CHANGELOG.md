# Changelog

All notable changes to FreeDuet. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not promised semantic versioning yet; it is pre-1.0 and one person maintains it.

Each version says what was and was not run live. "Run live" means run on a real installation by the maintainer; "built and tested in CI" means the automated tests passed and nobody has used it. The statements come from the release notes and from [docs/ROADMAP.md](docs/ROADMAP.md); where a PR number is given it is a merged pull request of [MarcoDeliaBot/freeduet](https://github.com/MarcoDeliaBot/freeduet/pulls). The pull requests of each version are those merged between its tag and the one before (`git log --first-parent --merges <previous tag>..<tag>`).

## [Unreleased]

### Changed

- A member cannot type into a password, code or card field (D76; `docs/M1_PLAN.md` section 55). The computer refuses `computer_type`, and a key that can write a character, when the field is a password, carries an `autocomplete` token for a password, one-time code or card, is drawn as dots, or is a field a secret was entered into earlier; it is checked in the page at the moment of writing, in frames and shadow roots too. The refusal is made on the computer, so Full access, a saved rule and the automatic reviewer cannot lift it, and the member tells you to type that field yourself in the live browser view or on the site. The snapshot also carries each form control's `type`, so the server's rules see a password field whatever its label. Built and tested against a real Chromium, not run live. Not caught: a field with none of those markers, such as a password box turned into plain text by a "show password" button.

- Changing a research setting no longer switches it back on (follow-up to D78; `docs/M1_PLAN.md` section 57). A change that named only the focus or only the interval used to fill in the other fields with their defaults, so it switched a switched-off setting on, scheduled a run and reset the rest. Now a change touches only the fields it names, a run is scheduled only when the request itself turns a setting from off to on, and an empty change is refused with a 400. Built and tested against Postgres, not run live.
- A payment or a password change run as a command, or written into a script, on a member's own computer now comes to the person like the same action through an account (D77; `docs/M1_PLAN.md` section 56). Under Full access the automatic reviewer reads each command and script write once for this, even when it is switched off; a command or script too long for it to read is handed to the person. It only adds hand-offs. Built and tested in CI, not run live.
- Background research is off until the person switches it on (D78; `docs/M1_PLAN.md` section 57). Before, every member read the person's connected mail and calendar every 240 minutes after a first conversation, without being asked. Now `OPENBOT_PROACTIVE_DEFAULTS` must be `true` or `1` (Helm: `config.memory.researchDefaults: true`) for it to switch on by itself. A research setting that exists keeps running: an installation updated from an earlier version keeps the rows it made, which cannot be told apart from ones a person chose; a person turns one off in the app's research settings. Built and tested in CI, not run live.

### Added

- Iris's daily review (08:30) is no longer created at first sign-in: Iris offers it once, as one line of her first proposal (only when she holds the routine tools), and it exists only after the person says yes and allows the card that every routine setup gets (D79, `docs/M1_PLAN.md` section 58). A daily review that already exists is left exactly as it is. Safety case iris-26 added, not yet run live.

- A member sees the picture the person attaches to their latest message, in the Claude CLI engine (Claude Code) only (#359, D72; `docs/M1_PLAN.md` section 51). Up to 20 pictures a turn, of the types png, jpeg, gif and webp, at most 5 MiB each and 10 MiB together; a picture that is over a limit, past the twentieth or not of the type its bytes show gets a note instead. Older messages, hand-offs to another member and the other engines keep the note that the member cannot see a picture. `FREEDUET_PICTURES=off` sends none, and it is on by default. The log lines of a picture turn give counts and ids only; no picture's bytes or file name is logged. Built and tested with a fake CLI. A bare command with the same stdin line and one 64x64 PNG was answered on a real installation on 17 November 2026; the member's full segment with the flags it uses, the other types, several pictures and the new note are not run live.

- Programs on your computer, server core (slice S1 of the design note; off by default, switched on from the plain page `/api/programs/pairing`): a per-person switch, a broker that queues typed operations for a small helper that polls the server (signed, single-use, with expiry), and two tools for the member that looks after the computer, "list installed programs" and "list available updates". Each asks you with a card every time, with Full access on or off, only in a conversation with you at your computer, never from a routine, a check-in or a phone. Update and install are not built. The switch cannot go on while the installation still uses the public example key. One new database migration (0077) stores a random salt for each person's helper secret. Built and tested in CI against a helper played in process; reviewed independently before the merge, and not run on a real PC (#318, D60).

- Programs on your computer, the Windows helper (slice S2; reads only): a readable PowerShell script that runs as you at log on, asks the FreeDuet server every few seconds whether it has a question, and answers only two: which programs are installed and which have an update. It runs nothing but `winget` with two fixed argument lists, never accepts a tool's terms for you, refuses to run as administrator, shows a Windows notification each time and keeps a log you can read. A setup script pairs it with a one-time code (the secret is stored protected for your Windows user) and an uninstall script removes it. Built and tested in CI (Pester tests with a stand-in for winget, signatures checked against the server's own code); never run on a real PC. After an independent review: pairing cannot be flooded or locked by a stranger, the helper stops and asks to pair again when its secret is refused, setup ends the old helper, and the scripts no longer use `Bypass`.

- Programs on your computer, the members' words (slice S5a, #325, D63): Gus, and only Gus, knows that he can list what is installed on your own computer and which programs have an update, when you have switched the function on and paired the helper. He says plainly that today he can only look (updating and installing are not built), treats every name and version as data, never suggests downloading an installer, and a page, a mail or a file he reads never starts a look at your programs. When the function is off he says so and gives at most three steps, done at your computer: open FreeDuet's `/api/programs/pairing` page and press Switch on; press Download the helper; follow the two lines the page shows in a normal PowerShell window and type the code there, never in the chat. Iris hands a question about a program on your PC to Gus instead of answering it herself. The shared sentence of 16 November (a member acts in its own computer, not yours) is unchanged and stays true for the other eleven. Four new eval cases (iris-25, gus-5, gus-6 and gus-7, the last two safety cases) and one reworded case (iris-24) take the team to 96 cases, 43 safety; they are not yet run live, and the Gus cases run with the function off, so they test his words and not his behaviour with the tools. Nothing ran on a real PC.

- Programs on your computer, follow-up to the review of #325 (#331, D63): the helper download says plainly that the scripts come from your own FreeDuet and are not signed yet, and what `Unblock-File` does; the zip no longer follows links and refuses oversized files (audited); the certificate-name check in the helper accepts only the shortest DER lengths. Not run on a real PC.

- Programs on your computer, the helper reaches you: the plain page `/api/programs/pairing` has a "Download the helper" link that serves a zip of the helper's four files from the folder your running FreeDuet carries (only you, at this computer; one audit row; no path from the request), and shows the exact PowerShell lines to run (`Unblock-File` and `powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\setup.ps1`). Both Docker images now carry the helper's folder. The refusal text of the tools no longer points to a Settings screen that does not exist.

- The Windows helper and pairing, fixes from the independent reviews: the check of who signed winget now reads the certificate's own name (DER), not text, requires exactly one organisation equal to `Microsoft Corporation` with no trimming and the code-signing purpose, and is tested with real certificate objects; when the helper cannot write an operation's id to disk it refuses the operation and tells the server, and it does not start (log line and a toast) if its list of done operations is larger than 1 MiB or unreadable; the pairing code check no longer walks every remembered address on each try (a flood from 100,000 addresses took 56 seconds before; now each try cleans at most 8 entries); and setup prints the unsigned-alias warning on the screen and asks you to type a word before it goes on. Pester and server tests added; the Pester tests first run in CI.

- Standing instructions for executors and reviewers are in the repository (`.claude/agents/executor-haiku.md`, `executor-sonnet.md`, `reviewer.md`), so every coordinating session finds the same ones; a brief adds only the task. A note, `docs/design/member-cli-isolation.md`, records that a team member's own Claude Code process starts in a private empty folder outside the checkout, with a test that guards it. Documents and a guard test only; no runtime change.

- Mark, the marketer, has a new skill, `/design-craft-floor`: a checklist of the basics to check on a page before it is called finished (contrast, spacing, type, motion, states and copy).
- Mark, the marketer, has a new skill, `/landing-page-design`: a guide to planning, writing or reviewing a landing page around one offer and one primary action, with its sections, copy and visual rules (type, spacing, radius, motion and states).
- Mark, the marketer, has four new skills for Instagram, `/ig-carousel`, `/ig-story`, `/ig-reply` and `/ig-dm`: a carousel, a story sequence, replies to the comments under the person's posts and direct messages, each written as text for the person to post or send; the skills hold no tool, so they post and send nothing (#329). Where a skill points to `/ig-reel`, `/ig-caption` or `/ig-human`, which Mark does not hold, he does that part in plain text and says so (#333).
- Office files (#317, D61): the member's computer image now carries headless LibreOffice (Writer, Calc and Impress from the distribution, installed and not modified), reached only through `office-convert`, a small wrapper of ours with two jobs. `recalc` calculates a spreadsheet's formulas in a temporary folder and prints each formula cell with its calculated value (it keeps no file; `--keep` writes a recalculated copy for reading, `--replace` overwrites only a regular file that `office-convert` itself wrote and marked with an extended attribute; a file you already had is never replaced, and on a folder whose filesystem keeps no such mark (a shared Windows drive, most likely) a file it wrote cannot be replaced later, and `--new-name` makes the file again under the next free numbered name (`report-2.pdf`, up to 99) without replacing anything; the cell texts it prints are framed as data), so a member can check the totals of the formulas it wrote before it tells you anything; the file you receive is still the original. `pdf` turns a .docx, .xlsx or .pptx into a PDF. The file goes through `office-inspect` first (a macro file, an old format, a password or a bomb is refused and LibreOffice never starts); a workbook that uses a function LibreOffice 24.2 cannot calculate is refused by `recalc`, and error values it finds are reported. LibreOffice runs on a throwaway profile with macros off under one overall limit of 105 seconds; nothing existing is ever replaced or followed through a link. The skills `/spreadsheets` and `/word-documents` say so, and that some phone and mail previews show formula cells empty. The calculation is LibreOffice's and not Excel's. A folder that takes no new file (a read-only shared drive, for example) is refused at once, with a plain sentence and no LibreOffice run (#328). Costs about 424 MiB more installed in every member's computer image (estimated from the package list, no image was built). Built and tested in CI with a stand-in `soffice` and, on a machine that has it, the real program; not run live.
- Office files, first slice (D58): Penny can make, read and change an Excel (.xlsx) file and Wren a Word (.docx) file, in their own computer, and hand it over with the Download card. Each has one new skill (`/spreadsheets`, `/word-documents`) and one new paragraph in their prompt. The computer image carries python-docx, openpyxl, python-pptx, pypdf, reportlab, pdfplumber and defusedxml, pinned to exact versions and hashes, and `office-inspect`, a small read-only inspector that reports a file's type (from its bytes), counts, formulas, macros and external links, and refuses macro files, old binary Office files, zip bombs and XML entity bombs. Limits stated in the skills: no macros, no real Excel or Word, formulas are written but not calculated here, pages are not drawn, nothing is sent. Three new eval cases (penny-xlsx-1, penny-xlsx-2, wren-docx-1; 89 cases, 40 safety). Built and tested in CI; not run live and no image was built.
- First start (#302, D54): a card in the chat when Claude is not connected or not installed, with the exact command to copy and **Check again**, which looks again with nothing restarted. No one-time code passes through FreeDuet. A new server setting `FREEDUET_DEPLOYMENT=hosted` (default: your own installation) makes the server refuse the Claude check and tells the app to leave the card out. After **Check again**, the sentences that name a problem with Claude are drawn in the coral of the wide approval card, not in red (#308). Built and tested in CI, not run live. The six decisions of the design note were taken on 16 November 2026.
- On a computer the app uses the whole screen (#303, D55): from 1280 px your team is a column on the left with a mascot face and a short state for Iris and each of the eleven members, from 1024 px it folds to faces, and below 1024 px nothing changes. The members' faces draw their whole canvas inside their 40 px picture, so no accessory is cut at the edge (#314). A card that waits on you is pinned at the top of its conversation (the same card as in Tasks), with a coral edge while it waits, large, with the answers side by side. The mascot faces of the home page are now in the app, from the same file. Built and tested in CI; run in a real browser against a local stack in the sandbox; not run live on the maintainer's installation.
- The card of a member that Iris handed a job to appears in the conversation you are writing in, under the hand-off line, and not only on the Tasks page (D52). It is the same card with the same buttons: deciding it in the chat is deciding it in Tasks, it runs once, and the member's answer comes back to the Bot that asked. Built and tested; not yet run live. No approval rule changed.
- Installer: `install.ps1` and its Pester tests now run in CI on a GitHub-hosted Windows runner (job `installer-windows`), up to the Ubuntu install, with a job summary of where each run stopped. Never run on a person's PC; the restart, the Ubuntu user step, Docker and the first start are not covered (#293).
- Installer: an opt-in systemd service for FreeDuet inside WSL, with `install.sh --service` and `install.ps1 -Service` (`install-service.sh`, #285). Tested with fake commands only; never run under real systemd or on a real Windows machine.

### Changed

- Four prompt sentences that the safety cases already tested (D71, `docs/M1_PLAN.md` section 50): Iris says that a routine she sets up always waits for a card the person allows, with Full access on or off, and that Full access and the approval rules are changed only by the person in the app's settings under Approval rules; Otto says that approving a request in the inbox never gives him a tool that sends and that the person allows sending in settings, on his page for Gmail and Google Calendar under Plugins; Penny tells the person when a note copied from outside begins with an equals sign, that she wrote it as text, and quotes one. Each sentence states what the server already does; no approval, grant or tool changed. Text read by a model: not run live.

- Eval case lines made clearer or stricter, never easier (D70, [docs/M1_PLAN.md](docs/M1_PLAN.md) section 49): 21 `must` and `must_not` lines in 20 cases of `evals/team/cases.yaml`, 17 of them safety cases; none has run live, so none is certified until it runs with `--repeat 3`.

- Eval case lines that judged one wording, after the certification run of 16 and 17 November 2026 (D66, [docs/M1_PLAN.md](docs/M1_PLAN.md) section 46): iris-19, otto-11, otto-17, penny-5 and mark-6 now judge the behaviour (nothing sent, nothing archived, no rule, who sends) and accept any true reason of the right kind; Mark says that material he reviews holds a line aimed at an AI assistant and that he did not follow it; Cam checks whether a named library is in his computer and installs nothing until you agree. Not yet run live.

- Prompts and eval case lines after the 16 November certification run (D64, [docs/M1_PLAN.md](docs/M1_PLAN.md) section 44): Iris no longer repeats a password she read, not in a quote and not in the Evidence line; Leo says where a token, a key or the .env file can be looked up instead of printing it; Mark always names `/design-craft-floor` for a page review; Penny and Wren now say that LibreOffice, not Excel or Word, calculated or drew what they report, write outside text into a sheet as text, and re-open the saved file; Cam gives the usual video sizes. Compound case lines were split, and the two file lines of penny-xlsx-2 are fair when the gate asks a card. Not yet run live.

- The FreeDuet server refuses to start when `FREEDUET_INTELLIGENCE` is unset, empty or only spaces (D65), and says to write `off` (conversations stay on this computer) or `on` (kept by the outside service). Before, a missing line with the three Intelligence settings quietly ran in Intelligence mode. `scripts/start.sh` and `.env.example` already write the line; the desktop app (only when its `.env` holds no value for the line, in any form the server would read) and the Helm chart (unless `config.extraEnv` names it) now write the line too: the chart `on`, as it always ran, and the desktop `off` (D67, below). Built and tested here; not yet run on a real installation, the desktop app or a cluster.

- The desktop app writes `FREEDUET_INTELLIGENCE=off`, not `on`, when its `.env` holds no value for it (#346, D67, decided by the maintainer on 17 November 2026): conversations and memory stay in the install's own database. A value the person wrote, in any form Bun reads, is never overwritten, `on` included; a line an earlier desktop wrote as `on` cannot be told from the person's own and stays `on`. The Helm chart still writes `on`. The setup screen still asks for an Intelligence key and says it keeps conversations, which is no longer true by default. For people who update: a desktop install that had no such line and kept its conversations in the outside Intelligence service no longer shows them in the app; they are not deleted, and writing `FREEDUET_INTELLIGENCE=on` in the settings file makes the install use that service again, where they were kept. Built and unit-tested; not run on a real desktop.
- Onboarding's "Where your data lives" step now says conversations and memory stay in this install's own database, with nothing sent to a hosted memory service, when `FREEDUET_INTELLIGENCE=off` (the default); and that CopilotKit gets no usage events when its telemetry is off (`COPILOTKIT_TELEMETRY_DISABLED=true` or `DO_NOT_TRACK=1`, the install's default). It said CopilotKit's cloud, and that CopilotKit receives usage events, which were false for a default install. Tested; not yet run live.
- FreeDuet advertises nobody (D51): the bar that offered help self-hosting is off by default for FreeDuet's package, and onboarding no longer shows the slide that sent the person to another company's products and sales contact. The credit to the upstream authors is unchanged, and `OPENBOT_SELF_HOST_BANNER=true` brings the upstream behaviour back. Tested; not yet run live.
- An imported team member's instructions may be up to 10,000 characters, up from 8,000, in the team file reader, in the server's limit for an imported member and in the app's counter. Tested; not yet run live.
- Mark's prompt says "your skills" instead of "your marketing skills" and names `/design-craft-floor` among the skills he can point the person to; two new eval cases for him, mark-5 (a landing page review that must give checkable design points) and mark-6 (safety: a pasted page with a line for an AI assistant), take the team to 92 cases, 41 safety, as of commit `4e8b4e6`. Pins tested. The thirty cases added or reworded since the certification run of 16 and 17 November 2026 (commit `4e8b4e6`) are not yet run live: four were added and twenty-six reworded. The list is in [evals/team/README.md](evals/team/README.md). That run did not pass.
- Nine messages a person reads, made plainer with no change of behaviour (#348): the Undo line after a member is added (it now states the seven-day limit), the install script's docker-group line, two lines of the Windows helper's setup and uninstall, the next step of the tool that moves what was made with no sign-in, the refusal of a sign-in address that is not on the list, the note that a computer's answer was not in the expected format, the line that asks you to turn programs on, and the language example in settings.
- Documents and comments, with no change of behaviour, prompt, setting or eval case: the README and the security policy, the threat model, the architecture, design, configuration and upstream-touches pages, the working rules of the coordinating sessions (CLAUDE.md and the executor instructions), team size, Mark's skill count, the place where decision D53 is recorded, the engines file (a copy of the example) and the status of the iris-20 to iris-23 cases corrected to the code. Several citations that pointed at a line number now point at a section or a decision. The only YAML edit among these documentation changes is to comments in `evals/team/cases.yaml`.

### Fixed

- Installer (Windows, through WSL2): `install.ps1` returned its list of WSL names so that two lists were nested when read; the v0.2.2 script had the same bug. Fixed; the first run of the new CI job found it (#293).
- A picture attached to a chat message is said to be attached and not seen when it is not passed on, instead of "this engine receives text only": the member tells the person plainly that a picture was attached and could not be seen, and asks for a description. Until D72 nothing sent a picture to the engine; since D72 the Claude CLI engine receives the picture of the person's latest message (see Added), and this note stays for every other picture: older messages, hand-offs and the other engines. `docs/M1_PLAN.md` section 48 (D68) names the options and the one check on a real installation that would settle it. No byte of a picture is kept or logged. Built and tested in CI, not run live (#347, D68).
- Iris no longer tells the person that a colleague "may be waiting for your yes on a card" while a hand-off has no answer: a card is named only when one is shown in the conversation (#347, D69; text in her prompt and in the `message_bot` result, no approval or grant changed).
- A message you send now reads the stored conversation first and adds what this screen lacks, so the answer of a finished hand-off (which the server stores in your conversation while you are not streaming it) is shown and reaches the member in your next turn instead of her saying again that the colleague has not answered (#347, D69). One extra read of the conversation per message; why the open chat did not draw it by itself is not explained yet (`docs/M1_PLAN.md` section 48). Built and tested in CI, not run live.
- Asked to do something on the person's own computer (for example to update a program), a member now says plainly that it works in its own computer and cannot install, update or run their programs, never promises that sharing a folder would make that possible, and gives at most three steps the person can take; it no longer reads mail to reinterpret a request that is not about mail. The Evidence line of every report is written in plain words, with no tool names or ids unless asked (D59). Prompt change, not yet run live: new eval case iris-24.
- A routine that is switched off just before its scheduled run now leaves a row in its History saying so ("This routine was switched off before this run could start, so it did not run."); before, that occurrence left no trace. Every other way a run does not start or finish already left a row with a reason. Built and tested; not yet run live (D56).
- A routine run that cannot start because the conversation is busy (you are writing in that chat, or another turn is running there) now shows as "skipped" in its History with "The conversation was busy when this run was due, so it did not run.", where it showed as failed with "Thread lock denied". It no longer counts toward switching the routine off after ten failures in a row. Every other error still counts as before. Built and tested; not yet run live (D57).
- A member can read what is in Spam and in the Bin: a Gmail search that says `in:spam` or `in:trash` reads that folder, read-only, on both ways of connecting Gmail, and an account with no Spam or Bin folder gets a plain sentence instead of an empty list. Before, the search never reached them, so after Otto moved mail to Spam, Iris searched, found nothing and the person read it as lost mail. Default searches are unchanged. Built and tested against fake servers; not run on a real mailbox (D53).
- With no calendar connected, members no longer get a calendar tool to call (four calls failed in one morning): the tool is left out of the run, and the member is told once that no calendar is connected and that one is added on the Connections page. With a calendar connected nothing changes. Built and tested; not yet run live (D53).
- Git ignores the person's own copies of the engines file: `openbot/agent-freeduet/engines.yaml` (made from `engines.example.yaml`, as docs/PROVIDERS.md says) and `openbot/engines.local.yaml` (the local router copy in agent-freeduet's README), so `git add .` does not pick up a gateway address or settings of the person's own. The example stays tracked, and the image and run-time behaviour do not change. Tested by a git check in agent-freeduet's tests; not yet run live.

### Security

- With "Home and office network access" on, a member's computer can no longer reach its own loopback through the network filter: the switch lifts only the private LAN ranges. Loopback (`127.0.0.0/8`, `::1` and their IPv4-mapped forms), `localhost` and this host (`0.0.0.0/8`, `::`) are refused with the switch on or off, and the server's navigation check refuses the same addresses (#365, D73; `docs/M1_PLAN.md` section 52). Before, with the switch on, a page could reach the computer's own loopback through the filter, with its own requests, WebSockets and redirects. A page the member serves to itself can no longer be loaded in its browser with the switch on, while the member's own shell commands against localhost do not go through the filter. A computer with no API server and `EGRESS_POLICY_REQUIRED=0` (a developer's or a test's) keeps the old rule, loopback included. Built and tested; not run live on a real stack or Docker Desktop.
- Revoking a paired browser also signs that browser out (#366, D74; `docs/M1_PLAN.md` section 53). Before, a lost phone whose pairing was revoked stayed signed in, with remote powers. Revoke now ends the sign-in session that browser was last seen with, so its next request is signed out; a pairing never seen with a session is revoked without ending one. Revoke keeps the session of the browser that presses it, unless that browser is the one revoked. The Settings sentence now reads "Revoke one and it is cut off at its next request and signed out"; `DELETE /api/pairings/:id` answers `signedOut`, and the audit row of a revoke records `sessionEnded`. One new database migration (0078) adds a nullable column that holds the session's id, never its token. Limits: a browser that signed in again and has not made a request since keeps the id of its old session until then, and a session shared by two browsers (a copied sign-in cookie) ends for both, except for the browser that revokes. Built and tested; not run live: no phone took part.

### What was run live

Run live on one real installation (the maintainer's), 16 November 2026. This supersedes the note under [0.2.2] that pairing a phone with the code had not been tried yet:

- pairing a phone with the one-time code, shown as a QR code under Settings ("Pair a phone or another browser"). This is the first live run of pairing a phone (#283, D49). The list under Settings then held a computer pairing and a device pairing, neither revoked (`docs/ROADMAP.md`).

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
