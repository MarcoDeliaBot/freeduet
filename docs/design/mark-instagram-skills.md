# Mark's Instagram skills

Status: built in the pull request of branch `mark-instagram-skills` (16 November 2026). Not run live.
Member: Mark, the marketer (`marketer`). Source: `Jakeschincariol/instagram-agent-skill`, commit `d03c56bb598be770c60b201f94237e5d1a4268a6`, MIT (NOTICE.md).

## What the person sees

Four new `/` chips in Mark's menu: `/ig-carousel`, `/ig-story`, `/ig-reply` and `/ig-dm`. Picking one puts its text in front of the run, as for `/landing-page-design`. Mark answers in text: the cover and slide copy of a carousel, a story sequence with the sticker of each frame, a reply for each kind of comment, or a direct message with its follow-ups. Nothing is posted, sent or uploaded by these skills, which each hold no tool (`tools: []`). Mark's entry in `openbot/examples/freeduet/agents.yaml` lists no tool. His prompt says he never posts or sends himself: that goes through a connected tool that the approval gate shows the person, and when none is connected he says so.

## Rules

- Text only: `tools: []`, granted to Mark only (`openbot/examples/freeduet/agents.yaml`, his skill list).
- Each body is the upstream `SKILL.md` from its first heading to its last line, word for word. The package test pins each one by length and SHA-256 (`openbot/server/tests/freeduet-package.test.ts`, `INSTAGRAM_SKILLS`).
- No body contains `${`, the loader's placeholder start.
- The summary is one line of 112 characters or fewer, cut from the upstream description. The "Use when" lists of the front matter are not carried: a `/` chip has no automatic matching.
- Mark holds 60 skills (56 before). The count is pinned in the package test and stated in `docs/TEAM.md`; CLAUDE.md gives the bytes his skill bodies add (852,457).

## What is not built

- Posting, scheduling, sending direct messages, Instagram's API, automation, and scraping of comments. The bodies forbid them, and FreeDuet adds none.
- The nine other skills of the upstream repository, its `templates/` folder, and its scripts and data files.
- An eval case. A case cannot send a `/` chip, so it could test only Mark's prompt. Nothing about the four is certified by a live run.
- Any change to Mark's prompt.

The bodies refer to four things we do not carry. They are left as written, because the body must stay word for word. Lines are in `openbot/examples/freeduet/skills.yaml`:

- `/ig-reel`: lines 18435, 18557, 18647.
- `/ig-caption` and its "Job B": lines 18490, 18508.
- `/ig-human`: lines 18493, 18809.
- "a brand skill": line 18483.

## Built so far

- Four entries after `landing-page-design` in `openbot/examples/freeduet/skills.yaml` (lines 18414, 18514, 18607, 18699).
- Mark's grant in `openbot/examples/freeduet/agents.yaml`.
- Pins in `openbot/server/tests/freeduet-package.test.ts`: the count 56 to 60, the exact list, and one test that pins each body.
- A row in NOTICE.md, one line in CHANGELOG.md, and the counts in `docs/TEAM.md` and CLAUDE.md.

## Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
| --- | --- | --- | --- |
| The references to skills we do not carry (`/ig-reel`, `/ig-caption`, `/ig-human`) | (a) keep the words as upstream wrote them; (b) carry those three the same way, in a separate pull request; (c) reword the sentences | (b) | Under (a) the person is sent to a chip Mark does not hold. (c) ends the word-for-word pin |
| Summary length | (a) one line of 112 characters or fewer, cut from the description, as now; (b) the whole description, 290 characters or more | (a) | Every other skill Mark holds has a one-line summary, and the test checks it for the 53 marketing skills. The "Use when" lists mean nothing in a chip. (b) relaxes the rule for four skills |
| `social` already covers carousels and Instagram posts | (a) keep both; (b) fold the four into `social` | (a) | `social` plans posts for five channels. The four are narrower and carry the upstream text |
| Mark's prompt does not name the four | (a) leave it; (b) add them to his example list, with an eval case | (a) now; (b) with the first live run | The prompt is unchanged in this change, and a case can only be certified live |
