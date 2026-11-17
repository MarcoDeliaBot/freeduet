/**
 * D74 without a database: the memory store and the service tie a pairing to the session it was seen with, and
 * `observeSession` asks who the session is at most once a minute for the same cookies.
 */
import { describe, expect, test } from "bun:test";
import {
  createBrowserPairings,
  createMemoryPairingStore,
} from "../src/auth/browser-pairings";

const SECRET = "s".repeat(40);
const clock = { now: Date.now() };

function make() {
  const ended: string[] = [];
  const store = createMemoryPairingStore(async (userId, sessionId) => {
    ended.push(`${userId}:${sessionId}`);
    return true;
  });
  const service = createBrowserPairings({
    store,
    secret: SECRET,
    port: 3001,
    now: () => clock.now,
  });
  return { ended, store, service };
}
const withCookie = (setCookie: string) =>
  new Request("http://localhost:3001/api/me", {
    headers: { cookie: setCookie.split(";")[0] as string },
  });

describe("a pairing and its session", () => {
  test("observeSession records the session, asks once a minute for the same cookies, and at once for new ones", async () => {
    const { store, service } = make();
    const made = await service.issue("u1", "device", "Phone", "code");
    let asked = 0;
    const resolve = (sessionId: string) => async () => {
      asked += 1;
      return { userId: "u1", sessionId };
    };
    await service.observeSession(withCookie(made.setCookie), resolve("s1"));
    expect(store.rows.get(made.id)?.sessionId).toBe("s1");
    await service.observeSession(withCookie(made.setCookie), resolve("s1"));
    expect(asked).toBe(1);
    clock.now += 61_000;
    await service.observeSession(withCookie(made.setCookie), resolve("s2"));
    expect(asked).toBe(2);
    expect(store.rows.get(made.id)?.sessionId).toBe("s2");
  });

  test("a request with no pairing cookie, or no session, records nothing and fails nothing", async () => {
    const { store, service } = make();
    const made = await service.issue("u1", "device", "Phone", "code");
    let asked = 0;
    await service.observeSession(
      new Request("http://localhost:3001/api/me"),
      async () => {
        asked += 1;
        return null;
      },
    );
    expect(asked).toBe(0);
    await service.observeSession(withCookie(made.setCookie), async () => null);
    await service.observeSession(withCookie(made.setCookie), async () => {
      throw new Error("lookup failed");
    });
    expect(store.rows.get(made.id)?.sessionId).toBeUndefined();
  });

  test("a revoke ends the session on the pairing, except the revoking browser's own", async () => {
    const { ended, store, service } = make();
    const phone = await service.issue("u1", "device", "Phone", "code");
    store.rows.get(phone.id)!.sessionId = "phone-session";
    expect(await service.revoke("u1", phone.id, "x", "phone-session")).toEqual({
      sessionEnded: false,
    });
    const again = await service.issue("u1", "device", "Phone", "code");
    store.rows.get(again.id)!.sessionId = "other-session";
    expect(await service.revoke("u1", again.id, "x", "phone-session")).toEqual({
      sessionEnded: true,
    });
    expect(ended).toEqual(["u1:other-session"]);
  });

  test("another person's pairing is not found, so none of their sessions end", async () => {
    const { ended, store, service } = make();
    const theirs = await service.issue("u2", "device", "Phone", "code");
    store.rows.get(theirs.id)!.sessionId = "their-session";
    expect(await service.revoke("u1", theirs.id, "x")).toBeNull();
    expect(ended).toEqual([]);
  });
});
