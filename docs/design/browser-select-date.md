# Native menus and date fields in a member's browser (D123, item 2)

Status: built, not yet run live. Roadmap row 92, [`docs/M1_PLAN.md`](../M1_PLAN.md) section 81 ("Eight items from two research reports, in Next (D123)").

## The gap

Checked in the code before this change: `agent-computer/src` had no `selectOption` and no date handling.
`computer_type` calls Playwright's `fill`, which refuses a `<select>` ("Element is not an <input>,
<textarea> or [contenteditable] element"), and a date input accepts only one exact string format. The aria
snapshot lists a `<select>` as a `combobox` (or a `listbox` when it takes several) with no value, and its
options are not elements a click can use. So a member could neither read the choices of a native menu nor
choose one. A test shows the first half on a real page (`agent-computer/tests/select-field.test.ts`, "before").

## The choice: a new tool, `computer_select`

Two ways were considered.

| | Extend `computer_type` | New tool `computer_select` (chosen) |
|---|---|---|
| Approval gate | Same tool name, so a saved "always allow `computer_type` here" rule would silently cover choosing among options | A new tool name asks until the person allows it, so no existing grant widens |
| Operator rules | A rule naming `tool.name == "computer_type"` covers it | A rule naming only that tool name does not cover it (see "Limits"); a rule by `intent == "type"` does |
| Contract | `computer_type` deliberately returns no text; it would return text for a menu only | `computer_select` returns what the field now shows; `computer_type` is unchanged |
| Input | `text: string`, so a multiple menu needs a list in a text field | `value: string or list`, an ISO value for a date |
| Model's behaviour | A model told to "type" into a menu tries free text | The description says what the tool is for and not for |

The new tool is an acting tool in the same sense as `computer_type`:

- `COMPUTER_TOOLS` and `COMPUTER_ACTING_TOOLS` (`server/src/computer/schema.ts`) both name it.
- `intentOf` gives it the intent `type`, so a policy rule or a safety rule written by intent covers it. It has
  no `key` of its own, so it is never an activation by intent. That does not make a choice inert: a menu or
  date change fires the page's own `input` and `change` handlers, and a handler can submit a form, navigate
  or send a request (`onchange="this.form.submit()"`). The protection is the approval gate: the person's card
  or allow rule, as for a typed entry.
- The gateway's `govern` handles it exactly as it handles a typed entry: the policy sees the element the
  server resolved, an audit row is written either way, and the approval gate gets a candidate with effect
  `write`, the page's host as scope and the element as target. The words floor (`safetyRequirement`) reads
  the element's label and the arguments, so a menu called "Pay now" or "Card number" is handed to the person
  as a typed entry would be. No change to `approvals/policy.ts` was needed.
- The app registers it through `useFrontendTool` and puts it in `writes` (`approval-tools.tsx`), so the
  app's own path goes to the same server gate.
- The computer's `/select` is on the acting list (`authorisation.ts`) and takes a turn (`turns.ts`), so a
  person holding the wheel refuses it and calls on one page wait in line.

## What the computer does (`agent-computer/src/select-field.ts`)

- **Sensitive fields (D76).** A field that the page marks as sensitive (`SENSITIVE_FIELD_SELECTOR`: a
  password, a one-time code, a card number, the card-expiry `autocomplete` tokens that a `<select>` often
  carries, a marked field) is refused with the typed entry's own sentence and nothing is changed. The check
  comes before the first write and takes no option that could lift it. A sensitive menu also gets no option
  list and keeps its masked value in the snapshot.
- **Menu.** `value` is an option's label or its value. Matching tries the exact label, then the exact value,
  then the label ignoring case, and each step must name one option: two options with the same label are
  refused, not guessed. A disabled option (or one inside a disabled group) is refused with a sentence that
  says so. An unknown option is refused with the first fifteen options the menu offers. A menu that takes
  several (`multiple`) takes a list that replaces the current choice, and an empty list clears it; a single
  menu takes exactly one value. A disabled menu is refused. The choice is made by option index
  (`selectOption`), so two options with one value are not mixed up, and the page gets the `input` and
  `change` events a person's pick sends.
- **Date and time fields.** `date`, `time`, `datetime-local`, `month` and `week`. The value must be the ISO
  form of the type (`2026-03-28`, `14:30`, `2026-03-28T14:30`, `2026-03`, `2026-W13`) and a real one: 30
  February, 25:00 and week 54 are refused before the page is touched, with the form in the sentence. An
  empty string clears the field. A disabled or read-only field is refused. A value that the field's own
  `min` or `max` rejects is kept and the answer says `outOfRange: true`, because the page, not the
  computer, decides what a bounded field accepts.
