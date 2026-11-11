# Notices and attributions

## Code we build on

| Project | License | What FreeDuet uses |
|---|---|---|
| [CopilotKit/OpenDuet](https://github.com/CopilotKit/OpenDuet) | MIT, © 2026 CopilotKit | The repository FreeDuet is forked from: the morning brief, triage, tasks, pages, channels and the tenant-package layout. Upstream `skills.yaml` entries are reused unchanged. |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/openbot) (inside `openbot/`) | MIT, © 2026 CopilotKit | Server, app, worker, a computer per agent, the action gateway, approvals, audit, credentials and connectors. |
| [Anil-matcha/open-duet](https://github.com/Anil-matcha/open-duet) | Apache-2.0 | The engine-adapter contract, the limit detection and the fallback rules are ported into `openbot/agent-freeduet/`. Ported files keep the Apache-2.0 license text in that folder, carry a header naming the original file, and state that they were changed. |
| [CopilotKit's SqliteAgentRunner](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/sqlite-runner` 1.77.0) | MIT, © Atai Barkai | Ported to Postgres as FreeDuet's agent runner for conversations kept without CopilotKit Intelligence (#42), in `openbot/server/src/freeduet/threads/pg-runner.ts`, which carries the MIT notice, names the original file and lists the changes. |
| [AI Continuity](https://github.com/MarcoDeliaBot/ai-continuity) | MIT, © 2026 Marco D'Elia | The checkpoint writer behind members' work reports and the handoff between engines (F14, F24), ported into `openbot/agent-freeduet/freeduet/checkpoints.py` with its MIT notice, the original files named and the changes listed. |

## Libraries added to the server for Gmail and Calendar with an app password (D24)

Installed from npm and used as they are, not copied into this repository. The first three are the direct dependencies of `openbot/server`; the rest come with them. None is MPL or copyleft: the one dual-licensed package, `@zone-eu/mailsplit`, offers MIT and is used under MIT.

| Library | Version | License | What it does here |
|---|---|---|---|
| [imapflow](https://github.com/postalsys/imapflow) | 2.11.0 | MIT, © Postal Systems OÜ | Reads the person's Gmail over IMAP, read-only (`EXAMINE`, `BODY.PEEK`) |
| [nodemailer](https://github.com/nodemailer/nodemailer) | 10.4.0 | MIT-0, © Andris Reinman | Sends an approved reply over SMTP |
| [node-ical](https://github.com/jens-maus/node-ical) | 0.27.6 | Apache-2.0 | Parses the calendar's secret iCal address, with recurring events |
| `@zone-eu/mailsplit` 5.4.30, `libmime` 5.6.4, `libqp` 3.0.1, `libbase64` 1.4.1 | as listed | MIT (`@zone-eu/mailsplit` is "MIT OR EUPL-1.1+", used under MIT) | Pulled in by imapflow: message and header decoding |
| `encoding-japanese` | 2.5.0 | MIT | Pulled in by imapflow and libmime: character-set conversion |
| `rrule-temporal` 2.2.8, `temporal-polyfill` 1.0.8, `temporal-utils` 1.0.4 | as listed | MIT | Pulled in by node-ical: recurrence rules and time zones |
| `temporal-spec` | 1.0.1 | Apache-2.0 | Pulled in by `rrule-temporal` and `temporal-polyfill`: types |
| `@types/nodemailer` | 8.0.2 | MIT | Development only: type declarations |

## Local Whisper for dictation (D25)

Fetched or built on the person's own computer when they switch `FREEDUET_DICTATION=local` on, and used as they are. None of it is copied into this repository or shipped in an image FreeDuet publishes: `openbot/whisper/Dockerfile` downloads the source at a pinned tag and builds it there, and the model is downloaded on first start.

| Project | License | What it does here |
|---|---|---|
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) `v1.9.5` (commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`) | MIT, © 2023-2026 The ggml authors | Built from source in the `whisper` image; its `whisper-server` transcribes the recordings on the CPU |
| [Whisper model files](https://huggingface.co/ggerganov/whisper.cpp) (`ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3-turbo.bin`, `ggml-small.bin`, `ggml-base.bin`), converted by whisper.cpp from [OpenAI Whisper](https://github.com/openai/whisper) | MIT, © 2022 OpenAI (the repository's own licence tag is MIT) | Downloaded on first start into a Docker volume and checked against a SHA-256 pinned in `openbot/shared/whisper-models.ts` |
| [FFmpeg](https://ffmpeg.org/), the Debian package | LGPL-2.1+ or GPL-2+, depending on the build Debian ships | Installed by `apt` while the `whisper` image is built, as a separate program the server calls (`--convert`), to read the browsers' WebM/Opus and MP4/AAC. Nothing links to it |
| [Google FLEURS](https://huggingface.co/datasets/google/fleurs), Italian test split | CC BY 4.0, © Google | The test audio and sentences for the proofs in `evals/dictation/`. Downloaded on the maintainer's computer into a folder git ignores; none of it is in this repository, except that a report can quote its ten worst lines |

## Projects we studied but deliberately did not copy from

| Project | License | Why no code was taken |
|---|---|---|
| [nightly-labs/openbot](https://github.com/nightly-labs/openbot) | PolyForm Noncommercial 1.0.0 (from v0.1.12) | Not compatible with an MIT project that people may use commercially. Ideas such as importing agents from Grok Bot are implemented independently. |
| [browser-use/open-duet](https://github.com/browser-use/open-duet) | No license file | Without a license, the code is all rights reserved. Only the general idea of one-click decision cards informed our design. |

## Software FreeDuet connects to and may ship in member computers

| Project | License | Use |
|---|---|---|
| [ArtCraft apps](https://github.com/storytold) (PhotoCraft, PdfCraft and others) | Apache-2.0; PhotoCraft MIT or Apache-2.0 | Installed unmodified in member computer images and driven through their own CLI or MCP server. Their license and NOTICE files ship with them. |

## Planned reuse (not yet in the code)

| Project | License | Planned use |
|---|---|---|
| [The Agency](https://github.com/msitarzewski/agency-agents) | MIT | Starting profiles for some pack members, adapted, with the source and license named in each member |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | Apache-2.0 | Grok Build CLI driver and team playbook format, ported with attribution |
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Apache-2.0, © 2026 Abhishek Barali and contributors | 77 game-development skills and their router, installed unmodified at a pinned commit for Nico, the game developer. Its LICENSE and NOTICE files ship with it. |

## Team prompts

The starter team's prompts, all test cases and the documentation were written from scratch for this project. Pack members adapted from a public library name their source and license in their own description.

## Trademarks

FreeDuet is an independent project and is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google, xAI, Z.ai, OpenRouter or CopilotKit. Claude, Claude Code and Duet are trademarks of Anthropic. ChatGPT and Codex are trademarks of OpenAI. Gemini is a trademark of Google. Grok is a trademark of xAI. These names are used only to describe compatibility.
