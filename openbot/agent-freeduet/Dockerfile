# agent-freeduet: FreeDuet's team members on the person's own Claude Code login (docs/M1_PLAN.md).
# Build context is openbot/, like the other agent-* images:
#   docker build -f agent-freeduet/Dockerfile openbot
#
# The official Claude Code CLI is installed from npm at a pinned version and never modified
# (docs/PROVIDERS.md rule 3). The person signs in once, inside the container, with Anthropic's own
# flow: `docker compose exec -it agent-freeduet claude`. The sign-in lives in the CLI's config
# folder, a volume; no FreeDuet code reads it (PROVIDERS.md rule 1, D9).

# Node LTS, the same pin as openbot/Dockerfile and agent-computer. Only the node binary and its
# global modules are taken: copying all of /usr/local would replace the Python install.
FROM node:24.18.1-bookworm-slim AS node-toolchain

FROM python:3.12-slim

COPY --from=node-toolchain /usr/local/bin/node /usr/local/bin/node
COPY --from=node-toolchain /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Bump deliberately, after re-checking the flags in freeduet/claude_cli.py against `claude --help`.
ARG CLAUDE_CODE_VERSION=2.1.311
RUN npm install -g --no-fund --no-audit "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force \
  && CLAUDE_CONFIG_DIR=/tmp/claude-build claude --version \
  && rm -rf /tmp/claude-build /root/.npm

WORKDIR /app

# Dependencies before source, so editing the service does not re-resolve them.
COPY agent-freeduet/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY agent-freeduet/freeduet ./freeduet
COPY agent-freeduet/engines.example.yaml agent-freeduet/prices.example.yaml agent-freeduet/LICENSE-APACHE-2.0 ./

# A user of its own. The CLI's config folder and the data folder are created here, owned by that
# user, so the named volumes mounted on them start with the same owner.
RUN useradd --create-home --uid 10001 --shell /bin/bash freeduet \
  && mkdir -p /home/freeduet/.claude /data \
  && chmod 700 /home/freeduet/.claude \
  && chown -R freeduet:freeduet /home/freeduet /data
USER freeduet

ENV CLAUDE_CONFIG_DIR=/home/freeduet/.claude \
    FREEDUET_DATA_DIR=/data \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
VOLUME ["/home/freeduet/.claude", "/data"]

EXPOSE 4230
# 0.0.0.0, not `::`: uvicorn binds `::` as IPv6-only, which refuses 127.0.0.1 inside the container
# (see agent-claude-sdk/Dockerfile). Compose publishes the port on loopback only.
CMD ["uvicorn", "freeduet.app:app", "--host", "0.0.0.0", "--port", "4230"]
