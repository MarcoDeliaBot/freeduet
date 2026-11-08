/**
 * FreeDuet's tenant package, its team evals and its engines file, checked together.
 *
 * The real loader runs first, so everything OpenBot already refuses (a skill a member names that the
 * package does not ship, a channel naming an unknown member, a repeated id) fails here too. The rest
 * are FreeDuet's own rules: Iris is the product's own Bot, every member has a channel and closes its
 * prompt with the shared rules, every eval case names a real member, and the engines file keeps
 * metered APIs off with caps of zero. See docs/PROJECT.md and docs/PROVIDERS.md.
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadTenantPackage } from "../src/tenant-package";

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);
const casesFile = fileURLToPath(
  new URL("../../../evals/team/cases.yaml", import.meta.url),
);
const enginesFile = fileURLToPath(
  new URL("../../agent-freeduet/engines.example.yaml", import.meta.url),
);

const SHARED_RULES_START =
  "Shared rules. Reply in the language the person writes in.";

type EvalCase = {
  id: string;
  member: string;
  request: string;
  must?: string[];
  must_not?: string[];
  safety?: boolean;
};

type Engine = { billing: string; enabled: boolean };

describe("FreeDuet tenant package", () => {
  test("loads with OpenBot's own loader and keeps FreeDuet's rules", async () => {
    const tenantPackage = await loadTenantPackage(packageDirectory);
    const memberIds = tenantPackage.agents.map((agent) => agent.id);

    expect(tenantPackage.tenantId).toBe("freeduet");
    expect(tenantPackage.productName).toBe("FreeDuet");
    // The product's own Bot is Iris: the app draws the Bot whose id is tenant.id as the main orb.
    expect(memberIds).toContain(tenantPackage.tenantId);
    expect(
      tenantPackage.agents.find((agent) => agent.id === tenantPackage.tenantId)
        ?.name,
    ).toBe("Iris");
    expect(memberIds.length).toBe(10);

    for (const agent of tenantPackage.agents) {
      const prompt = String(agent.configuration.systemPrompt ?? "");
      expect({
        member: agent.id,
        closesWithSharedRules: prompt.includes(SHARED_RULES_START),
      }).toEqual({
        member: agent.id,
        closesWithSharedRules: true,
      });
      expect({
        member: agent.id,
        hasChannel: tenantPackage.channels.some((channel) =>
          channel.permittedAgents.includes(agent.id),
        ),
      }).toEqual({ member: agent.id, hasChannel: true });
    }
  });
});

describe("FreeDuet team evals", () => {
  test("every case is well formed and names a real member", async () => {
    const tenantPackage = await loadTenantPackage(packageDirectory);
    const memberIds = new Set(tenantPackage.agents.map((agent) => agent.id));
    const { cases } = parse(await readFile(casesFile, "utf8")) as {
      cases: EvalCase[];
    };

    expect(cases.length).toBeGreaterThan(0);
    const ids = cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of cases) {
      expect({
        id: entry.id,
        knownMember: memberIds.has(entry.member),
      }).toEqual({
        id: entry.id,
        knownMember: true,
      });
      expect(entry.request.trim().length).toBeGreaterThan(0);
      expect(
        (entry.must ?? []).length + (entry.must_not ?? []).length,
      ).toBeGreaterThan(0);
    }

    // Every member is tested, and every member has at least one case that tries to make it break a rule.
    for (const member of memberIds) {
      const own = cases.filter((entry) => entry.member === member);
      expect({
        member,
        cases: own.length > 0,
        safety: own.some((entry) => entry.safety === true),
      }).toEqual({
        member,
        cases: true,
        safety: true,
      });
    }
  });
});

describe("FreeDuet engines file", () => {
  test("logins first: metered engines ship off, with caps of zero", async () => {
    const config = parse(await readFile(enginesFile, "utf8")) as {
      engines: Record<string, Engine>;
      metered: { enabled: boolean; daily_cap: number; monthly_cap: number };
      chains: Record<string, string[]>;
      assistants: { chain: string[] };
    };

    expect(config.metered).toMatchObject({
      enabled: false,
      daily_cap: 0,
      monthly_cap: 0,
    });
    for (const [name, engine] of Object.entries(config.engines)) {
      if (engine.billing === "metered") {
        expect({ engine: name, enabled: engine.enabled }).toEqual({
          engine: name,
          enabled: false,
        });
      }
    }

    // Every chain names known engines and starts with a login. A metered engine is never first.
    for (const [member, chain] of Object.entries(config.chains)) {
      for (const name of chain) {
        expect({
          chain: member,
          engine: name,
          known: name in config.engines,
        }).toEqual({
          chain: member,
          engine: name,
          known: true,
        });
      }
      const first = config.engines[chain[0] ?? ""];
      expect({ chain: member, firstBilling: first?.billing }).toEqual({
        chain: member,
        firstBilling: "subscription",
      });
    }

    // Assistants run on free engines only: never a subscription's limits, never a metered API.
    for (const name of config.assistants.chain) {
      expect({ engine: name, billing: config.engines[name]?.billing }).toEqual({
        engine: name,
        billing: "free",
      });
    }
  });
});
