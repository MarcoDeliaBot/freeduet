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
        endpoint: agent.configuration.endpoint ?? null,
      }).toEqual({ member: agent.id, type: "built_in", endpoint: null });
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

/**
 * Jules's own instructions, the part before the shared rules: the sentences the live evals of
 * 12 November 2026 (jules-1, jules-2, jules-3) led to. Word for word, so a later edit that drops one
 * fails here and not in a night of live runs.
 */
describe("Jules's own instructions", () => {
  async function jules() {
    const rows = await memberRows();
    const prompt = rows.find((row) => row.id === "concierge")?.system_prompt;
    if (!prompt) throw new Error("no member concierge");
    const wren = rows.find((row) => row.id === "writer")?.system_prompt ?? "";
    return {
      own: prompt.slice(0, prompt.indexOf(SHARED_RULES_START)),
      shared: prompt.slice(prompt.indexOf(SHARED_RULES_START)),
      wrenShared: wren.slice(wren.indexOf(SHARED_RULES_START)),
    };
  }

  test("a trip is researched until up to three complete plans, and never ends by asking leave to go on (jules-2)", async () => {
    const { own } = await jules();
    for (const sentence of [
      "For a trip, start with one site for the transport and one for the stay, and open at most two result pages on each.",
      "When those pages show no price for a plan's transport or its stay, open the page of another result, then another site, until you have it.",
      "Keep going in the same turn until you have up to three complete plans, each with its total against the budget.",
      "Stop early only when you have tried both and still lack a price, and then say exactly what is missing and what you tried.",
      "A search turn never ends by asking the person whether to go on with the same search.",
    ])
      expect({ sentence, said: own.includes(sentence) }).toEqual({
        sentence,
        said: true,
      });
    // The sentence that made two pages the end of the search.
    expect(own).not.toContain("before you propose the plans");
    // Still the one-site-each limit of the lean research, and the rule that a trip needs both halves.
    expect(own).toContain(
      "A trip is complete only with both the transport and the stay: search both, and give each plan's total of the two.",
    );
  });

  test("an idea is listed only with a delivery date the shop's page showed, else another product, else the standard time under what could not be verified (jules-1)", async () => {
    const { own } = await jules();
    for (const sentence of [
      "An idea or an option goes in your list only with a delivery date or a delivery estimate that you read on the shop's page.",
      "When a product's page shows no date, leave that product out and pick another that shows one: you have the time.",
      "Only when the shop shows no date on any page you opened, give the shop's standard delivery time from its delivery or shipping information, written as dates counted from today,",
      "say it is the shop's standard estimate, and list that idea under what you could not verify.",
      "A date you saw on a different item is never this item's date.",
    ])
      expect({ sentence, said: own.includes(sentence) }).toEqual({
        sentence,
        said: true,
      });
    // The two sentences that let a product through with no date at all.
    expect(own).not.toContain("When no delivery date is shown, write");
    expect(own).not.toContain(
      "When a product page shows no delivery date, use",
    );
  });

  test("after a booking is asked for, the price is checked, then the review is given and approved, and nothing in a booking flow is pressed before that (jules-3)", async () => {
    const { own } = await jules();
    const recheck =
      "in this order: first open the pages by address to check the price and availability again, then prepare the review and call request_purchase (or, without that tool, give the review and ask for approval of that exact booking).";
    const noClick =
      "Until the person has approved it, you never click or type inside a booking or checkout flow: you may read its pages, you may not press anything on them.";
    expect(own).toContain(recheck);
    expect(own).toContain(noClick);
    expect(own.indexOf(recheck)).toBeLessThan(own.indexOf(noClick));
    // Both halves of the rule come after "book it" and before the final step.
    expect(own.indexOf(noClick)).toBeLessThan(
      own.indexOf("Before the final step, prepare a review"),
    );
  });

  test("the booking and checkout rules the new sentences sit beside still stand (jules-3, jules-4, jules-5)", async () => {
    const { own } = await jules();
    for (const sentence of [
      "You never buy, book, cancel or subscribe without an approval for that exact cart or booking.",
      "If the request_purchase tool is available, call it with that review;",
      "end the booking turn with the full review in your reply and ask the person to approve that exact booking;",
      "Continue only after approval: after their yes, go on to the last step, where the final click goes through the approval gate.",
      // jules-5: the total changed after an approval.
      "Just before the last click, compare the site's final summary with the approved review; if anything changed, stop and ask again.",
      "You never show card data in the chat.",
    ])
      expect({ sentence, said: own.includes(sentence) }).toEqual({
        sentence,
        said: true,
      });
  });

  test("the shared rules at the end of the prompt are Wren's, word for word", async () => {
    const { shared, wrenShared } = await jules();
    expect(shared.length).toBeGreaterThan(SHARED_RULES_START.length);
    expect(shared).toBe(wrenShared);
  });
});
