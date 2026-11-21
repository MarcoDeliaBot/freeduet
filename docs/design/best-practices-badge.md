# OpenSSF Best Practices badge: passing level, prepared

Prepared 15 November 2026. The Scorecard check "CII-Best-Practices" scores 0 because no project is registered at [bestpractices.dev](https://www.bestpractices.dev). Registration needs the maintainer's own GitHub login, so it is not done here. This page is the answer sheet: each criterion of the passing level, whether the repository meets it today, and the evidence. Statuses are read from the repository on commit `ddb0cde` and from GitHub's settings as the API shows them; the criterion names are the ones of the passing level as the assistant knows them and the maintainer should compare each with the form while registering. Anything marked "maintainer" is a fact only the maintainer knows.

Legend: **Met** (with evidence), **Not met**, **N/A** (with the reason), **Maintainer** (answer needed).

## Basics

| Criterion | Status | Evidence or what to do |
|---|---|---|
| description_good | Met | [README.md](../../README.md) opening and "What is tested" |
| interact (how to get, give feedback, contribute) | Met | README Quick start; [CONTRIBUTING.md](../../CONTRIBUTING.md) and the issue templates in [.github/ISSUE_TEMPLATE](../../.github/ISSUE_TEMPLATE) |
| contribution (the process) | Met | CONTRIBUTING.md "How a fix gets in" |
| contribution_requirements | Met | CONTRIBUTING.md and [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) (tests, no secrets, upstream row); [CLAUDE.md](../../CLAUDE.md) holds the working rules |
| floss_license, floss_license_osi | Met | MIT, [LICENSE](../../LICENSE) |
| license_location | Met | `LICENSE` at the root |
| documentation_basics | Met | README, [docs/](../) (ARCHITECTURE, TEAM, PROVIDERS, M1_PLAN) |
| documentation_interface | Partly | The interface is the app plus [openbot/docs/configuration.md](../../openbot/docs/configuration.md); there is no separate API reference. Say the app is the interface and give the configuration page |
| sites_https | Met | github.com; the site is served over HTTPS (maintainer: confirm the site's host) |
| discussion | Met | GitHub issues and pull requests |
| english | Met | Documentation and issues in English; Italian is also accepted |
| maintained | Maintainer | The project is days old. The criterion asks that the project is working on maintenance; recent commits show it. The Scorecard "Maintained" check is 0 only because the repository is under 90 days old |

## Change control

| Criterion | Status | Evidence or what to do |
|---|---|---|
| repo_public, repo_track, repo_interim, repo_distributed | Met | Public Git repository on GitHub, with every merge visible |
| version_unique | Met | Tags v0.1, v0.2, v0.2.1, v0.2.2 |
| version_semver | Not met | The project has not promised semantic versioning ([CHANGELOG.md](../../CHANGELOG.md) says so). Answer "not met" or adopt it, which is the maintainer's decision |
| version_tags | Met | `git tag` |
| release_notes | Met | GitHub release notes and [CHANGELOG.md](../../CHANGELOG.md) |
| release_notes_vulns | Not applicable until a fixed vulnerability exists | No public vulnerability has been fixed with a release yet (maintainer: confirm) |

## Reporting

| Criterion | Status | Evidence or what to do |
|---|---|---|
| report_process | Met | Issue templates; CONTRIBUTING.md |
| report_tracker | Met | GitHub issues |
| report_responses (reply within 2 to 12 months) | Maintainer | CONTRIBUTING.md says replies can take a few days. The criterion is about the past: only the maintainer knows if every report got an answer. At the time of writing the project has no external reports (maintainer: confirm) |
| enhancement_responses | Maintainer | As above |
| report_archive | Met | Issues are public and searchable |
| vulnerability_report_process | Met | [SECURITY.md](../../SECURITY.md) |
| vulnerability_report_private | Met | GitHub private vulnerability reporting, linked in SECURITY.md (maintainer: confirm that the setting is enabled, Settings, Code security) |
| vulnerability_report_response (initial reply within 14 days) | Maintainer | SECURITY.md says 72 hours; no report has been received to measure it |

## Quality

| Criterion | Status | Evidence or what to do |
|---|---|---|
| build, build_common_tools, build_floss_tools | Met | Docker Compose and Bun, both free software; the build is `bash scripts/start.sh` |
| test | Met | `bun test` (server, app), pytest (agent-freeduet), the team evals in [evals/team](../../evals/team) |
| test_invocation | Met | [docs/dev/local-testing.md](../dev/local-testing.md) (formerly CLAUDE.md "Local testing"); CONTRIBUTING.md |
| test_most | Maintainer | The criterion asks for an automated suite that covers most branches or functionality. No coverage number is published; do not claim one |
| test_continuous_integration | Met | [.github/workflows/ci.yml](../../.github/workflows/ci.yml); the `verify` check is required on `main` |
| test_policy | Met | CONTRIBUTING.md "CI must be green"; the pull request template asks for tests |
| tests_are_added | Met | Recent merged pull requests add tests (every build brief requires one that fails before the change); [PR template checklist](../../.github/PULL_REQUEST_TEMPLATE.md) |
| tests_documented_added | Met | The PR template and CLAUDE.md |
| warnings | Met | Biome lint and format are run from `openbot/`; the TypeScript type check runs in CI |
| warnings_fixed | Met | CI fails on them |
| warnings_strict | Partly | Maintainer: say which compiler or linter settings are strict (`bun run typecheck:tests`, a baseline file lists known type errors) |

## Security

| Criterion | Status | Evidence or what to do |
|---|---|---|
| know_secure_design | Maintainer | The maintainer is one person and the work is written with an AI assistant. The design is explained in [docs/THREAT_MODEL.md](../THREAT_MODEL.md) and [SECURITY.md](../../SECURITY.md); whether the maintainer meets the criterion's wording (knowledge of secure design) is the maintainer's to answer |
| know_common_errors | Maintainer | Same |
| crypto_published, crypto_call, crypto_floss, crypto_keylength, crypto_working, crypto_weaknesses | Mostly N/A or Met | No cryptography of its own is written: the vault uses the platform's libraries; the Gmail transport pins TLS hosts [code: docs/M1_PLAN.md D24] (maintainer: confirm no custom cryptographic algorithm exists) |
| crypto_pfs | Maintainer | Applies to a protocol FreeDuet implements; it implements none |
| crypto_password_storage | Maintainer | Sign-in is by the identity provider the person configures (better-auth); FreeDuet stores no password of its own [not verified] |
| crypto_random | Met | The installation's secrets come from the operating system's random source in `start.sh` [code: openbot/scripts/start.sh, openbot/scripts/secrets.sh] (maintainer: confirm) |
| delivery_mitm | Met | Source is delivered over HTTPS from GitHub; release archives are attested ([VERIFY.md](../VERIFY.md)) |
| delivery_unsigned | Met | No checksum is fetched over plain HTTP |
| vulns_fixed_60_days, vulns_critical_fixed | Maintainer | Scorecard reports 153 known vulnerabilities in dependencies (15 November 2026). Dependabot is on; the answer depends on how many are medium or higher and whether they are reachable. Triage them before claiming this |
| no_leaked_credentials | Met | Secret scanning and push protection are on (README roadmap; release notes of v0.2) |

## Analysis

| Criterion | Status | Evidence or what to do |
|---|---|---|
| static_analysis | Met | CodeQL on every pull request ([.github/workflows/codeql.yml](../../.github/workflows/codeql.yml)); zizmor for workflows |
| static_analysis_common_vulnerabilities | Met | CodeQL's security queries |
| static_analysis_fixed | Maintainer | Check the Security tab for open code-scanning alerts of medium severity or higher |
| static_analysis_often | Met | Every pull request and weekly |
| dynamic_analysis | Not met | No fuzzing or dynamic analysis runs. The criterion is SUGGESTED, not required, at the passing level |
| dynamic_analysis_unsafe | N/A | The code is memory-safe languages (TypeScript, Python; the Tauri crate is Rust) |
| dynamic_analysis_enable_assertions, dynamic_analysis_fixed | N/A | No dynamic analysis |

## What is missing, in the order of the cheapest first

1. Register the project at bestpractices.dev with the maintainer's GitHub login and paste the evidence above (about 30 minutes).
2. Confirm that private vulnerability reporting is enabled in the repository's settings.
3. Decide on `version_semver`: adopt semantic versioning from v0.3 and say so in CHANGELOG.md, or answer "not met".
4. Triage the dependency vulnerabilities (Scorecard "Vulnerabilities" is 0 with 153 reported) so that `vulns_fixed_60_days` can be answered honestly.
5. Check the Security tab for open CodeQL alerts (`static_analysis_fixed`).
6. Answer the "maintainer" rows that only the maintainer can: secure design knowledge, response times, test coverage.
7. Fuzzing is not needed for passing.

After registering, add the badge to the README (the project id is given on the badge page):

```markdown
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/<ID>/badge)](https://www.bestpractices.dev/projects/<ID>)
```

Until the form is submitted and its status reads "passing", do not show a badge: a badge that says "in progress" is accurate and shows effort, and the Scorecard check starts to score on registration.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Register now | Now / after 90 days / never | Now | It takes minutes, costs nothing, and the Scorecard check moves off 0 on registration |
| Claim `version_semver` | Adopt from v0.3 / answer "not met" | Adopt | Pre-1.0 versions may break; saying so in the changelog is enough |
| Claim the "maintainer" rows about secure design | Answer honestly with the threat model / skip | Answer honestly | The form is self-attested and public; an honest "met, with this page" is better than a missed one |
