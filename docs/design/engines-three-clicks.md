# A free engine in three clicks (D109)

Status: built and tested in CI on 20 November 2026; not run live. The look is a preview and waits for the maintainer's yes.

The maintainer's words, 20 November 2026: life must be simple for the users, three simple clicks. On the Engines page
(`/admin/engines`) a person adds a free engine by switching it on, pasting its key and pressing Save, then pressing Test.

## 1. The cards

One card per provider, in this order: Ollama, llama.cpp server, LM Studio (tag Local); Groq, Google AI Studio, Mistral,
OpenRouter, Cloudflare Workers AI (tag Free with limits); Cerebras (Trial, needs a card); Anthropic API (Paid). A card has a
switch, the server address, a model with Load list, a key with Save and Remove, a Test button, its tag, a line about who can
use it, and, for a cloud service, "Data sent to this service leaves your computer." The per-member order ("Who uses what")
stays below the cards, unchanged.

## 2. What runs for whom, said plainly

Members run on `claude-code` and on `anthropic-compatible` engines only (`docs/ENGINES_PLAN.md`). So:

| Card | Light assistants | Members |
|---|---|---|
| Ollama | yes (`ollama-assist`, OpenAI format) | yes (`ollama-member`, `anthropic-compatible`, no key, local only) |
| OpenRouter | yes (`openrouter-assist`) | yes (`openrouter-member`, `https://openrouter.ai/api`, the D107 guard applies) |
| llama.cpp, LM Studio, Groq, Google, Mistral, Cloudflare | yes | not yet: the card says "For members: not yet" |
| Cerebras | no | no: shown, marked "Trial, needs a card", not offered as free (terms read 20 November 2026) |
| Anthropic API | no | no: paid, cannot be switched on until spending caps exist |

Switching a card on adds its assistant entry to `assistants.chain` and its member entry (if it has one) to every chain; the
router still puts logins first. Switching off removes them and keeps the settings.

## 3. Where things are kept

- `engine_panel.py` in agent-freeduet owns the file the page writes: `<FREEDUET_DATA_DIR>/engines.yaml`. A file the person
  wrote at `FREEDUET_ENGINES_FILE` always wins and is never touched; the cards then only show it (`file_is_yours`).
- Every change is validated by the loader (`engines.parse_engines`) before the file is replaced in one step. A change the
  loader refuses writes nothing. OpenRouter's free-model guard (D107) is checked first, with its own word (`model_not_free`).
- A key is a file `<data>/keys/<provider>` (mode 600, folder 700); the engines file holds only `credential_secret_ref:
  file:<that path>`. The loader's refusals still apply: no hidden folder, no Claude sign-in folder, no Claude plan token.
  No function returns a key, puts one in an error or logs one. Removing a key deletes the file and switches the card off.
- A change applies from the next message: the router is rebuilt from the file and the light assistants read it again. The
  light assistants could not use a keyed free engine before (nothing resolved the reference); `app.py` now wires the same
  reader a member's key uses.

## 4. Who may change them, and what is recorded

The same rule as D106 (`mayChangeEngines`): an administrator, at the computer or with a browser paired as a `computer`. A
remote session is refused by `remote-limits.ts` for the whole `/api/freeduet/engines/*` tree, and a member's tool cannot
reach these routes (they need the person's session). Every provider or key change writes a `configuration.changed` row
(`engine_provider_changed`, `engine_key_saved`, `engine_key_removed`) with the provider id and, for a switch, on or off: never
the key, the address or the model. Where there is nowhere to record, the change is refused. Load list and Test change
nothing and write no row, like "Check again".

The server reduces the agent's answers to closed lists (provider ids, tags, outcome words) and says one sentence from a
closed list for each refusal; nothing the agent adds goes through. The Test and Load list requests use the saved key inside
agent-freeduet; the browser never sends it again.

## 5. Test and Load list

Test sends one tiny chat request (8 tokens) to the provider's OpenAI-format address and answers one word: it works, the key
is wrong (401/403), the model or address is wrong (400/404/422), the limit is used up (429), no credit (402), no answer in
time, nothing at that address, or did not work. Load list reads `GET /models`, at most 300 names (OpenRouter: only the free
ones). Both give up after 8 s, under the 10 s a Bun connection may sit silent.

## 6. Built so far

Built and tested in CI: the agent module and routes, the server routes, the app cards. Tests: `tests/test_engine_panel.py`
(30), `server/tests/freeduet-engines-providers.test.ts` (12), `app/tests/freeduet-engines-providers.test.tsx` (11).

Not verified: nothing was run against a real provider, a real Ollama or a real Docker volume (does `/data` accept the key
folder's modes there?); the suggested model names (Groq, Google, Mistral, Cloudflare) are from memory and Test is the check;
a free model's quality calling tools is not checked (tier C, as D107); the look is not seen by the maintainer. Run live:
install, switch Ollama on with a pulled model, ask a member something, switch it off; then Groq with a real key and Test.

Known limit: a change is recorded after the agent has made it, so if the audit write itself fails the change stands and the
page shows an error. Only a failing database causes that.

## 7. Decisions left to the maintainer

See the pull request.
