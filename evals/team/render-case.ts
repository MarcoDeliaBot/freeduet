/*
 * One case, rendered for the subagent simulation (maintainer's decision, 27 November 2026).
 *
 *   bun evals/team/render-case.ts --id iris-35            prints the case to stdout
 *   bun evals/team/render-case.ts --id iris-35,ada-1 --out <dir>   writes <dir>/<id>.md
 *
 * The part above the line "## GRADER ONLY" is what the member sees: its full system text (from
 * render_prompt.py, which runs agent-freeduet's own transcript.render for a normal turn on the real
 * agents.yaml), its tools, and the request as the live runner sends it. The part below it is for the
 * grader: the must and must_not lines and the grader prompt of grader.ts. The member never sees it.
 *
 * It needs no eval stack and no model: the simulation runs under Claude Code subagents, and what the
 * live runner adds from a running server (the person's memory, the channel's rows, the tools the server
 * grants) is listed as left out in the file, not guessed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Attachment, type Case, loadCases, requestText } from "./checks";
import { renderDates } from "./dates";
import { GRADER_SYSTEM } from "./grader";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../..");
const CASES = join(HERE, "cases.yaml");
const PYTHON_RENDER = join(HERE, "render_prompt.py");
export const GRADER_MARKER = "## GRADER ONLY";

type Rendered = {
  system: string;
  tools: { name: string; description: string }[];
  toolsNote: string;
};

async function memberPart(member: string, request: string): Promise<Rendered> {
  const proc = Bun.spawn(["python3", "-I", PYTHON_RENDER], {
    cwd: ROOT,
    stdin: new Blob([JSON.stringify({ member, request })]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0)
    throw new Error(`render_prompt.py failed (exit ${code}): ${err.trim()}`);
  return JSON.parse(out) as Rendered;
}

function fence(text: string): string {
  return `\`\`\`\`\n${text}\n\`\`\`\``;
}

function attachmentBlock(a: Attachment): string {
  return `### ${a.name} (${a.mimeType})\n${fence(a.text)}`;
}

export async function renderOne(c: Case, today: Date): Promise<string> {
  const request = renderDates(c.request, today, `${c.id}: request`);
  const earlier = c.previous.map((turn) =>
    renderDates(turn.request, today, `${c.id}: earlier turn`),
  );
  const member = await memberPart(c.member, request);
  const lines: string[] = [];

  lines.push(
    `# Case ${c.id} (member ${c.member}${c.safety ? ", safety case" : ""})`,
    "",
  );
  lines.push(
    "Rendered by evals/team/render-case.ts for the subagent simulation. Everything above the GRADER ONLY line is",
    "what the member sees. Do not give the member the part below that line.",
    "",
  );

  lines.push("## 1. Instructions of the member", "");
  lines.push(
    "The full system text agent-freeduet builds for a normal turn: the member's row of",
    "openbot/examples/freeduet/agents.yaml, then the notes of the run (tool_notes, person language and tone),",
    "then the runtime note, as transcript.render joins them (render_prompt.py).",
    "",
    fence(member.system),
    "",
  );

  lines.push("## 2. Tools the member is offered", "");
  if (member.tools.length === 0)
    lines.push("None that the freeduet server serves itself.", "");
  for (const tool of member.tools)
    lines.push(`- \`${tool.name}\`: ${tool.description}`);
  lines.push("", member.toolsNote, "");

  lines.push("## 3. The conversation", "");
  if (earlier.length > 0) {
    lines.push("Earlier turns, sent first in the same conversation:", "");
    c.previous.forEach((turn, i) => {
      lines.push(
        `${i + 1}. ${renderDates(requestText(turn.request, turn.attachments), today, c.id)}`,
      );
    });
    lines.push("");
  }
  lines.push(
    "The request, as the live runner sends it:",
    "",
    fence(requestText(c.request, c.attachments)),
    "",
  );
  if (c.attachments.length > 0) {
    lines.push(
      "Files attached to the request (the member receives their text):",
      "",
    );
    lines.push(...c.attachments.map(attachmentBlock), "");
  }

  lines.push(GRADER_MARKER, "");
  lines.push(
    "Only for the grader subagent. The member never sees this part.",
    "",
    "### Grader instructions (evals/team/grader.ts, GRADER_SYSTEM)",
    "",
    fence(GRADER_SYSTEM),
    "",
    "### must (each one has to hold)",
    "",
    ...c.must.map((line, i) => `${i + 1}. ${line}`),
    "",
    "### must_not (none may have happened)",
    "",
    ...c.must_not.map((line, i) => `${i + 1}. ${line}`),
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      id: { type: "string" },
      out: { type: "string" },
    },
  });
  const ids = (values.id ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0)
    throw new Error(
      "usage: bun evals/team/render-case.ts --id <case>[,<case>...] [--out <dir>]",
    );

  const today = new Date();
  const cases = await loadCases(CASES, { today });
  const byId = new Map(cases.map((c) => [c.id, c]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length)
    throw new Error(`no such case in cases.yaml: ${missing.join(", ")}`);

  const docs: { id: string; text: string }[] = [];
  for (const id of ids) {
    const c = byId.get(id) as Case;
    docs.push({ id, text: await renderOne(c, today) });
  }

  if (values.out) {
    await mkdir(values.out, { recursive: true });
    for (const doc of docs) {
      const path = join(resolve(values.out), `${doc.id}.md`);
      await writeFile(path, doc.text, "utf8");
      console.log(path);
    }
  } else {
    console.log(docs.map((doc) => doc.text).join("\n\n---\n\n"));
  }
}

if (import.meta.main) {
  await main();
}
