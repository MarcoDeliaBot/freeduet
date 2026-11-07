# agent-freeduet: the subscription router

An AG-UI service that runs each FreeDuet team member on its own **engine chain**: the person's subscriptions first, through the official tools they signed in to, then optional metered APIs within caps.

> Status: specification. Built in milestone M2 (adapters, tool bridge) and M3 (chains, caps, ledger). See [docs/ARCHITECTURE.md §3](../../docs/ARCHITECTURE.md).

## What it does

1. Receives a turn from the OpenBot server over AG-UI for one member.
2. Reads that member's prompt from `openbot/examples/freeduet/agents.yaml` and its chain from `engines.yaml`.
3. Picks the first available engine in the chain (installed, signed in, not limited, within caps, meeting the member's quality floor).
4. Runs the turn on that engine, with the member's granted OpenBot tools exposed through the `freeduet-tools` MCP bridge, so every action still goes through OpenBot's gateway, approvals and audit.
5. Streams the answer back and reports usage to the FreeDuet ledger.
6. If the engine refuses the turn before accepting it (usage limit, rate limit, no credits), moves to the next engine and says so in the conversation.

## Files

| File | Purpose |
|---|---|
| `engines.example.yaml` | Engines, chains per member, caps, quality tiers. Copy to `engines.yaml`. |
| `prices.example.yaml` | Your own dated price table for the savings meter. Copy to `prices.yaml`. |
| `src/adapters/` (M2) | One adapter per engine kind. Files ported from Anil-matcha/open-duet keep the Apache-2.0 header and say what changed. |
| `src/bridge/` (M2) | The `freeduet-tools` MCP server. |
| `src/router.py` (M2/M3) | Chain selection, limit handling, usage reporting. |
| `LICENSE-APACHE` (M2) | The Apache-2.0 text for the ported files. |

## Hard rules for this service

- It **never** reads, copies, logs or transmits a provider's credential files or tokens. CLIs keep their own login in their own config directory, mounted read-write only into the CLI process.
- It **never** starts a CLI with its built-in host tools enabled.
- It **never** adds a metered engine to a chain unless `metered.enabled` is true and the caps allow it.
- Every engine switch emits a visible event in the conversation.

## Signing in (done by the person, never by FreeDuet)

```bash
# Claude Code, with your own Claude plan
docker compose exec -it agent-freeduet claude          # follow Anthropic's own sign-in flow

# Codex, once FreeDuet's "Sign in with ChatGPT" client ID is approved (until then: experimental flag)
docker compose exec -it agent-freeduet codex login
```

The Engines page in the app shows which engines are signed in and links to each provider's own instructions.
