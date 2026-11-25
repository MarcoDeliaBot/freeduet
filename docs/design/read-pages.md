# Read several pages in one call (D127, item 4 of D123)

Status: built, not yet run live. Roadmap row 94, `docs/M1_PLAN.md` section 85.

## The gap

A member that compares pages calls `computer_navigate` once per page: one model call, one tool call and one
full page of text in the conversation each time. Checked in the code: `computer_navigate` returns the text of
one page (`agent-computer/src/index.ts`, route `/navigate`, limit `TEXT_EXTRACT_LIMIT`, 6,000), and nothing
reads a list. This is the first step of code mode (section 81, item 7): one call instead of several, with
nothing new that acts.

## The tool

`computer_read_pages` takes `urls`, one to five web addresses, and returns `pages`: one entry per address, in
order, with `url` (as asked), `finalUrl` (after redirects), `title`, `text`, `truncated` and, for a page that
was not read, `error` in plain words. The result also says `truncated` when any page was cut. The text is
marked as outside content, as a navigation's is.

| Limit | Value | Why |
|---|---|---|
| Addresses per call | 5 | Each is a page load of up to 38 s (30 s load, 8 s settle budget); five keep a call inside the server's deadlines and a model's reading |
| Text per page | 6,000 characters, links included | `computer_navigate`'s own limit, so a page reads the same through either tool |
| Text in all | 24,000 characters, shared equally | The most one call returns. Each page's room is `min(6000, 24000 / count)`: 4,800 each for five pages. Equal shares, so a long first page cannot leave the last with nothing |
| Time | No page is opened after 120 s | The rest are reported as not read |

The server enforces the limits as well as the computer: it asks the computer for each page's share and cuts
what comes back, without splitting a character.

## Read only, and the same rules as a navigation

The change adds no click, no typing and no form. Each address is decided on by the same code as a single
navigation:

- The gateway calls `govern` once per address with the tool name `computer_navigate` (intent `navigate`).
  The operator's action policy sees `tool.name == "computer_navigate"`, `intent == "navigate"` and the page's
  host; an audit row is written for each page, named `computer_navigate`, before it is opened; the enterprise
  switches (`admin/controls.ts`: the network switch, and the refusal of a literal private address) apply; the
  approval gate is asked with effect `read`, the host as scope and the page as target. So a rule written for
  navigation covers the batch, and the batch cannot be used to reach what a navigation cannot. This is why
  the audit rows are not named `computer_read_pages`: a deny or a trail query on `computer_navigate` would
  miss them.
- The transport applies the target floor (`checkNavigationTarget`) to each address, as for a navigation:
  `localhost`, private ranges and the metadata address are refused before anything is sent.
- The computer loads each page in the Bot's browser, behind the egress filter (`egress.ts`,
  `private-network.ts`), so a name that resolves to a private address, a redirect to one, and a page's own
  requests to the home network are refused exactly as for a navigation. This change does not touch those
  files, so the server's shared network rules are unchanged.
- The tool is offered only when the person's browser and network switches are both on, like
  `computer_navigate` (`computer/offered.ts`): a page is opened. With the browser off, or the network off,
  neither is offered, and the gateway's own refusal stays behind it.
- A person holding the wheel refuses the page route like any acting route (`authorisation.ts`), and the call
  ends; so does the person's Stop. Neither is turned into per-page errors.

## What it does not do

- **Pages in one tab, one after another.** A Bot has one page (`profiles.page`), the person watches it, and
  every ref is tied to it. Parallel tabs are item 6 (row 96). The tab ends on the last page read; the
  computer retires the refs of an earlier snapshot, as after a navigation.
- **No human check, no card for a list.** A page that is a human check is reported as not read; no request for
  help is opened from inside a list (the member opens that page with `computer_navigate`, which can ask the
  person). The approval gate keeps one request per tool call (`approvals/store.ts`, `open`): if a rule asks
  the person about a read, the call pauses on the first page as a navigation does; a later page of the same
  call that would need its own card is refused with the gate's sentence ("ask for it with
  `computer_navigate`"). The default asks about no read, so this arises only under a rule the person or an
  operator wrote.
- **No frame for the screen** is stored for these pages (`keepFrameOf` is a navigation's).
- **Settle budget.** Each page is read with `collectWhenSettled` and the same 8 s budget as a navigation. No
  `ariaSnapshot` is used, so there is no call to bound.

## Tests

- `server/tests/computer-read-pages.test.ts`: limits, order, one bad page among good ones, a private address
  refused as `navigate` refuses it, truncation (long text, a surrogate pair, the total), a deny by tool name,
  intent and host, the audit rows, the gate's candidates against a navigation's, the real `decideAction`
  with team rules, an offer by switch, the headless tool, the route. A mutation (naming the tool
  `computer_read_pages` in `govern`) turns four of them red.
- `agent-computer/tests/read-page.test.ts`: the limit parser, the human-check sentence, the route in the three
  lists. `read-page-browser.test.ts` (real Chromium, asked for by name, in the CI line `computer (real
  browser)`): text, links, order, the tab, the limit, a redirect, a human check that opens no request, a page
  that never loads, malformed addresses. The pages are served from this machine's loopback.

## Not run live

The prompt sentence (Jules) and the tool's description are text a model reads. To run on the eval stack:
jules-1, jules-2 and jules-3, plus a case that gives Jules three addresses to compare and checks that he
calls the tool once. The saving in calls per turn is for the script of row 93 to measure.

## Built so far: an engine for the page (D156, section 109)

`computer_read_pages` takes an optional `engine` (`firefox` or `webkit`; the default is the member's own Chromium tab). The server passes it to the computer's `/read-page`, which reads the page in a private browser of that engine behind the same network filter, after the engine has passed a check against the filter in the running computer. Text only. Verified: the server cases and the canary logic (with Chromium standing in). Not verified: a real Firefox and WebKit run (CI installs them and runs `engine-check-browser.test.ts`).
