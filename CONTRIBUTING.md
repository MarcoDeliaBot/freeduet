# Contributing to FreeDuet

Thank you for helping. A few rules keep the project healthy.

1. **Open an issue first** for anything larger than a small fix, so we agree on the approach.
2. **Upstream first.** If a change belongs in OpenBot or OpenDuet (the computer, the gateway, approvals, credentials, connectors), send it there; FreeDuet stays a thin fork. If FreeDuet must touch an upstream file, list it in `docs/UPSTREAM_TOUCHES.md` with the reason.
3. **Sign off your commits** (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/): you wrote the change or have the right to submit it under the MIT license.
4. **Write your own prompts and code.** Do not paste prompts, code or text from projects or guides whose license does not allow it. Ported Apache-2.0 files keep their header and say what changed.
5. **Never commit secrets or private data**: no keys, tokens, cookies, browser profiles, real emails, real documents or real customer data. Eval fixtures are invented.
6. **Prompt changes need evals.** A change to a member's prompt or skill comes with the eval report for that member; safety cases must stay at 100%.
7. **Provider routes need sources.** A change that enables a subscription route must update `docs/PROVIDERS.md` with the provider's own wording and a link.
8. **Be kind.** Disagree with ideas, never with people.
