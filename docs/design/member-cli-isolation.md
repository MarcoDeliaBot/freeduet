# A member's CLI and the checkout's project files

Question: can the locked-down `claude -p` that runs a member pick up `CLAUDE.md` or `.claude/` (settings, agents, skills) from the repository checkout? Answer: no, in every run mode, because the process never starts inside the checkout. This note says what was checked, which test guards it, and what was not verified live.

## Why it matters

Claude Code loads project files from its working directory and every parent: `CLAUDE.md`, `CLAUDE.local.md`, `.claude/settings.json`, `.claude/agents`, `.claude/skills` [doc: https://code.claude.com/docs/en/memory]. The headless `-p` mode loads them as an interactive session would, and the documented switch that skips them, `--bare`, also stops using the subscription login [doc: https://code.claude.com/docs/en/headless]. FreeDuet runs on logins, so `--bare` is not an option and the working directory is the protection. The repository root holds a `CLAUDE.md` for coordinating sessions and `.claude/agents/` holds executor definitions; neither is written for members.

## What starts a CLI, and where

| Run | Working directory | Inside the checkout? | Where |
|---|---|---|---|
| Member turn, Claude engine | `<tmp>/freeduet-segment-*/work`, new and empty | No | `openbot/agent-freeduet/freeduet/segment.py:284-287` (made), `claude_engine.py:107` (used) |
| Member turn, compatible engine | the same folder | No | `compatible_engine.py:532` |
| Server's short text calls (titles, routing, review) | `<tmp>/freeduet-text-*/work`, new and empty | No | `claude_cli.py:254-259` |
| Sign-in probe (version, auth status) | `<tmp>/freeduet-probe-*/work`, new and empty | No | `claude_cli.py:355-366` |
| Compatible engine's probe | `<tmp>/freeduet-probe-*/work`, new and empty | No | `compatible_engine.py:443-453` |

All five callers go through `start(...)` (`claude_cli.py:171-178`, `cwd=cwd`) or `_short(...)` (`claude_cli.py:282-289`, which calls `start`). `grep` finds no other caller. `<tmp>` is the service's temporary folder (`/tmp`, or `TMPDIR`, which `claude_cli.py:90` passes through).

## Per way of running FreeDuet

- Compose (what `openbot/scripts/start.sh` starts, `start.sh:562`, `docker-compose.yml` service `agent-freeduet`): the service is the `agent-freeduet` image. Its build context is `openbot/`, so the repository root, and its `CLAUDE.md`, are not in the context. The image holds `/app/freeduet`, two example YAML files and a licence (`openbot/agent-freeduet/Dockerfile`, the `COPY` lines). The CLI's folder is under `/tmp` in the container.
- Source checkout started with `start.sh`: the same Compose service. `start.sh` does not run the service from the checkout on the host.
- All-in-one image (`openbot/Dockerfile`): it does not contain `agent-freeduet` (no `COPY` of it, no service in `docker/s6`), so no member CLI runs there.
- Running `uvicorn freeduet.app:app` by hand from a checkout: the working folder is still a fresh folder under `<tmp>`, not the shell's directory. It reaches the checkout only if `TMPDIR` is set to a folder inside it. That is the one way to break the guarantee, and nothing in FreeDuet sets it.

## What the tests guarantee

- `tests/test_command.py::test_the_started_cli_gets_exactly_that`: the run's working folder has no entries ("no project files, no CLAUDE.md"). The lockdown test next to it forbids `--bare`, `--add-dir`, `--settings`, `--plugin-dir`, `--resume`, `--continue`, `--session-id` and the permission-skipping flags. It does not look at the folder's parents.
- `tests/test_engine_probe.py` (about line 257): the probe's folder is a new `work` folder, empty, not the service's own folder, and nothing is left behind.
- New: `tests/test_command.py::test_the_cli_never_starts_where_project_files_could_be_found`. The working folder is not inside the repository checkout, and it is the run's own `work` folder under `freeduet-segment-*`, empty as the fake CLI saw it. It guards behaviour that is already true: it passes on main without a code change.

Not guaranteed by any test: the folders above the run's own folder (`/tmp`, `/`), which the service does not control; a `TMPDIR` pointing into a checkout.

## What the documentation confirmed, and what it did not

Confirmed: `-p` without `--bare` discovers CLAUDE.md, settings, agents and skills from the working directory and `~/.claude` [doc: https://code.claude.com/docs/en/headless]; `CLAUDE.md` discovery walks up from the working directory [doc: https://code.claude.com/docs/en/memory]; `--setting-sources` takes `user`, `project`, `local` and `--disable-slash-commands` turns off skills and commands [doc: https://code.claude.com/docs/en/cli-reference].

Not confirmed: that `--setting-sources` excludes `CLAUDE.md` or project agents (the page lists only settings sources), and what `--disable-slash-commands` does to project agents. No change was made on the strength of either, because none is needed while the folder is empty.

## Not verified live

No real `claude` binary was run, by rule. The tests use the repository's fake CLI, which records its working directory and arguments. Whether version 2.1.311 (pinned in the Dockerfile) loads a parent's file in the way the pages describe was not observed.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Reject a `TMPDIR` inside a checkout at start-up | Do nothing; refuse to start | Do nothing | Nothing sets it; a refusal adds a failure mode for a case nobody has. |
