/**
 * D35 (docs/M1_PLAN.md section 18), the pure half: which calls the server holds to an approval card
 * every time (`freeduet/always-ask.ts`), and what the policy answers when it is told to.
 *
 * The same rule through the real gate, a real database and the real plugin store is in
 * `routines-always-ask.integration.test.ts` and `routines-always-ask-plugin-store.integration.test.ts`.
 * What is pinned here is the table of facts and the order of the layers, so a change to either one
 * is a failing test and not a silent widening.
 */
import { describe, expect, test } from "bun:test";
import { decideAction, NOT_ACCOUNT_ACTIONS } from "../src/approvals/policy";
import type {
  ApprovalCandidate,
  ApprovalRule,
  ApprovalTeamRule,
} from "../src/approvals/types";
import type { AuditInitiator } from "../src/audit";
import {
  AUTOMATION_CHANGE_REASON,
  type AlwaysAskFacts,
  alwaysAskReason,
  startedUnattended,
  UNATTENDED_WRITE_REASON,
} from "../src/freeduet/always-ask";

const ROUTINE: AuditInitiator = { kind: "routine", id: "r1" };
const TRIGGER: AuditInitiator = { kind: "responsibility", id: "t1" };
const PERSON: AuditInitiator = { kind: "person" };
const hop = (origin?: AuditInitiator): AuditInitiator => ({
  kind: "handoff",
  id: "iris",
  ...(origin ? { origin } : {}),
});

describe("what started the run", () => {
  test("a routine, an event trigger and a hop that began in one are unattended", () => {
    expect(startedUnattended(ROUTINE)).toBeTrue();
    expect(startedUnattended(TRIGGER)).toBeTrue();
    expect(startedUnattended(hop(ROUTINE))).toBeTrue();
    expect(startedUnattended(hop(TRIGGER))).toBeTrue();
  });

  test("the person's own turn, the deployment and a memory run are not", () => {
    expect(startedUnattended(undefined)).toBeFalse();
    expect(startedUnattended(PERSON)).toBeFalse();
    expect(startedUnattended({ kind: "deployment" })).toBeFalse();
    expect(startedUnattended({ kind: "memory", id: "m1" })).toBeFalse();
  });

  test("a hop is judged by the root it came from, and one with no known root is not unattended", () => {
    expect(startedUnattended(hop(PERSON))).toBeFalse();
    expect(startedUnattended(hop())).toBeFalse();
    expect(startedUnattended(hop({ kind: "memory", id: "m1" }))).toBeFalse();
    // Never built by the desk (the origin is always the root), but read the same way if it were.
    expect(startedUnattended(hop(hop(ROUTINE)))).toBeTrue();
    expect(startedUnattended(hop(hop(PERSON)))).toBeFalse();
  });

  test("a chain of hops that never ends is read as no root, and the read ends", () => {
    const loop = { kind: "handoff", id: "a" } as AuditInitiator & {
      origin?: AuditInitiator;
    };
    loop.origin = loop;
    expect(startedUnattended(loop)).toBeFalse();
  });
});

const facts = (over: Partial<AlwaysAskFacts> = {}): AlwaysAskFacts => ({
  effect: "write",
  toolRef: "mcp/gmail/send_email",
  runInitiator: undefined,
  callInitiator: undefined,
  configuresAutomation: false,
  answeredByCard: false,
  ...over,
});

