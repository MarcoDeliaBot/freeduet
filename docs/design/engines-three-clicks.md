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

Switching a card on adds its assistant entry to `assistants.chain`. A LOCAL engine with a member entry (Ollama) joins every
member's chain. A free CLOUD engine with a member entry (OpenRouter) joins NO member's chain until the person ticks members
on its card ("Use for"); the `default` chain never gets it, and a ticked member without a chain of its own gets a copy of
`default` plus the engine. Ticking Otto (`inbox`) or Jules (`concierge`) says on the card that it sends your mail, or your
bookings, to this service. The router still puts logins first. Switching off removes the engine from every chain and keeps
the settings. (Decision of the review of PR #414: safety first; the maintainer may change it later.)

## 3. Where things are kept

- `engine_panel.py` in agent-freeduet owns the file the page writes: `<FREEDUET_DATA_DIR>/engines.yaml`. It recognises its own
  file ONLY by its first line, a marker. A file without the marker is the person's, whatever its name or place (also
  `FREEDUET_ENGINES_FILE` set to that very path): it is never written, every change answers `file_is_yours` (409), and the
  cards only show it. Each replacement of the page's own file first keeps a timestamped copy
  (`engines.yaml.bak-<time>`, the last five).
- Every change is validated by the loader (`engines.parse_engines`) before the file is replaced in one step. A change the
  loader refuses writes nothing. OpenRouter's free-model guard (D107) is checked first, with its own word (`model_not_free`).
- An address is judged at every write and again just before a key is sent (B2 of the review). A cloud provider's host is its
  own (`api.groq.com`, ...), https, no port, no user name, no query; only Cloudflare's account part is the person's to write.
  A local card may use `localhost`, `host.docker.internal`, a `*.local` name or an address literal in the person's own
  LAN (10.0.0.0/8, 192.168.0.0/16, unique-local IPv6). It never uses: a link-local address (169.254.0.0/16, which holds a
  cloud's metadata service, and fe80::/10); the Docker networks' ranges (172.16.0.0/12 and 198.18.0.0/15), except the host
  forwarder 198.19.255.1 on port 11435 (the Ollama on the host); a public address; a name with no dot (a service of the
  compose network); or FreeDuet's own ports (4230, 4231, 3001, 3010, 3101, 3110, 4300 and 4500 for the supervisor, 5432, and the
  configured `FREEDUET_PORT`, `PORT` and `SUPERVISOR_PORT`).
