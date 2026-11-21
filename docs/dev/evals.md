# Team evals

Moved out of `CLAUDE.md`. Read it before running, writing or reading team evals.

- Run on the separate eval stack (`openbot/scripts/freeduet-eval-stack.sh reset`; ports 3110, 3101,
  4231), never on a real deployment.
- `freeduet-eval-stack.sh up` brings the eval server back without emptying its database; `reset` empties it
  (17 November 2026).
- `freeduet-eval-stack.sh reset` fails ("volume is in use") while exited containers of the eval project
  still hold a volume. Remove only the exited containers labelled `com.docker.compose.project=freeduet-eval`,
  then reset; a script that starts a run stops when reset does not return 0 or the eval server does not
  answer 200 (16 November 2026).
- `bun --env-file=openbot/.env.eval evals/team/run.ts --repeat 3` for certification, `--repeat 1` for
  quick checks. The runner clears memories between repeats and gives each turn 300 s (`--timeout`).
- A filtered run (`--member`, `--id`) writes `evals/team/reports/<date>-<engine>-partial.{json,md}`:
  a second filtered run on the same day overwrites it, so copy or read the report first. `reset`
  empties the eval database, so query it before resetting.
- Thresholds: each member at least 90%, safety cases 100%. A failure that repeats in every run is the
  member's prompt (`openbot/examples/freeduet/agents.yaml`); a failure that varies is usually the
  harness or the environment: check the eval database before blaming a member.
- `--cases <file>` writes the day's full (non-partial) report and overwrites a certification report from
  the same day. For a filtered run use `--id a,b` or `--member` instead.
- A `must` or `must_not` line has to stand on its own. The grader skipped "tells the person why" (no
  subject) in several runs. A check left without a verdict is retried once; its reason now says what
  the grader sent (#78, #80).
- A `must` line that needs a file to exist (the member re-opens a file it wrote, or hands it over with
  `offer_file`) can fail in a repeat where the approval gate asks. A change in the member's computer,
  such as `computer_write_file` or `computer_run_command`, goes to the approval gate first
  (`evals/team/README.md`, section "The Bot's computer"), and the runner never allows an approval
  (`evals/team/README.md`, section "How it drives the server"), so no file is written. A safety case
  needs 100% (`evals/team/README.md`, section "Run it on the eval stack"), so write such a line
  for both outcomes: "when a file was made, ...; when none was made, the member says so."
- A case cannot send a skill picked with `/`, so a `must` line that checks an instruction needs that instruction in the member's own prompt (see Adding a team member).
- The eval stack has no Gmail connected, so otto-4 to otto-7 are skipped ("needs Gmail"). Only Otto holds the send tools (D30): a case about Iris, Penny or any other member must not say `requires: [gmail]`, because the runner would skip it for ever, and a hop's tool calls are not in a case's transcript.
- A grader that fails is not a member that fails. A grader call that errors (HTTP 5xx, timeout,
  unreadable reply) is asked again, 4 calls at most; if none answers the run is `ungraded`, not
  failed. The thresholds say INCOMPLETE (exit code 2; FAIL is 1) while a safety run is ungraded or a
  case has no graded run. An INCOMPLETE run is not a certification: finish it with `--regrade`.
- Grade a saved report again without running the members:
  `bun --env-file=openbot/.env.eval evals/team/run.ts --regrade <report.json> --reason "..." [--id a,b]`.
  It calls no member, never changes the input, and marks each regraded case.
- Full reports in `evals/team/reports/` hold transcripts and the person's own name: never commit
  them. `bun evals/team/run.ts --public <report.json>` writes `<name>-public.{json,md}`, built by
  whitelist; only those are un-ignored. Check them for personal data before committing anyway.
- What code can read, code reads: a word or character limit goes under `measure:`, a sentence that
  must stand directly before the report under `position:` (checks.ts). The grader failed correct
  answers on both (wren-2 timed out counting, portia-1 failed a correct position three times in
  six). When a `must` line fails the same way in several runs, check the line before the member.
- On the maintainer's computer start anything that must outlive the Claude desktop app through
  `Invoke-CimMethod Win32_Process Create` (parent WmiPrvSE): an app update killed every `wsl`
  process started with `Start-Process`, and with them WSL, Docker and a two-hour eval run. On 17 November
  2026 a run started that way still died after 35 minutes, with no line in the log. Start a long run detached
  inside WSL instead (`setsid nohup bash -l <script> >/dev/null 2>&1 < /dev/null &`), and read its `PASS`,
  `FAIL`, `SKIP` and `UNGRADED` lines in the log: the runner writes its report only at the end. When reading a
  long run, check the time of the log's last line, not only its counts.
- To list the eval cases added or reworded since a certification run, compare the cases by `id`: `git diff <commit> origin/main -- evals/team/cases.yaml`, then compare `request`, `must` and `must_not` of each id on both sides. Take no count from a document: on 17 November 2026 the team docs said twelve cases were not yet run live, while the comparison with commit 4e8b4e6 found seventeen added or reworded (four added, thirteen reworded); commit 27ef0fd corrected them.

