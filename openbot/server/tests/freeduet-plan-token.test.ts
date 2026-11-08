import { describe, expect, test } from "bun:test";
import { planModelForEnvironment } from "../src/agents/plan-model";
import {
  CLAUDE_PLAN_TOKEN,
  dropClaudePlanToken,
} from "../src/freeduet/plan-token";

describe("FreeDuet and the Claude plan token", () => {
  test("drops the token, so the plan route never switches on", () => {
    const environment: Record<string, string | undefined> = {
      [CLAUDE_PLAN_TOKEN]: "sk-ant-oat01-invented",
      PICKED_HARNESS_IMAGE: "openbot-agent-claude-sdk:latest",
      PICKED_HARNESS_URL: "http://127.0.0.1:4300",
      MANAGED_AGENT_TOKEN: "invented",
    };

    expect(dropClaudePlanToken(environment)).toBe(true);
    expect(CLAUDE_PLAN_TOKEN in environment).toBe(false);
    expect(planModelForEnvironment(environment)).toBeUndefined();
  });

  test("says nothing when there is no token", () => {
    const environment: Record<string, string | undefined> = {};
    expect(dropClaudePlanToken(environment)).toBe(false);
  });

  test("is gone from the server's own process", () => {
    expect(process.env[CLAUDE_PLAN_TOKEN]).toBeUndefined();
  });
});
