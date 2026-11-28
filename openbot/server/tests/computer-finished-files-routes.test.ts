import { describe, expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { computerAccessCheck } from "../src/agents/computer-access";
import type { AppVariables } from "../src/auth/guards";
import { ActionRefusedError } from "../src/computer/gateway";
import { createComputerRoutes } from "../src/computer/routes";

/**
 * The route behind the Files panel (D194): `GET /:botId/files/finished`.
 *
 * Whoever may use a Bot's computer (and so download from it) may list its finished work, through the
 * same `canUseComputer` check as the download route; everyone else gets the answer a Bot that does
 * not exist gets. Paths that are not under out/ never leave the route.
 */

function signedIn(
  id: string,
  role: "user" | "admin" = "user",
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    context.set("actor", { id, email: `${id}@openbot.test`, role });
    await next();
  };
}

const profiles = {
  get: async (_actor: unknown, botId: string) =>
    botId === "ada"
      ? { visibility: "private", ownerUserId: "owner" }
      : botId === "team"
        ? { visibility: "public", ownerUserId: "someone" }
        : null,
};

function appFor(
  actorId: string,
  answer: () => Promise<unknown>,
  role: "user" | "admin" = "user",
) {
  const asked: Array<{ botId: string; actorId: string }> = [];
  const gateway = {
    listFinishedFiles: async (botId: string, actor: { id: string }) => {
      asked.push({ botId, actorId: actor.id });
      return answer();
    },
  } as never;
  const routes = createComputerRoutes(
    gateway,
    {} as never,
    signedIn(actorId, role),
    computerAccessCheck(profiles as never),
  );
  return { asked, hono: new Hono().route("/api/computers", routes) };
}

const GOOD = {
  files: [{ path: "out/a.pdf", name: "a.pdf", bytes: 3, modifiedMs: 5 }],
  truncated: false,
};

describe("the finished-work listing route", () => {
  test("the owner gets the list, as private data", async () => {
    const { hono, asked } = appFor("owner", async () => GOOD);
    const response = await hono.request("/api/computers/ada/files/finished");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(GOOD);
    expect(asked).toEqual([{ botId: "ada", actorId: "owner" }]);
  });

  test("an administrator, and anyone for a public member, get the list", async () => {
    expect(
      (
        await appFor("boss", async () => GOOD, "admin").hono.request(
          "/api/computers/ada/files/finished",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await appFor("anyone", async () => GOOD).hono.request(
          "/api/computers/team/files/finished",
        )
      ).status,
    ).toBe(200);
  });

  test("another person is refused as if the member did not exist, and the gateway is not asked", async () => {
    const { hono, asked } = appFor("stranger", async () => GOOD);
    const response = await hono.request("/api/computers/ada/files/finished");
    expect(response.status).toBe(404);
    expect(asked).toEqual([]);
  });

  test("a path outside out/, with .., absolute, or hidden never leaves the route", async () => {
    const { hono } = appFor("owner", async () => ({
      files: [
        { path: "notes.txt", name: "notes.txt", bytes: 1, modifiedMs: 1 },
        { path: "out/../etc/passwd", name: "passwd", bytes: 1, modifiedMs: 1 },
        { path: "/out/x", name: "x", bytes: 1, modifiedMs: 1 },
        { path: "out/.env", name: ".env", bytes: 1, modifiedMs: 1 },
        { path: "out/.hidden/a", name: "a", bytes: 1, modifiedMs: 1 },
        { path: "out/ok/b.txt", name: "b.txt", bytes: 1, modifiedMs: 1 },
      ],
      truncated: true,
    }));
    const body = (await (
      await hono.request("/api/computers/ada/files/finished")
    ).json()) as { files: Array<{ path: string }>; truncated: boolean };
    expect(body.files.map((file) => file.path)).toEqual(["out/ok/b.txt"]);
    expect(body.truncated).toBe(true);
  });

  test("a refusal by the deployment's policy is the gateway's answer, not a list", async () => {
    const { hono } = appFor("owner", async () => {
      throw new ActionRefusedError("Downloads are not allowed here.");
    });
    const response = await hono.request("/api/computers/ada/files/finished");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(JSON.stringify(await response.json())).not.toContain("a.pdf");
  });
});
