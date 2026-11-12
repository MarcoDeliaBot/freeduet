import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { GrantedTool } from "@openbot/toolkit/granted-tool";
import { parse } from "yaml";
import { z } from "zod";
import { classifyTool, catalogueEntry } from "../src/plugins/catalogue";
import {
  checkInInitiator,
  createReadOnlyClassifier,
  guardProactiveCallback,
  proactiveInitiator,
  restrictToolsForRun,
} from "../src/proactive/restriction";
import { loadTenantPackage } from "../src/tenant-package";

/**
 * Who on the team can write a new email, and what the two members that touch the request are told.
 *
 * What a Bot may call is its grants, and the run-time offer is always the intersection of the grants
 * and the tools its skills declare (tenant-package.ts). The package ships the second half: the skill
 * that carries `gmail_send_message` and the members it is attached to. The first half, the
 * `gmail_send_message` grant, is an administrator's to give on a deployment and is never seeded.
 * Only Otto's skills carry the tool, so Iris, Penny and every other member are not offered it even
 * if an administrator has granted a Gmail connection's tools to them.
 */

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);
const agentsFile = `${packageDirectory}/agents.yaml`;

const NEW_EMAIL_REFS = [
  "google-workspace/gmail_send_message",
  "google-imap/gmail_send_message",
];

type Row = { id: string; name: string; system_prompt: string };

async function rows(): Promise<Row[]> {
  const { agents } = parse(await readFile(agentsFile, "utf8")) as {
    agents: Row[];
  };
  return agents;
}

async function load() {
  const previous = process.env.MANAGED_AGENT_AG_UI_URL;
  process.env.MANAGED_AGENT_AG_UI_URL = "http://localhost:4230/";
  try {
    return await loadTenantPackage(packageDirectory);
  } finally {
    if (previous === undefined) delete process.env.MANAGED_AGENT_AG_UI_URL;
    else process.env.MANAGED_AGENT_AG_UI_URL = previous;
  }
}

/** Every tool ref the skills a member is given declare: what its grants are narrowed to. */
async function toolsOf(memberId: string): Promise<Set<string>> {
  const tenantPackage = await load();
  const member = tenantPackage.agents.find((agent) => agent.id === memberId);
  if (!member) throw new Error(`no member ${memberId}`);
  return new Set(
    tenantPackage.skills
      .filter((skill) => member.skills.includes(skill.slug))
      .flatMap((skill) => skill.tools),
  );
}

describe("the skill that carries the new-email tool", () => {
  test("names the tool on both Gmail connections, and nothing else", async () => {
    const tenantPackage = await load();
    const skill = tenantPackage.skills.find(
      (candidate) => candidate.slug === "send-a-new-email",
    );
    expect(skill?.tools).toEqual(NEW_EMAIL_REFS);
  });

  test("is attached to Otto and to no other member", async () => {
    const tenantPackage = await load();
    const holders = tenantPackage.agents
      .filter((agent) => agent.skills.includes("send-a-new-email"))
      .map((agent) => agent.id);
    expect(holders).toEqual(["inbox"]);
  });
});

describe("what each member is offered", () => {
  test("Otto has the new-email tool and still has the reply tool", async () => {
    const otto = await toolsOf("inbox");
    for (const ref of NEW_EMAIL_REFS) expect(otto.has(ref)).toBe(true);
    expect(otto.has("google-workspace/gmail_send_reply")).toBe(true);
    expect(otto.has("google-imap/gmail_send_reply")).toBe(true);
  });

  test("Iris, Penny and every other member are not offered it", async () => {
    const tenantPackage = await load();
    for (const agent of tenantPackage.agents) {
      if (agent.id === "inbox") continue;
      const offered = await toolsOf(agent.id);
      for (const ref of NEW_EMAIL_REFS) {
        expect({ member: agent.id, ref, offered: offered.has(ref) }).toEqual({
          member: agent.id,
          ref,
          offered: false,
        });
      }
    }
    // Iris and Penny stay as they were: reads, and no send of any kind.
    for (const id of ["freeduet", "bookkeeper"]) {
      const offered = await toolsOf(id);
      expect([...offered].filter((ref) => /gmail_send/.test(ref))).toEqual([]);
    }
  });

  test("every member has skills, so the narrowing is on for all of them", async () => {
    const tenantPackage = await load();
    for (const agent of tenantPackage.agents) {
      expect({ member: agent.id, hasSkills: agent.skills.length > 0 }).toEqual({
        member: agent.id,
        hasSkills: true,
      });
    }
  });
});

