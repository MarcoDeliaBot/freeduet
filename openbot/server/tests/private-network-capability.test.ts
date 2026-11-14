import { describe, expect, test } from "bun:test";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  type CapabilityRow,
  DEFAULT_CAPABILITIES,
  resolveCapability,
} from "../src/admin/capabilities";
import { decideFromSnapshot } from "../src/admin/controls";
import {
  DEFAULT_ENTERPRISE_SETTINGS,
  type NetworkPolicyRow,
} from "../src/admin/settings-store";
import type { PolicyContext } from "../src/computer/policy";
import {
  type EgressPolicy,
  effectiveNetworkPolicy,
  pushEgressPolicies,
  withPolicyPushOnWake,
} from "../src/computer/policy-network";
import type { ComputerProvider } from "../src/computer/provider";

/**
 * "Home and office network access" (D36): the one switch that lets a Bot's computer reach the
 * devices on the network it sits in. Off unless somebody turned it on.
 *
 * The filter that enforces it lives on the computer (agent-computer/tests/private-network*.test.ts).
 * What is pinned here is everything on the server's side of it: the capability and its default, the
 * policy each person's computers are pushed, and the sentence a person gets back when a navigation is
 * judged before it ever reaches the computer.
 */

const row = (
  scopeKind: CapabilityRow["scopeKind"],
  scopeId: string,
  capability: string,
  allowed: boolean,
): CapabilityRow => ({ scopeKind, scopeId, capability, allowed });

const person = { role: "user" as const, groups: [] };

function snapshot(
  overrides: Partial<Parameters<typeof decideFromSnapshot>[0] & object> = {},
) {
  return {
    rows: [],
    admins: new Set<string>(),
    groupsByUser: new Map<string, string[]>(),
    settings: DEFAULT_ENTERPRISE_SETTINGS,
    network: [],
    loadedAt: new Date(),
    ...overrides,
  };
}

/** A navigation, with the host the gateway derives from the URL (`new URL(url).host`). */
function navigation(url: string, actor = "person"): PolicyContext {
  return {
    tool: { name: "computer_navigate" },
    bot: { id: "bot" },
    actor: { id: actor },
    page: { url, host: new URL(url).host },
    intent: "navigate",
    key: "",
    element: { ref: "", role: "", name: "", type: "" },
    file: { path: "", name: "", extension: "" },
    command: "",
    mcp: { server: "", tool: "", effect: "" },
    initiator: { kind: "person", id: "" },
  };
}

const networkRow = (
  mode: NetworkPolicyRow["mode"],
  rules: NetworkPolicyRow["rules"] = [],
  overrides: Partial<NetworkPolicyRow> = {},
): NetworkPolicyRow => ({
  scopeKind: "organization",
  scopeId: "",
  mode,
  rules,
  locked: false,
  updatedBy: null,
  updatedAt: "",
  ...overrides,
});

