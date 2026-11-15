import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/**
 * "Three steps at most" (docs/ROADMAP.md): when an app has to be connected, Iris and Otto answer with
 * one line and the card's button, no list and no technical names, and a password is never asked for
 * in the chat. These are what the prompts say; they are not certified until the team evals run live.
 */
const file = fileURLToPath(
  new URL("../../examples/freeduet/agents.yaml", import.meta.url),
);

async function prompt(id: string) {
  const { agents } = parse(await readFile(file, "utf8")) as {
    agents: { id: string; system_prompt: string }[];
  };
  const found = agents.find((agent) => agent.id === id);
  if (!found) throw new Error(`no member ${id}`);
  return String(found.system_prompt).replace(/\s+/g, " ");
}

describe("connecting an app from the chat", () => {
  test("Iris answers with one line and the card naming the member, and never takes a password", async () => {
    const iris = await prompt("freeduet");
    expect(iris).toContain(
      "answer with one short line and call show_app_access",
    );
    expect(iris).toContain("whose id is inbox");
    expect(iris).toContain("no list of steps and no technical names");
    expect(iris).toContain("never ask for a password or a key in the chat");
  });

  test("Otto answers with one line and the card, not the old list of places", async () => {
    const otto = await prompt("inbox");
    expect(otto).toContain("call show_app_access for it");
    expect(otto).toContain("never ask for a password in the chat");
    expect(otto).not.toContain(
      "on the Gmail page, or connect Gmail on the Connections page",
    );
  });
});
