import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../src/auth/guards";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { createPluginRoutes } from "../src/plugins/routes";
import { CatalogueEntryUnknownError } from "../src/plugins/store";
import { SecretRefusedError } from "../src/plugins/user-secret";

/**
 * The connection page's three routes for a pasted app password, with a store that records what it is
 * asked.
 *
 * The properties here are about what crosses the HTTP boundary: who the connection is for (the
 * session, never the body), what comes back (the address and a yes or no, never the password or the
 * calendar link), and what a refusal says (fixed words, never what was pasted).
 */

const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const PASSWORD = "qwertyuiopasdfgh";
const LINK =
  "https://calendar.google.com/calendar/ical/maya%40example.com/private-4f9a1c2b7d/basic.ics";

function signedIn(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    context.set("actor", {
      id: "user-1",
      email: "person@example.test",
      role: "user",
    } as never);
    await next();
  };
}

type Calls = {
  connect: { serverId: string; userId: string; body: unknown }[];
  disconnect: { serverId: string; userId: string; by: string }[];
  status: { serverId: string; userId: string }[];
};

function app(
  overrides: {
    connectUserSecret?: (input: {
      serverId: string;
      userId: string;
      body: unknown;
    }) => Promise<unknown>;
    userSecretStatus?: (input: {
      serverId: string;
      userId: string;
    }) => Promise<unknown>;
  } = {},
) {
  const calls: Calls = { connect: [], disconnect: [], status: [] };
  const store = {
    brokerProvider: "composio" as const,
    serverAddress: async () => ({ url: "https://imap.gmail.com/" }),
    connectUserSecret: async (input: {
      serverId: string;
      userId: string;
      body: unknown;
    }) => {
      calls.connect.push(input);
      return (
        (await overrides.connectUserSecret?.(input)) ?? {
          address: "maya@example.com",
          calendar: true,
          reconnected: false,
        }
      );
    },
    disconnectUserSecret: async (input: {
      serverId: string;
      userId: string;
      by: string;
    }) => {
      calls.disconnect.push(input);
      return { disconnected: true };
    },
    userSecretStatus: async (input: { serverId: string; userId: string }) => {
      calls.status.push(input);
      return (
        (await overrides.userSecretStatus?.(input)) ?? {
          connected: true,
          address: "maya@example.com",
          calendar: true,
          connectedAt: "2026-10-22T15:00:00.000Z",
        }
      );
    },
  };
  const routes = createPluginRoutes(
    store as never,
    signedIn(),
    async () => true,
    {
      publicUrl: "https://openbot.example",
      appUrl: "https://app.example",
      encryptionKey: ENCRYPTION_KEY,
      personHasAccess: async () => true,
    },
  );
  return { hono: new Hono().route("/api/plugins", routes), calls };
}

const url = (path: string) =>
  `http://t/api/plugins/servers/${GOOGLE_APP_PASSWORD}/${path}`;
const post = (hono: Hono, body: unknown, raw = false) =>
  hono.request(url("secret-connection"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const BODY = {
  address: "maya@example.com",
  appPassword: PASSWORD,
  calendarUrl: LINK,
};

describe("POST secret-connection", () => {
  test("connects the signed-in person and answers the address and a yes for the calendar, and nothing they pasted", async () => {
    const { hono, calls } = app();
    const response = await post(hono, BODY);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      connected: true,
      address: "maya@example.com",
      calendar: true,
      reconnected: false,
    });
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain("private-4f9a1c2b7d");
    expect(calls.connect).toEqual([
      { serverId: GOOGLE_APP_PASSWORD, userId: "user-1", body: BODY },
    ]);
  });

  test("whose connection it is comes from the session: a user in the body changes nothing", async () => {
    const { hono, calls } = app();
    await post(hono, {
      ...BODY,
      userId: "user-2",
      user: "user-2",
      by: "admin",
    });
    expect(calls.connect[0]?.userId).toBe("user-1");
  });

  test("a refusal is its own fixed sentence with its own status, and repeats nothing that was pasted", async () => {
    for (const [status, message] of [
      [400, "That does not look like an email address."],
      [422, "Gmail did not accept that address and app password."],
      [
        502,
        "Couldn't reach Gmail to check it, so nothing was saved. Try again.",
      ],
    ] as const) {
      const { hono } = app({
        connectUserSecret: async () => {
          throw new SecretRefusedError(message, status);
        },
      });
      const response = await post(hono, BODY);
      expect(response.status).toBe(status);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: message });
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain("private-4f9a1c2b7d");
      expect(text).not.toContain("maya@example.com");
    }
  });

  test("a body that is not JSON reaches the store as nothing, which it refuses", async () => {
    const { hono, calls } = app({
      connectUserSecret: async (input) => {
        if (input.body === null)
          throw new SecretRefusedError(
            "Send an email address and an app password.",
            400,
          );
        return {};
      },
    });
    const response = await post(
      hono,
      `{"address": "maya@example.com", "appPassword": "${PASSWORD}`,
      true,
    );
    expect(response.status).toBe(400);
    expect(calls.connect[0]?.body).toBeNull();
    expect(await response.text()).not.toContain(PASSWORD);
  });

  test("an app that has not been added is a 409 that says so", async () => {
    const { hono } = app({
      connectUserSecret: async () => {
        throw new CatalogueEntryUnknownError(GOOGLE_APP_PASSWORD);
      },
    });
    expect((await post(hono, BODY)).status).toBe(409);
  });
});

describe("GET secret-connection", () => {
  test("answers the person's own status: the address, a yes for the calendar and when, and nothing more", async () => {
    const { hono, calls } = app();
    const response = await hono.request(url("secret-connection"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const parsed = await response.json();
    expect(Object.keys(parsed).sort()).toEqual([
      "address",
      "calendar",
      "connected",
      "connectedAt",
    ]);
    expect(calls.status).toEqual([
      { serverId: GOOGLE_APP_PASSWORD, userId: "user-1" },
    ]);
  });
});

describe("DELETE connection", () => {
  test("ends the signed-in person's own, says Google was not asked, and takes nobody else's from the request", async () => {
    const { hono, calls } = app();
    const response = await hono.request(
      `http://t/api/plugins/servers/${GOOGLE_APP_PASSWORD}/connection?userId=user-2`,
      { method: "DELETE" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      disconnected: true,
      vendorRevoked: false,
    });
    expect(calls.disconnect).toEqual([
      { serverId: GOOGLE_APP_PASSWORD, userId: "user-1", by: "user-1" },
    ]);
  });
});