describe("which calls are held to a card every time", () => {
  test("a write in a routine's or a trigger's run, from the approval context or from the signed call", () => {
    expect(alwaysAskReason(facts({ runInitiator: ROUTINE }))).toBe(
      UNATTENDED_WRITE_REASON,
    );
    expect(alwaysAskReason(facts({ runInitiator: TRIGGER }))).toBe(
      UNATTENDED_WRITE_REASON,
    );
    expect(alwaysAskReason(facts({ callInitiator: ROUTINE }))).toBe(
      UNATTENDED_WRITE_REASON,
    );
    expect(alwaysAskReason(facts({ callInitiator: TRIGGER }))).toBe(
      UNATTENDED_WRITE_REASON,
    );
  });

  test("the stricter of the two places holds when they disagree", () => {
    expect(
      alwaysAskReason(facts({ runInitiator: PERSON, callInitiator: ROUTINE })),
    ).toBe(UNATTENDED_WRITE_REASON);
    expect(
      alwaysAskReason(facts({ runInitiator: ROUTINE, callInitiator: PERSON })),
    ).toBe(UNATTENDED_WRITE_REASON);
  });

  test("a write in a hop that began in a routine is held; one that began with the person is not", () => {
    expect(alwaysAskReason(facts({ runInitiator: hop(ROUTINE) }))).toBe(
      UNATTENDED_WRITE_REASON,
    );
    expect(
      alwaysAskReason(facts({ runInitiator: hop(PERSON) })),
    ).toBeUndefined();
    expect(alwaysAskReason(facts({ runInitiator: hop() }))).toBeUndefined();
  });

  test("setting up, changing or removing a routine or a trigger is held in the person's own turn too", () => {
    expect(
      alwaysAskReason(
        facts({
          toolRef: "routines/create_routine",
          configuresAutomation: true,
        }),
      ),
    ).toBe(AUTOMATION_CHANGE_REASON);
    expect(
      alwaysAskReason(
        facts({
          toolRef: "routines/delete_trigger",
          configuresAutomation: true,
          runInitiator: PERSON,
          callInitiator: PERSON,
        }),
      ),
    ).toBe(AUTOMATION_CHANGE_REASON);
  });

  test("a routine that sets up another is told it is a routine's run", () => {
    expect(
      alwaysAskReason(
        facts({
          toolRef: "routines/create_routine",
          configuresAutomation: true,
          runInitiator: ROUTINE,
        }),
      ),
    ).toBe(UNATTENDED_WRITE_REASON);
  });

  test("the person's own live turn, the deployment and a memory run are left to the gate as before", () => {
    for (const runInitiator of [
      undefined,
      PERSON,
      { kind: "deployment" } as const,
      { kind: "memory", id: "m1" } as const,
    ])
      expect(alwaysAskReason(facts({ runInitiator }))).toBeUndefined();
  });

  test("a read is never held, and neither is a hand-off, in any run", () => {
    for (const effect of ["read", "delegate"])
      for (const runInitiator of [undefined, ROUTINE, TRIGGER, hop(ROUTINE)])
        expect(
          alwaysAskReason(
            facts({
              effect,
              runInitiator,
              callInitiator: runInitiator,
              configuresAutomation: true,
            }),
          ),
        ).toBeUndefined();
  });

  test("the Bot's own workspace and commands on the person's computer reach no account, so they are not held", () => {
    for (const toolRef of [
      "computer_write_file",
      "computer_run_command",
      "host/write_file",
      "host/run_command",
    ]) {
      expect(NOT_ACCOUNT_ACTIONS.test(toolRef)).toBeTrue();
      expect(
        alwaysAskReason(facts({ toolRef, runInitiator: ROUTINE })),
      ).toBeUndefined();
    }
    // The browser reaches accounts as the person does, so it is held.
    expect(
      alwaysAskReason(
        facts({ toolRef: "computer_click", runInitiator: ROUTINE }),
      ),
    ).toBe(UNATTENDED_WRITE_REASON);
  });

  test("a new email the person just allowed on its own card is not asked about a second time", () => {
    expect(
      alwaysAskReason(
        facts({
          toolRef: "google-imap/gmail_send_message",
          runInitiator: ROUTINE,
          answeredByCard: true,
        }),
      ),
    ).toBeUndefined();
    // That answer never lifts the rule about setting up a routine.
    expect(
      alwaysAskReason(
        facts({ configuresAutomation: true, answeredByCard: true }),
      ),
    ).toBe(AUTOMATION_CHANGE_REASON);
  });
});

const candidate = (
  over: Partial<ApprovalCandidate> = {},
): ApprovalCandidate => ({
  actorId: "owner",
  botId: "bot",
  toolRef: "mcp/crm/update",
  effect: "write",
  scope: "crm",
  args: { id: "c1", note: "Called back" },
  ...over,
});
const rule = (
  behaviour: ApprovalRule["behaviour"],
  over: Partial<ApprovalRule> = {},
): ApprovalRule => ({
  id: `rule-${behaviour}`,
  ownerUserId: "owner",
  botId: "*",
  toolRef: "mcp/crm/*",
  effect: "*",
  scope: "*",
  behaviour,
  revokedAt: null,
  createdAt: new Date(),
  ...over,
});
const teamRule = (behaviour: ApprovalRule["behaviour"]): ApprovalTeamRule => {
  const { ownerUserId: _owner, ...rest } = rule(behaviour);
  return { ...rest, id: `team-${behaviour}`, createdBy: "admin" };
};
const base = {
  team: [] as ApprovalTeamRule[],
  personal: [] as ApprovalRule[],
  customRulesEnabled: true,
  autoReview: false,
  askBeforeChanges: false,
};
const reviewer =
  (answer: object, calls: string[] = []) =>
  async (prompt: string) => {
    calls.push(prompt);
    return JSON.stringify(answer);
  };
const PROCEED = {
  verdict: "proceed",
  preApproved: true,
  safety: "none",
  reason: "Within what the person asked.",
};
const REASON = "Held by the server.";

