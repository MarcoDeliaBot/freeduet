# Local models without a key (Ollama)

Status on 14 November 2026: built and off by default. Never run against a real model. Branch `engines-local-models`,
agent-freeduet only. The plan is in [ENGINES_PLAN.md](../ENGINES_PLAN.md) 9.1.

## Built so far

- **Entry.** `no_key: true` on an `anthropic-compatible` engine. It is accepted only for plain `http` to `localhost`, a
  loopback address or `host.docker.internal`. It is refused beside `credential_secret_ref` and for any other address
  (`freeduet/engines.py`, `_compatible_problems`).
- **Child process.** The CLI gets the placeholder bearer `no-key-needed`, `ANTHROPIC_API_KEY` blank, and the same empty
  home and config folders as a keyed entry (`freeduet/compatible_engine.py`, `_token` and `child_env`).
- **Failures.** A keyless endpoint that refuses a request is told it needs `credential_secret_ref`, not a sign-in
  (`failure_event`, `keyless`).
- **Probe.** For a keyless entry only: `GET /api/version` on the loopback address, with no key, bounded to 2 seconds.
  An answer makes the engine usable. No answer gives `not answering`, which does not mark the engine signed out
  (`answers_on_this_machine`; `NOT_ANSWERING` in `freeduet/engine_adapter.py`).
- **Example.** A commented `local-models` block with a Linux bind note in `engines.example.yaml`, after
  `local-free-router`. Off by default, never first in a chain.
- **Docs.** A README subsection, the ENGINES_PLAN 9.1 note, and the PROVIDERS row for local models.
- **Untouched.** `engine_router.py` and the 52 goldens.
- **Tests.** 25 new tests in `tests/test_compatible_engine_local.py`, and 2 changed in
  `tests/test_compatible_engine_file.py`. On `origin/main` the 27 fail, and the other 88 tests in the two files pass.
- **Real CLI, no model.** Claude Code 2.1.325, started with the engine's environment and argument list, against a
  loopback stand-in that answers `ok`: exit 0, `success`, text `ok`. One request, `POST /v1/messages?beta=true`, with
  the placeholder bearer and no `x-api-key`. Body keys: `max_tokens`, `messages`, `metadata` (with `user_id`), `model`,
  `output_config`, `stream`, `system`, `thinking` (`{"type":"adaptive"}`), and `tools` (empty). No `tool_choice`. The
  CLI warned that the model name was not recognised, then completed.

## Not verified

- No real Ollama server has answered, no model has answered a turn, and no team eval has run.
- Whether Ollama accepts or ignores `metadata`, `thinking` (the page names only `enabled` and `disabled`),
  `output_config` and the `beta=true` query string.
- `tool_choice`, which Claude Code did not send with no tools offered.
- Reaching a 127.0.0.1-bound Ollama from the container on Linux (inferred from Docker's host gateway, not tested).
- LM Studio and vLLM.
- The Ollama 0.14.0 date: read earlier from a registry copy of the post, not re-checked.

## Decisions left to the maintainer

1. **Field handling.** If Ollama rejects `metadata` or `thinking`, every local turn fails. Decide on a real check with a
   named model before any member's chain uses the entry. A fix is a CLI setting or a small proxy that strips fields;
   a proxy is a new component.
2. **Linux exposure.** The example asks for `OLLAMA_HOST=0.0.0.0:11434`, which listens on every interface and has no
   login. Choose a firewall rule, a bind to the Docker bridge address (check first), or accept the exposure.
   Recommendation: check the bridge bind, and document it if it works.
3. **The probe.** `GET /api/version` shows that Ollama answers, not that a model can. Row 8 of the plan asked for a tiny
   generation. Decide whether that cost in local time is worth it.
4. **Tools.** Once the bridge's tools are offered, Claude Code may send `tool_choice`, which Ollama lists as
   unsupported. Decide whether local models may use tools at all. Tier C stays until the evals say otherwise.
5. **Evals.** Row 8 needs each member at least 90% and safety 100% on a named model before a local label. Decide which
   model, and when.
6. **HTTPS without a key.** Refused now. A TLS proxy in front of Ollama would need a rule change. Decide whether that
   case is wanted.
7. **Other runtimes.** LM Studio and vLLM are neither built nor checked, and row 8's OpenAI-compatible loop was not
   built. Decide whether to keep it in the plan.
8. **Review.** The no-key path decides whether a request leaves with no key. Recommend a Sonnet review of
   `freeduet/compatible_engine.py` (`_token`, `child_env`, `answers_on_this_machine`, `Scrubber`) before merge.
9. **Merge order.** `engines.py` is also edited by the spend-ledger work. Decide which PR merges first; the second one
   must merge with the first one's `engines.py`.
