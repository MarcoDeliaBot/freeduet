# Safe purchases (v0.4): design

Status: design only. Nothing is built and no code is changed. Read on origin/main at 5b96410, 14 November 2026; the code paths cited here are the same at e1c11b3 and 5b96410. Milestone v0.4 in [PROJECT.md](../PROJECT.md) (F7) and [ROADMAP.md](../ROADMAP.md).

Markers: `[code: path:line]` read on origin/main. `[repo: path:line]` a repository doc or CLAUDE.md. `[doc: URL]` a public page, read on 14 November 2026. `[code: none found]` a search of the named folders found nothing. `[assumed]` not checked.

## 1. What the person gets

- You set once, in Settings, the shops a member may buy from and the spending caps: per purchase, per day, per month and per shop.
- A member buys only at a listed shop and only under the caps, by clicks and typing. A command is a separate open question (section 3.8).
- Above a cap the purchase is refused with a reason, with Full access on or off.
- Gift cards, vouchers, subscriptions, transfers to people, crypto and irreversible buys always ask you, whatever the cap. No member types a card number or approves a bank step.

## 2. What exists today, and the gaps

### 2.1 A payment is a hand-off, not a card

- Payments are one of three built-in safety categories, matched on words in English and Italian and on tool names [code: openbot/server/src/approvals/policy.ts:176, 202-207; PAYMENTS_IT_EN at policy.ts:98-124; MONEY_TOOL_NAMES at policy.ts:164-165].
- A safety hit returns `hand_off` before any rule or the reviewer runs [code: policy.ts:504-509].
- A hand-off accepts only "handled" (the person did it) or "deny" [code: openbot/server/src/approvals/store.ts:155-159]. Its card shows no "Always allow" [code: openbot/app/src/components/approvals/approval-card.tsx:194].
- The reviewer can only add a hand-off [code: policy.ts:545-560]. Its prompt repeats that payments always go to the person [code: policy.ts:428].
- The gate refuses without a card only for a repeat of an action the person declined [code: openbot/server/src/approvals/service.ts:483-503]. Any outcome other than allow, a fresh `deny` included, opens a pending card [code: service.ts:505-518]. A refusal with a reason is therefore a new branch.

### 2.2 Full access

- Plain Full access lifts the payments category. "Without payments" lifts nothing [code: openbot/server/src/approvals/policy.ts:293-315, esp. 299-303]. The Full-access check runs before the safety floor [code: policy.ts:495-509].
- There is no amount limit and no spending cap. The docs say so [repo: docs/FULL_ACCESS.md:13, 74]. No spending cap, budget or spend counter for purchases exists in server, agent-computer, agent-freeduet, app or shared code [code: none found].
- Full access is stored per member in `users.preferences.freeduetFullAccess` [code: openbot/server/src/freeduet/full-access.ts:49, 228-230] and set only by the person's route [code: openbot/server/src/freeduet/full-access-routes.ts:1-6, 29].

### 2.3 What the gate sees at a click

- The gate gets an effect (`write` for a click, a type, a file write or a command; `read` otherwise), a scope (the page host) and a target (page URL and element) [code: openbot/server/src/computer/gateway.ts:669-690].
- For a click the page URL is the stored snapshot's URL [code: gateway.ts:543, 567]. For a navigation it is the URL the member asked for [code: gateway.ts:1023].
- The element is the snapshot entry: role, accessible name and, for a form control, its value [code: openbot/agent-computer/src/aria-snapshot.ts:69-81; gateway.ts:498]. The snapshot holds no autocomplete attribute.
- Typed text never reaches the gate. A type call passes the ref and the snapshot id, plus an Enter key when the member asks to submit [code: gateway.ts:1068-1077], and the audit row omits the text [code: gateway.ts:1249-1258].
- No code reads structured data (`ld+json`) from a page [code: none found].
- The agent-computer can read a page's text itself [code: openbot/agent-computer/src/index.ts:444-450; challenge.ts:93]. Nothing passes that text to the gate.
- A command is not read by the floor at all: `computer_run_command` and the computer's file tools are exempt [code: openbot/server/src/approvals/policy.ts:230, 237; repo: docs/FULL_ACCESS.md:78].

