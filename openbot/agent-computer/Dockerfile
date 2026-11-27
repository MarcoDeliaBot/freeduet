# The Bot's computer installs the Playwright browsers (Chromium, Firefox, WebKit) and, for the member's shell, the
# `playwright` package at the same version (D175), plus the command-line tools the video
# maker (Cam) works with: ffmpeg, git and python3 with venv, plus the office toolkit (python-docx,
# openpyxl, python-pptx, pypdf, reportlab, pdfplumber, defusedxml) in its own virtual environment,
# `office-inspect`, our own read-only inspector (docs/design/office-files.md, slices S1 and S2), and headless
# LibreOffice with `office-convert`, our wrapper (slice S4, D61).
#
# The image tag and Playwright dependency must be pinned to the same exact version. Bump both or
# neither.
FROM node:24.18.1-bookworm-slim AS node-toolchain
FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS bun-toolchain

FROM ubuntu:24.04

# The Bun image digest pins the amd64/arm64 release bytes, including if its tag changes.
ARG PLAYWRIGHT_VERSION=1.62.1
ENV BUN_INSTALL=/usr/local
ENV PATH="/usr/local/bin:${PATH}"
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=node-toolchain /usr/local /usr/local
COPY --from=bun-toolchain /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils \
      ffmpeg git python3 python3-venv \
  && ln -s bun /usr/local/bin/bunx \
  && bunx --bun "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
  && rm -rf /root/.cache /tmp/* /var/lib/apt/lists/*

# Build check for the browsers: Chromium, Firefox and WebKit (the engine Safari uses) must each be in the image, or the
# image fails to build. Playwright names each browser's folder after its revision, so this checks the folder names.
RUN ls -d /ms-playwright/chromium-* /ms-playwright/firefox-* /ms-playwright/webkit-* >/dev/null \
  && echo "browsers: $(ls /ms-playwright | tr '\n' ' ')"

# D175: the `playwright` package for the member's shell, at EXACTLY the version that installed the browsers above
# (the same ARG, never a second number), global so that `require('playwright')`, `npx playwright --version` and
# `npx playwright test` find it with no network. `@playwright/test` is the same version, for tests written against it.
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD comes after the browsers are installed (it would skip that install too): a
# `playwright install` a member types then downloads nothing and says why. NODE_PATH and these two variables are
# passed to the shell by `environmentForCommand` (src/shell.ts).
RUN npm install -g --no-audit --no-fund --ignore-scripts "playwright@${PLAYWRIGHT_VERSION}" "@playwright/test@${PLAYWRIGHT_VERSION}" \
  && rm -rf /root/.npm /tmp/*
ENV NODE_PATH=/usr/local/lib/node_modules
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY agent-computer/image-check/playwright-ready.cjs /opt/image-check/playwright-ready.cjs
# Build check: the package version and the /ms-playwright revisions must agree, and the package must load.
RUN node /opt/image-check/playwright-ready.cjs --expect "${PLAYWRIGHT_VERSION}" \
  && npx --no-install playwright --version

# The office toolkit: one virtual environment at /opt/office, built here because a Bot's computer cannot
# install anything when it runs (root with every capability dropped, no sudo). Every package is pinned to
# an exact version and to its release files' hashes; `--no-deps` and `--only-binary` mean pip installs
# exactly that list and builds nothing. The system `python3` is left alone: a member runs
# `office-python script.py` for the toolkit. `office-python` is a small wrapper script, not a symbolic
# link (a link does not find the environment from another directory). `office-inspect` is a stdlib-only
# program of ours that reads a file and reports it; it runs with the same Python, in isolated mode.
# Files deleted after the install, because they are under a licence we do not carry: the reportlab wheel's
# sample font DarkGarden (GPL with a font exception; nothing uses it) and two LGPL C header files in the
# lxml wheel (build headers, not linked; nothing needs them at run time). The last step runs the tools
# for real, so an image whose toolkit does not work fails to build.
# LibreOffice (MPL-2.0), headless: Writer, Calc and Impress cores from the distribution, nothing else (no Java,
# no GUI extras, no recommended packages). Installed, never copied or modified (docs/M1_PLAN.md section 41, D61).
# It is meant to be used through `office-convert`, which recalculates a sheet and makes a PDF. Its launchers are taken
# off PATH below (D85), so `soffice` and `libreoffice` are not commands here; the program stays at its own path.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress fonts-liberation fonts-dejavu-core \
  && find /usr/bin -maxdepth 1 -type l -lname '*libreoffice*' -delete \
  && rm -rf /root/.cache /tmp/* /var/lib/apt/lists/*

COPY agent-computer/office-requirements.txt /opt/office-requirements.txt
RUN python3 -m venv /opt/office \
  && /opt/office/bin/pip install --no-cache-dir --require-hashes --no-deps --only-binary=:all: \
       --requirement /opt/office-requirements.txt \
  && find /opt/office -path '*/reportlab/fonts/DarkGarden*' -delete \
  && find /opt/office -path '*/lxml/includes/extlibs/*charset.h' -delete \
  && rm -rf /root/.cache
COPY agent-computer/office-inspect/office_inspect.py /usr/local/lib/office-inspect/office_inspect.py
COPY agent-computer/office-inspect/office-inspect agent-computer/office-inspect/office-python /usr/local/bin/
# `office-convert` (ours) is the intended way a member runs LibreOffice: two fixed jobs, `recalc` and `pdf`, after
# `office-inspect` has passed the file, with a throwaway profile, macros off and one overall limit of 105 seconds.
COPY agent-computer/office-convert/office_convert.py /usr/local/lib/office-convert/office_convert.py
COPY agent-computer/office-convert/office-convert /usr/local/bin/
RUN chmod 0755 /usr/local/bin/office-inspect /usr/local/bin/office-python /usr/local/bin/office-convert \
  && cd / \
  && office-python -c "import docx, openpyxl, pptx, pypdf, reportlab, pdfplumber, defusedxml, lxml.etree; docx.Document().save('/tmp/office-smoke.docx')" \
  && office-inspect /tmp/office-smoke.docx > /dev/null \
  && rm -f /tmp/office-smoke.docx
# Build check for LibreOffice: its version, then a real recalculation (a formula with no stored value must come out
# as 42.5, printed and in a kept copy) and a real PDF through `office-convert`, so an image whose LibreOffice does not work fails to build.
RUN /usr/lib/libreoffice/program/soffice --headless --version \
  && ! command -v soffice \
  && ! command -v libreoffice \
  && mkdir /tmp/lo-smoke && cd /tmp/lo-smoke \
  && office-python -c "import openpyxl, docx; w = openpyxl.Workbook(); s = w.active; s['A1'] = 10; s['A2'] = 32.5; s['A3'] = '=SUM(A1:A2)'; w.save('t.xlsx'); d = docx.Document(); d.add_heading('Smoke', 1); d.save('t.docx')" \
  && office-convert recalc t.xlsx | grep -q '"value": 42.5' \
  && office-convert recalc --keep t.xlsx > /dev/null \
  && office-convert pdf t.docx > /dev/null \
  && office-python -c "import openpyxl; v = openpyxl.load_workbook('t.recalculated.xlsx', data_only=True).active['A3'].value; assert v == 42.5, v; assert open('t.pdf', 'rb').read(5) == b'%PDF-'" \
  && cd / && rm -rf /tmp/lo-smoke /root/.cache

# The game-development library for Kai (docs/M1_PLAN.md section 107, D151): awesome-gamedev-agent-skills
# (Apache-2.0), fetched at one pinned commit, unmodified, into /opt/gamedev-skills. Only `router/`, `skills/`,
# LICENSE and NOTICE are kept (its repo-level scripts, tests, docs and .git are not shipped). The build fails if the
# fetched commit is not the pinned one or if LICENSE or NOTICE differ from the text that was reviewed on 25 November 2026.
# Only Kai's prompt names this folder. Moving the pin needs the same review again.
ARG GAMEDEV_SKILLS_SHA=c6ca6c41c839b68319ffc08430b99ab768debc32
ARG GAMEDEV_SKILLS_LICENSE_SHA256=6f82dcfeb95a1c0a0452180a3b16f21bf82111780018fed59d95a052b5b75f6c
ARG GAMEDEV_SKILLS_NOTICE_SHA256=2dcb65b1c5be24e5ba11e937f3996100f4e980d8cf8ac5b30ba1d70dae6c40f8
RUN git init -q /tmp/gamedev-src \
  && git -C /tmp/gamedev-src fetch -q --depth 1 https://github.com/gamedev-skills/awesome-gamedev-agent-skills "${GAMEDEV_SKILLS_SHA}" \
  && git -C /tmp/gamedev-src checkout -q FETCH_HEAD \
  && test "$(git -C /tmp/gamedev-src rev-parse HEAD)" = "${GAMEDEV_SKILLS_SHA}" \
  && cd /tmp/gamedev-src \
  && echo "${GAMEDEV_SKILLS_LICENSE_SHA256}  LICENSE" | sha256sum -c - \
  && echo "${GAMEDEV_SKILLS_NOTICE_SHA256}  NOTICE" | sha256sum -c - \
  && mkdir -p /opt/gamedev-skills \
  && cp -r router skills LICENSE NOTICE /opt/gamedev-skills/ \
  && chmod -R a-w /opt/gamedev-skills \
  && cd / && rm -rf /tmp/gamedev-src /root/.cache

WORKDIR /app
# The lockfile as well as the manifest: `--frozen-lockfile` with no lockfile present resolves afresh
# and exits 0, so the file has to be here for the flag to mean anything.
COPY agent-computer/package.json agent-computer/bun.lock ./
RUN bun install --frozen-lockfile

COPY agent-computer/src ./src
# index.ts imports ../../shared/file-download at runtime (the other shared imports are type-only and
# erased), so the one file it needs goes where that path resolves from /app/src.
COPY shared/file-download.ts /shared/file-download.ts

# Durable working directory. Bot-produced files that must survive replacement live here.
RUN mkdir -p /workspace
ENV WORKSPACE_DIR=/workspace

ENV PORT=4100
EXPOSE 4100
# Readiness is exposed through Docker health so the supervisor need not know the network route.
HEALTHCHECK --interval=2s --timeout=3s --start-period=2s --retries=30 \
  CMD bun -e "const r = await fetch('http://localhost:4100/health'); process.exit(r.ok ? 0 : 1)"

CMD ["bun", "src/index.ts"]
