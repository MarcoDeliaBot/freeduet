/*
 * render-case.ts: one case, rendered for the subagent simulation (maintainer's decision, 27 November
 * 2026). The member's part, above the GRADER ONLY marker, holds the member's real prompt (the opening
 * line of its agents.yaml row and the fixed report rule), the case's request as the runner sends it,
 * and no grader text. The must and must_not lines and the grader prompt sit below the marker.
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadCases, requestText } from "./checks";
import { GRADER_SYSTEM } from "./grader";
import { messageBotTool } from "./render-case";

const ROOT = resolve(import.meta.dir, "../..");
const MARKER = "## GRADER ONLY";
const REPORT_RULE =
  "Outcome (done, partly done, in progress, blocked, failed or needs you";

async function renderCase(
  id: string,
): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(
    [process.execPath, "evals/team/render-case.ts", "--id", id],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, out, err };
}

describe("render-case: one Iris case for the subagent simulation", () => {
  test("member part has her prompt, the report rule and the expanded request; grader text is below the marker", async () => {
    const cases = await loadCases(join(import.meta.dir, "cases.yaml"));
    const c = cases.find((x) => x.id === "iris-35");
    expect(c).toBeDefined();
    if (!c) return;

    const agents = Bun.YAML.parse(
      await readFile(
        join(ROOT, "openbot/examples/freeduet/agents.yaml"),
        "utf8",
      ),
    ) as { agents: { id: string; system_prompt?: string }[] };
    const iris = agents.agents.find((row) => row.id === "freeduet");
    const opening =
      (iris?.system_prompt ?? "").trim().split("\n")[0]?.trim() ?? "";
    expect(opening.length).toBeGreaterThan(20);

    const { code, out, err } = await renderCase("iris-35");
    expect(err).toBe("");
    expect(code).toBe(0);

    // The member's prompt: its opening line, the shared fixed-report rule, the request as sent.
    expect(out).toContain(opening);
    expect(out).toContain(REPORT_RULE);
    expect(out).toContain(requestText(c.request, c.attachments));
    expect(out).not.toContain("{{");

    // Everything above the marker is the member's view; nothing of the grader is there.
    const at = out.indexOf(MARKER);
    expect(at).toBeGreaterThan(0);
    const above = out.slice(0, at);
    const below = out.slice(at);
    expect(above).toContain(opening);
    expect(above).toContain(requestText(c.request, c.attachments));
    expect(above).not.toContain(GRADER_SYSTEM.slice(0, 60));
    for (const line of [...c.must, ...c.must_not])
      expect(above).not.toContain(line);

    // The grader part: the fixed grader prompt and every must and must_not line of the case.
    expect(below).toContain(GRADER_SYSTEM.slice(0, 60));
    for (const line of [...c.must, ...c.must_not])
      expect(below).toContain(line);
  });

  test("each tool shows its real parameters: message_bot's required names come from the server source", async () => {
    // Read from handoff-tool.ts through messageBotTool(), not written here: a renamed argument fails this test.
    const schema = (await messageBotTool()).inputSchema;
    const required = schema.required ?? [];
    expect(required.length).toBeGreaterThan(0);
    const names = Object.keys(schema.properties ?? {});
    expect(names).toEqual(expect.arrayContaining(required));

    const { code, out, err } = await renderCase("iris-35");
    expect(err).toBe("");
    expect(code).toBe(0);

    const start = out.indexOf("## 2. Tools the member is offered");
    const end = out.indexOf("## 3. The conversation");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const tools = out.slice(start, end);
    expect(tools).toContain("- `message_bot`:");
    for (const name of required)
      expect(tools).toContain(`\`${name}\` (string, required)`);
    for (const name of names) expect(tools).toContain(`\`${name}\``);

    // The TOOL_CALL instruction and the colleague ids of the team file.
    expect(tools).toContain(
      'TOOL_CALL {"name": "<exact tool name>", "args": {...}}',
    );
    const agents = Bun.YAML.parse(
      await readFile(
        join(ROOT, "openbot/examples/freeduet/agents.yaml"),
        "utf8",
      ),
    ) as { agents: { id: string }[] };
    for (const row of agents.agents)
      if (row.id !== "freeduet") expect(tools).toContain(row.id);

    // The schema lines are the member's view: above the marker, none of them below it.
    const at = out.indexOf(MARKER);
    expect(out.split(MARKER).length).toBe(2);
    expect(out.slice(0, at)).toContain("`bot` (string, required)");
    expect(out.slice(at)).not.toContain("TOOL_CALL");
  });
});
