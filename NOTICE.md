# Notices and attributions

## Code we build on

| Project | License | What FreeDuet uses |
|---|---|---|
| [CopilotKit/OpenDuet](https://github.com/CopilotKit/OpenDuet) | MIT, © 2026 CopilotKit | The repository FreeDuet is forked from: the morning brief, triage, tasks, pages, channels and the tenant-package layout. Upstream `skills.yaml` entries are reused unchanged. |
| [CopilotKit/OpenBot](https://github.com/CopilotKit/openbot) (inside `openbot/`) | MIT, © 2026 CopilotKit | Server, app, worker, a computer per agent, the action gateway, approvals, audit, credentials and connectors. |
| [Anil-matcha/open-duet](https://github.com/Anil-matcha/open-duet) | Apache-2.0 | The engine-adapter contract, the limit detection and the fallback rules are ported into `openbot/agent-freeduet/`. Ported files keep the Apache-2.0 license text in that folder, carry a header naming the original file, and state that they were changed. |

## Projects we studied but deliberately did not copy from

| Project | License | Why no code was taken |
|---|---|---|
| [nightly-labs/openbot](https://github.com/nightly-labs/openbot) | PolyForm Noncommercial 1.0.0 (from v0.1.12) | Not compatible with an MIT project that people may use commercially. Ideas such as importing agents from Grok Bot are implemented independently. |
| [browser-use/open-duet](https://github.com/browser-use/open-duet) | No license file | Without a license, the code is all rights reserved. Only the general idea of one-click decision cards informed our design. |

## Software FreeDuet connects to and may ship in member computers

| Project | License | Use |
|---|---|---|
| [ArtCraft apps](https://github.com/storytold) (PhotoCraft, PdfCraft and others) | Apache-2.0; PhotoCraft MIT or Apache-2.0 | Installed unmodified in member computer images and driven through their own CLI or MCP server. Their license and NOTICE files ship with them. |

## Team prompts

All FreeDuet team prompts, test cases and documentation were written from scratch for this project. They do not reproduce third-party prompt collections.

## Trademarks

FreeDuet is an independent project and is not affiliated with, endorsed by or sponsored by Anthropic, OpenAI, Google, xAI, Z.ai, OpenRouter or CopilotKit. Claude, Claude Code and Duet are trademarks of Anthropic. ChatGPT and Codex are trademarks of OpenAI. Gemini is a trademark of Google. Grok is a trademark of xAI. These names are used only to describe compatibility.