- A key is a file `<data>/keys/<provider>` (mode 600, folder 700, made with mode 700 from the start; a link in either place is
  refused and never followed); the engines file holds only `credential_secret_ref:
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

Test sends one tiny chat request (8 tokens) to the provider's OpenAI-format address and answers one word of a closed list:
`ok`, `key_rejected`, `model_missing`, `rate_limited` (a limit or no credit left) or `unreachable` (no answer, a timeout, or
anything else). The provider's own status is never passed on. Load list reads `GET /models`, at most 300 names (OpenRouter: only the free
ones). Both give up after 8 s, under the 10 s a Bun connection may sit silent.

## 6. Built so far

Built and tested in CI: the agent module and routes, the server routes, the app cards. Tests: `tests/test_engine_panel.py`
(60), `server/tests/freeduet-engines-providers.test.ts` (13), `app/tests/freeduet-engines-providers.test.tsx` (12).

Not verified: nothing was run against a real provider, a real Ollama or a real Docker volume (does `/data` accept the key
folder's modes there?); the suggested model names (Groq, Google, Mistral, Cloudflare) are from memory and Test is the check;
"Free" is FreeDuet's label from the provider's terms (the card says so, and that Google bills if billing is switched on for the project); a free model's quality calling tools is not checked (tier C, as D107); the look is not seen by the maintainer. Run live:
install, switch Ollama on with a pulled model, ask a member something, switch it off; then Groq with a real key and Test.

Known limit: a change is recorded after the agent has made it, so if the audit write itself fails the change stands and the
page shows an error. Only a failing database causes that.

## 7. Decisions left to the maintainer

See the pull request.

## 8. The order of a member's engines, by hand (D112)

Seen live on 20 November 2026: OpenRouter was switched on for Iris, but the local model answered. A card switched on is
appended to the end of a chain (`_set_chains`), so the order was the order of switching on, and the "Who uses what" table
only showed it.

**What it does.** Each engine in a member's row has an arrow up and an arrow down ("Move OpenRouter up for Iris"); the first
has no Up and the last no Down. One click moves one engine one place. The page sends `PUT /api/freeduet/engines/members/:memberId/order`
with `{ order: [engine ids] }`, the member's whole chain as shown, in the new order. It applies from the member's next message
(the router is rebuilt from the file, as for a card). Undo of the row puts the previous order back with one more request of
the same kind.

**Rules, all from D109.** Only the page's own file, the one that starts with the marker line (otherwise `file_is_yours`, 409);
the loader validates the document before it is written; a backup `engines.yaml.bak-*` as for a card; the same guard as every
other change here (`mayChangeEngines`, D106: an administrator at the computer or with a paired `computer` browser; a remote
session, a phone and a non-administrator are refused and nothing reaches the agent); a change that cannot be recorded is not
made (the audit row is `configuration.changed`, `engine_member_order`, payload `engine_order_changed`, the member and the new
order); an order already in use writes nothing and records nothing. The new route sits under `/api/freeduet/engines`, which
`createApp`'s deny-by-default list and `remote-limits.ts` (`ALL /api/freeduet/engines/*`) already cover.

**What the agent refuses** (`engine_panel.apply_order`): a member that is not on the team (`unknown_member`, 404); an order
that is not a permutation of the member's chain as the router sees it (`order_not_permutation`: nothing added, nothing dropped,
nothing unknown, no repeat), and a body that is not a list of ids (`order_shape`). The engines of the file's chain that do not
run (left out, or without an adapter) keep their places; a member that uses the `default` chain gets a chain of its own, as
when a cloud engine is chosen for it.

**Logins first by default (changed by D115, section 9).** The router orders every chain subscription, then free, then metered,
whatever the file says (`engines.order_logins_first`, CLAUDE.md "Logins first"), for every member the person has not given an
own order. D112 refused an order that this rule would undo (`order_logins_first`) and the arrows worked only inside a group. D115
replaced that refusal: an order across groups is now asked for with a confirmation (section 9), and the code
`order_logins_first` no longer exists.

**Built so far.** `engine_panel.apply_order`, `PUT /engines/panel/members/{member}/order` in agent-freeduet, the server route,
the arrows and Undo in `app/src/freeduet/engines-members.tsx`. Tests: `tests/test_engine_panel.py` (15 new),
`server/tests/freeduet-engines-order.test.ts` (11), `app/tests/freeduet-engines-members.test.tsx` (6 new, 1 reworded).

**Not verified.** Not run live: a real engines file, a real turn after a move. The look of the arrows is not seen by the
maintainer yet (preview screenshot with the pull request). The order of the engines the router shows is the effective one;
a pin in the file's `switching:` block is not touched by the order.

## 9. The person's own order (D115, 21 November 2026)

The maintainer moved OpenRouter above Claude Code for Iris and met a red sentence, "Your own logins always go first... That
order cannot be kept." His decision: "the person is free to choose the order of a member's engines; show a warning and require
a confirmation tick, never impose our choice."

**The key.** `own_order: [member ids]`, a top-level list in the engines file, validated by the loader: a list of non-empty member
ids, each once, never `default` (the default chain is always sorted). Absent means empty, so a file without it behaves exactly as
before. `ordered_chain(member)` returns the file's order, unsorted, for a member in `own_order`, and the sorted order for every
other member. It changes no switch: `is_allowed` (`metered.enabled`, both caps above 0, the paid-gateway lock) still decides what
runs, so a paid engine put first still does not run until the person has switched paid engines on.

**The agent** (`engine_panel.apply_order(member, order, current=, confirmed=)`). The new order is first tried without the
member in `own_order`: if the loader's sort keeps it, it is in the group order, nothing needs asking, and the member is removed
from `own_order` (going back to the recommended order). If the sort would change it, the order breaks the group order, and the
agent names the kind (`engines.order_break`): `paid_before_free_or_login` (a paid engine before a free engine or a login; the
worse, so it wins) or `free_before_login`. Without `confirmed: true` (exactly the boolean true; anything else is `order_shape`)
it answers 409 `order_needs_confirmation` with `kind`, and nothing is written. With it, the order is written, the member joins
`own_order`, and the answer carries `ownOrder` and `confirmedKind`. Every rule of D112 and D109 stands: only the page's own marked
file, permutation check, loader validation, a backup, one atomic write, the lock. A move inside an own order that is itself out
of the group order is asked again each time; the way back needs none. `GET /engines` adds `own_order` and `recommended_chain`
(the same engines, logins first) to each member.

**The server** (`engines-routes.ts`). The order route forwards `confirmed` only as the boolean `true` (a string, a number or any
other value is `order_shape` before anything is forwarded), under the same guard as before (D106). The refusal passes on
`kind` only from the closed pair. The audit row (`engine_order_changed`) gains `ownOrder`, `confirmed` and `confirmedKind`, taken
from what the agent says needed confirming, not from what the request claimed, so a bare `confirmed: true` on a sorted order is
recorded as `confirmed: false`. The member summary gains `ownOrder` and `recommendedChain`.

**The page.** An arrow sends the plain order. When the agent answers `order_needs_confirmation`, the row shows an amber warning
(not the red alert) for that member: for a free engine before a login, that a free engine would answer first, that if it is a
cloud service the member's messages go to that provider and it may keep them (D101), and that quality may differ; for a paid
engine, that every message may cost money from the first one if it is first. A box "I understand, use this order" starts empty;
Confirm is disabled until it is ticked and then sends the same order with `confirmed: true`; Cancel leaves the order. A member whose
order differs from the recommended one shows "Your order: logins are not first" and a button "Use the recommended order", which
sends `recommendedChain` (no confirmation). The page does not know an engine's billing: the agent decides the kind.

**Built so far.** `engines.own_order`, `engines.order_break`, `engine_panel.apply_order` with `confirmed`, `PanelRefused.kind`, the
overview fields, the server route and member fields, the warning, the tick, the note and the way back in
`app/src/freeduet/engines-members.tsx`; the "Logins first" rule in CLAUDE.md and CONTRIBUTING.md, `docs/PROVIDERS.md`,
`docs/ARCHITECTURE.md`, `docs/ENGINES_PLAN.md` and the comments of `engines.example.yaml`; the one approved sentence under the
page title now reads "answer first unless you choose another order".

**Not verified.** Not run live: a real file with `own_order`, a real turn on a reordered chain, the confirmation on the maintainer's
installation. The look of the warning is shown in screenshots with the pull request, not yet seen by the maintainer. A card
switched on later is appended to the end of an own-order member's chain (`_set_chains`), where before the sort would have placed
it; the person can move it. D100's "a free cloud engine is never first" and D113's "a FreeLLMAPI engine is never first" now hold
by default only: D115 lets the person confirm otherwise.
