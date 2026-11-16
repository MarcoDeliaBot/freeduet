# Onboarding says where the data is

## What the person sees

The step "Where your data lives" (`openbot/app/src/routes/_authed/onboarding.tsx`) is shown to somebody trying FreeDuet on their own machine. Its paragraph now follows the server's answer:

| Server answer | Paragraph |
|---|---|
| `FREEDUET_INTELLIGENCE=off` (`mode: "local"`; what a FreeDuet install writes, `openbot/.env.example:378`) | Your Bots and settings stay in this install's database. Conversations and memory stay in that same database. Nothing is sent to a hosted memory service. What you ask goes to your AI model. |
| Intelligence on (unset or `on`, `mode: "intelligence"`) | Unchanged: "... Conversations and memory are kept in CopilotKit Intelligence, in CopilotKit's cloud unless you host it yourself. ..." |

The usage-events caption under the paragraph is unchanged.

## Rules

- The signal is `mode`, which `/api/capabilities` already sends (`openbot/server/src/app.ts:583`). The app reads it as `intelligence` (`openbot/app/src/lib/deployment/queries.ts`). No server change.
- An absent `mode` keeps the upstream sentence, as `promotions` does.
- The step does not say "on this computer": `DATABASE_URL` is required and nothing checks where it points (`openbot/server/src/config.ts:1464`). The default written by the start script is `localhost` (`openbot/scripts/start.sh:588`).

## Where the data is with the switch off (read in the code)

- Threads: `createLocalThreadStore(database)` (`openbot/server/src/freeduet/backend.ts:176`), a store on the install's Postgres (`openbot/server/src/freeduet/threads/store.ts:274-275`). The local backend has no Intelligence client and `memory: undefined` (`backend.ts:196-201`).
- Runtime: no Intelligence settings reach the runtime (`openbot/server/src/copilot.ts:1810-1812`), and it runs on the local runner (`copilot.ts:1908`).
- Memory: `createMemoryStore(database, { intelligence: threadBackend.memory })` (`openbot/server/src/index.ts:1435-1437`). Without an Intelligence client the store calls no platform (`openbot/server/src/memory/store.ts:107-110`, `:210`).
- One database: `createDatabase(config.databaseUrl)` (`openbot/server/src/index.ts:393`).
- Measured in #45: zero requests to `*.copilotkit.ai` with the switch off and no telemetry variable (`docs/M1_PLAN.md:97`).

## What is not built

- The usage-events caption ("CopilotKit also receives usage events") is unchanged. `openbot/.env.example:203` ships `COPILOTKIT_TELEMETRY_DISABLED=true`, and D20 (`docs/M1_PLAN.md:93`) says telemetry is off unless it is set to false. So the caption is probably wrong for a default install. Not checked live.
- `docs/M1_PLAN.md:905` still lists this step as upstream's wording. The coordinator updates it.
- Other places that name Intelligence for memory (for example `openbot/server/src/memory/types.ts:48`) were not reviewed.

## Built so far

- `LocalStep` takes `intelligence` and writes one of the two paragraphs above (`openbot/app/src/routes/_authed/onboarding.tsx`).
- `openbot/app/src/lib/deployment/queries.ts` reads `mode` as `intelligence`.
- `openbot/app/tests/onboarding-route.test.tsx`: the fixture answers `mode`, the upstream test runs with `intelligence`, and one new test runs with `local` and fails on the unchanged source.
- Not run live: no installation was started, and the test uses a mocked `/api/capabilities`.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Say "on this computer" for the local database? | (a) "this install's database", as built; (b) "on this computer" | (a) | `DATABASE_URL` decides where the database is (`openbot/server/src/config.ts:1464`). (b) is true only for the default `localhost` address |
| The usage-events caption | Keep it as it is; or say what a default install does (telemetry off, `openbot/.env.example:203`) | Reword it in a separate change after a live check | The brief limited this change to the paragraph |
