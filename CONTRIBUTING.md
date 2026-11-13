# Contributing to FreeDuet

Thank you for helping. One maintainer runs this project. Replies can take a few days.

## Three ways to help

1. **Tell us you use it.** Open an [I am using it](https://github.com/MarcoDeliaBot/freeduet/issues/new?template=it_works.yml) issue. If you agree, we list your GitHub username among the testers in the README.
2. **Report an error.** Open a [bug report](https://github.com/MarcoDeliaBot/freeduet/issues/new?template=bug_report.yml). The form asks for the steps, what you expected, and what happened.
3. **Offer a fix.** Open an [I can help fix this](https://github.com/MarcoDeliaBot/freeduet/issues/new?template=fix_offer.yml) issue. Say what you propose and whether you want to send the change yourself.

Have a question? Use the [question form](https://github.com/MarcoDeliaBot/freeduet/issues/new?template=question.yml).

Found a security problem? Do not open an issue. Follow [SECURITY.md](SECURITY.md).

You can write in English or Italian.

## How a fix gets in

1. Fork the repository. A fork is the normal way to propose a change, and it is welcome.
2. Make a branch in your fork.
3. Open a pull request against `main`. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) lists what to include.
4. CI must be green.
5. The maintainer or the coordinating session reviews the change.

Small pull requests are merged faster. For anything larger than a small fix, open an issue first so we agree on the approach.

## Good first issues

Issues with the label `good first issue` are a good place to start.

## Testers

Use FreeDuet and tell us, with the [I am using it](https://github.com/MarcoDeliaBot/freeduet/issues/new?template=it_works.yml) form. Testers who agree are listed in the README.

## Rules that never bend

- **Logins first.** Members run on the person's own subscription logins. A metered API is never first in any chain and never on by default.
- **Never read, copy or forward subscription credentials.** Never open the Claude CLI's login or config directories, in any container or volume.
- **No secrets and no personal data.** Never commit keys, tokens, cookies, browser profiles, real emails, real documents or real customer data. Eval fixtures are invented.
- **The person's approval stays for real account actions.** Agents do not send email, pay, buy, sign or delete without the person's approval.
- **Change only what was asked.** A refactor nobody asked for is a regression risk.
- **Upstream changes stay minimal.** Each upstream OpenBot file we change gets a row in [docs/UPSTREAM_TOUCHES.md](docs/UPSTREAM_TOUCHES.md).

## Other rules

- **Upstream first.** If a change belongs in OpenBot or OpenDuet (the computer, the gateway, approvals, credentials, connectors), send it there. FreeDuet stays a thin fork.
- **Sign off your commits** (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/): you wrote the change or have the right to submit it under the MIT license.
- **Write your own prompts and code.** Do not paste prompts, code or text from projects or guides whose license does not allow it. Ported Apache-2.0 files keep their header and say what changed.
- **Prompt changes need evals.** A change to a member's prompt or skill comes with the eval report for that member; safety cases must stay at 100%. See [evals/team/README.md](evals/team/README.md).
- **Provider routes need sources.** A change that enables a subscription route must update [docs/PROVIDERS.md](docs/PROVIDERS.md) with the provider's own wording and a link.
- **Be kind.** Disagree with ideas, never with people.

## Local setup

Follow the [quick start in the README](README.md#quick-start) to run FreeDuet.

To run the tests, see "Local testing" in [CLAUDE.md](CLAUDE.md). For example, `bun test` runs from `openbot/`.
