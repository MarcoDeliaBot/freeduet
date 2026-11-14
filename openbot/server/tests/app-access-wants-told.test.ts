import { describe, expect, test } from "bun:test";
import { readConnectPrompt } from "@openbot/shared/connect-prompt";
import {
  type AppAccess,
  type AppAccessState,
  REQUEST_KIND_FOR,
  requestKindFor,
  type WantedTool,
} from "../src/plugins/app-access";
import { appAccessTools } from "../src/plugins/app-access-tool";
import type { AppInspection } from "../src/plugins/plugin-store/app-access";
import { grantedToolGuidance } from "../src/plugins/tools";

/**
 * What a Bot is told when its own skills need a tool it was never given (issue #102, docs/M1_PLAN.md
 * D30): the sentence the model reads, in the words of a one-person deployment and of every other, and
 * the one request the card carries.
 *
 * Pure: the store is a stub, so nothing here depends on a database. What the store puts in `wants` is
 * the integration suite's to prove (`app-access-wants.integration.test.ts`).
 */

const SEND: WantedTool = {
  ref: "composio-gmail/GMAIL_SEND_EMAIL",
  name: "GMAIL_SEND_EMAIL",
  label: "Send a new email",
  read: false,
};
const REPLY: WantedTool = {
  ref: "composio-gmail/GMAIL_REPLY",
  name: "GMAIL_REPLY",
  label: "Answer a customer",
  read: false,
};

function access(state: AppAccessState, wants?: WantedTool[]): AppAccess {
  return {
    key: "composio-gmail",
    displayName: "Gmail",
    logo: null,
    provider: "composio",
    account: "personal",
    connect: "consent",
    authScheme: "OAUTH2",
    accountMode: "personal",
    state,
    unavailable: null,
    accountHolder: "you",
    asksFirst: false,
    granted: state === "ready",
    connectedAt: null,
    requestKind: requestKindFor(state, wants ?? []),
    request: null,
    ...(wants === undefined ? {} : { wants }),
  };
}

async function told(
  answer: AppAccess,
  singleUser?: boolean,
): Promise<{ answer: string; message: string | undefined }> {
  const [tool] = appAccessTools({
    store: {
      inspectApp: async () => ({ access: answer }) as unknown as AppInspection,
    },
    botId: "expenses",
    actorId: "usr_7",
    composioConfigured: true,
    ...(singleUser === undefined ? {} : { singleUser }),
  });
  if (!tool) throw new Error("no tool");
  const text = await tool.execute({ app: "gmail" });
  return { answer: text, message: readConnectPrompt(text)?.message };
}

describe("the request an app in each state files", () => {
  test("a ready app whose Bot is missing a tool its skills need files the same grant request a Bot holding nothing files", () => {
    expect(requestKindFor("ready", [SEND])).toBe("grant");
    expect(requestKindFor("not_granted", [])).toBe("grant");
  });

  test("a ready app with nothing wanted still has no request, as before", () => {
    expect(requestKindFor("ready", [])).toBeNull();
    expect(REQUEST_KIND_FOR.ready).toBeNull();
  });

  test.each(
    Object.keys(REQUEST_KIND_FOR).filter(
      (state) => state !== "ready",
    ) as AppAccessState[],
  )(
    "%s is unchanged by a list of wanted tools: it has a step of its own first",
    (state) => {
      expect(requestKindFor(state, [SEND])).toBe(REQUEST_KIND_FOR[state]);
      expect(requestKindFor(state, [])).toBe(REQUEST_KIND_FOR[state]);
    },
  );
});