describe("the switch, as a capability", () => {
  test("is off in a deployment nobody has configured, and is the only capability that is", () => {
    expect(DEFAULT_CAPABILITIES.cloudPrivateNetwork).toBe(false);
    expect(CAPABILITIES.filter((name) => !DEFAULT_CAPABILITIES[name])).toEqual([
      "cloudPrivateNetwork",
    ]);
    expect(resolveCapability([], person, "cloudPrivateNetwork")).toMatchObject({
      allowed: false,
      decidedBy: "default",
    });
  });

  test("the organization turns it on, a role replaces that, and a group only widens it", () => {
    // Before any row says anything: off.
    expect(resolveCapability([], person, "cloudPrivateNetwork").allowed).toBe(
      false,
    );
    const organizationOn = [
      row("organization", "", "cloudPrivateNetwork", true),
    ];
    expect(
      resolveCapability(organizationOn, person, "cloudPrivateNetwork"),
    ).toMatchObject({ allowed: true, decidedBy: "organization" });

    // A role row replaces the organization's: administrators get it, everybody else does not.
    const adminsOnly = [
      row("organization", "", "cloudPrivateNetwork", false),
      row("role", "admin", "cloudPrivateNetwork", true),
    ];
    expect(
      resolveCapability(
        adminsOnly,
        { role: "admin", groups: [] },
        "cloudPrivateNetwork",
      ),
    ).toMatchObject({ allowed: true, decidedBy: "role" });
    expect(
      resolveCapability(adminsOnly, person, "cloudPrivateNetwork").allowed,
    ).toBe(false);

    // A group can grant it to its members and never take it away.
    const group = (allowed: boolean) => [
      row("organization", "", "cloudPrivateNetwork", !allowed),
      row("group", "lab", "cloudPrivateNetwork", allowed),
    ];
    expect(
      resolveCapability(
        group(true),
        { role: "user", groups: ["lab"] },
        "cloudPrivateNetwork",
      ),
    ).toMatchObject({ allowed: true, decidedBy: "group", scopeId: "lab" });
    expect(
      resolveCapability(group(true), person, "cloudPrivateNetwork").allowed,
    ).toBe(false);
    expect(
      resolveCapability(
        group(false),
        { role: "user", groups: ["lab"] },
        "cloudPrivateNetwork",
      ).allowed,
    ).toBe(true);
  });

  test("is named for a person on the capabilities screen, and says what stays blocked", () => {
    const label = CAPABILITY_LABELS.cloudPrivateNetwork;
    expect(label.title).toBe("Home and office network access");
    expect(label.description).toContain("router");
    expect(label.description).toContain("metadata");
  });
});

describe("the policy a computer is pushed", () => {
  const nobody = { groups: [] as string[] };

  test("is exactly what it was while the switch is off, and carries the switch once it is on", () => {
    // Off, by default or by name: no extra key at all, so a computer that predates the switch and a
    // computer that has it read the same policy and block.
    const asBefore = { mode: "allow_all" as const, rules: [], from: "none" };
    expect(effectiveNetworkPolicy([], nobody, true)).toStrictEqual(asBefore);
    expect(effectiveNetworkPolicy([], nobody, true, false)).toStrictEqual(
      asBefore,
    );
    expect(effectiveNetworkPolicy([], nobody, true, true)).toStrictEqual({
      ...asBefore,
      allowPrivateNetwork: true,
    });
  });

  test("only allow_all carries it, because every other mode decides by the administrator's own rules", () => {
    expect(
      effectiveNetworkPolicy([], nobody, true, true).allowPrivateNetwork,
    ).toBe(true);
    const rules = [{ type: "domain" as const, value: "example.com" }];
    for (const mode of ["defaults_plus_allowlist", "allowlist_only"] as const) {
      expect(
        effectiveNetworkPolicy([networkRow(mode, rules)], nobody, true, true),
      ).toStrictEqual({ mode, rules, from: "organization" });
    }
    // A group's own allow_all is still allow_all, so the switch rides with it.
    expect(
      effectiveNetworkPolicy(
        [
          networkRow("allowlist_only", rules),
          networkRow("allow_all", [], { scopeKind: "group", scopeId: "lab" }),
        ],
        { groups: ["lab"] },
        true,
        true,
      ),
    ).toStrictEqual({
      mode: "allow_all",
      rules: [],
      from: "group:lab",
      allowPrivateNetwork: true,
    });
  });

  test("the network capability keeps its meaning: off is deny_all whatever this switch says", () => {
    expect(effectiveNetworkPolicy([], nobody, false, true)).toStrictEqual({
      mode: "deny_all",
      rules: [],
      from: "capability",
    });
    // And the new switch is a different capability: the old one is still on by default.
    expect(DEFAULT_CAPABILITIES.cloudNetwork).toBe(true);
    expect(
      effectiveNetworkPolicy([], nobody, true, true).allowPrivateNetwork,
    ).toBe(true);
  });

  /** One running computer, and a `fetch` that records what it was sent. */
  function fleet() {
    const sent: { url: string; body: unknown }[] = [];
    const provider = {
      list: async () => [
        { botId: "a", status: "running", url: "http://computer.test:4100" },
      ],
    } as unknown as ComputerProvider;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("{}");
    }) as unknown as typeof fetch;
    return { sent, provider, fetchImpl };
  }

  test("the push body carries the switch when it is on and leaves it out when it is off", async () => {
    const on = fleet();
    await pushEgressPolicies({
      provider: on.provider,
      fetchImpl: on.fetchImpl,
      policyForBot: async () => ({
        mode: "allow_all",
        rules: [],
        allowPrivateNetwork: true,
      }),
    });
    expect(on.sent).toEqual([
      {
        url: "http://computer.test:4100/egress-policy",
        body: {
          policy: { mode: "allow_all", rules: [], allowPrivateNetwork: true },
        },
      },
    ]);

    const off = fleet();
    await pushEgressPolicies({
      provider: off.provider,
      fetchImpl: off.fetchImpl,
      policyForBot: async () => ({ mode: "allow_all", rules: [] }),
    });
    expect(off.sent).toEqual([
      {
        url: "http://computer.test:4100/egress-policy",
        body: { policy: { mode: "allow_all", rules: [] } },
      },
    ]);
    // Not even a key that says false: the body is what it was before the switch existed.
    expect(JSON.stringify(off.sent[0]?.body)).not.toContain(
      "allowPrivateNetwork",
    );
  });

  test("a computer that wakes is pushed the switch too, so the first action after a wake is judged by it", async () => {
    const sent: unknown[] = [];
    const woken = withPolicyPushOnWake(
      {
        name: "fake",
        isolation: "per-bot",
        locate: async () => "http://computer.test:4100",
        sessionOf: async () => "run-1",
      } as unknown as ComputerProvider,
      {
        policyForBot: async (): Promise<EgressPolicy> => ({
          mode: "allow_all",
          rules: [],
          allowPrivateNetwork: true,
        }),
        fetchImpl: (async (_url: string, init: RequestInit) => {
          sent.push(JSON.parse(String(init.body)));
          return new Response("{}");
        }) as unknown as typeof fetch,
      },
    );
    await woken.locate("a");
    expect(sent).toEqual([
      {
        policy: { mode: "allow_all", rules: [], allowPrivateNetwork: true },
      },
    ]);
  });
});

