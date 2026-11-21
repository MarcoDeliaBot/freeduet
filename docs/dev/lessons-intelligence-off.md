# Things learned the hard way (Intelligence off, SSE mode)

Moved out of `CLAUDE.md`. Read it before changing the server's run, stream, approval, hand-off or sign-in code.

- `Bun.serve` closes a connection silent for 10 s. Run and connect streams get our own keep-alive
  every 5 s (`server/src/freeduet/keep-alive.ts`); the runtime's own keep-alive is switched off.
- Stored runs must never get a synthetic `missing_terminal_event` result for a paused tool call
  (frontend tools, approvals). `sealRuns` only closes text, reasoning and tool-call ENDs.
- agent-freeduet ends a pause with a plain `RUN_FINISHED`; the approval interrupt is built on the
  OpenBot side by `HeadlessToolsMiddleware`.
- `PgAgentRunner.run()` starts the agent eagerly: a client that disconnects does not stop the run.
- A run needs its thread row first (`getOrCreateThread`); whoever takes the thread lock releases it.
- An exported `ANTHROPIC_BASE_URL` beats `.env`; the server pins the model base to agent-freeduet
  while the router is on (`server/src/freeduet/model-base.ts`).
- CopilotKit's runtime sends `licenseStatus` only with Intelligence on: identify the server by
  `/api/capabilities` instead.
- `localRuntimeFrom` (`openbot/server/src/freeduet/intelligence-switch.ts`) REFUSES a missing
  `FREEDUET_INTELLIGENCE` (unset, empty or only spaces, D65) with `INTELLIGENCE_SWITCH_MISSING`; it
  returns `undefined`, upstream's Intelligence contract, only for `on`. The server has no default: the
  install files write the line (`openbot/.env.example:382` is `off`, `openbot/scripts/start.sh:301-308`
  writes `off` when it is missing, `on` when `INTELLIGENCE_API_URL`, `INTELLIGENCE_GATEWAY_WS_URL` and
  `INTELLIGENCE_API_KEY` are all set), the Helm chart writes `on` unless `config.extraEnv` names the switch, and the desktop app writes `off` when its `.env` holds no value (D67; a value the person wrote stays, `on` included). A test or a
  script that starts the server or calls `loadConfig` must say `on` or `off` itself
  (`server/tests/support/environment.ts` says `on`).
- The desktop app runs the upstream example package, not the FreeDuet team: `openbot/desktop/src-tauri/src/env.rs:790` sets `TENANT_PACKAGE_DIR` to `../examples/fintech`, and `openbot/desktop/src-tauri/src/stack.rs:25` and `:84-95` start no `agent-freeduet`. So D65 and D67 on the desktop decide where conversations are kept, not what the members do (D67, `docs/M1_PLAN.md`, 17 November 2026).
- Hand-off turns and the computer (D22, D130). Every hop gets the asked member's computer tools through
  `toolsForTurn` in `server/src/agents/handoff-delivery.ts`, built like a routine's
  (`server/src/freeduet/relay-computer.ts`), approvals unchanged: the RELAY (the answer coming back to the
  Bot that asked, in the person's own conversation) since D22, and the FORWARD hop (the scratch thread where
  the colleague works) since D130, which had kept `tools: []` and left every member without its browser when
  a colleague asked (22 November 2026, "the temperature in Rome" through Iris and Jules). A card a forward hop
  raises is drawn in the asking conversation (D52) and its decision resumes the hop; a hop is not the person's
  typed turn for Full access or D27. When the person switches the computer or the browser off
  (`cloudComputer`, `cloudBrowser`, `cloudNetwork`, read per person through
  `enterpriseControls().capabilitiesFor`), NO server-run turn is offered the matching computer tools
  (`server/src/computer/offered.ts`, the rule of the app's `computerToolsOffered`); the gateway's
  refusal stays behind it, and `tool_notes.py` tells the member to say its browser is switched off in
  settings. The CLI answers a call for a tool the run did not list
  with "No such tool available" itself, so it reaches no stored transcript; agent-freeduet tells the
  member why (`tool_notes.py`) and logs it (`segment.py`).
- `server/src/approvals/policy.ts` `SAFETY_REQUIREMENTS` match words in a tool's reference. A catalogue
  key that contains "password", "credential" or "api-key" makes every write under it unapprovable
  ("changing a password is always done by the person"). That is why the app-password Gmail entry is
  keyed `google-imap` (D24). Test such changes through the real gate, not only `classifyTool`.
- With sign-in on and an installation secret present, a signed-in session is REMOTE unless its browser holds the
  token of a live `browser_pairings` row of that same person (`server/src/auth/remote-limits.ts`,
  `auth/browser-pairings.ts`, D49, PR #283). Each paired browser has its own revocable token, and a phone is
  paired with a one-time code made in a browser paired as a `computer`. The old cookie, which is the installation
  secret itself, is upgraded once and only for a request made directly at this machine; it is refused from
  16 February 2027 (`LEGACY_UPGRADE_ENDS`). Every route is refused unless one deny-by-default list in `createApp`
  allows it: a new route must be added to that list, and a test fails until it is. A chat turn from a remote
  session carries the server-set initiator `remote`, which earns neither D27 nor Full access. "At the computer"
  has one definition, `at-the-computer.ts`: never write a second one.
- FreeDuet advertises nobody (D51): for FreeDuet's own package, the upstream self-host bar and the onboarding
  slide with product links are off. The credit to the upstream authors stays.
- A card raised inside a hand-off is also drawn in the conversation that asked (D52). The chat takes it from the
  person's approval inbox, where `askedIn` names the conversation that asked. One request, one decision route.
- A picture attached in chat reaches `agent-freeduet` as a base64 `image` part (`resolvePart` in
  `openbot/server/src/channels/attachment-parts.ts`). Since D72 (`docs/M1_PLAN.md`, section 51), a picture
  in the person's latest message goes to the Claude CLI engine on stdin as base64, with
  `--input-format stream-json` (`openbot/agent-freeduet/freeduet/claude_engine.py`, `transcript.py`). At
  most 20 pictures, 5 MiB each and 10 MiB per turn are sent. Older pictures, the compatible engine and
  hand-offs keep the D68 note from `_part_text`, which says the member cannot see the picture.
  `FREEDUET_PICTURES=off` sends no picture. The full flag combination of a member's segment is not run
  live (17 November 2026).
- What decides whether a card was due: a call the gate allows by a personal rule, by the auto-review model or by Full access writes an `approval.evaluated` row in `audit_events`, and no `approval_requests` row (`openbot/server/src/approvals/store.ts:545`; the allow returns at `openbot/server/src/approvals/service.ts:528`, before `store.open` at `service.ts:550`). An allow that is only the default writes no row at all (`service.ts:396`). So "no card appeared" is not evidence that a tool was not called (16–17 November 2026).
- In the app's chat, a member's next turn is built from the messages the app sends with the request (`openbot/server/src/copilot.ts:1435`, `sanitizeSeededHistory` over `input.messages`), not from the stored thread, so what the screen does not hold, the member does not see (16–17 November 2026). A headless turn, such as a routine, loads the stored thread instead (`openbot/toolkit/src/run-turn.ts:741`).