describe("show_app_access for an app whose Bot is missing a tool its skills need", () => {
  test("names the tool and the skill that needs it, and says what to do, on a deployment with administrators", async () => {
    const { message } = await told(access("ready", [SEND]), false);
    expect(message).toBe(
      "Gmail is ready for this person to use through you, except for GMAIL_SEND_EMAIL (Send a new email): your skills need this tool and you have not been granted it. The card in front of the person lets them ask an administrator to grant it to you. Say plainly that you cannot do that part yet because you have not been granted it. Do not try another tool to get around it, and do not browse to its website or ask them to sign in there.",
    );
  });

  test("tells the Bot on a one-person deployment that the person can allow it themselves, and where", async () => {
    const { message } = await told(access("ready", [SEND]), true);
    expect(message).toBe(
      "Gmail is ready for this person to use through you, except for GMAIL_SEND_EMAIL (Send a new email): your skills need this tool and you have not been granted it. This person is the only one here, so they can allow it themselves: the card in front of them has Request access, and they approve it under Requests on the Plugins page of Admin, in settings. Tell them plainly that you have not been granted it and that they can do it themselves. Do not try another tool to get around it, and do not browse to its website or ask them to sign in there.",
    );
    expect(message).not.toContain("dministrator");
  });

  test("a deployment that never said it is a one-person one reads the administrator sentence", async () => {
    const unsaid = await told(access("ready", [SEND]));
    expect(unsaid.message).toBe(
      (await told(access("ready", [SEND]), false)).message,
    );
    expect(unsaid.message).toContain("ask an administrator");
  });

  test("names every tool when there are several, and says them and these", async () => {
    const { message } = await told(access("ready", [REPLY, SEND]), true);
    expect(message).toContain(
      "except for GMAIL_REPLY (Answer a customer), GMAIL_SEND_EMAIL (Send a new email): your skills need these tools and you have not been granted them.",
    );
    expect(message).toContain("they can allow them themselves");
    expect(message).toContain("that you have not been granted them");
  });

  test("still draws the card for the app, as an access card, and shows nothing as granted", async () => {
    const { answer } = await told(access("ready", [SEND]), true);
    expect(readConnectPrompt(answer)).toMatchObject({
      serverId: "composio-gmail",
      title: "Gmail",
      agentId: "expenses",
      reason: "access",
    });
  });

  test("an app with nothing wanted reads exactly as it did, whether the list is absent or empty", async () => {
    const plain = "Gmail is ready for this person to use through you.";
    expect((await told(access("ready"))).message).toStartWith(plain);
    expect((await told(access("ready", []))).message).toBe(
      (await told(access("ready"))).message,
    );
    expect((await told(access("ready"), true)).message).toBe(
      (await told(access("ready"))).message,
    );
    expect((await told(access("ready"))).message).not.toContain("except for");
  });

  test.each([
    "not_connected",
    "reconnect",
    "shared_not_connected",
    "shared_not_approved",
    "disabled",
    "not_granted",
  ] as const)(
    "%s keeps its own step: wanted tools do not change what it says",
    async (state) => {
      for (const alone of [false, true])
        expect((await told(access(state, [SEND]), alone)).message).toBe(
          (await told(access(state), alone)).message,
        );
    },
  );
});

describe("what the Bot's instructions say about a tool its skill names and it does not hold", () => {
  const drive = [
    { name: "mcp__google-drive__search_files" },
    { name: "mcp__google-drive__read_file_content" },
  ] as never[];
  const card = { name: "show_app_access" } as never;
  const flat = (text: string) => text.replace(/\s+/g, " ");

  test("a Bot offered the card is told to call it for that tool rather than only say so", () => {
    const guidance = flat(grantedToolGuidance([...drive, card]));
    expect(guidance).toContain(
      "If it is a tool one of your skills names that you do not hold, call show_app_access with that system's name rather than only saying so: it tells you which tool is missing and who can give it, and puts a card in front of the person with the button that asks for it.",
    );
  });

  test("the paragraph it extends is still there, word for word, before it", () => {
    const guidance = flat(grantedToolGuidance([...drive, card]));
    const old =
      "If one of these systems is involved and no tool above covers the part you need, that is a missing grant and not something to work around. Say so plainly, name the capability you would need, and say an administrator can grant it on that connector. Do not reach for the browser, do not ask the person to sign in, and do not ask them to fetch it for you: they already have the access, and the thing that is missing is yours, not theirs.";
    expect(guidance).toContain(old);
    expect(guidance.indexOf(old)).toBeLessThan(
      guidance.indexOf("If it is a tool one of your skills names"),
    );
  });

  test("a Bot that is not offered the card reads what it always did", () => {
    const guidance = grantedToolGuidance(drive);
    expect(guidance).not.toContain("show_app_access");
    expect(guidance).not.toContain("one of your skills names");
    expect(guidance).toContain("an administrator can grant it");
  });

  test("a Bot holding only the card, or nothing, is not told about a tool it cannot be missing", () => {
    expect(grantedToolGuidance([card])).not.toContain(
      "one of your skills names",
    );
    expect(grantedToolGuidance([])).toBe("");
  });
});
