import { describe, expect, test } from "bun:test";
import type { AuditEventInput, AuditStore } from "../src/audit";
import {
  createComputerGateway,
  WorkspaceRefusedError,
} from "../src/computer/gateway";
import type { ActionPolicy } from "../src/computer/policy";
import type { ComputerProvider } from "../src/computer/provider";

/**
 * The computer's refusal to type into a secret field cannot be lifted from the server (D76).
 *
 * The refusal is made on the computer, below the approval gate, so a policy that allows everything
 * (the most permissive thing the gateway knows) still gets the refusal back, as the member's
 * answer, and the audit trail says the action was allowed and then failed, never what was typed.
 */
const SENTENCE =
  "This field is for a password, a code or a card number, so the person types it themselves. Nothing was typed.";
const TYPED = "hunter2-do-not-keep";

function setup() {
  const rows: AuditEventInput[] = [];
  const auditStore: AuditStore = {
    insert: async (event) => void rows.push(event),
  };
  const provider: ComputerProvider = {
    name: "test",
    isolation: "per-bot",
    locate: async () => "http://agent-computer:4100",
    status: async (botId) => ({ botId, state: "ready" }),
    stop: async () => ({ wasRunning: true }),
    reset: async () => ({ cleared: true }),
    list: async () => [],
  };
  const reached: string[] = [];
  const fetchImpl = (async (url: string) => {
    const path = new URL(url).pathname;
    reached.push(path);
    if (path === "/snapshot")
      return Response.json({
        snapshotId: 1,
        url: "https://example.com/login",
        title: "Login",
        truncated: false,
        elements: [
          { ref: "e1", role: "textbox", name: "Notes", type: "password" },
        ],
      });
    return Response.json(
      { error: SENTENCE, secretField: true },
      { status: 403 },
    );
  }) as unknown as typeof fetch;
  const open: ActionPolicy = { mode: "enforce", deny: [], allow: ["true"] };
  const gateway = createComputerGateway({
    provider,
    fetchImpl,
    auditStore,
    policy: () => open,
  });
  return { gateway, rows, reached };
}

describe("a refusal made on the computer", () => {
  test("reaches the member with the sentence, whatever the policy allows", async () => {
    const { gateway, rows, reached } = setup();
    await gateway.snapshot("bot-1");
    const error = await gateway
      .type(
        "bot-1",
        { id: "dev-local-user" },
        { ref: "e1", snapshotId: 1, text: TYPED },
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(WorkspaceRefusedError);
    expect((error as Error).message).toBe(SENTENCE);
    // The policy let it through, so the refusal came from the computer's answer.
    expect(reached).toContain("/type");
    expect(rows.map((row) => row.eventType)).toEqual([
      "computer.action_allowed",
      "computer.action_failed",
    ]);
    expect(JSON.stringify(rows)).not.toContain(TYPED);
  });
});
