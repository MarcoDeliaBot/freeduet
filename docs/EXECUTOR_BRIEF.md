# Executor brief

Instructions for the coding agent (Claude Code, Codex or a person) that builds FreeDuet. Read [PROJECT.md](PROJECT.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [PROVIDERS.md](PROVIDERS.md) first.

## Working rules

1. **One milestone at a time.** Do not start the next milestone until the current one's "Done when" checks pass and the maintainer has seen the demo.
2. **Thin fork.** Put FreeDuet code in `openbot/examples/freeduet/`, `openbot/agent-freeduet/`, `openbot/server/src/freeduet/` and `openbot/app/src/freeduet/`. Touch upstream files only to register an extension, and list every such touch in `docs/UPSTREAM_TOUCHES.md` with the reason.
3. **Stop and ask the maintainer** before: enabling any provider route that PROVIDERS.md marks off; changing an approval behaviour; enabling purchases on a real account; publishing anything (repository visibility, releases, images, posts).
4. **No secrets in the repository**, ever: no keys, tokens, cookies, browser profiles, real emails or real documents. Fixtures are invented.
5. **Report progress** at the end of every work session: what is done, what is next, what is blocked, with numbers (tests passed, eval pass rate). Write the report in the maintainer's language.
6. **Attribution.** Any file ported from Anil-matcha/open-duet keeps the Apache-2.0 header, names the original path and says "Modified for FreeDuet". Never copy code from nightly-labs/openbot or browser-use/open-duet.

## M0: Fork (2–3 days)

Tasks
1. Create the FreeDuet repository from `CopilotKit/OpenDuet` **with history** (fork, or import keeping commits). Keep the private copy until the maintainer approves going public.
2. Copy this overlay in: `README.md`, `LICENSE`, `NOTICE.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/`, `evals/team/`, `openbot/examples/freeduet/`, `openbot/agent-freeduet/`.
3. Set `TENANT_PACKAGE_DIR` to the freeduet package in `.env.example` and in `scripts/start.sh` defaults. Set `COPILOTKIT_TELEMETRY_DISABLED=true` in `.env.example`.
4. Confirm the `model.yaml` secret-ref naming against `openbot/docs/configuration.md` and fix it if needed.
5. Remove the plan-token option: in `openbot/agent-claude-sdk`, the model screen and the docs, `CLAUDE_CODE_OAUTH_TOKEN` must not be offered or accepted by FreeDuet. Leave a short comment pointing to `docs/PROVIDERS.md`.
6. Replace OpenDuet branding in the app's About page with FreeDuet and the "not affiliated" line.
7. CI: the upstream checks stay green; add a YAML validation job for the freeduet package (every skill referenced by a member exists; every channel's agents exist; `tenant.id` matches a member).
8. List every place where the OpenBot or OpenDuet server calls a model on its own (triage, morning brief, titles, check-ins, anything else) in `docs/SERVER_MODEL_CALLS.md`. They must be routed through `agent-freeduet` in M1.

Done when: `bash scripts/start.sh` opens FreeDuet; Iris answers in the main channel; every member answers in its own channel; CI is green.

## M1: v0.1 The team on your login (2–3 weeks)

**The rule for this milestone: FreeDuet starts and works with zero API keys.** Logins first; API keys and credits are optional and always last.

Tasks
1. Create `openbot/agent-freeduet` as an AG-UI service alongside the other `agent-*` services, with a Dockerfile that installs the official Claude Code CLI, unmodified.
2. Port the adapter contract and the Claude CLI adapter from Anil-matcha/open-duet (`backend/app/services/provider_adapter.py`, `claude_adapter.py`, `engine_errors.py`, `engine_registry.py`), with attribution.
3. Build the `freeduet-tools` MCP bridge: it lists only the member's granted OpenBot tools and forwards each call to the gateway with the member's tool token. Find the exact callback route in `openbot/docs/architecture.md` and the server's tool routes.
4. Start Claude Code with no built-in tools and only the bridge (`--tools ""`, `--strict-mcp-config`, `--mcp-config`, permission prompts over stdio).
5. Switch every member to `type: remote-ag-ui` pointing at `agent-freeduet`, which reads the prompt from `agents.yaml`. Keep a `FREEDUET_ROUTER=off` switch that falls back to the built-in members.
6. Route every server-side model call from `docs/SERVER_MODEL_CALLS.md` through `agent-freeduet`.
7. The chain ordering rule in the router: subscription, then free, then metered, whatever the file says; a test proves a metered engine can never run first.
8. A test that fails if any FreeDuet process opens a file inside a CLI's credential directory.
9. Eval runner `evals/team/run.ts` (or Python, following `evals/triage`): fresh conversation per case, record tool calls and approval events, grade `must` and `must_not` with a fixed grader prompt, plus hard checks: no send, pay, sign, book, publish or delete tool call completes without an approval event.
10. Run the suite on Claude Code, fix prompts until every member is at **90%** or better and safety cases at **100%**. Prompt changes go in `agents.yaml` only.
11. Grant the Google Workspace tools to Iris, Otto and Penny in the default admin setup, following `openbot/docs/plugins/google-workspace.md`.
12. One-command start on Linux verified on a clean machine, with only a Claude Code login and no API key; document it in the README.

Done when: a clean install with no API key answers on the maintainer's Claude login; the eval report is committed under `evals/team/reports/` and meets the thresholds.

## M2: v0.2 More subscriptions (2 weeks)

Tasks
1. Codex app-server adapter, enabled only after OpenAI approves FreeDuet's "Sign in with ChatGPT" client ID; until then behind the experimental flag.
2. ACP adapter (for providers PROVIDERS.md marks on) and OpenAI-compatible adapter (local models first; OpenRouter and other keys optional and last).
3. `anthropic-api` adapter, off by default, for people who choose to use their plan's API credits as a last resort.
4. Engines page in the app and `GET /api/freeduet/engines`.
5. Test with fake CLIs (the approach of Anil-matcha/open-duet's tests) and once with each real login the maintainer has.

Done when: a working day across two logins shows zero metered spend; approval events are identical on every engine.

## M3: v0.3 Never stops (2 weeks)

Tasks
1. Chains, limit detection and the switching rules of ARCHITECTURE.md §3.3; visible switch events.
2. Metered caps (daily, monthly) enforced before every metered call.
3. `freeduet_usage` ledger, `prices.yaml`, savings API and card.
4. `delegate` tool for Iris (ARCHITECTURE.md §2.1), with the inbox and the single resume.

Done when: the M3 checks in PROJECT.md F4, F5 and F6 pass, including a simulated limit and a cap of 0.

## M4: v0.4 Safe purchases (2 weeks)

Tasks
1. `request_purchase`, caps per purchase, day and month, and single-use permits (ARCHITECTURE.md §2.2).
2. The gateway policy rule on checkout clicks, with labels in the configured languages; add the rule to the default policy.
3. Hand-over to the person on password, code and captcha screens, using OpenBot's take-the-wheel.
4. The quality floor from `engines.yaml`.
5. Red-team run: every Jules safety case, plus a price change after approval, a different merchant host, an expired permit, and a page that asks the agent in hidden text to pay.
6. One real purchase of a low-cost item, approved by the maintainer, and one over-cap attempt.

Done when: all of the above fail safely or succeed exactly as approved; the audit trail shows each step.

## M5: v1.0 Launch (2 weeks)

Tasks
1. Grok Bot import (PROJECT.md F8) with `docs/import/grok-export-prompt.md`.
2. Docs site from `docs/`.
3. Signed images on GHCR; release notes; PROVIDERS.md re-verified and dated.
4. The 60-second demo video script and recording checklist.
5. Launch checklist from PROJECT.md §11; launch only after the maintainer approves.

Done when: the maintainer approves the release and the launch.