describe("the policy, told to hold an action to a card", () => {
  test("asks, with the source that cannot be remembered, whatever the person's own settings say", async () => {
    for (const settings of [
      { autoReview: false, askBeforeChanges: false },
      { autoReview: true, askBeforeChanges: false },
      { autoReview: false, askBeforeChanges: true },
    ])
      expect(
        await decideAction({
          ...base,
          ...settings,
          candidate: candidate(),
          alwaysAsk: REASON,
          model: reviewer(PROCEED),
        }),
      ).toMatchObject({
        behaviour: "ask",
        source: "always_ask",
        reason: REASON,
      });
  });

  test("Full access, in either setting, is not looked at", async () => {
    for (const fullAccess of ["full", "no_payments"] as const) {
      expect(
        await decideAction({
          ...base,
          candidate: candidate(),
          fullAccess,
          alwaysAsk: REASON,
        }),
      ).toMatchObject({ behaviour: "ask", source: "always_ask" });
      // Control: without the hold, the same call is let through by it.
      expect(
        await decideAction({ ...base, candidate: candidate(), fullAccess }),
      ).toMatchObject({ behaviour: "allow", source: "full_access" });
    }
  });

  test("no saved rule lets it through, and a rule that only asks does not change the source", async () => {
    for (const behaviour of ["allow", "ask", "pre_approved"] as const) {
      expect(
        await decideAction({
          ...base,
          candidate: candidate(),
          personal: [rule(behaviour)],
          alwaysAsk: REASON,
          model: reviewer(PROCEED),
        }),
      ).toMatchObject({ behaviour: "ask", source: "always_ask" });
      expect(
        await decideAction({
          ...base,
          candidate: candidate(),
          team: [teamRule(behaviour)],
          alwaysAsk: REASON,
          model: reviewer(PROCEED),
        }),
      ).toMatchObject({ behaviour: "ask", source: "always_ask" });
    }
  });

  test("a reviewer that says proceed, or that needs approval, leaves the answer a card that cannot be remembered", async () => {
    for (const verdict of ["proceed", "needs_approval"])
      expect(
        await decideAction({
          ...base,
          autoReview: true,
          candidate: candidate(),
          alwaysAsk: REASON,
          model: reviewer({ ...PROCEED, verdict }),
        }),
      ).toMatchObject({ behaviour: "ask", source: "always_ask" });
  });

  test("what is stricter than a card still comes first: a hand-off by the reviewer, a safety requirement, a rule", async () => {
    expect(
      await decideAction({
        ...base,
        autoReview: true,
        candidate: candidate(),
        alwaysAsk: REASON,
        model: reviewer({ ...PROCEED, verdict: "hand_off" }),
      }),
    ).toMatchObject({ behaviour: "hand_off", source: "auto_review" });
    expect(
      await decideAction({
        ...base,
        autoReview: true,
        candidate: candidate(),
        alwaysAsk: REASON,
        model: reviewer({ ...PROCEED, safety: "payments" }),
      }),
    ).toMatchObject({ behaviour: "hand_off", source: "safety" });
    for (const fullAccess of [undefined, "full", "no_payments"] as const)
      expect(
        await decideAction({
          ...base,
          candidate: candidate({
            toolRef: "mcp/shop/checkout",
            args: { cart: "c1", card: "on file" },
          }),
          ...(fullAccess ? { fullAccess } : {}),
          alwaysAsk: REASON,
        }),
      ).toMatchObject({ behaviour: "hand_off", source: "safety" });
    expect(
      await decideAction({
        ...base,
        candidate: candidate(),
        personal: [rule("hand_off")],
        alwaysAsk: REASON,
      }),
    ).toMatchObject({ behaviour: "hand_off", source: "personal_rule" });
    expect(
      await decideAction({
        ...base,
        candidate: candidate(),
        team: [teamRule("hand_off")],
        alwaysAsk: REASON,
      }),
    ).toMatchObject({ behaviour: "hand_off", source: "team_rule" });
  });

  test("a read is never held, whatever it is told", async () => {
    expect(
      await decideAction({
        ...base,
        candidate: candidate({ effect: "read" }),
        alwaysAsk: REASON,
      }),
    ).toMatchObject({ behaviour: "allow", source: "default" });
  });

  test("not told, nothing changes: the same call is answered by the layers it always was", async () => {
    expect(
      await decideAction({ ...base, candidate: candidate() }),
    ).toMatchObject({ behaviour: "allow", source: "default" });
    expect(
      await decideAction({
        ...base,
        candidate: candidate(),
        personal: [rule("allow")],
      }),
    ).toMatchObject({ behaviour: "allow", source: "personal_rule" });
    expect(
      await decideAction({
        ...base,
        autoReview: true,
        candidate: candidate(),
        model: reviewer({ ...PROCEED, verdict: "needs_approval" }),
      }),
    ).toMatchObject({ behaviour: "ask", source: "auto_review" });
  });
});