### 2.4 Card fields and secrets

- Card fields (`cc-number`, `cc-csc`) are hidden from the read-back [code: openbot/agent-computer/src/secret-masking.ts:30-38].
- Nothing refuses a fill: `/type` fills any ref it is given [code: openbot/agent-computer/src/index.ts:1821-1833].
- The floor reads the element's stored name, role, value and href, not its autocomplete attribute [code: policy.ts:242-247; gateway.ts:669-690; aria-snapshot.ts:69-81]. A card field whose name holds no card words passes the floor [assumed: read from code, not run in a browser].
- A secret path exists. The person types the secret in a private form outside the conversation, and the field is filled without the value going back to the model [code: openbot/server/src/computer/gateway.ts:236-246; openbot/server/src/passwords/service.ts:20-30; openbot/agent-computer/src/secret-masking.ts:4-9]. Card fields do not use it yet.

### 2.5 Payment words the floor does not match

| Category | Matched today | Not matched |
|---|---|---|
| Gift cards | gift card, buono regalo, carta regalo [code: policy.ts:113, 120] | none |
| Vouchers | none; "voucher" appears only in a comment [code: policy.ts:100] | voucher, coupon |
| Subscriptions, renewals | subscribe, abbonamento, renew [code: policy.ts:110, 117-118] | recurring, every month, auto-renew |
| Transfers | bonifico, bank transfer, send money [code: policy.ts:105, 205] | transfers to people in apps, unless a listed phrase appears |
| Crypto | none [code: none found] | all |
| Auctions, bids, pre-orders | none [code: none found] | all |
| Buttons | buy now, place order, pay now [code: policy.ts:205] | plain Buy, Donate, Charge my card [repo: docs/FULL_ACCESS.md:76] |

### 2.6 Doc drift

- `docs/FULL_ACCESS.md` cites `service.ts:430`, `service.ts:320`, `policy.ts:446` and `policy.ts:271` (lines 17 and 21). On origin/main they sit at `service.ts:444`, `service.ts:321`, `policy.ts:468` and `policy.ts:293`.

## 3. The design

### 3.1 The smallest model

- One set of purchase settings per person, shared by all members, routines and hand-offs. A second member or a hand-off cannot buy around a cap.
- Stored like Full access: a new key in `users.preferences` [code: openbot/server/src/freeduet/full-access.ts:228-230, the pattern to copy]. No migration until the ledger (slice 3). The latest migration is 0068, so the next is 0069 [code: openbot/server/drizzle/0068_user_secret_credential_kind.sql].
- Contents: trusted entries (an exact host and a label), a cap per purchase, per day (all shops together), per month (all shops together), and per shop per month. One currency per person.
- Changed only by the person, through a session route like Full access's, with `confirm` for every raise [repo: docs/FULL_ACCESS.md:38-50]. Members cannot change it: the chat settings list excludes payments [code: openbot/server/src/settings-in-chat/allow-list.ts:8-14].
- A booking without a payment is not a purchase here; it follows the rules that exist (asks, or Full access). A booking that takes a payment is a purchase.
- The person's first list is the shops they already buy from. A member may suggest an addition in chat, but only the person adds one.
- Marketplaces can be listed as one entry, as the maintainer asked. Their sellers are not checked (decision 5).

### 3.2 Categories that always ask

