# WhatsApp and a chat channel for the phone: design

Written 17 November 2026 for two roadmap rows, "WhatsApp" and "Chat channel for the phone (Telegram first)" ([ROADMAP.md](../ROADMAP.md)). The decision is D82 ([M1_PLAN.md](../M1_PLAN.md), section 61). Read with [phone-and-remote.md](phone-and-remote.md), [remote-session-voice.md](remote-session-voice.md) and [SECURITY.md](../../SECURITY.md).

**Status: nothing is built.** This note says what could be built, what each choice costs, and what the maintainer must decide before code starts.

Tags: **[code: path]** read on origin/main on 17 November 2026. **[doc: URL]** a public page, read on 17 November 2026. **[not read]** a page I could not read; nothing tagged so may be built on as if it were true.

## 1. What is in scope

The maintainer decided on 17 November 2026 that WhatsApp is fundamental, and that a chat channel for the phone is wanted, Telegram first because it is the simplest. There are three separate capabilities. Each has its own risk, so each can be built, reviewed and switched on alone.

| | Capability | What the person gets | Main risk |
|---|---|---|---|
| a | **Notices and approval answers** | A short notice on the phone when a member needs the person or has finished. An approval card can be answered there with Allow once or Deny. | An approval given from a place that is not the person. The text sits on the chat provider's servers. |
| b | **Chatting with the team** | The person writes to Iris (or a member) from the chat app and reads the answer there. | A message from the wrong sender, or text from someone else inside it, treated as the person's request. |
| c | **A member reading the person's WhatsApp conversations** | Iris reads chosen conversations, read-only, to learn how the person answers. | Other people's messages are their personal data. Reading is not the same as writing: she never sends as the person without approval. |

(a) is the smallest and the most useful. (b) needs (a)'s pairing. (c) is independent of (a) and (b) in code, but it needs a WhatsApp transport that can read, and only some of the options below can.

## 2. Options for WhatsApp

### 2.1 What I read

