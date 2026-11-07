# Security

FreeDuet agents read your mail, browse the web and can, with your approval, spend money. Security is a feature, not an afterthought.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private vulnerability reporting on this repository ("Security" tab → "Report a vulnerability"). We acknowledge within 72 hours and aim to fix critical issues within 14 days. Do not include real credentials, personal data or conversation contents in a report.

Especially valuable reports:

- any way an agent completes a purchase, booking, send, signature, publication or deletion **without** an approval event;
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
| Your reputation | Something is sent or published in your name | Every send and publish shows the exact text and recipient before it goes |

## Safe defaults

- Spending cap: **0** until you set one. Jules cannot buy before you do.
- Metered APIs: off in every chain until you enable them and set caps.
- Telemetry: off.
- The app listens on localhost. Put TLS and sign-in in front of it before exposing it to a network.
