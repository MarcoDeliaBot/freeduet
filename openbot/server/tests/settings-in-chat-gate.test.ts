/**
 * Settings in chat, slice 1, through the real gate: a member's change of one of the person's settings
 * always asks the person first, with Full access on or off (docs/design/settings-in-chat.md, section 5:
 * "Full access never lifts a setting"). The same rule through a real database and the real approval
 * service is in `settings-in-chat.integration.test.ts`. What is pinned here is the decision itself.
 */
import { describe, expect, test } from "bun:test";
import { decideAction, NOT_ACCOUNT_ACTIONS } from "../src/approvals/policy";
import type { ApprovalCandidate } from "../src/approvals/types";
import type { AuditInitiator } from "../src/audit";
import {
  alwaysAskReason,
  SETTING_CHANGE_REASON,
  UNATTENDED_WRITE_REASON,
} from "../src/freeduet/always-ask";

const PERSON: AuditInitiator = { kind: "person" };
const ROUTINE: AuditInitiator = { kind: "routine", id: "r1" };

/** A call to the Settings connector's change tool, as the plugin store makes it. */
function settingCall(
  args: Record<string, unknown>,
  over: Partial<ApprovalCandidate> = {},
): ApprovalCandidate {
  return {
    actorId: "person-1",
    botId: "member-1",
    toolRef: "settings/change_setting",
    effect: "write",
    scope: "settings",
    args,
    changesSetting: true,
    ...over,
  } as ApprovalCandidate;
}

/** The real gate, with the person's own defaults, Full access as given, and no reviewer. */
function gate(
  candidate: ApprovalCandidate,
  fullAccess: "full" | "no_payments" | undefined,
  alwaysAsk: string | undefined,
) {
  return decideAction({
    candidate,
    team: [],
    personal: [],
    customRulesEnabled: false,
    autoReview: false,
    askBeforeChanges: false,
    ...(fullAccess ? { fullAccess } : {}),
    ...(alwaysAsk ? { alwaysAsk } : {}),
  });
}

describe("the rule that holds a setting change to a card", () => {
  test("a write from the person's own turn that changes a setting asks, with its own reason", () => {
    expect(
      alwaysAskReason({
        effect: "write",
        toolRef: "settings/change_setting",
        runInitiator: PERSON,
        callInitiator: undefined,
        configuresAutomation: false,
        answeredByCard: false,
        changesSetting: true,
      }),
    ).toBe(SETTING_CHANGE_REASON);
  });

  test("the tool's own reference is not one the gate treats as a device action", () => {
    expect(NOT_ACCOUNT_ACTIONS.test("settings/change_setting")).toBeFalse();
  });

  test("a read never asks, and a call that changes no setting is left to the gate as before", () => {
    expect(
      alwaysAskReason({
        effect: "read",
        toolRef: "settings/change_setting",
        runInitiator: PERSON,
        callInitiator: undefined,
        configuresAutomation: false,
        answeredByCard: false,
        changesSetting: true,
      }),
    ).toBeUndefined();
    expect(
      alwaysAskReason({
        effect: "write",
        toolRef: "mcp/crm/update_contact",
        runInitiator: PERSON,
        callInitiator: undefined,
        configuresAutomation: false,
        answeredByCard: false,
      }),
    ).toBeUndefined();
  });

  test("a routine's change keeps the reason for unattended runs, which already asks", () => {
    expect(
      alwaysAskReason({
        effect: "write",
        toolRef: "settings/change_setting",
        runInitiator: ROUTINE,
        callInitiator: undefined,
        configuresAutomation: false,
        answeredByCard: false,
        changesSetting: true,
      }),
    ).toBe(UNATTENDED_WRITE_REASON);
  });
});

describe("through the real gate, a setting change is never allowed without a card", () => {
  const notifications = settingCall({
    setting: "notifications",
    value: "needs_input",
  });

  test("the guard: with Full access on and no rule of this kind, the same call would go through", () => {
    // What Full access does to any non-safety write. Pinned so the next test shows the rule, and not a
    // quirk of the candidate, is what holds the call.
    const withoutRule = settingCall(
      { setting: "notifications", value: "needs_input" },
      { changesSetting: undefined },
    );
    return gate(withoutRule, "full", undefined).then((outcome) => {
      expect(outcome.behaviour).toBe("allow");
    });
  });

  test("Full access on: a change of notifications asks, and Full access does not lift it", async () => {
    const outcome = await gate(notifications, "full", SETTING_CHANGE_REASON);
    expect(outcome.behaviour).toBe("ask");
    expect(outcome.source).toBe("always_ask");
  });

  test("Full access without payments on: a change of notifications still asks", async () => {
    const outcome = await gate(
      notifications,
      "no_payments",
      SETTING_CHANGE_REASON,
    );
    expect(outcome.behaviour).toBe("ask");
    expect(outcome.source).toBe("always_ask");
  });

  test("Full access off: the change asks as well", async () => {
    const outcome = await gate(notifications, undefined, SETTING_CHANGE_REASON);
    expect(outcome.behaviour).toBe("ask");
    expect(outcome.source).toBe("always_ask");
  });

  test("a security setting asks too, with Full access on or off, because the gate cannot tell it apart by its words", async () => {
    // The change tool is the one door. Whether a key is on the list is decided by the tool itself, and
    // a refusal there is proved in `settings-in-chat.integration.test.ts`. Here the gate must hold the
    // call to a card, so no security setting can ever be changed without the person's answer.
    for (const fullAccess of ["full", "no_payments", undefined] as const) {
      for (const setting of [
        "fullAccess",
        "approvals",
        "computer",
        "connections",
      ]) {
        const attempt = settingCall({ setting, value: "full" });
        const outcome = await gate(attempt, fullAccess, SETTING_CHANGE_REASON);
        expect(outcome.behaviour).toBe("ask");
        expect(outcome.source).toBe("always_ask");
      }
    }
  });
});
