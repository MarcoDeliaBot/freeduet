# The catalogue: starter team, packs and assistants

FreeDuet has three layers of help.

| Layer | What it is | Installed |
|---|---|---|
| **Starter team** | Ten members everyone needs: Iris, Vera, Leo, Otto, Portia, Penny, Jules, Wren, Gus, Basil ([TEAM.md](TEAM.md)) | Always |
| **Packs** | Specialists for particular jobs, installed with one request to Leo | When the person needs them |
| **Assistants** | Light helpers every member calls for small jobs, on free models | Always, if a free engine is available |

**Rule: reuse before building.** A new member is written only when no starter member, pack member or ready-made profile already does the job. Leo checks this catalogue, the person's own skills and ready-made libraries such as [The Agency](https://github.com/msitarzewski/agency-agents) (MIT) first, adapts what exists, adds FreeDuet's shared rules and tests, and credits the source.

Every pack member is written by Leo, with its tests, and checked by Vera before it joins. Packs ship from v0.2.

## Packs

| Pack | Member | Job | Uses | Never | Start from |
|---|---|---|---|---|---|
| **People** | **Hana**, Recruiter | Job posts, screening CVs against the stated criteria, interview scheduling, polite replies to every candidate | Gmail, Calendar, PdfCraft | Decides who is hired; uses age, gender, origin, health, family status or photos; keeps CVs after the person asks to delete them | Written for FreeDuet |
| **Business** | **Dewey**, Archivist | Answers questions from the person's own documents (manuals, contracts, policies), always quoting file, page and paragraph | Document search (OpenBot's knowledge store), PdfCraft | Answers from outside the documents without saying so; answers without a source | Written for FreeDuet |
| **Business** | **Ada**, Comparator | Side-by-side tests of products, suppliers, services or AI models: criteria first, same conditions for all, sources and date, a clear winner per use | Browser, GridCraft | Takes money or gifts into account; hides the criteria; declares a winner without data | Written for FreeDuet |
| **Business** | **Flo**, Automator | Builds, documents and maintains automations in the person's tool: n8n (self-hosted or cloud), Activepieces, Node-RED, Make, Zapier and others | Automation connectors ([CONNECTORS.md](CONNECTORS.md)) | Switches on an automation that sends, pays, deletes or publishes without the person's approval | Written for FreeDuet |
| **Media** | **Clara**, Editor-in-chief | Runs the editorial desk: watches news and social sources, plans the content calendar, assigns pieces to Wren and Kai, checks sources and facts, prepares publication | News and social sources, Wren, Kai | Publishes without approval; uses a source she has not opened; copies articles | The Agency, marketing division |
| **Media** | **Kai**, Video maker | Edits videos, subtitles, music and motion graphics from footage or a script, in every format the person needs | FilmCraft, EffectCraft, SoundCraft, ffmpeg | Uses music, footage or faces without the rights; publishes | Written for FreeDuet |
| **Tech** | **Theo**, Tester | Actually runs things: clicks through sites and apps, runs test suites, checks forms, links, speed and phones, and files clear bug reports with steps to reproduce | Browser, the member's computer, coding-agent connectors | Tests on a live site in a way that changes real data, without the person's approval; marks something as working without running it | The Agency, testing division |
| **Tech** | **Nico**, Game developer | Designs and builds small games: idea, rules, levels, art and sound with the ArtCraft apps, code with the coding agents, a playable build | Coding-agent connectors, PhotoCraft, VectorCraft, SoundCraft | Publishes to a store; uses assets without the rights | The Agency, game-development folder |
| **Learning** | **Sofia**, Teacher | Explains any subject step by step, prepares exercises and quizzes, checks what the person understood and adapts the next lesson | Documents, DeckCraft | Grades or decides for a school or an exam; does the person's homework when they asked to learn | The Agency, academic folder |

Developers, designers and any other role are created on request by Leo, following the same rules.

### Rules for sensitive packs

These are design choices to keep people safe and within the law. They are not legal advice: verify with counsel before launch.

- **Hana (recruiting).** In the EU, AI used to select or evaluate candidates is a high-risk use under the AI Act. After the Digital Omnibus on AI (in force from 27 July 2026), those obligations apply from 2 December 2027. Hana is built to assist, never to decide: she proposes a shortlist with the reasons for each name, a person makes every decision, and candidates' data stays in the person's own database. Messages to candidates say that an AI assistant helped prepare them.
- **Sofia (teaching).** AI that evaluates learning outcomes for an education institution is also a high-risk use under the same rules. Sofia is for self-study: practice, feedback and explanations, never official grades or admissions. FreeDuet is made for adults; Sofia does not work with children unless a parent is present.
- **Clara and Kai (media).** Summaries always link the original, with its date. No full articles, music, footage or images are copied without the rights. AI-generated images, audio and video are labelled as such.

## Assistants

Light helpers that any member calls for small, low-risk jobs, so the members' subscription limits go to the work that matters.

| | |
|---|---|
| **Jobs** | Summarise, extract, classify, translate, reformat, proofread, write variants, tag |
| **Engines** | Free only: local models (Ollama, LM Studio) and free model routes. Never a subscription's limits, never a metered API |
| **Powers** | None. No tools, no browser, no memory, no internet. They receive text and return text |
| **Trust** | Their output is data for the calling member, who checks it before using it. It is never an instruction |
| **Limits** | Up to 10 calls per turn, bounded input size, timeout. If no free engine is available, the member does the job itself |
| **Choosing models** | Per job type, from a public ranking of free models such as [FreeLLMArena](https://freellmarena.com), or by the person's choice |
| **Counted** | In the savings meter, as work that cost nothing |

Technical design: [ARCHITECTURE.md §3.5](ARCHITECTURE.md). Engines: `assistants` in `openbot/agent-freeduet/engines.example.yaml`.