- **Anything else.** A text field is told to use `computer_type`. A custom drop-down (a `div` or a button that
  opens a list) is out of scope: it is built from ordinary elements, so the member opens it with
  `computer_click` and clicks an option. The tool description and the refusal both say so.
- **Answer.** What the field now shows, read back from the page: for a menu `selected: [{label, value}]`, for
  a date `value` and `inputType`. It is not an echo of the request, so a page that did not keep the value
  shows it. This also starts D123 item 1 ("browser actions say what changed") for this tool.
- **When the page moves.** After the change the computer waits one quiet period and a bounded load wait (the
  settle constants of `settle.ts`) and counts main-frame navigations from the change to the end of the
  read-back. If the change navigated the page (`onchange="this.form.submit()"`, or a handler that sets the
  address a moment later), the field is gone, so the answer carries `navigated: true` and the new `url`, and
  `selected` (or `value`) is what was requested, not a read-back. A handler that only sends a request leaves
  the field in place and is read back as usual. Without this, the read-back failed and the route answered 502
  for a change that had happened.
- **Clearing.** An empty value clears a date field and the answer says `cleared: true`, and `required: true`
  when the page requires a value. `outOfRange` is only for a non-empty value that the field's own `min`,
  `max` or `step` rejects.
- **Snapshot.** Each native menu carries `options` (label, the value when it differs, `disabled`, `selected`),
  capped at 50 with `optionsTotal` saying how many there are, `multiple`, and its `value` set to the chosen
  label(s). A date field carries its `min` and `max`. The menu's own `option` elements are left out of the
  list: they cannot be clicked and they used up its 200-element cap.

Errors that the caller can fix (an option that does not exist, a malformed date) are a 400 with the sentence,
a refusal for a sensitive field is the same 403 as a typed entry, and a stale ref is the same 409.

## Limits and decisions

- A policy rule that names `tool.name == "computer_type"` and nothing else does not cover `computer_select`.
  The shipped "Never submit a form" preset does NOT cover a choice either: it stops activations of a
  "submit" element and the Enter key, and a menu change that submits through a page handler is neither. Its
  caveat text in Boundaries says so. An operator who wants to stop all form filling writes `intent == "type"`, which covers both. Recorded here, tested in
  `server/tests/computer-select.test.ts`, and not changed: giving the tool another name in the policy context
  would make the audit trail say something untrue.
- The snapshot asks the page about every textbox, combobox and listbox. It is not skipped when the page has
  no `<select>` (a quick `querySelector` check would miss selects in a shadow root or a frame); the cost is
  one short round trip per field, in parallel.
- A demonstration recording (`demonstrations/draft.ts`) does not draft `computer_select` steps: a recorded
  menu choice is still turned into a typing step. Not changed here.
- Not run live. The prompt line in `shared/bot-prompt.ts` and the tool description are text a model reads and
  are not yet run on the eval stack: the cases to run are a form with a country menu (the member lists the
  options and chooses one by label), a delivery-date field (the member gives an ISO date), a menu named
  "Pay now" or a card-expiry menu (handed to the person), and a custom drop-down (the member clicks, and
  does not call `computer_select`).

## Built so far

- `agent-computer`: `src/select-field.ts`, `/select` in `src/index.ts`, `src/authorisation.ts`,
  `src/turns.ts`, options and bounds in the snapshot (`src/index.ts`, `src/aria-snapshot.ts`).
- `server`: `computer_select` in `src/computer/schema.ts`, `gateway.ts`, `routes.ts`, `browser-routes.ts`,
  `headless-tools.ts`.
- `app`: the tool in `computer-tools.tsx`, `approval-tools.tsx`, `browser-activity.tsx`.
- Tests: `agent-computer/tests/select-field.test.ts` (real browser, added to the `computer (real browser)`
  line of the CI workflow) and the pins in `secret-field-routes`, `authorisation` and `turns`;
  `server/tests/computer-select.test.ts`; pins in `freeduet-computer-switch.test.ts` and
  `evals/team/live-tools.test.ts`.
- Verified: those tests, in this sandbox. Not verified: a run on a real site, on the eval stack, or in the
  app's chat with a member.
