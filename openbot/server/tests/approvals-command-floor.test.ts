/**
 * D77 (docs/M1_PLAN.md section 56): a payment or a credential change run as a command in a member's own
 * computer meets the same rule as the account action of that category. Through the real `decideAction`,
 * with a fake reviewer that counts its calls.
 */
import { describe, expect, test } from "bun:test";
import { decideAction, reviewerCategoryCounts } from "../src/approvals/policy";
import type {
  ApprovalCandidate,
  ApprovalRule,
  ApprovalTeamRule,
} from "../src/approvals/types";

type Mode = "off" | "full" | "no_payments";
type Safety = "none" | "credentials" | "security_settings" | "payments";

const run = (command: string): ApprovalCandidate => ({
  actorId: "owner",
  botId: "bot",
  toolRef: "computer_run_command",
  effect: "write",
  scope: "computer",
  args: { command },
});
const write = (path: string, contents = "x"): ApprovalCandidate => ({
  actorId: "owner",
  botId: "bot",
  toolRef: "computer_write_file",
  effect: "write",
  scope: "computer",
  args: { path, contents },
});

const reviewer =
  (
    safety: Safety,
    calls: string[],
    verdict: "proceed" | "needs_approval" = "proceed",
  ) =>
  async (prompt: string) => {
    calls.push(prompt);
    return JSON.stringify({
      verdict,
      preApproved: false,
      safety,
      reason: "Judged.",
    });
  };

const decide = (
  candidate: ApprovalCandidate,
  mode: Mode,
  safety: Safety | "down" | "none-model",
  over: { autoReview?: boolean } = {},
) => {
  const calls: string[] = [];
  const model =
    safety === "none-model"
      ? undefined
      : safety === "down"
        ? async (prompt: string) => {
            calls.push(prompt);
            throw new Error("down");
          }
        : reviewer(safety, calls);
  const outcome = decideAction({
    candidate,
    team: [] as ApprovalTeamRule[],
    personal: [] as ApprovalRule[],
    customRulesEnabled: true,
    autoReview: over.autoReview ?? true,
    askBeforeChanges: false,
    ...(mode === "off" ? {} : { fullAccess: mode }),
    ...(model ? { model } : {}),
  });
  return outcome.then((result) => ({ result, calls }));
};

const STRIPE = run("stripe charges create --amount 5000 --confirm");
const PASSWD = run("passwd marco");
const LS = run("ls -la");

describe("a payment run as a command", () => {
  test("is handed to the person with the switch off, and in 'without payments'", async () => {
    for (const mode of ["off", "no_payments"] as const) {
      const { result } = await decide(STRIPE, mode, "payments");
      expect(result).toMatchObject({ behaviour: "hand_off", source: "safety" });
    }
  });
  test("is allowed in plain Full access, as an account payment is", async () => {
    const { result } = await decide(STRIPE, "full", "payments");
    expect(result).toMatchObject({
      behaviour: "allow",
      source: "full_access",
    });
  });
});

describe("a credential or security change run as a command", () => {
  test("goes to the person in every mode", async () => {
    for (const mode of ["off", "full", "no_payments"] as const)
      for (const safety of ["credentials", "security_settings"] as const) {
        const { result } = await decide(PASSWD, mode, safety);
        expect(result).toMatchObject({
          behaviour: "hand_off",
          source: "safety",
        });
      }
  });
});

describe("an ordinary command", () => {
  test("is unchanged in every mode: no new ask, no hand-off", async () => {
    for (const mode of ["off", "full", "no_payments"] as const) {
      const { result } = await decide(LS, mode, "none");
      expect(result.behaviour).toBe("allow");
    }
  });
  test("with the reviewer asking for approval, only the switch-off modes ask (as before)", async () => {
    const off = await decide(LS, "off", "none");
    expect(off.result.behaviour).toBe("allow");
    for (const mode of ["full", "no_payments"] as const) {
      const calls: string[] = [];
      const result = await decideAction({
        candidate: LS,
        team: [],
        personal: [],
        customRulesEnabled: true,
        autoReview: true,
        askBeforeChanges: false,
        fullAccess: mode,
        model: reviewer("none", calls, "needs_approval"),
      });
      expect(result).toMatchObject({
        behaviour: "allow",
        source: "full_access",
      });
    }
  });
  test("the reviewer runs once per command under Full access, never for a read or another tool", async () => {
    for (const mode of ["full", "no_payments"] as const) {
      const { calls } = await decide(LS, mode, "none");
      expect(calls).toHaveLength(1);
      const file = await decide(write("notes.txt"), mode, "payments");
      expect(file.calls).toHaveLength(0);
      expect(file.result.source).toBe("full_access");
    }
    const read = await decide({ ...LS, effect: "read" }, "full", "payments");
    expect(read.calls).toHaveLength(0);
  });
});

describe("a reviewer that cannot be reached", () => {
  test("leaves Full access as it was (allow), and the switch off as it was (ask)", async () => {
    for (const mode of ["full", "no_payments"] as const) {
      const { result } = await decide(STRIPE, mode, "down");
      expect(result).toMatchObject({
        behaviour: "allow",
        source: "full_access",
      });
      const none = await decide(STRIPE, mode, "none-model");
      expect(none.result.source).toBe("full_access");
    }
    const { result } = await decide(STRIPE, "off", "down");
    expect(result).toMatchObject({ behaviour: "ask", source: "auto_review" });
  });
});

describe("a file write", () => {
  test("an ordinary file never meets the category, even if the reviewer names one", async () => {
    for (const path of ["notes.txt", "config.env", "report.md"]) {
      const { result } = await decide(write(path), "off", "payments");
      expect(result.behaviour).toBe("allow");
    }
    expect(reviewerCategoryCounts(write("notes.txt"))).toBeFalse();
  });
  test("a script or an executable does", async () => {
    for (const file of [
      write("pay.sh"),
      write("job.py"),
      write("run", "#!/bin/sh\nstripe ..."),
    ]) {
      const { result } = await decide(file, "off", "payments");
      expect(result).toMatchObject({ behaviour: "hand_off", source: "safety" });
    }
  });
  test("a routine's ordinary file write waits for no card", async () => {
    const { result } = await decide(write("notes.txt"), "off", "none", {
      autoReview: false,
    });
    expect(result.behaviour).toBe("allow");
  });
});

describe("a routine's command (no Full access, nobody at the desk)", () => {
  test("a payment command is a hand-off when the reviewer is on", async () => {
    const { result } = await decide(STRIPE, "off", "payments");
    expect(result).toMatchObject({ behaviour: "hand_off", source: "safety" });
  });
  test("with auto-review off nothing reads the command, as before", async () => {
    const { result, calls } = await decide(STRIPE, "off", "payments", {
      autoReview: false,
    });
    expect(calls).toHaveLength(0);
    expect(result.behaviour).toBe("allow");
  });
});

describe("other tools are unchanged", () => {
  test("an account tool, a host command and a read", async () => {
    expect(reviewerCategoryCounts({ ...LS, toolRef: "mcp/bank/x" })).toBeTrue();
    expect(reviewerCategoryCounts({ ...LS, toolRef: "host/run" })).toBeFalse();
    expect(reviewerCategoryCounts({ ...LS, effect: "read" })).toBeFalse();
    const { result } = await decide(
      { ...LS, toolRef: "host/run", args: { command: "ls" } },
      "off",
      "payments",
    );
    expect(result.behaviour).toBe("allow");
  });
});
