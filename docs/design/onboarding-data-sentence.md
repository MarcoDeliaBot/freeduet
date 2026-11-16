# Onboarding says where the data is

## What the person sees

The step "Where your data lives" (`openbot/app/src/routes/_authed/onboarding.tsx`) is shown to somebody trying FreeDuet on their own machine. Its first paragraph follows the server's answer about conversations:

| Server answer | Paragraph |
|---|---|
| `FREEDUET_INTELLIGENCE=off` (`mode: "local"`; what a FreeDuet install writes, `openbot/.env.example:378`) | Your Bots and settings stay in this install's database. Conversations and memory stay in that same database. Nothing is sent to a hosted memory service. What you ask goes to your AI model. |
| Intelligence on (unset or `on`, `mode: "intelligence"`) | Unchanged: "... Conversations and memory are kept in CopilotKit Intelligence, in CopilotKit's cloud unless you host it yourself. ..." |

The caption under it follows a second answer, about CopilotKit's usage events:

| Server answer | Caption |
|---|---|
| `copilotkitTelemetryDisabled: true` (CopilotKit's usage events are off) | CopilotKit gets no usage events from this install, because telemetry is switched off here. |
| Key absent (the SDK's rule leaves usage events on) | Unchanged: "CopilotKit also receives usage events. Set DO_NOT_TRACK=1 to turn them off." |

## Rules

- The conversations signal is `mode`, which `/api/capabilities` already sent (`openbot/server/src/app.ts:583`). The app reads it as `intelligence` (`openbot/app/src/lib/deployment/queries.ts`). An absent `mode` keeps the upstream sentence, as `promotions` does.
- The usage-events signal is `copilotkitTelemetryDisabled`. The server sends it only when CopilotKit's own rule is true: `COPILOTKIT_TELEMETRY_DISABLED` or `DO_NOT_TRACK` is exactly `true` or `1`. `openbot/server/src/freeduet/copilotkit-telemetry.ts` copies that rule from `isTelemetryDisabled` in `@copilotkit/shared` 1.77.0 (`dist/telemetry/telemetry-disabled.mjs:13`). The runtime applies the same rule to its own sends: `@copilotkit/runtime` `dist/v2/runtime/telemetry/telemetry-client.mjs:9-11` reads it, `:20` stores it, and `:64` returns before any send.
- The answer is read from the environment after `openbot/server/src/freeduet/telemetry-off.ts` has run. `openbot/server/src/index.ts:4` imports it before the runtime loads, and `loadConfig()` runs at `index.ts:387`, so the answer is the one the runtime gives.
- The caption follows that answer, not the switch. `FREEDUET_INTELLIGENCE=off` with `COPILOTKIT_TELEMETRY_DISABLED=false` keeps upstream's caption, because the SDK keeps usage events on.
- The step does not say "on this computer": `DATABASE_URL` is required and nothing checks where it points (`openbot/server/src/config.ts:1470`). The default the start script writes is `localhost` (`openbot/scripts/start.sh:588`).

## Where usage events are off by default (read in the code)

- `openbot/.env.example:203` ships `COPILOTKIT_TELEMETRY_DISABLED=true`. `openbot/scripts/start.sh:301-309` writes `FREEDUET_INTELLIGENCE` only when the settings file has no line for it: `on` for an install that already has all three Intelligence settings (it keeps its conversations), otherwise `off`. A new install copies `.env.example`, which says `off` (`openbot/.env.example:378`).
- With the switch off and the variable empty, `openbot/server/src/freeduet/telemetry-off.ts:24-26` fills in `true`. A value the person chose, `false` included, is kept.
- The browser side makes no CopilotKit telemetry call in a person's install. `openbot/app/src/lib/copilot/provider.tsx:64` passes `enableInspector={inspectorEnabled()}`, and `inspectorEnabled()` is true only when `VITE_COPILOTKIT_INSPECTOR` is `true` (`provider.tsx:40`). The SDK's `shouldEnableInspector` (`@copilotkit/shared` `dist/utils/inspector-visibility.mjs:6`) also needs a development build, so the inspector, whose `track()` posts to `telemetry.copilotkit.ai`, is never loaded there.
- Threads: `createLocalThreadStore(database)` (`openbot/server/src/freeduet/backend.ts:176`), a store on the install's Postgres (`openbot/server/src/freeduet/threads/store.ts:274-275`). The local backend has no Intelligence client and `memory: undefined` (`backend.ts:196-201`).
- Runtime: no Intelligence settings reach the runtime (`openbot/server/src/copilot.ts:1810-1812`), and it runs on the local runner (`copilot.ts:1908`).
- Memory: `createMemoryStore(database, { intelligence: threadBackend.memory })` (`openbot/server/src/index.ts:1436-1438`). Without an Intelligence client the store calls no platform (`openbot/server/src/memory/store.ts:107-110`, `:210`).
- One database: `createDatabase(config.databaseUrl)` (`openbot/server/src/index.ts:394`).
- Measured in #45: zero requests to `*.copilotkit.ai` with the switch off and no telemetry variable (`docs/M1_PLAN.md:97`).

## What is not built, and limits

- Not run live. The caption is tested with a mocked `/api/capabilities`, and no installation was started.
- A developer who sets `VITE_COPILOTKIT_INSPECTOR=true` in a development build gets the inspector. The inspector checks the core's `telemetryDisabled` before the sends I read (six call sites, not all of them), and its `track()` in `lib/telemetry.mjs` checks only a local opt-out. The core's flag starts as `false` until the runtime info has loaded (`@copilotkit/core` `dist/index.mjs:1561`, `:2357`). The caption does not cover that developer path.
- Other places that name Intelligence for memory (for example `openbot/server/src/memory/types.ts:48`) were not reviewed.

## Built so far

- `LocalStep` takes `intelligence` and `telemetryOff`, and writes the paragraph and the caption above (`openbot/app/src/routes/_authed/onboarding.tsx`).
- `openbot/server/src/freeduet/copilotkit-telemetry.ts` holds the rule. `openbot/server/src/config.ts` adds `copilotkitTelemetryDisabled` to the loaded configuration. `openbot/server/src/app.ts` sends it on `/api/capabilities` only when true. `openbot/app/src/lib/deployment/queries.ts` reads both answers (absent means false).
- Tests: `openbot/server/tests/freeduet-copilotkit-telemetry.test.ts` (the rule table, and `/api/capabilities` after the boot order for four environments); `openbot/app/tests/onboarding-route.test.tsx` (the paragraph for both modes, and the caption for both telemetry states).
- `docs/M1_PLAN.md:905` now describes the step as following the server's answers, not as upstream's wording.

## Decisions

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Say "on this computer" for the local database? | (a) "this install's database", as built; (b) "on this computer" | (a) | `DATABASE_URL` decides where the database is (`openbot/server/src/config.ts:1470`). (b) is true only for the default `localhost` address |
| The usage-events caption | Keep upstream's text for everyone; or say what is true when the server reports usage events off | Decided: the caption follows the server's answer (`copilotkitTelemetryDisabled`), and upstream's text stays when the key is absent | Set on the coordinator's follow-up to PR #300. The state comes from the code, not from the switch alone |