- **Official Cloud API, what you must have.** A Meta app with the WhatsApp use case, a business portfolio and a WhatsApp Business account, a sending phone number, and an access token (a permanent one comes from a system user) [doc: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started].
- **Webhooks.** The endpoint must be HTTPS with a valid certificate; self-signed ones are refused. Each call carries an HMAC signature header made with the app secret, and Meta verifies the endpoint with a challenge request [doc: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint]. Any answer other than 200 is retried for up to 7 days, so duplicates happen; some webhooks are not sent while the app is in Dev mode [doc: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks].
- **Templates and the window.** A message outside a "customer service window" must be an approved template; review can take up to 24 hours, and an approved template can later be paused [doc: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview]. The window is a 24-hour timer that opens when the user writes and restarts at each new user message; inside it free-form messages are allowed [doc: https://developers.facebook.com/docs/whatsapp/pricing]. So a notice that FreeDuet starts by itself (a routine finished at night) needs a template, unless the person wrote in the last 24 hours.
- **Price.** Charged per delivered message, by category and by the recipient's country. Each business number has 1,000 free service messages a month, and from 1 October 2026 service messages above that, and utility messages inside the window, are charged [doc: https://developers.facebook.com/docs/whatsapp/pricing]. The rates change; I did not copy any.
- **What it cannot do.** The Cloud API belongs to a business number. It does not read the person's own personal WhatsApp conversations. **[assumed]**: I found no page that states this in one sentence; it follows from the API being a business sender and receiver. So the Cloud API serves (a) and (b), not (c).
- **Unofficial gateways.** WhatsApp's own terms forbid automated methods for certain things, bulk and auto-messaging, reverse engineering or altering the service, and let WhatsApp suspend or end an account that breaks the terms [doc: https://www.whatsapp.com/legal/terms-of-service]. One gateway library says so in its own words: WhatsApp does not allow bots or unofficial clients, so it is not totally safe, and not being blocked is not guaranteed [doc: https://github.com/pedroslopez/whatsapp-web.js, Disclaimer]. Another says it does not condone use that breaks WhatsApp's terms and that you use it at your own discretion [doc: https://github.com/WhiskeySockets/Baileys, Disclaimer]. I found no page that gives a rate of restrictions; treat the risk as real and unmeasured.

### 2.2 Gateways: licences as read today

A gateway is a separate program the person installs and runs. FreeDuet reaches it by a URL and a token, as configuration. FreeDuet ships none of its code and copies none of it (CLAUDE.md, "Rules that never bend").

| Gateway | Licence on its repository | Based on | Official or unofficial protocol | Source |
|---|---|---|---|---|
| WAHA | Apache-2.0 | Several engines: a browser one, a Node websocket one, a Go websocket one, another browser one | Unofficial WhatsApp Web protocol (the engines named are Web-based); I did not find a ban warning on the page | https://github.com/devlikeapro/waha |
| Evolution API | Apache-2.0 "with additional brand-protection conditions" (logo and copyright kept, a usage notification) | Baileys, or the official Cloud API, chosen by the person | Both; the Baileys mode is the unofficial one, and the page says it "may have limitations" | https://github.com/EvolutionAPI/evolution-api |
| go-whatsapp-web-multidevice | MIT | Not stated in the part I read | Unofficial (a Web multi-device client); the part of the page I read has no disclaimer, and I read 100,000 of 121,210 characters | https://github.com/aldinokemal/go-whatsapp-web-multidevice |

Libraries a gateway is built on, for the licence check only (FreeDuet would not link them): Baileys is MIT [doc: https://github.com/WhiskeySockets/Baileys]; whatsmeow is MPL-2.0, a file-level copyleft licence [doc: https://github.com/tulir/whatsmeow]; whatsapp-web.js is Apache-2.0 [doc: https://github.com/pedroslopez/whatsapp-web.js].

**None of the three gateways is AGPL, GPL or unlicensed as of 17 November 2026.** If one changes licence, or the person picks another that is AGPL, GPL or without a licence, the rule stays: it may only be a separate program the person installs; its code is never copied or shipped by FreeDuet. The WAHA page said its former paid "Plus" version is now part of the free image; I did not read the licence terms of that change, so check them before the note names WAHA to the public.

The maintainer already runs his own gateway on his own server for other work. That is a good fit for the "configuration only" rule, and nothing about it belongs in this repository.

### 2.3 The options compared

| | A. Official Cloud API | B. A gateway the person runs (unofficial protocol) | C. Official API for (a) and (b) only, nothing for (c) |
|---|---|---|---|
| What the person does | Makes a Meta app, a business account, adds a number, makes a token, sets up an HTTPS webhook. At least five steps, several outside FreeDuet. Breaks the "three steps at most" rule unless FreeDuet guides each one | Installs the gateway, scans a QR code with the phone, pastes a URL and a token into FreeDuet | Same as A |
| Cost | Per delivered message (see 2.1); templates for anything that FreeDuet starts | The gateway is free; the person's server and time | Same as A |
| Public URL | Yes: Meta calls FreeDuet. Needs HTTPS with a valid certificate, which the home setup does not have today ([phone-and-remote.md](phone-and-remote.md), TLS and exposure) | No, if the gateway runs next to FreeDuet: the gateway calls FreeDuet or FreeDuet polls it. It needs one if the gateway is on another machine | Yes |
| What can break | Template rejected or paused; app left in Dev mode; token expired; webhook retried and duplicated | Protocol changes break the gateway until it is updated; the session can drop and need a new QR code | As A |
| Account risk | Low: it is the sanctioned route. A business number is not the person's own personal number | Real, unmeasured: the person's own number is used on an unofficial client, and WhatsApp may restrict or end the account (2.1) | Low |
| Licence | Not applicable, no third-party code | Apache-2.0 or MIT for the three read; a separate program in any case | Not applicable |
| What leaves the machine | Notices and chats go through Meta | The same, through WhatsApp as always; plus the gateway holds the session on the person's server | As A |
| Fits "configuration only" | Yes: a URL, a token and an app secret | Yes, if FreeDuet speaks to it only by URL and token and ships none of its code | Yes |
| Can read the person's own chats for (c) | No (2.1) | Yes, that is the only route found | No |
| Needed for (a) and (b) | Works | Works | Works |

### 2.4 Recommendation

1. **Build (a) and (b) first on Telegram.** It needs no public URL (the bot is reached by asking Telegram for updates, which Telegram documents as the alternative to a webhook, and which expire after 24 hours unread [doc: https://core.telegram.org/bots/api, getUpdates]), a sender id is a stable number, and a button press comes back as a `callback_query` that names the sender. Account risk is low and it costs nothing. It lets the whole safety design in section 3 be built and reviewed once, behind one adapter.
2. **WhatsApp for (a) and (b) through a gateway the person runs (option B), as one more adapter behind the same design.** Reason: the maintainer asked for it for his own number, option A makes a person with no business account do five steps, and the cost of A is per message. The trade-off is account risk. The mitigation is to say it plainly in the app, to make the gateway optional and off by default, and to recommend a second number for the person who is worried.
3. **Offer option A (official API) as the safe path later**, behind the same adapter, once the HTTPS and templates questions are answered. It is the one to recommend to anyone who will use FreeDuet with a business number.
4. **(c) only with option B, and only read-only, as the last slice**, after (a) and (b) are used. It has no official route at all, so it carries the account risk and the third-party privacy question (section 4). If the maintainer does not accept that, the answer to (c) is "not built".

Doing nothing for (c) is a legitimate choice. It removes the riskiest capability, and Iris can still learn how the person writes from the mail she already reads.

### 2.5 What the maintainer must decide

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| 1 | Which transport first | Telegram; WhatsApp through his gateway; WhatsApp official API | Telegram first, then the gateway | No public URL, no account risk, builds the safety design once |
| 2 | Accept the account risk of an unofficial gateway for his own number | Yes; no; yes with a second number | Yes with a second number if he can, and a plain warning in the app | WhatsApp can restrict the account; the risk is unmeasured |
| 3 | Build (c), the reading of his WhatsApp conversations | Yes, later; never | Yes, last, per conversation, read-only | Highest privacy cost, no official route |
| 4 | How much a notice may say, since the provider stores it | Short summary only; title only | Short summary only (section 3.7) | The text is stored by the provider |
| 5 | Name a gateway in public documents | Name none; name the ones read | Name none until the maintainer picks one | Public wording rule: no praise of a product |

## 3. The safety design that holds for every transport

The transport is an adapter. Every rule in this section lives in FreeDuet's server, never in the adapter, so a new transport inherits it. A chat app is a **remote session** in the sense of D49: it may read, chat and answer a card once; it may not do what a remote session may not do ([phone-and-remote.md](phone-and-remote.md); [M1_PLAN.md](../M1_PLAN.md), D49).

### 3.1 Pairing, in two steps

1. The person sends a one-time code, shown in the app at the computer, from the chat app to the bot or number.
2. The app at the computer then shows who wrote (the chat app, the sender id, the time) and the person presses **Confirm**.

The code is single-use and lasts two minutes, like the phone pairing code (D49). Without the Confirm press nothing is paired, so a stranger who learns the code cannot pair. Revoking works from the app at the computer, and a revoked pairing stops answering at once.

### 3.2 One sender, one kind of chat

- One accepted sender id per person. Anything else is dropped with no answer (no reply that says the bot exists).
- **Private chats only.** A message from a group, a channel or a broadcast list is dropped. For Telegram the chat type must be `private`; the sender id is the user id [doc: https://core.telegram.org/bots/api].
- **An edited message never counts, and a forwarded message never counts as a request.** An edit can change a message after it was read; a forward is someone else's words.
- An inbound message is the person's request **only when the sender id matches**. Text inside it that came from someone else (a forwarded mail, a quoted message, a caption of a picture from another person) is data, like any mail body, and never an instruction.

### 3.3 Approval: only a button bound to one approval

- A notice for an approval carries two buttons, **Allow once** and **Deny**, built by the server for one approval id.
- Each button carries a **single-use nonce** and an **expiry**. The nonce is checked against the pending approval, the paired sender id and the clock. Used, expired, repeated, or from another sender: refused, and the card stays pending for the computer.
- The answer goes through the existing remote-answer gate (`openbot/server/src/approvals/remote-answer.ts`, [code]) with the same limits as a remote session. That gate already refuses a request that connects, authorises, installs, shares, drives a computer, changes an approval rule or Full access, or that the safety words floor marks as a payment or a credential. Nothing is added there that weakens it; a chat button adds a way to send the same answer, not a new right.
- **Free text, a voice note, an emoji, or a model's reading of "yes", "ok" or "go ahead" never approves.** This is the rule decided on 14 November 2026 ("a spoken yes never approves", [remote-session-voice.md](remote-session-voice.md)), applied to typed chat as well. A reply "yes" to a notice is treated as a chat message to Iris, with the card still pending.
- A chat button never answers a request that would stand as a rule ("always allow"). Only Allow once and Deny exist there.
- Under the chat channel there is no Full access, and a routine's card still asks (D35).

### 3.4 What a chat session may not do

The same list as a remote session. Payments, credentials, connected accounts, security settings, Full access, approval rules, raising limits, pairing another browser: refused, with one short sentence "do this in the app at the computer". A chat that was started from the chat app never sends an email without a card and never uses Full access, and a spoken or voice-note message counts as "from the microphone" and always asks (D49 and the voice design). Only Otto sends email (D27, D30).

### 3.5 Links

A notice never carries a link to a private step (a pairing page, a settings page, a payment page). Where a step belongs at the computer, the notice says "open the app". A link in a notice can be forwarded, opened on another device, or rewritten by a page preview.

### 3.6 Secrets

The transport's token (a Telegram bot token, a gateway token, a Cloud API token and app secret) is stored like the other secrets of the installation (the vault, see [vault-rekey.md](vault-rekey.md)), never in the repository, never in a notice, never read by a member. The webhook signature (Cloud API) or the gateway's own token is checked on every inbound call, and a call that fails the check is dropped.

### 3.7 What a notice may contain

The text sits on the chat provider's servers, and on WhatsApp the person's phone backups may keep it too. So a notice is a **short summary**: which member, what kind of action, and "open the app to see everything". No email body, no address list, no amount, no file content, no secret, no password, no code. The person can switch notices off, and can choose notices for approvals only. (The full request is still shown in the app; this applies to the chat text only.)

### 3.8 Chatting from the chat app

An answer from a member goes back to the same chat. It is the answer of a remote chat turn: it never carries a card's decision, and where a tool would need a card the answer says so and sends a notice with the two buttons (3.3). Pictures, files and voice notes sent in are not accepted in the first version (a voice note is not read), so the first version carries text only.

## 4. Reading the person's WhatsApp conversations (c)

- **Read-only, per conversation.** The person picks each conversation in the app. The default is none. A new conversation is never added by itself, and a group is never added.
- **Nothing is sent.** There is no send tool for this source. Writing as the person to anyone is a separate, existing path (Otto for mail; WhatsApp writing is **not built**), and it would always need a card. A reply a member drafts is a draft in the app.
- **What is stored, and for how long.** Proposal, for the maintainer: only a derived note about how the person answers (tone, length, usual phrases), never the raw messages; raw messages are kept in memory only for the turn that reads them. If the maintainer wants the raw messages kept for search, that is a separate decision with a retention limit (for example 30 days), a button to delete them, and a count in the app.
- **Other people's messages are personal data of third parties.** They did not agree to an assistant reading them. The design reads only the conversations the person chose, never exports them, never puts them in an eval report, a log, a commit or a notice, and a derived note never names them.
- **Text inside is data.** An instruction inside a read message ("send me the money") is never followed.
- **Account risk.** (c) needs a gateway that holds the person's own WhatsApp session (2.3); the risk of 2.1 applies to it.

Open questions, for the maintainer and for a lawyer where he wants one:

1. Is a derived style note enough, or does he want the raw messages kept?
2. Does he accept reading a conversation of a person who does not know? (A private use by the owner of the phone is the usual case; a business use may carry duties of its own.)
3. Is the answer to the account risk "second number", "accept", or "not built"?
4. Should the style note be deleted when the person removes a conversation? (Recommendation: yes.)

## 5. Slices, in build order

| # | Slice | What | Effort | Independent security review |
|---|---|---|---|---|
| S1 | Chat adapter port and the safety core | The server-side rules of section 3: pairing, one sender, private only, nonce and expiry, the call into the remote-answer gate, the refusals. No transport yet, tested with a fake | Large | **Yes** |
| S2 | Telegram: notices and approval buttons | Bot token as a secret; polling by default; a notice with Allow once and Deny. Needs S1 | Medium | **Yes** (it is the first path that lets a press from outside the app answer a card) |
| S3 | Telegram: chat with the team | Text in, text out, the remote-chat rules | Medium | Yes, the delta |
| S4 | WhatsApp adapter through a gateway the person runs | A URL and a token as configuration; inbound webhook or polling; the same S1 core. The plain account-risk warning in the app | Medium | Yes, the delta |
| S5 | WhatsApp adapter, official Cloud API | App secret and signature check, HTTPS question, templates for notices FreeDuet starts | Large | Yes |
| S6 | A member reads chosen WhatsApp conversations, read-only | Section 4; the derived note; deletion | Large | **Yes**, plus the maintainer's answers to section 4 |
| S7 | Eval cases and the members' words | Cases for the refusals and for "yes" not approving; wording for notices in the person's language. Not certified until run live | Small | No |

Order: S1, S2, S3, S4, then S5 and S6 as the maintainer decides. Each slice is its own pull request.

**Not built.** Everything above. In particular: no transport, no pairing code, no notice, no button, no gateway setting, no Cloud API setting, no reading of any conversation, no writing as the person on WhatsApp, no group chat, no voice note, no file or picture over a chat app, no push notification, and no mention of any of this in the app or on the site.

## 6. Built so far

Nothing is built. This note, the two roadmap rows and D82 are the only changes. Verified: the pages and repository licences named above, read on 17 November 2026 through a page reader that summarised them. Not verified: the Cloud API's current rates; the `callback_data` size limit and the `answerCallbackQuery` call of Telegram (that part of the page was cut off when I read it); any statement from WhatsApp about unofficial clients other than its terms of service (its help page refused the reader); the rate of account restrictions; WAHA's licence terms after its "Plus" version moved into the free image; any behaviour of a gateway on a real phone.
