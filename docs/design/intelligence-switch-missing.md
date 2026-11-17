# A missing FREEDUET_INTELLIGENCE is refused (D65)

Written on 17 November 2026. Decision D65, section 45 at the end of `docs/M1_PLAN.md`. Built and tested here; not yet run on a real installation, a desktop app or a cluster.

## 1. The problem

The rule in `CLAUDE.md` and D20 says CopilotKit Intelligence is "optional and off by default". That was true for the install files and not for the code.

- `localRuntimeFrom` (`openbot/server/src/freeduet/intelligence-switch.ts`, before this change line 45: `if (!value || value === "on") return undefined`) returned "no local runtime" when `FREEDUET_INTELLIGENCE` was unset, empty or only spaces.
- `runtimeCapabilities` (`openbot/server/src/config.ts:1063-1091`) then took the upstream branch. With `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and `INTELLIGENCE_API_KEY` present, the server ran in Intelligence mode: `createThreadBackend` (`openbot/server/src/freeduet/backend.ts:146-171`) built the Intelligence client and runner, so threads and memory went to the outside service although nobody wrote `on`. With one or two of the three missing, it refused to start with a message about keys.
- `telemetryOffWithoutIntelligence` (`openbot/server/src/freeduet/telemetry-off.ts:22`) forces telemetry off only for `off`.
- The install path is safe: `openbot/scripts/start.sh:301-314` writes the line before the server starts (`on` when the three settings are there, else `off`), `openbot/.env.example:382` has `off`, `update.sh` runs `start.sh`. Not safe: any start that does not go through `start.sh` (a hand-written `.env`, the Helm chart, the desktop app, the all-in-one image with `-e` flags).

So the sentence "your conversations stay on your computer" was false in that state.

## 2. What the person sees, in each way of running

"Before" is main at a766f00 (where this branch was cut); "after" is this change. "Line" means the `FREEDUET_INTELLIGENCE` line.

| Way of running | Before | After |
|---|---|---|
| `scripts/start.sh` (README quick start, `update.sh`, `.env.example` copied) | `start.sh:301-314` writes the missing line, `on` with the three settings, else `off`. Server runs as written | Same. `start.sh` is not changed; `start-restart-guard.test.ts:1188-1246` passes untouched |
| Server started by hand with no line and the three settings (`bun src/index.ts`, a hand-written `.env`) | Intelligence mode, threads and memory in the outside service, silently | Refuses to start with the sentence in section 3. Nothing is built: no Intelligence client, no listener |
| The same with none or some of the three | Refuses, with a message about keys | Refuses, with the sentence in section 3 (the switch is asked first) |
| Line `off` | Local, the three ignored and named in the boot log (`backend.ts:178-186`) | Same |
| Line `on` | Intelligence, the three required | Same |
| Line misspelled (`of`, `false`) | Refused (`intelligence-switch.ts`, `must be "on" or "off"`) | Same |
| All-in-one image (`openbot/Dockerfile`, `ENTRYPOINT ["/init"]`, container environment) | With the three `-e` settings and no line: Intelligence mode, silently | Refuses; the sentence is in the container log. `docker run` must say `-e FREEDUET_INTELLIGENCE=on` or `off` |
| `docker compose up` with an old `.env` | `openbot/docker-compose.yml` has no server service (it starts the database, the migration, the computers, the supervisor and the agents), so no server starts from it | Nothing changes. The server that `start.sh` starts reads the `.env` it just wrote |
| Helm chart | `charts/openbot/templates/_helpers.tpl` `openbot.commonEnv` passes the three settings (`validation.yaml:80` refuses an install without them) and no line: Intelligence mode, silently | The chart passes `FREEDUET_INTELLIGENCE=on` beside the three, unless `config.extraEnv` already names it (then only the operator's entry is rendered, never a duplicate). Behaviour exactly as today, now explicit. A switch set only through `extraEnvFrom` would be overridden by the chart's `on`: not supported, say so if it matters |
| Desktop app | `openbot/desktop/src-tauri/src/env.rs` `compose` writes the three settings on every start and no line: Intelligence mode, silently. A hand-written line in `.env` was kept | `write` puts `FREEDUET_INTELLIGENCE=on` in `.env` only when the file has no value for it (unset, empty, blank); an existing value, `off`, `on` or a typo, is never overwritten, so `off` stays `off` and a typo is refused by the server |
| Eval stack (`openbot/scripts/freeduet-eval-stack.sh`) | `check_intelligence` read a missing line as off | Reads it as `start.sh` will write it (`on` with all three settings, else `off`), which is what the server then runs. A fresh `.env.eval` has `off` from `.env.example`, the person's two addresses and no key, so it is `off` either way |
| Telemetry | Forced off only for `off` | Unchanged for `on` and `off`. A missing line never reaches telemetry: the server stops first |

## 3. What is built

- One definition: `localRuntimeFrom` throws `INTELLIGENCE_SWITCH_MISSING` for a value that is unset, empty or only spaces. `runtimeCapabilities` and both Learning readers in `config.ts` (`learningSetupCredential`, `learningDefault`) go through it, so they agree and `ignoredIntelligenceVariables` is only built for `off`.
- The sentence, exactly: `FREEDUET_INTELLIGENCE is not set. Write FREEDUET_INTELLIGENCE=off in your settings file to keep your conversations on this computer, or FREEDUET_INTELLIGENCE=on to have them kept by the outside CopilotKit Intelligence service. scripts/start.sh writes it for you.`
- It does not become `off` silently: an installation whose conversations are already in Intelligence would then show none of them. That is why `start.sh` writes `on` in that case (`start-restart-guard.test.ts:1188-1246`, "Writing off would hide them").
- The chart and the desktop app say `on` where they pass the three settings (the desktop only when `.env` holds no value for the key: `DEFAULT_ONLY` in `env.rs` `write`, chosen over making the key owned because an owned key is replaced on every Start, which would turn a hand-written `off` into `on`); the image job in CI says `on` for its placeholders; the eval stack reads the line the way `start.sh` writes it.
- Tests: `freeduet-intelligence-switch.test.ts` and `freeduet-intelligence-config.test.ts` pin the new behaviour; `freeduet-intelligence-missing.test.ts` runs the real entry point with the line missing (refused, no listener, zero connections to the "outside service") and the three ways in process; `freeduet-eval-stack-intelligence.test.ts`; a Rust unit test in `env.rs`. The shared test environment (`server/tests/support/environment.ts`) says `on`, which is what a missing line meant before, for tests written for upstream's three settings.

## 4. What is not built

- What the desktop app should write by default.
- What the Helm chart's default should be.
- Whether a missing telemetry line should also be forced off.
- Any sentence on the site (`site/` is not touched; a text preview is open in #334).

## 5. Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| What the desktop app writes | (a) `on`, as built here (the app requires an Intelligence key to start and its screen says conversations are kept by the outside service). (b) `off`: the app stops asking for a key, conversations stay on the computer | (b), as its own slice | It matches the promise to the person. It changes the first-start screen and the stored data of existing desktop installs (conversations in Intelligence would no longer show), so it needs a design and a migration note |
| The Helm chart's default | (a) `on`, as built. (b) A value `config.intelligence.mode`, default `on`, `off` skips the three settings and their validation. (c) Default `off` | (b) | A cluster operator chose the chart with the three settings required. `off` by value is an explicit choice and keeps upgrades from hiding conversations |
| Telemetry when the line is missing | (a) Nothing (the server refuses first). (b) Force it off whenever the line is missing or `off` | (a) | The server cannot run with the line missing, so (b) changes nothing today; revisit only if the refusal is ever relaxed |
| Site sentences that depend on this | The heading "Your conversations stay on your computer" (`site/src/body.html:304`, key `fe5h` in `site/src/lang/en.json` and every other language) and the data-sentence in the onboarding step | Reword to "by default, for an install made with the FreeDuet scripts" until the desktop and chart defaults are decided | The sentence is true for `start.sh` installs and false for the desktop app and the chart, which run in Intelligence mode |

Desktop behaviour implemented, for the record: an existing `FREEDUET_INTELLIGENCE` value in the desktop's `.env` is never overwritten (D65 must never turn Intelligence on where the person wrote `off`). What the desktop writes when there is no value stays the maintainer's open decision (first row above).
