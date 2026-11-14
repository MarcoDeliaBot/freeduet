# Security

FreeDuet agents read your mail, browse the web and can, with your approval, spend money. Security is a feature, not an afterthought. It is safe by default; if you want, you can turn on Full access for a member, which removes its approval cards, with or without payments (see [docs/FULL_ACCESS.md](docs/FULL_ACCESS.md)).

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). We acknowledge within 72 hours and aim to fix critical issues within 14 days. Do not include real credentials, personal data or conversation contents in a report.

Especially valuable reports:

- any way an agent completes a purchase, booking, send, signature, publication or deletion **without** an approval event, unless the person turned on Full access for that member in their own settings;
- any way Full access gets turned on, or changed, by anything other than the person in their own signed-in session: a member, a routine, a hand-off, a skill, a connector, or text in a mail or a page;
- any way Full access reaches a routine, a check-in, another member or another person, or lifts the refusal of a password, credential or security setting;
- any way a member set to Full access without payments completes a payment, a purchase or a transfer of money without an approval event, a hand-off from another member included;
- any way FreeDuet code reads or transmits a provider's subscription credentials;
- any way content an agent reads (an email, a web page, a document, an image) makes it act;
- any way a CLI engine reaches the host outside the tool bridge;
- any way a purchase permit is reused, extended or applied to another merchant or total.

## Threat model

| Asset | Threat | Control |
|---|---|---|
| Money | An agent buys or books what you did not approve | Single-use purchase permits bound to merchant host and total, valid 10 minutes; caps per purchase, day and month; no "Always allow" for purchases; gateway rule on checkout clicks; final summary re-checked before the last click; minimum engine tier for buying |
| Subscription accounts | Credentials stolen or misused; account suspended | FreeDuet never handles subscription credentials; only official, unmodified CLIs; routes off when provider terms are unclear ([docs/PROVIDERS.md](docs/PROVIDERS.md)) |
| Site logins and payment details | Leaked into chat, logs or the model | Masked secret box and take-over; credentials encrypted, write-only, redacted from audit; agents never type secrets |
| Your data | Exfiltrated by prompt injection | Read content is data, never instructions; outgoing messages checked for sensitive data; every send needs approval; telemetry off by default |
| Your machine | An agent escapes to the host | One isolated computer per agent; CLI engines with no built-in tools; computers bound to loopback with per-container tokens |
| Your reputation | Something is sent or published in your name | Every send and publish shows the exact text and recipient before it goes, unless you turned on Full access for that member |
| Your approvals | A member, a mail or a page switches Full access on, or it spreads beyond the member you chose | Off by default. Only your own signed-in session can write the setting (no member tool, no route a member can reach); it applies to one member, in your own live chat only (never routines or check-ins); passwords, credentials and security settings are still handed to you, and so are payments and purchases in Full access without payments, while plain Full access has no limit on the amount until spending caps exist (v0.4); each action taken without a card is on the audit trail, with the setting that allowed it |

## Safe defaults

- Spending cap: **0** until you set one. Jules cannot buy before you do.
- Metered APIs: off in every chain until you enable them and set caps.
- Full access: off for every member until you turn it on, one member at a time, after a warning, in one of two settings (with or without payments).
- Telemetry: off.
- The app listens on localhost. Put TLS and sign-in in front of it before exposing it to a network.
- With no sign-in, a request from this machine is answered only when it names one of this machine's own hosts (`localhost`, `127.0.0.1`, `[::1]`) or a host you configured in `TRUSTED_ORIGINS`; any other `Host` gets 421. This keeps a web page that re-points its own name at 127.0.0.1 from reading your local FreeDuet. Details in `openbot/docs/configuration.md`.
