import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { createPluginRoutes } from "../src/plugins/routes";

/**
 * Connecting a mailbox from the chat's button (docs/design/connect-from-chat.md): the form names the
 * member that will use it, and the server gives that member the app's tools only for an administrator,
 * only for a member that exists, and never reads anything but the member's id from that field.
 */

const BODY = {
  address: "maya@example.com",
  appPassword: "qwertyuiopasdfgh",
  calendarUrl: "",
};

function app(role: "admin" | "user", registered = true) {
  const granted: { serverId: string; agentId: string; reason: string }[] = [];
  const store = {
    brokerProvider: "composio" as const,
    serverAddress: async () => ({ url: "https://imap.gmail.com/" }),
    connectUserSecret: async () => ({
      address: "maya@example.com",
      calendar: false,
      reconnected: false,
    }),
    agentIsRegistered: async () => registered,
    grantAutomatically: async (
      serverId: string,
      agentId: string,
      reason: string,
    ) => {
      granted.push({ serverId, agentId, reason });
      return ["a", "b", "c"];
    },
  };
  const routes = createPluginRoutes(
    store as never,
    async (context, next) => {
      context.set("actor", {
        id: "user-1",
        email: "person@example.test",
        role,
      } as never);
      await next();
    },
    async () => true,
    {
      publicUrl: "https://openbot.example",
      appUrl: "https://app.example",
      encryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      personHasAccess: async () => true,
    },
  );
  return { hono: new Hono().route("/api/plugins", routes), granted };
}

const post = (hono: Hono, body: unknown) =>
  hono.request(
    `http://t/api/plugins/servers/${GOOGLE_APP_PASSWORD}/secret-connection`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

describe("POST secret-connection with a member", () => {
  test("an administrator's connection gives the named member the app's tools, once", async () => {
    const { hono, granted } = app("admin");
    const response = await post(hono, { ...BODY, botId: "inbox" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      connected: true,
      botGranted: 3,
    });
    expect(granted).toEqual([
      {
        serverId: GOOGLE_APP_PASSWORD,
        agentId: "inbox",
        reason: "connected_from_chat",
      },
    ]);
  });

  test("a person who is not an administrator connects, and the member gets nothing", async () => {
    const { hono, granted } = app("user");
    const response = await post(hono, { ...BODY, botId: "inbox" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ botGranted: 0 });
    expect(granted).toEqual([]);
  });

  test("a member that does not exist is given nothing", async () => {
    const { hono, granted } = app("admin", false);
    const response = await post(hono, { ...BODY, botId: "nobody" });
    expect(response.status).toBe(200);
    expect(granted).toEqual([]);
  });

  test("without a member the connection is what it always was", async () => {
    const { hono, granted } = app("admin");
    const body = await (await post(hono, BODY)).json();
    expect(body).toEqual({
      connected: true,
      address: "maya@example.com",
      calendar: false,
      reconnected: false,
    });
    expect(granted).toEqual([]);
  });

  test("the answer never carries what was pasted", async () => {
    const { hono } = app("admin");
    const text = await (await post(hono, { ...BODY, botId: "inbox" })).text();
    expect(text).not.toContain(BODY.appPassword);
  });
});
