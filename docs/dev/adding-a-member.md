# Adding a team member

Moved out of `CLAUDE.md` so that it is read only when needed. Read it before adding a member to the team or changing a member's prompt, skills or computer.

Mark (id `marketer`) was the first member added after v0.1, Cam (id `video`) the second, Rex (id `trainer`) the third, and Ada (`webdev`), Kai (`gamedev`) and Lumi (`designer`) the fourth to sixth, in one pull request (D148). What a new member touches:

- `openbot/examples/freeduet/agents.yaml`: the entry (copy the shared-rules paragraph from Wren word
  for word, and the "Email." paragraph that stands before it from Penny, D30: only Otto sends email, and
  a test fails if another member's paragraph differs), and the team lists in Iris's and Leo's prompts
  (a test fails if Leo does not name him).
  `channels.yaml`: one channel. Hub grants and each person's conversation are built from the package,
  so nothing else wires him.
- `skills.yaml`: a skill's instructions can only be inline, there is no file reference. The loader
  expands `${NAME}` over the whole file and throws on one that is unset, so a third-party body that
  contains `${` breaks the load. A skill with `tools: []` reaches a run only as a `/` chip the
  person picks in the message box (`channel-chat` puts its text in front of the run); nothing else
  tells the model which skills it holds, so Mark's prompt says how to ask for one. The app loads
  every granted skill with its body for the `/` menu: his 60 add about 0.85 MB (852,457 bytes, measured on 16 November 2026) to that request.
- `evals/team/cases.yaml`: cases for the member, at least one `safety: true`. Pins to move with the
  count: `server/tests/freeduet-package.test.ts` (members), `freeduet-team.test.ts` (hub grants),
  `freeduet-person-language.test.ts` (prompts), and `evals/team/run.test.ts` (cases, safety cases,
  members, team channels, and the list of cases whose `[fixture: ...]` bracket has no `attachments`),
  `openbot/agent-freeduet/tests/test_report.py` and `openbot/scripts/freeduet-clean-start-check.sh`
  (members). Also `docs/TEAM.md`, `README.md`, `docs/CATALOG.md`, `docs/ROADMAP.md`, `docs/COMPARISON.md`
  and `docs/M0_DEMO.md` (case counts), `docs/PROJECT.md` (F20, the packs), `evals/team/README.md`, the
  two issue templates, `NOTICE.md` for third-party text. `site/` has its own copy of the roster.
- New cases are not certified until they run live on the eval stack. A case cannot send a skill picked
  with `/`, so it can only test what the member's own prompt says.
- Every member must hold at least one skill, or `openbot/server/tests/send-new-email-team.test.ts` fails (a skill with `tools: []` is enough). The site build reads the app's `openbot/app/src/freeduet/wide/mascot-drawn.json`: every member the site shows must have a drawing there, and a drawing for a member the site does not show is allowed (`site/tools/build.py`).
- A member that needs tools in his computer (Cam: ffmpeg, git, python3 with venv) gets them in the first
  `apt-get` line of `openbot/agent-computer/Dockerfile`, the image that Compose and the supervisor give
  each Bot (a Bot there runs as root with every capability dropped, `supervisor/src/docker.ts`, and the
  image has no sudo, so installing at run time is not something to rely on). The all-in-one
  `openbot/Dockerfile` is another image, where a Bot may `sudo apt-get`. Label the pull
  request `full-ci`, because `component dockerfiles` and `image` run only on main and on that label.
- A member hands a file to the person with `offer_file` (D38, `server/src/freeduet/member-files.ts`):
  a card with the name, the size and a Download button (`app/src/freeduet/member-file-card.tsx`) that
  fetches `GET /api/computers/:botId/files/download` as the signed-in person when it is pressed. The
  tool looks at the file through `computerGateway.downloadFile`, so the deployment's policy, the
  computer's confinement and its 100 MiB limit decide, and it moves no bytes. Chat attachments are
  still pictures and text, person to member only (`shared/attachments.ts`). A public member's computer
  is shared by everyone who can sign in, so any of them can press the button (`computer-access.ts`).
- `computer_run_command` has no timeout parameter and stops a command after about two minutes (and then
  kills its whole process group, `agent-computer/src/shell.ts`); every call goes through the approval
  gate. A member who renders starts long jobs in the background with the output sent to a file: a job
  that keeps the command's output open holds the command until the two minutes are over.
- An outside tool with split licences (Lemo-Opuscar: code MIT, every `*.md` CC BY-NC): wire it only as an
  optional tool the person installs, and write the skill text yourself; never copy or paraphrase its docs.