describe("a navigation, judged on the server before it reaches the computer", () => {
  /** Addresses on the network the computer sits in, in the forms the URL parser hands the gateway. */
  const insideTheNetwork = [
    "http://192.168.1.1/",
    "http://192.168.1.1:8080/admin",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://172.31.255.254/",
    "http://100.64.0.1/",
    "http://127.0.0.1:3001/",
    "http://localhost:3001/",
    "http://app.localhost/",
    "http://0.0.0.0:80/",
    "http://[::1]:3001/",
    "http://[fd00::1]/",
    "http://[::ffff:192.168.1.1]/",
    // Spelled as numbers, which the URL parser turns into the dotted address the browser will use.
    "http://2130706433/",
    "http://0x7f.1/",
    "http://0300.0250.0.1/",
  ];

  test.each(insideTheNetwork)(
    "%s is refused by default, with a sentence that names the switch",
    (url) => {
      const decision = decideFromSnapshot(snapshot(), navigation(url));
      expect(decision).toMatchObject({
        allowed: false,
        forward: false,
        matched: "capability:cloudPrivateNetwork",
      });
      // The switch is the person's own, not an allowlist an administrator adds a rule to.
      expect(decision?.reason).toContain("Home and office network access");
      expect(decision?.reason).not.toContain("An admin can add it");
    },
  );

  test.each(insideTheNetwork)(
    "%s goes through once the switch is on",
    (url) => {
      const on = snapshot({
        rows: [row("organization", "", "cloudPrivateNetwork", true)],
      });
      expect(decideFromSnapshot(on, navigation(url))).toBeNull();
      // The same snapshot with the switch off refuses it, so this is the switch and nothing else.
      expect(decideFromSnapshot(snapshot(), navigation(url))?.forward).toBe(
        false,
      );
    },
  );

  test("the internet is untouched by the switch either way", () => {
    const on = snapshot({
      rows: [row("organization", "", "cloudPrivateNetwork", true)],
    });
    for (const url of [
      "https://example.com/",
      "http://93.184.216.34/",
      "http://[2606:4700::1111]/",
      "http://172.32.0.1/",
      "http://100.128.0.1/",
    ]) {
      expect(decideFromSnapshot(snapshot(), navigation(url))).toBeNull();
      expect(decideFromSnapshot(on, navigation(url))).toBeNull();
    }
    // A control inside the same loop's reach: the address next door is refused.
    expect(
      decideFromSnapshot(snapshot(), navigation("http://172.31.0.1/"))?.forward,
    ).toBe(false);
  });

  test("cloud metadata is refused with the switch on, and it is not the switch that refuses it", () => {
    const on = snapshot({
      rows: [row("organization", "", "cloudPrivateNetwork", true)],
    });
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://169.254.170.2/v2/credentials",
      "http://100.100.100.200/latest/meta-data/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      // Spelled as a number: the parser makes it the dotted address.
      "http://2852039166/latest/meta-data/",
    ]) {
      const decision = decideFromSnapshot(on, navigation(url));
      expect(decision).toMatchObject({ allowed: false, forward: false });
      expect(decision?.matched).not.toBe("capability:cloudPrivateNetwork");
    }
    expect(
      decideFromSnapshot(snapshot(), navigation("http://192.168.1.1/"))
        ?.matched,
    ).toBe("capability:cloudPrivateNetwork");
  });

  test("a group's grant reaches its members and nobody else", () => {
    const current = snapshot({
      rows: [
        row("organization", "", "cloudPrivateNetwork", false),
        row("group", "lab", "cloudPrivateNetwork", true),
      ],
      groupsByUser: new Map([["person", ["lab"]]]),
    });
    expect(
      decideFromSnapshot(current, navigation("http://192.168.1.1/")),
    ).toBeNull();
    expect(
      decideFromSnapshot(current, navigation("http://192.168.1.1/", "other"))
        ?.matched,
    ).toBe("capability:cloudPrivateNetwork");
  });

  test("an allowlist an administrator wrote still decides by its own rules, and the switch does not widen it", () => {
    const rules = [
      { type: "domain" as const, value: "example.com" },
      { type: "cidr" as const, value: "192.168.1.0/24" },
    ];
    const mode = "defaults_plus_allowlist" as const;
    // The administrator named that range, which is explicit permission: through, switch off.
    const named = snapshot({ network: [networkRow(mode, rules)] });
    expect(
      decideFromSnapshot(named, navigation("http://192.168.1.7/")),
    ).toBeNull();
    // The range next to it was not named, and the switch being on does not name it.
    const on = snapshot({
      network: [networkRow(mode, rules)],
      rows: [row("organization", "", "cloudPrivateNetwork", true)],
    });
    expect(
      decideFromSnapshot(on, navigation("http://192.168.2.7/"))?.matched,
    ).toBe("network:organization");
    // With no switch and no rule, the address is refused by the switch's own sentence.
    expect(
      decideFromSnapshot(
        snapshot({ network: [networkRow("allow_all")] }),
        navigation("http://192.168.2.7/"),
      )?.matched,
    ).toBe("capability:cloudPrivateNetwork");
  });

  test("a person without the network capability is refused by that one, as before", () => {
    const current = snapshot({
      rows: [
        row("organization", "", "cloudNetwork", false),
        row("organization", "", "cloudPrivateNetwork", true),
      ],
    });
    expect(
      decideFromSnapshot(current, navigation("http://192.168.1.1/"))?.matched,
    ).toBe("capability:cloudNetwork");
    expect(
      decideFromSnapshot(
        snapshot({ rows: [row("organization", "", "cloudNetwork", false)] }),
        navigation("https://example.com/"),
      )?.matched,
    ).toBe("capability:cloudNetwork");
    expect(
      decideFromSnapshot(snapshot(), navigation("http://192.168.1.1/"))
        ?.matched,
    ).toBe("capability:cloudPrivateNetwork");
  });
});
