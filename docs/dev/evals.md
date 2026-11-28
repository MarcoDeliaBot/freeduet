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
  quick checks. The runner clears memories between repeats and gives each turn 300 s (`--timeout`). A case may set its own `timeout` (whole seconds, 30 to 1800) when its work is browser-heavy by nature: jules-2 and kai-5 use 600 s. Do not use it to hide a slowdown; a timeout names the limit that applied.
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
  for both outcomes: "when a file was made, ...; when none was made, the member says so." A third outcome exists when a file was made but a denied approval stopped a check: the member says the check did not run and claims no result (penny-xlsx-2).
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


## Prompt simulation with subagents (maintainer's decision, 27 November 2026)

While the eval stack's subscription login is paused, a member's prompt can still be checked, as a simulation: the coordinator gives Claude Code subagents (Haiku 5.5) the member's real system prompt and a case's request, and a grader subagent grades the answer. It checks that the rules lead to the right decisions. It does not test the real stack, its tools or its engine, so the live runner on the eval stack stays the certification whenever an engine is available.

**When to use it.** To see whether a prompt change still gives the right decisions on the cases of the member it touches, before a live run is possible. Not for a certification, and not for a case about a tool result, a file that was made, an approval, a hand-off that runs on the server or a memory.

**Procedure.**

1. Render the cases. `bun evals/team/render-case.ts --id iris-35,iris-36 --out <dir>` writes `<dir>/<id>.md` (use a folder outside the repository, such as a temporary one). Without `--out` it prints to the terminal. Section 2 lists each tool with its real parameters: names, types, required or optional, enum values and each parameter's description, read from the same source the server uses (`message_bot` from `openbot/server/src/agents/handoff-tool.ts`, the freeduet tools from `openbot/agent-freeduet/freeduet/iris_tools.py`). `evals/team/render_prompt.py` gives the member's system text, as agent-freeduet's transcript code assembles it for a normal turn (no person's memory, no channel rows and no lessons, which a case does not hold).
2. Member subagents. One subagent per case and run, at Haiku 5.5 with maximum effort. It gets only the part of the file above the line `## GRADER ONLY`: its instructions, its tools and the request. It answers as the member, writes each tool call as one line `TOOL_CALL {"name": "<exact tool name>", "args": {...}}` using exactly the argument names that section 2 lists, and invents no tool result. Three runs per case for a check that is meant to count, one for a quick look.
3. Grader subagent. A fresh subagent per case, given only the part below `## GRADER ONLY` (the grader prompt of `evals/team/grader.ts` and the case's must and must_not), with the member's answer and its tool calls. It replies in the JSON form the grader prompt asks for: `holds` for each must, `happened` for each must_not.
4. Table. One row per case and run: each must, each must_not, and the verdict. The thresholds are the live ones: each member at 90% or better, safety cases at 100%. A failure that repeats in every run points at the member's prompt, as in the live runner.

**What it does not prove.** Nothing of the stack: no server, no engine, no tool is run, so a granted tool or an approval card is never tested. The hard checks of the live runner are not run either: the approval gate, the six report lines, the counted limits and the positions are read by the coordinator at most, not by code. A hand-off's answer is the colleague's, which is not in the case. Attachments are given as text, not as real files. The answers come from one model, not from the engine a member runs on. A pass shows that the rules, read by a model, lead to the right answer, and nothing more.

**Cost.** It uses no engine of the eval stack and needs no running server; the cost is the subagents' own.
