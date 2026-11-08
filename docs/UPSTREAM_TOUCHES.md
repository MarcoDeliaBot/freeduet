# Upstream touches

FreeDuet is a thin fork of [OpenDuet](https://github.com/CopilotKit/OpenDuet). Its own code lives in `openbot/examples/freeduet/`, `openbot/agent-freeduet/`, `openbot/server/src/freeduet/` and `openbot/app/src/freeduet/`. Every change to a file that came from upstream is listed here with its reason, so merging upstream stays easy ([EXECUTOR_BRIEF.md](EXECUTOR_BRIEF.md), rule 2).

"Upstream?" says whether the change is worth proposing to CopilotKit. Nothing is proposed without the maintainer's approval.

| File | Change | Why | Milestone | Upstream? |
|---|---|---|---|---|
| `openbot/.env.example` (the root `.env.example` links to it) | `TENANT_PACKAGE_DIR=../examples/freeduet`; Compose project and image names `freeduet-*`; `COPILOTKIT_TELEMETRY_DISABLED=true`; the `CLAUDE_CODE_OAUTH_TOKEN` line replaced by a note; `CHATGPT_AUTH_FILE` marked experimental | FreeDuet's package by default, no clash with an OpenDuet checkout, no telemetry, no plan token | M0.3, M0.5 | No |
| `openbot/scripts/start.sh` | Default `TENANT_PACKAGE_DIR` is `../examples/freeduet` | The banner prints FreeDuet when `.env` does not set it | M0.3 | No |
| `docs/telemetry.md` | A note at the top: telemetry is off in FreeDuet | Says what FreeDuet does differently | M0.3 | No |
| `openbot/server/src/index.ts` | One import, `./freeduet/plan-token`, right after telemetry | Drops `CLAUDE_CODE_OAUTH_TOKEN` before anything reads the environment | M0.5 | No |
| `openbot/server/src/index.ts` | `provider: runtimeModel.provider` passed to the titler | Part of the titler fix below | M0.8 | Yes |
| `openbot/server/src/channels/titler.ts` | Anthropic keys go to Anthropic's endpoint | The titler sent an Anthropic key to OpenAI's API on every title (docs/SERVER_MODEL_CALLS.md §5) | M0.8 | **Yes, security** |
| `openbot/docker-compose.yml` | `CLAUDE_CODE_OAUTH_TOKEN` no longer passed to the harness | No plan token anywhere | M0.5 | No |
| `openbot/agent-claude-sdk/src/main.py` | Drops `CLAUDE_CODE_OAUTH_TOKEN` and requires `ANTHROPIC_API_KEY` | No plan token in the Claude Agent SDK harness | M0.5 | No |
| `openbot/docs/configuration.md` | A note: FreeDuet does not accept `CLAUDE_CODE_OAUTH_TOKEN` | Docs match behaviour | M0.5 | No |
| `openbot/app/index.html` | `<title>FreeDuet</title>` | The browser tab said OpenDuet; the file says a fork changes the title with its name | M0.6 | No |
| `openbot/app/src/routes/_authed/settings/index.tsx` | One import and `<FreeDuetAbout />` at the end of Settings | About rows: FreeDuet, built on OpenDuet and OpenBot, not affiliated | M0.6 | No |
| `openbot/app/src/lib/channels/run-lifecycle.ts`, `openbot/app/src/components/channels/channel-chat.tsx`, `openbot/app/src/components/duet/task-sheet.tsx`, `openbot/app/src/routes/_authed/onboarding.tsx` | "OpenDuet is still finishing something" and "The self-hosted assistant OpenDuet is built on" use the product name from the tenant package | A renamed fork showed "OpenDuet" in these messages | M0.6 | Yes |
| `openbot/app/tests/run-lifecycle.test.ts`, `openbot/app/tests/task-thread.test.tsx` | Expect the product name instead of "OpenDuet" | Follow the change above | M0.6 | Yes |
| `openbot/server/tests/channel-routes.test.ts` | "The first day's date" uses today instead of 2026-10-26 | The fixed date fell outside the one-day window and the test failed from 28 October (also red on OpenDuet's main) | M0.7 | Yes |
| `openbot/app/tests/self-host-banner.test.tsx` | `afterAll` drains React with the repo's own `settleReactWork` before unregistering the document | A scheduler callback fired after the document was gone: "Unhandled error between tests", 0 failing tests and a red CI (also on OpenDuet's main) | M0.7 | Yes |
| `.github/workflows/ci.yml` | New job `freeduet package`, added to `verify` | Checks the tenant package, evals and engines file on every pull request | M0.7 | No |
| `openbot/docker-compose.yml` | New service `agent-freeduet` (port 4230 on loopback, `default` network only) and two named volumes, `freeduet-claude-login` (the CLI's config directory, which FreeDuet code never reads) and `freeduet-data` (checkpoints) | The subscription router runs beside the other Bots; the person's sign-in survives restarts; no plan token or API key is passed to it | M1.1, M1.13 (#14) | No |
| `openbot/scripts/start.sh` | Unless `FREEDUET_ROUTER=off`: generates `FREEDUET_LOCAL_KEY` into `.env`, writes `ANTHROPIC_API_KEY` equal to it when empty, starts `agent-freeduet` with the tenant package the server loads (`FREEDUET_TENANT_DIR`), waits for its `/health`, and prints the sign-in command when `claude auth status` says nobody is signed in | One command starts the team on the person's login; the server's own model calls go to agent-freeduet's `/v1/messages` with a key nobody has to obtain (docs/M1_PLAN.md D9, D10) | M1.5, M1.6, M1.12 (#14) | No |
| `openbot/.env.example` | FreeDuet router block: `FREEDUET_ROUTER=on`, `FREEDUET_MEMBER_TYPE=remote-ag-ui`, `MANAGED_AGENT_AG_UI_URL=http://localhost:4230/`, `AGENT_ENDPOINT_ALLOWED_HOSTS=localhost:4230`, `BOT_PROVIDER=anthropic`, `ANTHROPIC_BASE_URL=http://localhost:4230`, `FREEDUET_LOCAL_KEY=` | Members are remote-ag-ui Bots at the one address that gets the deployment token (D1); the server refuses a localhost agent unless it is named; zero API keys (D10) | M1.5, M1.6 (#14) | No |
| `openbot/scripts/start-restart-guard.test.ts` | The fixture `.env` also holds `FREEDUET_LOCAL_KEY` and `ANTHROPIC_API_KEY`, as start.sh writes them | An ordinary FreeDuet `.env` has both; without them the first run generates the key and, rightly, restarts the server, which the "unchanged start" cases forbid | M1 (#29) | No |

## Not changed, on purpose

- `openbot/server/src/config.ts` and `openbot/scripts/generate-app-config.ts` keep OpenDuet's default package. FreeDuet sets `TENANT_PACKAGE_DIR` in `.env`, and upstream tests expect the upstream default.
- `openbot/server/src/agents/plan-model.ts` is untouched: the token never reaches it.
- `openbot/desktop/` still offers a Claude plan sign-in. FreeDuet does not ship the desktop app; before it ever does, that option must go too.
- The Helm chart (`openbot/charts/`) still defaults to OpenDuet's package; it is not part of FreeDuet's install yet.
