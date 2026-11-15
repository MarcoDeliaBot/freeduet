import { describe, expect, test } from "bun:test";
import { readConnectPrompt } from "@openbot/shared/connect-prompt";
import type { AppAccess } from "../src/plugins/app-access";
import { appAccessTools } from "../src/plugins/app-access-tool";
import type { AppInspection } from "../src/plugins/plugin-store/app-access";

/** `show_app_access` with a member: the card, and the button's link, are about the member who will use the app. */

const access = {
  key: "google-imap",
  displayName: "Gmail and Google Calendar (app password)",
  logo: null,
  provider: "catalogue",
  account: "personal",
  connect: "key",
  authScheme: null,
  accountMode: "personal",
  state: "not_connected",
  unavailable: null,
  accountHolder: "you",
  asksFirst: false,
  granted: true,
  connectedAt: null,
  requestKind: null,
  request: null,
} as unknown as AppAccess;

function toolOver(registered: string[]) {
  const asked: { agentId: string }[] = [];
  const [tool] = appAccessTools({
    store: {
      inspectApp: async (input) => {
        asked.push({ agentId: input.agentId });
        return { access } as unknown as AppInspection;
      },
      isPackageMember: async (id: string) => registered.includes(id),
    },
    botId: "freeduet",
    actorId: "usr_1",
    composioConfigured: false,
  });
  if (!tool) throw new Error("no tool");
  return { tool, asked };
}

describe("show_app_access with a member", () => {
  test("asks about, and draws the card for, the member who will use the app", async () => {
    const { tool, asked } = toolOver(["inbox"]);
    const answer = await tool.execute({ app: "Gmail", member: "inbox" });
    expect(asked).toEqual([{ agentId: "inbox" }]);
    expect(readConnectPrompt(answer)?.agentId).toBe("inbox");
  });

  test("without a member the card is about the Bot that asked", async () => {
    const { tool, asked } = toolOver(["inbox"]);
    const answer = await tool.execute({ app: "Gmail" });
    expect(asked).toEqual([{ agentId: "freeduet" }]);
    expect(readConnectPrompt(answer)?.agentId).toBe("freeduet");
  });

  test("a Bot that is not a member of the package draws no card", async () => {
    const { tool, asked } = toolOver(["inbox"]);
    const answer = await tool.execute({ app: "Gmail", member: "nobody" });
    expect(asked).toEqual([]);
    expect(readConnectPrompt(answer)).toBeNull();
    expect(answer).toContain("There is no team member called nobody");
  });
});
