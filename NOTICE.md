# Notices and attributions

## Code we build on

| Project | License | What FreeDuet uses |
|---|---|---|
| [CopilotKit/OpenDuet](https://github.com/CopilotKit/OpenDuet) | MIT, © 2026 CopilotKit | The repository FreeDuet is forked from: the morning brief, triage, tasks, pages, channels and the tenant-package layout. Upstream `skills.yaml` entries are reused unchanged. |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/openbot) (inside `openbot/`) | MIT, © 2026 CopilotKit | Server, app, worker, a computer per agent, the action gateway, approvals, audit, credentials and connectors. |
| [Anil-matcha/open-duet](https://github.com/Anil-matcha/open-duet) | Apache-2.0 | The engine-adapter contract, the limit detection and the fallback rules are ported into `openbot/agent-freeduet/`. Ported files keep the Apache-2.0 license text in that folder, carry a header naming the original file, and state that they were changed. |
| [CopilotKit's SqliteAgentRunner](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/sqlite-runner` 1.77.0) | MIT, © Atai Barkai | Ported to Postgres as FreeDuet's agent runner for conversations kept without CopilotKit Intelligence (#42), in `openbot/server/src/freeduet/threads/pg-runner.ts`, which carries the MIT notice, names the original file and lists the changes. |
| [AI Continuity](https://github.com/MarcoDeliaBot/ai-continuity) | MIT, © 2026 Marco D'Elia | The checkpoint writer behind members' work reports and the handoff between engines (F14, F24), ported into `openbot/agent-freeduet/freeduet/checkpoints.py` with its MIT notice, the original files named and the changes listed. |
| [Humanizer](https://github.com/blader/humanizer) 4.0.0 | MIT, © 2025 Siqi Chen | Wren's `humanizer` skill: the body of the upstream `SKILL.md` (commit b48c832), copied unchanged into `openbot/examples/freeduet/skills.yaml`. |
| [Marketing Skills](https://github.com/coreyhaines31/marketingskills) | MIT, © 2025 Corey Haines | Mark's 53 marketing skills, granted to him only: the body of each upstream `skills/<name>/SKILL.md` (commit 1f83744, 2026-11-11), copied unchanged into `openbot/examples/freeduet/skills.yaml`, with `tools: []`. The upstream `references/`, `evals/`, `assets/`, `tools/` and `scripts/` folders are not carried; Mark's prompt says so. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0, © 2025 Paul Bakaus | Mark's `design-craft-floor` skill: the body of one upstream reference file, `skill/reference/craft-floor.md` (commit d41d986), copied unchanged into `openbot/examples/freeduet/skills.yaml`, with `tools: []`, granted to him only. Its scripts, hooks, engine and other files are not carried. The Apache-2.0 licence text is in `openbot/agent-freeduet/LICENSE-APACHE-2.0`, the copy this repository keeps. |

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

## Python libraries in the member's computer image, for office files (D58)

Installed from PyPI when the `agent-computer` image is built and used as they are, not copied into this repository. `openbot/agent-computer/office-requirements.txt` pins every one to an exact version and to the hashes of its release files. The first seven are the libraries the members use; the rest come with them. Versions and licences are read from each installed package's own metadata (the licence of reportlab from its `license.txt`). As far as was checked, none of the installed libraries is used under a copyleft licence; the ones offered under more than one licence are used under the permissive one: cryptography (Apache-2.0 OR BSD-3-Clause), and, inside the compiled wheels, FreeType (FreeType License, the GPL-2 alternative is not used) and zstd (BSD). Where a licence is permissive but is not literally MIT, Apache-2.0 or BSD, the maintainer accepted it by name on 16 November 2026: Pillow, typing_extensions, defusedxml and cffi.

| Library | Version | License | What it does here |
|---|---|---|---|
| [python-docx](https://github.com/python-openxml/python-docx) | 1.2.0 | MIT | Makes, reads and changes Word (.docx) files (Wren) |
| [openpyxl](https://foss.heptapod.net/openpyxl/openpyxl) | 3.1.5 | MIT | Makes, reads and changes Excel (.xlsx) files; writes formulas but never calculates them (Penny) |
| [python-pptx](https://github.com/scanny/python-pptx) | 1.0.2 | MIT | Makes, reads and changes PowerPoint (.pptx) files (no member holds a skill for it yet) |
| [pypdf](https://github.com/py-pdf/pypdf) | 7.1.0 | BSD-3-Clause | Reads, merges, splits PDF files; used by `office-inspect` for a PDF's page count |
| [reportlab](https://www.reportlab.com/opensource/) | 5.1.0 | BSD (three-clause; text in its `license.txt`, © ReportLab Inc.) | Makes PDF files |
| [pdfplumber](https://github.com/jsvine/pdfplumber) | 0.11.10 | MIT | Reads the text and tables of a PDF. Installed without its `pypdfium2` requirement, so it cannot draw a page as a picture |
| [defusedxml](https://github.com/tiran/defusedxml) | 0.7.1 | PSF-2.0 (the package says "PSFL") | Installed so that openpyxl guards its XML parsing against entity attacks, which it does only when this is present |
| pdfminer.six | 20260107 | MIT | Pulled in by pdfplumber: reads PDF text |
| lxml | 6.1.3 | BSD-3-Clause | Pulled in by python-docx and python-pptx: XML. The wheel carries libxml2 and libxslt compiled in (MIT licences in its `LICENSES.txt`) |
| Pillow | 13.0.0 | MIT-CMU | Pulled in by python-pptx, reportlab and pdfplumber: images. The wheel carries compiled libraries, among them FreeType (used under the FreeType License; the GPL alternative is not used), libjpeg-turbo, libpng, libtiff, libwebp, libavif, lcms2, HarfBuzz, zstd and liblzma, with their licence texts in the wheel's `LICENSE`. Those texts were listed, not audited line by line |
| XlsxWriter | 3.3.1 | BSD-2-Clause | Pulled in by python-pptx: charts inside a presentation |
| et_xmlfile | 2.0.0 | MIT | Pulled in by openpyxl |
| typing_extensions | 4.16.0 | PSF-2.0 | Pulled in by python-docx and python-pptx |
| charset-normalizer | 3.5.2 | MIT | Pulled in by pdfminer.six |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause | Pulled in by pdfminer.six and pypdf: encrypted PDFs. The wheel carries OpenSSL compiled in |
| cffi, pycparser | 2.1.1, 3.12 | MIT-0, BSD-3-Clause | Pulled in by cryptography |

What was checked, and what was not. After the install, the image deletes three kinds of file, because they carry a copyleft licence: the reportlab wheel's sample font DarkGarden (GPL-2+ with a font-embedding exception, with its `copying-gpl` text), and the lxml wheel's two C header files `libcharset.h` and `localcharset.h` (LGPL-2+, build headers that nothing links or loads; python-docx, openpyxl and lxml were run again after deleting them). **pypdfium2** is not installed: its wheel bundles libraries nobody has audited. A search of the whole installed set for the words "GNU General Public License", "Lesser General Public License", "LGPL" and "GPL-2/3" in files outside the packages' own `dist-info` folders found, after those deletions, two lines in one file: comments in Pillow's `PIL/ImageCms.py` (lines 7 and 56) that say the code was "originally released under LGPL" and was donated to PIL; the file is part of Pillow under Pillow's own licence. The `dist-info` folders of Pillow, lxml, et_xmlfile, typing_extensions, charset-normalizer and cryptography mention GPL or LGPL, each as the alternative licence of a bundled library or as history, not as a licence we use: Pillow's licence file (texts of its bundled libraries), lxml's `LICENSES.txt`, the Python licence text in et_xmlfile and typing_extensions (which recounts that older Python releases were distributed under the GPL), charset-normalizer's `METADATA` (a note that chardet's historical implementation was LGPL and has been replaced), and cryptography's Rust software bill of materials (one crate offered as "Apache-2.0 OR GPL-2.0-only", of which Apache-2.0 is the one we use). Two things were read in Pillow's metadata and not resolved: its software bill of materials lists FriBiDi (LGPL-2.1+), which Pillow loads from the system only if a system copy exists, and no copy is in the wheel; and libimagequant (GPL-3+), which the metadata mentions and which is not in the wheel. Whether the finished image has a system FriBiDi is not known, because no image was built. The compiled libraries inside the Pillow, lxml and cryptography wheels were listed from their licence files, not audited line by line. reportlab also carries the Bitstream Vera fonts under their own free licence (`bitstream-vera-license.txt`, in the wheel). `office-inspect` itself, in `openbot/agent-computer/office-inspect/`, is FreeDuet's own code, written from scratch.

## LibreOffice in the member's computer image, for office files (D61)

Installed by `apt` when the `agent-computer` image is built, as a separate program that a member runs through a command (`office-convert`, FreeDuet's own script). None of its code is copied into this repository, linked, or modified, and its source is not redistributed by FreeDuet; it is the distribution's package, from Ubuntu 24.04's own archive.

| Project | License | What it does here |
|---|---|---|
| [LibreOffice](https://www.libreoffice.org/) 24.2.7, the Ubuntu packages `libreoffice-writer`, `libreoffice-calc`, `libreoffice-impress` and the `libreoffice-core`, `-common`, `-draw` and related packages they depend on | MPL-2.0 for LibreOffice's own code; the packages' copyright files also list the licences of the libraries bundled in them (Apache-2.0, BSD, MIT, LGPL-3+, MPL-1.1 and others, and GPL-2 and GPL-3+ for some of them) | Recalculates the formulas of a spreadsheet and converts a Word, Excel or PowerPoint file to PDF, headless, on a profile made for each call |
| `libpoppler134`, the distribution's package, a hard dependency of `libreoffice-core` | GPL-2, GPL-3 and Apache-2.0 parts, as its copyright file lists | Loaded by LibreOffice for PDF import; FreeDuet does not use it, copy it or link to it, and cannot leave it out of the install |
| `fonts-liberation`, `fonts-dejavu-core` | SIL OFL-1.1 (Liberation, with GPL-2+ with a font exception for some files), the DejaVu fonts' free licence | The fonts a PDF is drawn with |

The distribution's packages bring a number of further dependencies (the maintainers' licence list for each is in its own copyright file under `/usr/share/doc/<package>/copyright` in the image), among them GPL programs that the distribution lists as dependencies of libgpgme and PAM. They are installed, not modified and not linked by FreeDuet.

## Local Whisper for dictation (D25)

Fetched or built on the person's own computer when they switch `FREEDUET_DICTATION=local` on, and used as they are. None of it is copied into this repository or shipped in an image FreeDuet publishes: `openbot/whisper/Dockerfile` downloads the source at a pinned tag and builds it there, and the model is downloaded on first start.

| Project | License | What it does here |
|---|---|---|
| [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) `v1.9.5` (commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`) | MIT, © 2023-2026 The ggml authors | Built from source in the `whisper` image; its `whisper-server` transcribes the recordings on the CPU |
| [Whisper model files](https://huggingface.co/ggerganov/whisper.cpp) (`ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3-turbo.bin`, `ggml-small.bin`, `ggml-base.bin`), converted by whisper.cpp from [OpenAI Whisper](https://github.com/openai/whisper) | MIT, © 2022 OpenAI (the repository's own licence tag is MIT) | Downloaded on first start into a Docker volume and checked against a SHA-256 pinned in `openbot/shared/whisper-models.ts` |
| [Silero VAD](https://github.com/snakers4/silero-vad) v5.1.2, as `ggml-silero-v5.1.2.bin` from [ggml-org/whisper-vad](https://huggingface.co/ggml-org/whisper-vad) | MIT (the Silero VAD project's licence; the model card is to be checked) | Voice-activity detection for the local service, downloaded on first start and checked against a SHA-256 pinned in `openbot/shared/whisper-models.ts` |
| [FFmpeg](https://ffmpeg.org/), the Debian package | LGPL-2.1+ or GPL-2+, depending on the build Debian ships | Installed by `apt` while the `whisper` image is built, as a separate program the server calls (`--convert`), to read the browsers' WebM/Opus and MP4/AAC. Nothing links to it |
| [Google FLEURS](https://huggingface.co/datasets/google/fleurs), Italian test split | CC BY 4.0, © Google | The test audio and sentences for the proofs in `evals/dictation/`. Downloaded on the maintainer's computer into a folder git ignores; none of it is in this repository, except that a report can quote its ten worst lines |

The `whisper` image is listed in `openbot/.github/published-images.json`. Once an image is published, its FFmpeg (the Debian package, installed with `apt-get` in `openbot/whisper/Dockerfile`) brings GPL obligations that must be stated in this file at that time, if the Debian build is the GPL one (to confirm).

## Font used by the app

Installed from npm and used as it is, not copied into this repository. No font file is tracked by git.

| Font | License | What FreeDuet uses |
|---|---|---|
| Inter (variable), through [`@fontsource-variable/inter`](https://www.npmjs.com/package/@fontsource-variable/inter) 5.3.0 | SIL Open Font License 1.1 (to confirm: the npm registry gives `OFL-1.1` for 5.3.0; the licence file ships in the npm package, not in this repository) | The app's sans-serif face (`--font-sans` in `openbot/app/src/styles.css`), imported in `openbot/app/src/routes/__root.tsx` and `openbot/app/src/styles.css`, pinned in `openbot/bun.lock` |

## Crates of the desktop shell under MPL-2.0 (to confirm)

These are transitive dependencies locked in `openbot/desktop/src-tauri/Cargo.lock`; none is named in `openbot/desktop/src-tauri/Cargo.toml`. The lock file carries no licences, so each licence is to confirm with `cargo-license`.

| Crate | Version | License | What FreeDuet uses |
|---|---|---|---|
| `cssparser` | 0.36.0 | MPL-2.0 (to confirm) | Locked as a transitive dependency |
| `cssparser-macros` | 0.6.1 | MPL-2.0 (to confirm) | Locked as a transitive dependency |
| `dtoa-short` | 0.3.5 | MPL-2.0 (to confirm) | Locked as a transitive dependency |
| `option-ext` | 0.2.0 | MPL-2.0 (to confirm) | Locked as a transitive dependency |
| `selectors` | 0.36.1 | MPL-2.0 (to confirm) | Locked as a transitive dependency |

## Projects we studied but deliberately did not copy from

| Project | License | Why no code was taken |
|---|---|---|
| [nightly-labs/openbot](https://github.com/nightly-labs/openbot) | PolyForm Noncommercial 1.0.0 (from v0.1.12) | Not compatible with an MIT project that people may use commercially. Ideas such as importing agents from Grok Bot are implemented independently. |
| [browser-use/open-duet](https://github.com/browser-use/open-duet) | No license file | Without a license, the code is all rights reserved. Only the general idea of one-click decision cards informed our design. |

## Software FreeDuet connects to and may ship in member computers

| Project | License | Use |
|---|---|---|
| [ArtCraft apps](https://github.com/storytold) (PhotoCraft, PdfCraft and others) | Apache-2.0; PhotoCraft MIT or Apache-2.0 | Planned, not shipped: no image carries them today. When they are added they will be installed unmodified in member computer images and driven through their own CLI or MCP server, with their license and NOTICE files. |

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
