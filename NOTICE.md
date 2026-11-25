# Notices and attributions

## Code we build on

| Project | License | What FreeDuet uses |
|---|---|---|
| [CopilotKit/OpenDuet](https://github.com/CopilotKit/OpenDuet) | MIT, © 2026 CopilotKit | The repository FreeDuet is forked from: the morning brief, triage, tasks, pages, channels and the tenant-package layout. Upstream `skills.yaml` entries are reused unchanged. |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/openbot) (inside `openbot/`) | MIT, © 2026 CopilotKit | Server, app, worker, a computer per agent, the action gateway, approvals, audit, credentials and connectors. |
| [Anil-matcha/open-duet](https://github.com/Anil-matcha/open-duet) | Apache-2.0 | Three files are ported from open-duet into `openbot/agent-freeduet/freeduet/`: the Claude CLI launch and outcome (`claude_cli.py`), the limit patterns (`engine_errors.py`) and the stream parser (`stream_json.py`). Ported files keep the Apache-2.0 license text in `openbot/agent-freeduet/`, carry a header naming the original file, and state that they were changed. |
| [CopilotKit's SqliteAgentRunner](https://github.com/CopilotKit/CopilotKit) (`@copilotkit/sqlite-runner` 1.77.0) | MIT, © Atai Barkai | Ported to Postgres as FreeDuet's agent runner for conversations kept without CopilotKit Intelligence (#42), in `openbot/server/src/freeduet/threads/pg-runner.ts`, which carries the MIT notice, names the original file and lists the changes. |
| Code by the same author (not published) | MIT, © 2026 Marco D'Elia | The checkpoint writer behind members' work reports and the handoff between engines (F14, F24), ported into `openbot/agent-freeduet/freeduet/checkpoints.py` with its MIT notice, the original files named and the changes listed. |
| [Humanizer](https://github.com/blader/humanizer) 4.0.0 | MIT, © 2025 Siqi Chen | Wren's `humanizer` skill: the body of the upstream `SKILL.md` (commit b48c832), copied unchanged into `openbot/examples/freeduet/skills.yaml`. |
| [Marketing Skills](https://github.com/coreyhaines31/marketingskills) | MIT, © 2025 Corey Haines | Mark's 53 marketing skills, granted to him only: the body of each upstream `skills/<name>/SKILL.md` (commit 1f83744, 2026-11-11), copied unchanged into `openbot/examples/freeduet/skills.yaml`, with `tools: []`. The upstream `references/`, `evals/`, `assets/`, `tools/` and `scripts/` folders are not carried. Mark's prompt names references files, scripts and command-line tools as things he does not have; it does not name `evals/` or `assets/`. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0, © 2025 Paul Bakaus | Mark's `design-craft-floor` skill: the body of one upstream reference file, `skill/reference/craft-floor.md` (commit d41d986), copied unchanged into `openbot/examples/freeduet/skills.yaml`, with no tools key, which the loader reads as an empty list, granted to him only. Its scripts, hooks, engine and other files are not carried. The Apache-2.0 licence text is in `openbot/agent-freeduet/LICENSE-APACHE-2.0`, the copy this repository keeps. |
| [ai-design-skills](https://github.com/elayadesign/ai-design-skills) | MIT, Copyright (c) 2026 Elaya ([permission notice](#mit-permission-notice)) | Mark's `landing-page-design` skill: the body of one upstream `skills/landing-page-design/SKILL.md` (commit 456d9e0), from its first heading to its last checklist item, copied unchanged into `openbot/examples/freeduet/skills.yaml`, with `tools: []`, granted to him only. Not carried: the frontmatter, the Credits section (its two credits are in the next two rows), the other skill in that repository (`figma-designer`), its scripts, tests, plugin files and images, and the companion skill `redesign-existing-projects` that the body links to. |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) by Leon Lin | MIT, Copyright (c) 2026 Leonxlnx, as quoted in the upstream Credits section ([permission notice](#mit-permission-notice)) | Named by the upstream `landing-page-design` file as the source of parts it was adapted from. Those parts are in Mark's `landing-page-design` skill, granted to him only. |
| [allen-baler](https://github.com/allen-baler) | None stated (credit only) | The upstream `landing-page-design` Credits section names them for suggesting the no-invented-facts rule and the reduced-motion support for the tagline reveal, in [PR #1](https://github.com/elayadesign/ai-design-skills/pull/1). Both are in the body of Mark's `landing-page-design` skill, as the upstream file has them. |
| [Instagram agent skill](https://github.com/Jakeschincariol/instagram-agent-skill) | MIT, Copyright (c) 2026 Jake Schincariol ([permission notice](#mit-permission-notice)) | Mark's `ig-carousel`, `ig-story`, `ig-reply` and `ig-dm` skills: the body of each upstream `skills/<name>/SKILL.md` (commit d03c56bb598be770c60b201f94237e5d1a4268a6), from its first heading to its last line, copied unchanged into `openbot/examples/freeduet/skills.yaml`, with `tools: []`, granted to him only. Not carried: the front matter, the nine other skills in that repository, its `templates/` folder, the scripts and data files beside its skills (for example `caption.py` and `rubric.json`), its plugin manifests and its README. Its LICENSE file is not copied; that file's permission paragraph is the same text as the permission notice below. |

## MIT permission notice

The licence text below is the MIT permission notice, copied unchanged from the MIT licence of the ai-design-skills repository. Where a row of this file whose licence is MIT gives a copyright line, that line is the copyright notice that goes with this permission notice.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Libraries added to the server for Gmail and Calendar with an app password (D24)

Installed from npm and used as they are, not copied into this repository. The first three are the direct dependencies of `openbot/server`; the rest come with them. None is MPL or copyleft: the one dual-licensed package, `@zone-eu/mailsplit`, offers MIT and is used under MIT. nodemailer's licence, MIT-0, is permissive but not literally MIT, Apache-2.0 or BSD: the maintainer accepted it by name on 17 November 2026.

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

What was checked, and what was not. The search and the licence-file reading in this paragraph were made on 16 November 2026 in a sandbox install of the same packages, not in a built image; the check script is not in the repository. After the install, the image deletes three kinds of file, because they carry a copyleft licence: the reportlab wheel's sample font DarkGarden (GPL-2+ with a font-embedding exception, with its `copying-gpl` text), and the lxml wheel's two C header files `libcharset.h` and `localcharset.h` (LGPL-2+, build headers that nothing links or loads; python-docx, openpyxl and lxml were run again after deleting them). **pypdfium2** is not installed: its wheel bundles libraries nobody has audited. A search of the whole installed set for the words "GNU General Public License", "Lesser General Public License", "LGPL" and "GPL-2/3" in files outside the packages' own `dist-info` folders found, after those deletions, two lines in one file: comments in Pillow's `PIL/ImageCms.py` (lines 7 and 56) that say the code was "originally released under LGPL" and was donated to PIL; the file is part of Pillow under Pillow's own licence. The `dist-info` folders of Pillow, lxml, et_xmlfile, typing_extensions, charset-normalizer and cryptography mention GPL or LGPL, each as the alternative licence of a bundled library or as history, not as a licence we use: Pillow's licence file (texts of its bundled libraries), lxml's `LICENSES.txt`, the Python licence text in et_xmlfile and typing_extensions (which recounts that older Python releases were distributed under the GPL), charset-normalizer's `METADATA` (a note that chardet's historical implementation was LGPL and has been replaced), and cryptography's Rust software bill of materials (one crate offered as "Apache-2.0 OR GPL-2.0-only", of which Apache-2.0 is the one we use). Two things were read in Pillow's metadata and not resolved: its software bill of materials lists FriBiDi (LGPL-2.1+), which Pillow loads from the system only if a system copy exists, and no copy is in the wheel; and libimagequant (GPL-3+), which the metadata mentions and which is not in the wheel. Whether the finished image has a system FriBiDi is not known, because no image was built. The compiled libraries inside the Pillow, lxml and cryptography wheels were listed from their licence files, not audited line by line. reportlab also carries the Bitstream Vera fonts under their own free licence (`bitstream-vera-license.txt`, in the wheel). `office-inspect` itself, in `openbot/agent-computer/office-inspect/`, is FreeDuet's own code, written from scratch.

## LibreOffice in the member's computer image, for office files (D61)

Installed by `apt` when the `agent-computer` image is built, as a separate program that a member runs through a command (`office-convert`, FreeDuet's own script). None of its code is copied into this repository, linked with FreeDuet code, or modified, and its source is not redistributed by FreeDuet; it is the distribution's package from Ubuntu 24.04's own archive. **Rule, decided by the maintainer on 16 November 2026:** no GPL code is copied into or linked with FreeDuet; packages the distribution installs as separate programs, including LibreOffice's dependencies, are accepted and listed here.

| Project | License | What it does here |
|---|---|---|
| [LibreOffice](https://www.libreoffice.org/) 24.2 from the Ubuntu 24.04 archive (24.2.7 in the tests of 16 November 2026; the image does not pin the version), the Ubuntu packages `libreoffice-writer`, `libreoffice-calc`, `libreoffice-impress` and the `libreoffice-core`, `-common`, `-draw` and related packages they depend on | MPL-2.0 for LibreOffice's own code; the packages' copyright files also list the licences of the libraries bundled in them (Apache-2.0, BSD, MIT, LGPL-3+, MPL-1.1 and others, and GPL-2 and GPL-3+ for some of them) | Recalculates the formulas of a spreadsheet and converts a Word, Excel or PowerPoint file to PDF, headless, on a profile made for each call |
| `libpoppler134`, the distribution's package, a dependency of `libreoffice-core` | GPL-2, GPL-3, with Apache-2.0 parts, as its copyright file lists | Linked only by LibreOffice's separate helper program `xpdfimport` (PDF import); `soffice.bin` itself does not load it (checked with `ldd` on 16 November 2026 in the sandbox, not in a built image). FreeDuet does not use, copy or link it |
| `fonts-liberation` | SIL OFL-1.1 for the fonts; the GPL-2+ in its copyright file covers the Debian packaging files only | A font a PDF is drawn with |
| `fonts-dejavu-core` | Bitstream Vera licence (with the DejaVu changes in the public domain) | A font a PDF is drawn with |

**GPL-only programs that arrive as dependencies of the distribution's LibreOffice packages** (through libgpgme and the poppler library), all installed by the distribution as separate programs, not linked with FreeDuet code and not copied into this repository: `gnupg`, `gpg`, `gpg-agent`, `gpgsm`, `gpgconf`, `gnupg-utils`, `gpgv`, `dirmngr`, `keyboxd` and the poppler library named above. Further dependencies (PAM, adduser, ucf, libraries under LGPL and permissive licences) are listed in their own copyright files under `/usr/share/doc/<package>/copyright` in the image. The 116 packages were downloaded and their copyright files read on 16 November 2026 in the sandbox, not in a built image; no script for that reading is in the repository.

## Programs the images install

The Dockerfiles below install these packages and programs. Versions are given only where the Dockerfile pins them. Each row is listed under the rule in the LibreOffice section above. The image names match the folders under `openbot/`. Python libraries are listed in the Python section, and LibreOffice and its fonts in the LibreOffice section. The system packages that `playwright install --with-deps chromium` pulls in are not enumerated. The `server` image and the `agent-*` images not named in the table install no separate program, only language libraries (`bun install`, `pip install -r requirements.txt`), so they are not listed. The all-in-one image (`openbot/Dockerfile`) is not in `openbot/.github/published-images.json`.

| Image | Package or program | Version | Installed by | License |
|---|---|---|---|---|
| `agent-computer` | ca-certificates, curl, unzip, xz-utils | not pinned | `apt-get install`, lines 22-24 | licence in the package's own copyright file |
| `agent-computer` | ffmpeg | not pinned | `apt-get install`, lines 22-24 | GPL-2.0-or-later: the Ubuntu 24.04 build has `--enable-gpl` (checked on 18 November 2026, see the Local Whisper section) |
| `agent-computer` | git, python3, python3-venv | not pinned | `apt-get install`, lines 22-24 | licence in the package's own copyright file |
| `agent-computer` | Node.js and npm | 24.18.1 (image tag, line 9) | copied from the `node` image, line 20 | MIT for Node.js's own code (© Node.js contributors); the components it bundles keep their own licences, listed in Node's LICENSE file |
| `agent-computer` | Bun | 1.4.3 (image tag and digest, line 10) | copied from the `oven/bun` image, line 21 | to confirm |
| `agent-computer` | Playwright | 1.62.1 (`PLAYWRIGHT_VERSION`, line 15; locked in `openbot/agent-computer/bun.lock`, line 109) | `bunx --bun "playwright@${PLAYWRIGHT_VERSION}"`, line 26 | Apache-2.0 (the LICENSE file in the npm package) |
| `agent-computer` | Chromium | not pinned in the Dockerfile | `playwright install --with-deps chromium`, line 26 | to confirm |
| `agent-computer` | LibreOffice and two fonts | not pinned | the `apt-get install` step for LibreOffice, which also deletes its launcher links from `/usr/bin` (D85) | listed in the LibreOffice section above |
| `agent-computer` | Python toolkit | pinned in `office-requirements.txt` | the `pip install --require-hashes` step for the office toolkit | listed in the Python section above |
| all-in-one | ca-certificates, curl, unzip, xz-utils | not pinned | `apt-get install`, lines 34-35 | licence in the package's own copyright file |
| all-in-one | Node.js and npm | 24.18.1 (image tag, line 20) | copied from the `node` image, line 32 | MIT for Node.js's own code (© Node.js contributors); the components it bundles keep their own licences, listed in Node's LICENSE file |
| all-in-one | Bun | 1.4.3 (image tag and digest, line 21) | copied from the `oven/bun` image, line 33 | to confirm |
| all-in-one | Playwright and Chromium | 1.62.1 (`PLAYWRIGHT_VERSION`, line 26) | `bunx --bun "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium`, line 37 | to confirm |
| all-in-one | s6-overlay | 3.2.1.0 (`S6_OVERLAY_VERSION`, line 100) | downloaded from GitHub, lines 105 and 111-115 | to confirm |
| all-in-one | postgresql-16, postgresql-16-pgvector | major version 16, as named | `apt-get install`, lines 174-175 | licence in the package's own copyright file |
| all-in-one | sudo | not pinned | `apt-get install`, line 200 | licence in the package's own copyright file |
| `whisper` | ffmpeg | not pinned | `apt-get install` in the runtime stage, line 40 | LGPL-2.1+ or GPL-2+, depending on the build Debian ships (line 104) |
| `whisper` | libgomp1 | not pinned | `apt-get install` in the runtime stage, line 40 | licence in the package's own copyright file |
| `whisper` | build-essential, cmake, git, ca-certificates | not pinned | `apt-get install` in the build stage, line 25 | none: not in the runtime image (only `whisper-server` is copied, line 43) |
| `agent-freeduet` | Node.js and npm | 24.18.1 (image tag, line 12) | node binary and global modules copied, lines 16-17; npm and npx linked, lines 18-19 | MIT for Node.js's own code (© Node.js contributors); the components it bundles keep their own licences, listed in Node's LICENSE file |
| `agent-freeduet` | @anthropic-ai/claude-code | 2.1.311 (`CLAUDE_CODE_VERSION`, line 22) | `npm install -g`, line 23 | to confirm |
| `supervisor` | SPIRE (`spire-server` binary) | 1.15.1 (image tag, line 8) | copied from `ghcr.io/spiffe/spire-server:1.15.1`, line 19 | to confirm |
| Compose only (not published) | BusyBox (`busybox:1.37`, the `spire-init` service) | 1.37 (image tag) | pulled as an image | GPL-2.0 (busybox.net) |

## Python libraries in the `agent-freeduet` image

Installed with `pip` from `openbot/agent-freeduet/requirements.txt`. Each licence below was read in the package's own metadata or licence file on 17 November 2026.

| Library | Version | License | What it does here |
|---|---|---|---|
| fastapi | 0.162.2 | MIT | The service's web framework |
| uvicorn | 0.38.0 | BSD-3-Clause | Runs the service |
| httpx | 0.28.1 | BSD-3-Clause | Calls to the server and to engines |
| PyYAML | 6.0.3 | MIT | Reads `engines.yaml` |
| pytest | 9.2.0 | MIT | Tests only |

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

Checked on 18 November 2026 in an `agent-computer` image built from this repository (Ubuntu 24.04 package `ffmpeg` 7:6.1.1-3ubuntu5): `ffmpeg -buildconf` shows `--enable-gpl`, and neither `--enable-nonfree` nor `--enable-version3`. So that FFmpeg is the GPL build (GPL version 2 or later). It is installed as a separate program from the distribution's archive, and it is not copied into or linked with FreeDuet's own code (D61). Its source is the distribution's source package (`apt-get source ffmpeg` on the same release). The `whisper` image installs the package of its own base image, and its build was not checked on that date.

## Font used by the app

Installed from npm and used as it is, not copied into this repository. No font file is tracked by git.

| Font | License | What FreeDuet uses |
|---|---|---|
| Inter (variable), through [`@fontsource-variable/inter`](https://www.npmjs.com/package/@fontsource-variable/inter) 5.3.0 | SIL Open Font License 1.1, Copyright 2016 The Inter Project Authors (the LICENSE file in the npm package) | The app's sans-serif face (`--font-sans` in `openbot/app/src/styles.css`), imported in `openbot/app/src/routes/__root.tsx` and `openbot/app/src/styles.css`, pinned in `openbot/bun.lock` |

The public site (`site/`) loads two more fonts from Google Fonts; neither is in the repository.

| Font | License | Where |
|---|---|---|
| Schibsted Grotesk | SIL Open Font License 1.1 | `site/tools/build.py` |
| IBM Plex Sans | SIL Open Font License 1.1 (read in the Debian `fonts-ibm-plex` copyright file, not upstream) | `site/tools/build.py` |

## Audio of the launch video (to confirm)

The sound track of `site/video/freeduet-launch.mp4`, the video on the public site, was made with a free generator; which one, and under which terms, is not yet checked (recorded on 19 November 2026). If its terms do not allow use on a public project, the track will be replaced.

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
| Lemo-Opuscar (outside library, named by the `film-in-code` skill) | Code MIT; its `*.md` guides CC BY-NC, as `CLAUDE.md` states | Optional, installed by the person; the member installs nothing until the person agrees. Its guides are never copied or paraphrased into this repository (`CLAUDE.md`). |

## Planned reuse (not yet in the code)

| Project | License | Planned use |
|---|---|---|
| [The Agency](https://github.com/msitarzewski/agency-agents) | MIT | Starting profiles for some pack members, adapted, with the source and license named in each member |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | Apache-2.0 | Grok Build CLI driver and team playbook format, ported with attribution |
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Apache-2.0, © 2026 Abhishek Barali and contributors | 77 game-development skills and their router, installed unmodified at a pinned commit for the game-development role of the catalogue (Kai, D149). Its LICENSE and NOTICE files ship with it. |

## Team prompts

The starter team's prompts, all test cases and the documentation were written from scratch for this project. Pack members adapted from a public library name their source and license in their own description.

## Trademarks

FreeDuet is an independent project and is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google, xAI, Z.ai, OpenRouter or CopilotKit. Claude, Claude Code and Duet are trademarks of Anthropic. ChatGPT and Codex are trademarks of OpenAI. Gemini is a trademark of Google. Grok is a trademark of xAI. These names are used only to describe compatibility.
