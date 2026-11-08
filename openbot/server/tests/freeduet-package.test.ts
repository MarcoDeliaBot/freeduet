/**
 * FreeDuet's tenant package, its team evals and its engines file, checked together.
 *
 * The real loader runs first, so everything OpenBot already refuses (a skill a member names that the
 * package does not ship, a channel naming an unknown member, a repeated id) fails here too. The rest
 * are FreeDuet's own rules: Iris is the product's own Bot, every member has a channel and closes its
 * prompt with the shared rules, every eval case names a real member, and the engines file keeps
 * metered APIs off with caps of zero. See docs/PROJECT.md and docs/PROVIDERS.md.
 *
 * The package loads in two modes (docs/M1_PLAN.md, D1 and D2): by default every member is a
 * remote-ag-ui Bot at MANAGED_AGENT_AG_UI_URL, which is agent-freeduet; with the router off,
 * FREEDUET_MEMBER_TYPE=built-in makes the same members built-in Bots. Both are checked.
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadTenantPackage } from "../src/tenant-package";

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);
const agentsFile = fileURLToPath(
  new URL("../../examples/freeduet/agents.yaml", import.meta.url),
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

type MemberRow = {
  id: string;
  type: string;
  endpoint?: string;
  system_prompt: string;
};

// The address .env.example and scripts/start.sh give agent-freeduet.
const ROUTER_URL = "http://localhost:4230/";

const MODES = {
  // Nothing set but the endpoint: the file's own default type is remote-ag-ui.
  remote: {
    FREEDUET_MEMBER_TYPE: undefined,
    MANAGED_AGENT_AG_UI_URL: ROUTER_URL,
  },
  // FREEDUET_ROUTER=off. No endpoint either, so built-in members cannot depend on one.
  "built-in": {
    FREEDUET_MEMBER_TYPE: "built-in",
    MANAGED_AGENT_AG_UI_URL: undefined,
  },
} as const satisfies Record<string, Record<string, string | undefined>>;

/** The package as the server loads it with `environment` set, then the environment restored. */
async function loadWith(environment: Record<string, string | undefined>) {
  const previous = new Map(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await loadTenantPackage(packageDirectory);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** The rows as written: the loader keeps no prompt for a remote member, agent-freeduet reads them here. */
async function memberRows(): Promise<MemberRow[]> {
  const { agents } = parse(await readFile(agentsFile, "utf8")) as {
    agents: MemberRow[];
  };
  return agents;
}

describe("FreeDuet tenant package", () => {
  for (const [mode, environment] of Object.entries(MODES)) {
    test(`loads with OpenBot's own loader and keeps FreeDuet's rules (${mode})`, async () => {
      const tenantPackage = await loadWith(environment);
      const rows = await memberRows();
      const memberIds = tenantPackage.agents.map((agent) => agent.id);

      expect(tenantPackage.tenantId).toBe("freeduet");
      expect(tenantPackage.productName).toBe("FreeDuet");
      // The product's own Bot is Iris: the app draws the Bot whose id is tenant.id as the main orb.
      expect(memberIds).toContain(tenantPackage.tenantId);
      expect(
        tenantPackage.agents.find(
          (agent) => agent.id === tenantPackage.tenantId,
        )?.name,
      ).toBe("Iris");
      expect(memberIds.length).toBe(10);
      expect(tenantPackage.omittedAgentIds).toEqual([]);
      expect(memberIds).toEqual(rows.map((row) => row.id));

      for (const agent of tenantPackage.agents) {
        const written = rows.find((row) => row.id === agent.id)?.system_prompt;
        const prompt = String(
          mode === "built-in" ? agent.configuration.systemPrompt : written,
        );
        // Built-in, the server runs the very prompt agent-freeduet would read.
        if (mode === "built-in") expect(prompt).toBe(String(written));
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
  }

  test("remote members are all at MANAGED_AGENT_AG_UI_URL, the only address given the token", async () => {
    const tenantPackage = await loadWith(MODES.remote);

    for (const agent of tenantPackage.agents) {
      expect({
        member: agent.id,
        type: agent.type,
        endpoint: agent.configuration.endpoint,
      }).toEqual({
        member: agent.id,
        type: "remote_ag_ui",
        endpoint: ROUTER_URL,
      });
    }
  });

  test("built-in members carry no endpoint", async () => {
    const tenantPackage = await loadWith(MODES["built-in"]);

    for (const agent of tenantPackage.agents) {
      expect({
        member: agent.id,
        type: agent.type,
        endpoint: agent.configuration.endpoint,
      }).toEqual({ member: agent.id, type: "built_in", endpoint: undefined });
    }
  });

  test("every row takes its type and endpoint from the environment", async () => {
    for (const row of await memberRows()) {
      expect({
        member: row.id,
        type: row.type,
        endpoint: row.endpoint,
      }).toEqual({
        member: row.id,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the unexpanded placeholder as written in agents.yaml is what this asserts.
        type: "${FREEDUET_MEMBER_TYPE:-remote-ag-ui}",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the unexpanded placeholder as written in agents.yaml is what this asserts.
        endpoint: "${MANAGED_AGENT_AG_UI_URL:-}",
      });
    }
  });
});

describe("FreeDuet team evals", () => {
  test("every case is well formed and names a real member", async () => {
    const tenantPackage = await loadWith(MODES.remote);
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