describe("what Otto and Iris are told", () => {
  test("Otto sends a new email with gmail_send_message, an answer with gmail_send_reply, and never changes an address", async () => {
    const otto = (await rows()).find((row) => row.id === "inbox");
    const prompt = otto?.system_prompt.replace(/\s+/g, " ") ?? "";
    expect(prompt).toContain("gmail_send_reply");
    expect(prompt).toContain("gmail_send_message");
    expect(prompt).toContain("exactly as the person wrote it");
    expect(prompt).toContain("never invent, correct or complete one");
    expect(prompt).toContain("ask them which one they mean");
    expect(prompt).toContain("say so in one plain sentence");
    expect(prompt).toContain(
      "that it was sent, to whom, its subject and the text",
    );
  });

  test("Iris hands an email request to Otto with the address as written, and has no send tool of her own", async () => {
    const iris = (await rows()).find((row) => row.id === "freeduet");
    const prompt = iris?.system_prompt.replace(/\s+/g, " ") ?? "";
    expect(prompt).toContain(
      "A request to send an email to an address goes to Otto as it is, with the address exactly as the person wrote it.",
    );
    expect(prompt).not.toContain("gmail_send_message");
    expect(prompt).not.toContain("gmail_send_reply");
  });

  test("Penny is not told about the tool", async () => {
    const penny = (await rows()).find((row) => row.id === "bookkeeper");
    expect(penny?.system_prompt).not.toContain("gmail_send_message");
  });
});

/*
 * Background runs never write. A check-in only offers, and research only reads, by the catalogue's own
 * classification, so the new tool (a write on both connections, whatever a vendor recorded for it) is
 * never offered to either and is refused if a callback names it.
 */
describe("a check-in or a background research run", () => {
  const refs = ["google-workspace", "google-imap"].flatMap((key) =>
    ["gmail_search_messages", "gmail_send_reply", "gmail_send_message"].map(
      (name) => ({ key, name, ref: `${key}/${name}` }),
    ),
  );
  const catalogue = createReadOnlyClassifier({
    listServers: async () =>
      ["google-workspace", "google-imap"].map((key) => ({
        id: key,
        title: key,
        tools: refs
          .filter((entry) => entry.key === key)
          .map((entry) => ({
            ref: entry.ref,
            // Even a vendor that recorded every tool as a read cannot make a send one.
            effect: classifyTool(catalogueEntry(key), entry.name, true, "read"),
            destructive: false,
          })),
      })),
  });
  const granted = (name: string, ref: string): GrantedTool => ({
    name,
    ref,
    description: ref,
    parameters: z.object({}),
    execute: async () => `${ref} ran`,
  });
  const load = async () =>
    refs.map((entry) => granted(`mcp__${entry.key}__${entry.name}`, entry.ref));

  test("research is offered the reads and not the new-email tool", async () => {
    const offered = (
      await restrictToolsForRun(proactiveInitiator("r"), load, catalogue)()
    ).map((tool) => tool.ref);
    expect(offered).toEqual([
      "google-workspace/gmail_search_messages",
      "google-imap/gmail_search_messages",
    ]);
  });

  test("a check-in is offered neither of the sends", async () => {
    const offered = (
      await restrictToolsForRun(checkInInitiator("c"), load, catalogue)()
    ).map((tool) => tool.ref);
    expect(offered).toEqual([]);
  });

  test("a callback that names the tool is refused for either kind of run", async () => {
    for (const initiator of [proactiveInitiator("r"), checkInInitiator("c")]) {
      for (const key of ["google-workspace", "google-imap"]) {
        const refusal = await guardProactiveCallback(
          { name: `${key}/gmail_send_message`, run: { initiator } },
          catalogue,
        );
        expect(refusal?.text).toStartWith("Refused.");
      }
    }
  });
});