| Category | Examples | Why it stays a card |
|---|---|---|
| Gift cards and vouchers | gift card, buono regalo, voucher, coupon code | A trusted shop does not lift this (the maintainer's rule). A voucher can be given away or spent with no shop to dispute it |
| Subscriptions and anything recurring | subscribe, renew, every month, auto-renew | The cost goes on after the purchase |
| Transfers to people | bank transfer, bonifico, send money, peer payment apps | Money goes to a person, not a shop |
| Crypto | crypto, exchange, token | Irreversible, with no shop to ask for a refund |
| Auctions, bids, pre-orders, final sale | place bid, pre-order, final sale | Cannot be undone once placed |

"Always ask" means the person answers every time, whatever the caps and Full access say. Under decision 6 every word of these categories is matched, and each stays a hand-off: never the one-press card of decision 1, and never "Always allow" [repo: docs/PROJECT.md:125]. Today the floor misses most of these words (section 2.5).

### 3.3 What the server can know, and how the amount is checked

A shop writes its own page, so every amount on it is data, not a fact [code: openbot/server/src/untrusted-content.ts:75-77].

1. Before a checkout click, the server asks the agent-computer for one fixed read of the live page: the live host, every `application/ld+json` Offer with its `price` and `priceCurrency` [doc: https://schema.org/Offer], and the amount beside the pay control [assumed: works on common shop layouts; not tested]. The server writes the script, so a page cannot change it.
2. When a provider hosts the payment step (for example a Stripe-hosted checkout [doc: https://docs.stripe.com/strong-customer-authentication]), the amount shown there should be the one charged [assumed: not checked on a provider page]. Read it the same way, on a host from the provider list.
3. Amounts are parsed strictly: one currency, which must be the person's, and one number format. An unclear format is refused.
4. The amount counts only if the Offer and the visible amount agree. A disagreement, no read, or a read that changes between two reads refuses the purchase.
5. From slice 2a, the member declares shop, total and currency before the click. The declared total must equal the read. A mismatch refuses.
6. The read and the click happen in one browser call, so the page cannot change between them [assumed: not built or tested].

What this cannot prove: on a shop-hosted checkout the shop shows and charges the amount, so the server can only check that the shop agrees with itself. The caps bound the loss; they do not prove the charge.

### 3.4 Where the cap is enforced, and what happens at it

- In the server, in the approval gate, before any card. The inputs are the server's read, the trusted list, the ledger and the person's caps. No model output is an input.
- The check sits at the top of `decideAction` for payment candidates, before the Full-access branch [code: openbot/server/src/approvals/policy.ts:495]. The facts are attached in `gateway.ts` next to the approval call [code: gateway.ts:669-690].
- A new refusal source (`purchase_limit`) joins the union in `ApprovalPolicyOutcome` [code: openbot/server/src/approvals/types.ts:41-52]. A new branch in `gate` records the decision and throws, as the declined-repeat branch does [code: service.ts:483-503].
- At the cap there is no card. A cap is a limit, not a question [repo: docs/FULL_ACCESS.md:74]. The member gets the amount, the cap and the shop, in a reason it can give the person. The person raises the cap in Settings, with `confirm`.
- This is the risk evaluator the maintainer asked for: fixed rules that only the person can change, by changing their inputs. The reviewer model cannot lift a refusal.

### 3.5 Refunds and failed payments

- An attempt counts at its full amount from approval until the person marks it failed. An unknown result (timeout, error) counts as spent. The eval case iris-8 already expects a check of the first payment before a second attempt [repo: evals/team/cases.yaml:82-88].
- A refund never lowers a total by itself, because a page cannot prove a refund. The person may correct a total with a reason, logged as a settings change.
- Totals are per person, across members and routines.

### 3.6 Full access and routines

| Case | Today | With caps (recommended) |
|---|---|---|
| Plain Full access, payment | Lifted, no limit [code: policy.ts:299-303; repo: docs/FULL_ACCESS.md:13] | Refused above the cap. Below it: decision 2 |
| Full access without payments, payment | Payment goes to the person as a hand-off [code: openbot/server/src/approvals/policy.ts:504-509; repo: docs/FULL_ACCESS.md:10] | Refused above the cap. Below it: the hand-off, as today |
| Routine or trigger, payment | Hand-off from the safety floor. Full access never applies to routines [code: openbot/server/src/approvals/policy.ts:494-495, 504-509; repo: docs/FULL_ACCESS.md:55; docs/M1_PLAN.md:476-478] | Refused above the cap. Below it: the hand-off, as today |
| Hand-off from a Full-access member | The stricter setting applies [repo: docs/FULL_ACCESS.md:57] | Same. The ledger is per person, so a hand-off cannot buy around a cap |
| Full access, anything but a payment | Lifted | Unchanged |

Recommendation: caps apply in both Full-access settings. Why: a Full-access member can be steered by what it reads [repo: docs/FULL_ACCESS.md:73]; a cap limits that loss without asking anyone; and the same document says caps, once they exist, are limits and not cards, and asks the maintainer to confirm [repo: docs/FULL_ACCESS.md:74].

### 3.7 The trail of choices

- Each purchase writes one audit row with the facts it was decided on: the shop and whether it is trusted, the amount read, the cap, the outcome and the rule. The row holds no typed text, as today [code: gateway.ts:1249-1258].
- The member tells the person each choice it made in one line of its reply: the shop, the amount, whether it was under the cap, and who approved. The person can then change the rule next time.
- Purchases appear in the list of actions done without asking, beside Full access's list [repo: docs/FULL_ACCESS.md:69].

### 3.8 Threats

| Threat | Defence | Left over |
|---|---|---|
| A shop page changes the amount or asks for another recipient | The amount comes from the server's read, never from the model. No recipient is filled from a page. Transfers always ask | A shop can show one amount and charge another; the cap bounds it |
| A fake shop that looks like a trusted one | Exact host only, never a suffix. Non-ASCII hosts compared in punycode form. A checkout on another host counts only if that host is on the provider list. The egress matcher uses suffix rules and is not reused [code: openbot/agent-computer/src/egress.ts:383-386] | Shared hosting names below a public suffix are a risk. The Public Suffix List says which names are public suffixes [doc: https://publicsuffix.org/] |
| One purchase split to stay under a cap | Caps per shop, per day and per month across all members and routines. Attempts count from approval | A purchase just under a cap is allowed by design |
| Currency confusion | One currency per person. Another currency, or an unclear number format, is refused | No conversion until decided |
| Saved payment methods | FreeDuet holds no card number today [code: none found in openbot/server, openbot/agent-computer, openbot/agent-freeduet]. A saved method sits in the shop account, the browser profile or the provider. Chrome can fill saved payment info [doc: https://support.google.com/chrome/answer/142893]. A member uses a saved method only when the person saved it and the purchase is under the cap | The browser profile keeps its state across restarts [code: openbot/agent-computer/src/profiles.ts:4-14]. A click that pays with a saved card must still be seen as a payment by its element's words |
| A bank or 3-D Secure step | The live browser goes to the person, as a visible challenge does [code: openbot/agent-computer/src/challenge.ts:12-30]. A member never types a one-time code or approves in a bank app. Banks may ask for this step [doc: https://docs.stripe.com/strong-customer-authentication] | Detecting a bank step by words or frames is [assumed]; not built |
| The amount or host changes after the card | Read again in the same call as the click; a mismatch refuses. The eval case jules-5 already expects a stop and a new ask when the total rises after approval [repo: evals/team/cases.yaml, jules-5]. The plan's permit is single use and lasts 10 minutes [repo: docs/PROJECT.md:125]; not built | A race inside one page call |
| A redirect to another host | The check uses the live host at the click, not the requested URL [code: gateway.ts:1023] or an old snapshot [code: gateway.ts:567] | A snapshot can be older than the page [assumed] |
| "Always allow" or an old rule answers a purchase | Not offered for payments [code: approval-card.tsx:194; repo: docs/PROJECT.md:125] | None |
| A member changes the caps or the list | Only the person's session route can. The chat list excludes payments [code: allow-list.ts:8-14]. F11 lists "spending or raising a budget" as owner-only, enforced by the gateway, with one exception: Full access may remove the card for spending [repo: docs/PROJECT.md:192]. No spending or budget code exists yet [code: none found] | Until that gate exists, the route is the only door. A test must show no member tool reaches it |
| Words the floor misses (voucher, recurring, crypto, auction, plain Buy) | Add them for purchases (decision 6) | Changing the floor changes cards in every setting |
| A failed payment retried | The retry counts as an attempt; the first is checked before a second [repo: evals/team/cases.yaml:82-88, iris-8] | An unknown first result may already have charged |
| A purchase made by a command (a script, or a command-line call to a shop) | None yet. Section 6 asks whether a command may reach a listed shop while purchase settings are on. A command follows its own setting, ask, allow or never [repo: docs/FULL_ACCESS.md:64, 78] | Under "allow" a command reaches a shop with no cap check. Whether the computer's egress rules also restrict commands is [assumed] |

### 3.9 What comes after

- Permits bound to shop and total, single use, 10 minutes [repo: docs/PROJECT.md:125] (slice 2b).
- A red-team set in the team evals, which the plan requires [repo: docs/PROJECT.md:93] (slice 5).
- A quality floor for the engine allowed to buy [repo: docs/PROJECT.md:91, 125]. Not designed here.
- Currency conversion at a rate the person sets. Seller checks for marketplaces. Neither is designed here.

## 4. Slices

Size as in [ENGINES_PLAN.md](../ENGINES_PLAN.md) section 2: S under 300 changed lines, M 300 to 1000, L over 1000. One PR each. S1 comes first. The one-press card (S2b) changes the rule that payments always go to the person, so it waits for decision 1.

| Slice | Builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|
| S1 Read and refuse | Purchase settings and their route (`users.preferences`, no migration). The server-written checkout read in agent-computer. Facts attached in `gateway.ts`. A refusal branch in `gate` with a reason and an audit row. Cap and trusted-host checks before Full access. Below the cap the hand-off stays, and its card names the read amount and shop | Pure: host matcher (exact, punycode, suffixes refused), amount parser (one format; unclear refused), cap arithmetic. Postgres, through the real gate: above cap refused in card mode and in Full access; unreadable amount refused; Offer and visible amount disagree, refused; trusted host under cap gets the same hand-off as on main. Fixture page in Chromium for the read. Each new test fails on main, or is marked as a guard | Decision 3; decision 2 for the Full-access lifting rule | M |
| S2a Declared purchase | `request_purchase` [repo: docs/PROJECT.md:91]: the member declares shop, total and currency before a click. The declared total must equal the read | Declared differs from read: refused. Above cap with no declaration: refused. Matching declaration: hand-off unchanged | S1 | S |
| S2b One press under the cap (only if decision 1 says so) | Under the cap at a trusted host, and not in an always-ask category (3.2), a payment becomes an `ask` with "Allow once" only, not a hand-off, and the card shows the amount and shop the server read. A single-use permit, bound to host and amount, lasts 10 minutes. The click re-reads the amount in the same call | The card appears only when every condition holds. No "Always allow". A second use is refused. A changed amount between card and click is refused. An untrusted host keeps the hand-off. Full access unaffected. The red-team cases for this path pass on the eval stack first | S2a; decision 1 | M |
| S3 Totals | Ledger table (migration 0069): per person, reserved at approval, released only by the person's "failed" mark. Totals in Settings. Refusal at each limit | Postgres: two purchases racing for the last amount (one passes, row lock). A refund does not lower a total. An unknown result counts. Day and month boundaries in the person's time zone | S2b | M |
| S4 Full access aligned | Plain Full access lifts payments only below the cap at trusted shops (decision 2, option a). Settings text drops "no limit" | Plain Full access at an untrusted shop asks. Above cap refused in both settings. A routine asks or refuses. A hand-off takes the stricter setting | S1 to S3; decision 2 | S |
| S5 Detection and red team | Checkout words widened (decision 6). Bank-step hand-over like the visible challenge. Card-field fills refused and routed to the private form. Provider list and exact host rules. Red-team cases in the team evals, run on the eval stack, not in CI | Fixture pages: injected amount, lookalike host, redirect, bank frame, card-field fill (refused). Eval cases with `safety: true` | S1; S2b for the one-press path | L |

## 5. Rules that must hold

- Logins first: purchases use the person's own browser session and saved logins. No metered key buys anything [repo: CLAUDE.md, "Logins first"].
- Never read, copy or forward subscription credentials. A saved login is used only through the person's private sign-in request [code: openbot/server/src/passwords/service.ts:20-30].
- No secrets or personal data in the repository: no card numbers, shop accounts, real amounts or trusted lists. Fixtures use invented hosts and amounts [repo: CLAUDE.md, "No secrets and no personal data in the repository"].
- The person's approval for real account actions: a payment reaches the person unless decision 1 says otherwise. A cap is a limit, never a card [repo: CLAUDE.md, "The person's approval stays for real account actions"].
- Change only what the slice asks. A slice that touches an upstream file adds a row to docs/UPSTREAM_TOUCHES.md. Rows exist for `policy.ts`, `service.ts`, `gateway.ts` and agent-computer `index.ts` [repo: docs/UPSTREAM_TOUCHES.md].
- Public wording: the repository never names the purchases or shops of a person. The trusted list lives in that person's preferences only.

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Why |
|---|---|---|---|---|
| 1 | A payment below the cap at a trusted shop | (a) hand-off, as today; (b) one press on the card; (c) no card, Full access only | (a) in S1. (b) only after S2a and the red-team cases pass | (b) weakens "payments always go to the person" [code: openbot/server/src/approvals/policy.ts:428]. Under (a) a member prepares each purchase and the person completes it; a member that buys by itself needs (b) or (c). Money defaults to the stricter option |
| 2 | Plain Full access and payments | (a) lift below the cap at trusted shops only; (b) payments ask in both settings until S5; (c) lift as today, with the cap refusal only | (b) now; (a) after S4 | Plain Full access lifts payments with no limit today. D29 makes it the setting that lifts payments [repo: docs/M1_PLAN.md:321], and F11 names it the one exception to owner-only spending [repo: docs/PROJECT.md:192]. (b) closes the gap at once; (a) is the lean version once caps exist. Changing it changes a decided rule, so it is the maintainer's to take |
| 3 | Default caps for a new person | (a) 0 in the person's currency: no purchase until the person sets a cap; (b) a small fixed default; (c) no default | (a) | Money defaults to the stricter option. The plan says "low default caps" [repo: docs/PROJECT.md:171]; (a) is the strictest reading. One step in Settings sets a cap |
| 4 | What counts against a cap | (a) each approved attempt at full amount; refunds never lower it; (b) confirmed payments only; (c) reset by hand only | (a) | A page can say "failed" or "refunded". Attempts are what the server can count |
| 5 | Trusted entries and marketplaces | (a) exact host only; (b) host and its subdomains; (c) registrable domain | (a). A marketplace is one entry for caps; its seller is not checked | Anyone can make a subdomain on a shared host. The maintainer wants marketplaces, and exact hosts allow them |
| 6 | Words for checkout clicks and card words | (a) keep the list; (b) add Buy, Donate, Charge, voucher, recurring, crypto and auction for every setting; (c) page signals for purchases only | (b) and (c) | The floor misses these today (section 2.5). (b) adds cards in every setting, the stricter direction. Test each new word against ordinary text first ("exchange" and "token" are common) |

Not in the table, and each needs its own decision before its slice: currency conversion; the time zone of the day boundary; the seller check for marketplaces. Before S1 ships, the maintainer should also say whether a command may reach a listed shop while purchase settings are on (section 3.8). Until then S1's promise covers clicks and typing only.

## 7. What was not verified

- Real shops: whether their pages carry Offer data or a visible amount beside the pay control, and how often the two agree [assumed].
- Provider pages: which hosts a shop uses for its payment step, and whether the amount shows there [assumed].
- Card fields in a real browser: the floor's behaviour was read from the code, not run [assumed].
- Bank steps: no bank page was seen; detection by words or frames is untested [assumed].
- A member's own browser profile: Chrome's help confirms autofill of saved payment info [doc: https://support.google.com/chrome/answer/142893]; whether a profile holds a card in practice is [assumed].
- Races: whether a page can change between a read and a click inside one call [assumed].
- Payment words in other languages, and words for auctions and crypto: none in code [code: none found].
- The milestone's done-when: one real low-cost purchase with approval, and one over-cap attempt refused [repo: docs/PROJECT.md:93, 115]. No slice here runs it; it needs a live shop and the eval stack.
- The team eval cases with payment words were read, not run, including iris-8 (a failed checkout: check the first payment) and jules-5 (the total rises after approval). No live engine ran.
- No test, Chromium or Postgres run was made. Design only.
- Consumer refund rules and payment authentication rules by country were not checked.
