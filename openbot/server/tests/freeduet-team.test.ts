/**
 * FreeDuet's team wiring, the parts that need no database: which grants the package wants, that
 * nothing happens for another package, how the per-person mark is read, and that `/api/me` waits for
 * the person's team and never fails because of it. The database half is
 * `freeduet-team.integration.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { Database } from "../src/db/client";
import {
  applyFreeDuetPackage,
  FREEDUET_TENANT_ID,
  hubGrants,
  isFreeDuetPackage,
} from "../src/freeduet/hub-grants";
import {
  createPersonTeam,
  type PersonTeam,
  readTeamMark,
  teamOnboarding,
  withFreeDuetTeam,
} from "../src/freeduet/person-team";
import type { OnboardingStore } from "../src/people/onboarding";
import { loadTenantPackage, type TenantPackage } from "../src/tenant-package";

const packageDirectory = fileURLToPath(
  new URL("../../examples/freeduet", import.meta.url),
);

/** FreeDuet's package as the server loads it with the router off: every member a built-in Bot. */
async function freeDuetPackage() {
  const previous = process.env.FREEDUET_MEMBER_TYPE;
  process.env.FREEDUET_MEMBER_TYPE = "built-in";
  try {
    return await loadTenantPackage(packageDirectory);
  } finally {
    if (previous === undefined) delete process.env.FREEDUET_MEMBER_TYPE;
    else process.env.FREEDUET_MEMBER_TYPE = previous;
  }
}

/** A database that fails the test if anything touches it. */
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error("the database was touched");
    },
  },
) as unknown as Database;

const onboarding: OnboardingStore = {
  status: async () => ({ step: 2, completedAt: null }),
  setStep: async () => undefined,
  complete: async () => undefined,
};

describe("hub grants (D14)", () => {
  test("Iris and every other member, both ways, and nothing member to member", async () => {
    const tenantPackage = await freeDuetPackage();
    const iris = tenantPackage.tenantId;
    const members = tenantPackage.agents
      .map((agent) => agent.id)
      .filter((id) => id !== iris);
    const grants = hubGrants(tenantPackage);

    expect(members.length).toBe(11);
    expect(grants.length).toBe(22);
    // Mark and Cam, added after v0.1, are wired like every other member: nothing names them but the package.
    expect(members).toContain("marketer");
    expect(members).toContain("video");
    for (const member of members) {
      expect(grants).toContainEqual({ agentId: iris, ref: member });
      expect(grants).toContainEqual({ agentId: member, ref: iris });
    }
    expect(
      grants.filter((grant) => grant.agentId !== iris && grant.ref !== iris),
    ).toEqual([]);
  });

  test("follows the package's members rather than a fixed list", () => {
    const agents = ["hub", "a", "b"].map((id) => ({ id }));
    const tenantPackage = {
      tenantId: "hub",
      agents,
    } as unknown as TenantPackage;
    expect(hubGrants(tenantPackage)).toEqual([
      { agentId: "hub", ref: "a" },
      { agentId: "a", ref: "hub" },
      { agentId: "hub", ref: "b" },
      { agentId: "b", ref: "hub" },
    ]);
    // No Iris, no hub: grants between the others would be member to member.
    expect(
      hubGrants({ ...tenantPackage, tenantId: "nobody" } as TenantPackage),
    ).toEqual([]);
  });

  test("acts on FreeDuet's package only", async () => {
    expect(isFreeDuetPackage({ tenantId: FREEDUET_TENANT_ID })).toBe(true);
    expect(isFreeDuetPackage({ tenantId: "openduet" })).toBe(false);
    await applyFreeDuetPackage(untouchable, {
      tenantId: "openduet",
      agents: [],
    });
  });
});

describe("each person's team (#25, D17)", () => {
  test("the mark is read defensively", () => {
    expect(readTeamMark(null)).toEqual({ conversations: {} });
    expect(readTeamMark("x")).toEqual({ conversations: {} });
    expect(
      readTeamMark({
        conversations: { inbox: "channel_1", chef: 3, writer: "" },
        dailyReview: 5,
      }),
    ).toEqual({ conversations: { inbox: "channel_1" } });
    expect(
      readTeamMark({ conversations: {}, dailyReview: "routine_1" }),
    ).toEqual({ conversations: {}, dailyReview: "routine_1" });
  });

  test("/api/me's onboarding read waits for the person's team, then answers as before", async () => {
    const order: string[] = [];
    const team: PersonTeam = {
      ensure: async (userId) => {
        await Promise.resolve();
        order.push(`team:${userId}`);
      },
    };
    const wrapped = teamOnboarding(
      {
        ...onboarding,
        status: async (userId) => {
          order.push(`status:${userId}`);
          return onboarding.status(userId);
        },
      },
      team,
    );
    expect(await wrapped.status("ada")).toEqual({ step: 2, completedAt: null });
    expect(order).toEqual(["team:ada", "status:ada"]);
    expect(wrapped.setStep).toBe(onboarding.setStep);
    expect(wrapped.complete).toBe(onboarding.complete);
  });

  test("a failing pass is logged, and the request is still answered", async () => {
    const failing = {
      transaction: async () => {
        throw new Error("the database blinked");
      },
    } as unknown as Database;
    const team = createPersonTeam({
      database: failing,
      channels: {
        direct: async () => {
          throw new Error("not reached");
        },
        create: async () => {
          throw new Error("not reached");
        },
      },
      routines: {
        create: async () => {
          throw new Error("not reached");
        },
        listFor: async () => [],
      },
      actorFor: async (id) => ({ id, role: "user" }),
      tenantPackage: { tenantId: FREEDUET_TENANT_ID, agents: [], channels: [] },
    });
    const wrapped = teamOnboarding(onboarding, team);
    expect(await wrapped.status("ada")).toEqual({ step: 2, completedAt: null });
  });

  test("another package keeps the onboarding store exactly as it was", () => {
    const kept = withFreeDuetTeam(onboarding, {
      database: untouchable,
      channels: {} as never,
      routines: {} as never,
      actorFor: async (id) => ({ id, role: "user" }),
      tenantPackage: { tenantId: "openduet", agents: [], channels: [] },
    });
    expect(kept).toBe(onboarding);
  });
});
