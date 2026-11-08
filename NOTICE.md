# Notices and attributions

## Code we build on

| Project | License | What FreeDuet uses |
|---|---|---|
| [CopilotKit/OpenDuet](https://github.com/CopilotKit/OpenDuet) | MIT, © 2026 CopilotKit | The repository FreeDuet is forked from: the morning brief, triage, tasks, pages, channels and the tenant-package layout. Upstream `skills.yaml` entries are reused unchanged. |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/openbot) (inside `openbot/`) | MIT, © 2026 CopilotKit | Server, app, worker, a computer per agent, the action gateway, approvals, audit, credentials and connectors. |
| [Anil-matcha/open-duet](https://github.com/Anil-matcha/open-duet) | Apache-2.0 | The engine-adapter contract, the limit detection and the fallback rules are ported into `openbot/agent-freeduet/`. Ported files keep the Apache-2.0 license text in that folder, carry a header naming the original file, and state that they were changed. |
| [AI Continuity](https://github.com/MarcoDeliaBot/ai-continuity) | MIT, © 2026 Marco D'Elia | The checkpoint writer behind members' work reports and the handoff between engines (F14, F24), ported into `openbot/agent-freeduet/freeduet/checkpoints.py` with its MIT notice, the original files named and the changes listed. |

## Projects we studied but deliberately did not copy from

| Project | License | Why no code was taken |
|---|---|---|
| [nightly-labs/openbot](https://github.com/nightly-labs/openbot) | PolyForm Noncommercial 1.0.0 (from v0.1.12) | Not compatible with an MIT project that people may use commercially. Ideas such as importing agents from Grok Bot are implemented independently. |
| [browser-use/open-duet](https://github.com/browser-use/open-duet) | No license file | Without a license, the code is all rights reserved. Only the general idea of one-click decision cards informed our design. |

## Software FreeDuet connects to and may ship in member computers

| Project | License | Use |
|---|---|---|
| [ArtCraft apps](https://github.com/storytold) (PhotoCraft, PdfCraft and others) | Apache-2.0; PhotoCraft MIT or Apache-2.0 | Installed unmodified in member computer images and driven through their own CLI or MCP server. Their license and NOTICE files ship with them. |

## Planned reuse (not yet in the code)

| Project | License | Planned use |
|---|---|---|
| [The Agency](https://github.com/msitarzewski/agency-agents) | MIT | Starting profiles for some pack members, adapted, with the source and license named in each member |
| [OpenMausBot](https://github.com/milind-soni/OpenMausBot) | Apache-2.0 | Grok Build CLI driver and team playbook format, ported with attribution |
| [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Apache-2.0, © 2026 Abhishek Barali and contributors | 77 game-development skills and their router, installed unmodified at a pinned commit for Nico, the game developer. Its LICENSE and NOTICE files ship with it. |

## Team prompts

The starter team's prompts, all test cases and the documentation were written from scratch for this project. Pack members adapted from a public library name their source and license in their own description.

## Trademarks

FreeDuet is an independent project and is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google, xAI, Z.ai, OpenRouter or CopilotKit. Claude, Claude Code and Duet are trademarks of Anthropic. ChatGPT and Codex are trademarks of OpenAI. Gemini is a trademark of Google. Grok is a trademark of xAI. These names are used only to describe compatibility.
