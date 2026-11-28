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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { handoffTool } from "../../openbot/server/src/agents/handoff-tool";
import { type Attachment, type Case, loadCases, requestText } from "./checks";
import { renderDates } from "./dates";
import { GRADER_SYSTEM } from "./grader";

const HERE = import.meta.dir;
const ROOT = resolve(HERE, "../..");
const CASES = join(HERE, "cases.yaml");
const AGENTS = join(ROOT, "openbot/examples/freeduet/agents.yaml");
const SERVER_AGENTS_DIR = join(ROOT, "openbot/server/src/agents");
const PYTHON_RENDER = join(HERE, "render_prompt.py");
const IRIS = "freeduet";
export const GRADER_MARKER = "## GRADER ONLY";

/** One JSON Schema property, as zod and iris_tools.py write it (only the keys this file shows). */
type JsonProp = {
  type?: string;
  description?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  default?: unknown;
};
export type JsonSchema = {
  properties?: Record<string, JsonProp>;
  required?: string[];
  additionalProperties?: boolean;
};
export type ToolShape = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

type Rendered = {
  system: string;
  tools: ToolShape[];
  toolsNote: string;
};

/**
 * message_bot as the server defines it: its description and its parameters, from the same handoff-tool.ts
 * the server imports. The tool object is built with a desk that is never called (the description and the
 * schema are fixed at construction), and its zod parameters become JSON Schema with the server's own zod.
 */
export async function messageBotTool(): Promise<{
  description: string;
  inputSchema: JsonSchema;
}> {
  const tool = handoffTool({
    desk: {} as never,
    from: { depth: 0 } as never,
    hasSomebodyToAsk: true,
    maxDepth: 1,
    maxPerRun: 1,
  });
  if (!tool)
    throw new Error("handoffTool returned no tool for a run with depth 1");
  const { z } = await import(Bun.resolveSync("zod", SERVER_AGENTS_DIR));
  return {
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.parameters) as JsonSchema,
  };
}

/** The colleagues from the team file, as `Name (id)`: message_bot's `bot` takes the name, the lesson tools' `member` the id. */
async function colleagueIds(): Promise<string[]> {
  const agents = Bun.YAML.parse(await readFile(AGENTS, "utf8")) as {
    agents: { id: string; name?: string }[];
  };
  return agents.agents
    .filter((row) => row.id !== IRIS)
    .map((row) => (row.name ? `${row.name} (${row.id})` : row.id));
}

async function memberPart(member: string, request: string): Promise<Rendered> {
  const handoff = await messageBotTool();
  const proc = Bun.spawn(["python3", "-I", PYTHON_RENDER], {
    cwd: ROOT,
    stdin: new Blob([JSON.stringify({ member, request, handoff })]),
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

/** One indented line per argument: its name, type, required or optional, limits, enum values and description. */
export function argumentLines(schema: JsonSchema): string[] {
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  const names = Object.keys(properties);
  if (names.length === 0) return ["  Arguments: none."];
  const lines = names.map((name) => {
    const prop = properties[name] as JsonProp;
    const facts = [
      prop.type ?? "value",
      required.has(name) ? "required" : "optional",
    ];
    if (prop.enum)
      facts.push(
        `one of ${prop.enum.map((v) => JSON.stringify(v)).join(", ")}`,
      );
    if (prop.minimum !== undefined) facts.push(`minimum ${prop.minimum}`);
    if (prop.maximum !== undefined) facts.push(`maximum ${prop.maximum}`);
    if (prop.maxLength !== undefined)
      facts.push(`at most ${prop.maxLength} characters`);
    if (prop.default !== undefined)
      facts.push(`default ${JSON.stringify(prop.default)}`);
    const said = prop.description ? `: ${prop.description}` : "";
    return `  - \`${name}\` (${facts.join(", ")})${said}`;
  });
  if (schema.additionalProperties === false)
    lines.push("  No other argument names are accepted.");
  return lines;
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
  for (const tool of member.tools) {
    lines.push(`- \`${tool.name}\`: ${tool.description}`);
    lines.push(...argumentLines(tool.inputSchema));
  }
  if (member.tools.length > 0) {
    const ids = (await colleagueIds()).join(", ");
    lines.push(
      "",
      `To call a tool, write one line \`TOOL_CALL {"name": "<exact tool name>", "args": {...}}\`, using exactly the argument names listed above. For message_bot's \`bot\`, write the colleague's name as the roster gives it (for example Kai); for the lesson tools' \`member\`, the id. The colleagues, as Name (id): ${ids}.`,
    );
  }
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
