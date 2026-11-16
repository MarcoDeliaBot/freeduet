/**
 * Pairing a browser with the computer (docs/M1_PLAN.md D49): each browser has a token of its own, kept as a hash, tied to
 * the person; a phone is paired from the computer with a one-time code.
 *
 * Every test here is about a property that has to hold, and each one fails when it is broken (the mutants are listed in the
 * pull request). They run on the assembled app with sign-in, with a session as a header and the pairings in memory; the
 * table itself is `browser-pairings.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { AuditEventInput, AuditStore } from "../src/audit";
import {
  CODE_LIFETIME_MS,
  LEGACY_UPGRADE_ENDS,
  normalizeCode,
  pairingSecureNotice,
  pairCookieName,
} from "../src/auth/browser-pairings";
import { createBrowserPairingRoutes } from "../src/auth/browser-pairing-routes";
import { installCookieName, signInGate } from "../src/auth/install-secret";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  assembleSignIn,
  legacyCookie,
  pairedCookie,
  peerAt,
  SECRET,
  signInConfig,
} from "./support/signin-app";

const ORIGIN = "http://localhost:3001";
const config = signInConfig();

type Who = "admin" | "user" | "ghost";

function world(clock: { now: number } = { now: Date.now() }) {
  const events: AuditEventInput[] = [];
  const audit: AuditStore = {
    insert: async (event) => void events.push(event),
  };
  const built = assembleSignIn(config, {}, {}, { audit, now: () => clock.now });
  const ask = (
    path: string,
    options: {
      method?: string;
      who?: Who;
      cookie?: string;
      body?: unknown;
      peer?: unknown;
      headers?: Record<string, string>;
    } = {},
  ) => {
    const method = options.method ?? "GET";
    const writes = method !== "GET" && method !== "HEAD";
    return built.app.request(
      `${ORIGIN}${path}`,
      {
        method,
        headers: {
          origin: ORIGIN,
          ...(options.who ? { "x-test-session": options.who } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...(writes ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        ...(writes ? { body: JSON.stringify(options.body ?? {}) } : {}),
      },
      options.peer ?? LOOPBACK_PEER,
    );
  };
  type Body = {
    code?: string;
    canPair?: boolean;
    pairing: { id: string; label: string; kind: string };
    pairings: { id: string; current: boolean; label: string }[];
    path: string;
    remote?: boolean;
  };
  const json = async (answer: Response) => (await answer.json()) as Body;
  /** A code made by the browser paired at the computer, as `who`. */
  const mint = async (who: Who = "admin") => {
    const answer = await ask("/api/pairings/code", {
      method: "POST",
      who,
      cookie: pairedCookie(config, who),
    });
    expect(answer.status).toBe(200);
    return (await answer.json()) as { code: string; expiresInSeconds: number };
  };
  return { ...built, events, ask, json, mint, clock };
}

const quiet = {
  info: spyOn(console, "info").mockImplementation(() => {}),
  log: spyOn(console, "log").mockImplementation(() => {}),
  warn: spyOn(console, "warn").mockImplementation(() => {}),
  error: spyOn(console, "error").mockImplementation(() => {}),
};
beforeEach(() => {
  for (const spy of Object.values(quiet)) spy.mockClear();
});
afterEach(() => {
  for (const spy of Object.values(quiet)) spy.mockClear();
});

describe("who sees the pairings", () => {
  test("a remote session sees nothing of them and can mint nothing: the sentence of a limited session", async () => {
    const w = world();
    for (const [method, path] of [
      ["GET", "/api/pairings"],
      ["POST", "/api/pairings/code"],
      ["DELETE", "/api/pairings/seed-admin-computer"],
      ["PATCH", "/api/pairings/seed-admin-computer"],
      ["GET", "/api/pairings/redeem"],
    ] as const) {
      const answer = await w.ask(path, { method, who: "admin" });
      expect([method, path, answer.status]).toEqual([method, path, 403]);
      expect((await w.json(answer)).code).toBe("remote_session_limited");
    }
    // And nothing was made or ended.
    expect(w.events).toEqual([]);
  });

  test("the routes refuse an unpaired browser by themselves, with the remote limits out of the way", async () => {
    // The ledger in front of them is the first layer; this is the second, so that neither alone holds the line.
    const { pairings } = assembleSignIn(config, {}, {});
    const gate = signInGate(config, pairings);
    if (!gate) throw new Error("no gate");
    const bare = new Hono();
    bare.route(
      "/api/pairings",
      createBrowserPairingRoutes(gate, async (context, next) => {
        context.set("actor", { id: "u-admin" } as never);
        await next();
      }),
    );
    for (const [method, path] of [
      ["GET", "/api/pairings"],
      ["POST", "/api/pairings/code"],
      ["DELETE", "/api/pairings/seed-admin-computer"],
      ["PATCH", "/api/pairings/seed-admin-computer"],
    ] as const) {
      const answer = await bare.request(
        `${ORIGIN}${path}`,
        {
          method,
          headers: { "content-type": "application/json" },
          ...(method === "PATCH"
            ? { body: JSON.stringify({ label: "x" }) }
            : {}),
        },
        LOOPBACK_PEER,
      );
      expect([method, path, answer.status]).toEqual([method, path, 403]);
    }
    // And a paired browser of the same person is let in, so the 403 is the pairing and not the mount.
    const paired = await bare.request(
      `${ORIGIN}/api/pairings`,
      { headers: { cookie: pairedCookie(config, "admin") } },
      LOOPBACK_PEER,
    );
    expect(paired.status).toBe(200);
  });

  test("the browser at the computer sees the person's own pairings, with no token and no hash, and may pair another", async () => {
    const w = world();
    const answer = await w.ask("/api/pairings", {
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    const body = await w.json(answer);
    expect(body.canPair).toBe(true);
    expect((body.pairings ?? []).map((each) => each.id).sort()).toEqual([
      "seed-admin-computer",
      "seed-admin-device",
    ]);
    expect((body.pairings ?? []).find((each) => each.current)?.id).toBe(
      "seed-admin-computer",
    );
    for (const pairing of body.pairings)
      expect(Object.keys(pairing).sort()).toEqual([
        "createdAt",
        "current",
        "id",
        "kind",
        "label",
        "lastSeenAt",
      ]);
    expect(JSON.stringify(body)).not.toMatch(/token|hash|secret/i);
    // Another person's pairings are not in it.
    expect(JSON.stringify(body)).not.toContain("seed-user-");
  });

  test("a device sees the list and cannot make a code", async () => {
    const w = world();
    const cookie = pairedCookie(config, "admin", "device");
    const list = await w.json(
      await w.ask("/api/pairings", { who: "admin", cookie }),
    );
    expect(list.canPair).toBe(false);
    const minted = await w.ask("/api/pairings/code", {
      method: "POST",
      who: "admin",
      cookie,
    });
    expect(minted.status).toBe(403);
    expect(w.events).toEqual([]);
  });

  test("a token of person A never makes person B see or mint anything", async () => {
    const w = world();
    const cookie = pairedCookie(config, "admin");
    for (const [method, path] of [
      ["GET", "/api/pairings"],
      ["POST", "/api/pairings/code"],
    ] as const) {
      const answer = await w.ask(path, { method, who: "user", cookie });
      expect([path, answer.status]).toEqual([path, 403]);
    }
  });
});

describe("a code", () => {
  test("is good once: the second time it is refused, and the first made a device pairing", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    const first = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code, label: "Phone" },
    });
    expect(first.status).toBe(200);
    const second = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    expect(second.status).toBe(400);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(
      [...w.store.rows.values()].filter(
        (row) => row.kind === "device" && !row.id.startsWith("seed-"),
      ),
    ).toHaveLength(1);
  });

  test("is good for two minutes and not a second longer", async () => {
    const clock = { now: Date.now() };
    const w = world(clock);
    const { code, expiresInSeconds } = await w.mint("admin");
    expect(expiresInSeconds).toBe(120);
    clock.now += CODE_LIFETIME_MS - 1_000;
    // Within the time: good. (A fresh code for the late case.)
    const ok = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    expect(ok.status).toBe(200);

    const { code: later } = await w.mint("admin");
    clock.now += CODE_LIFETIME_MS + 1;
    const late = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code: later },
    });
    expect(late.status).toBe(400);
    expect(late.headers.get("set-cookie")).toBeNull();
  });

  test("is good only for the person who made it", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    const other = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "user",
      body: { code },
    });
    expect(other.status).toBe(400);
    expect(other.headers.get("set-cookie")).toBeNull();
    // A body that names a person is not read: it is refused, not obeyed.
    const named = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "user",
      body: { code, userId: "u-admin" },
    });
    expect(named.status).toBe(400);
    // The person who made it still has it.
    const mine = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    expect(mine.status).toBe(200);
  });

  test("a new code replaces the last one", async () => {
    const w = world();
    const first = await w.mint("admin");
    const second = await w.mint("admin");
    expect(
      (
        await w.ask("/api/pairings/redeem", {
          method: "POST",
          who: "admin",
          body: { code: first.code },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await w.ask("/api/pairings/redeem", {
          method: "POST",
          who: "admin",
          body: { code: second.code },
        })
      ).status,
    ).toBe(200);
  });

  test("is read as it is typed: any case, with or without the dash", async () => {
    expect(normalizeCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    const w = world();
    const { code } = await w.mint("admin");
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    const typed = code.replace("-", "").toLowerCase();
    expect(
      (
        await w.ask("/api/pairings/redeem", {
          method: "POST",
          who: "admin",
          body: { code: typed },
        })
      ).status,
    ).toBe(200);
  });

  test("is burned after five wrong tries in a row, so it cannot be guessed", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(
        (
          await w.ask("/api/pairings/redeem", {
            method: "POST",
            who: "admin",
            body: { code: "AAAAA-AAAAA" },
          })
        ).status,
      ).toBe(400);
    const right = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    expect(right.status).toBe(400);
  });

  test("is not taken from the address: a GET with the code in the URL does nothing, and a POST with it in the URL alone is refused", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    const before = w.store.rows.size;
    const viaGet = await w.ask(`/api/pairings/redeem?code=${code}`, {
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(viaGet.status).toBe(404);
    const viaQuery = await w.ask(`/api/pairings/redeem?code=${code}`, {
      method: "POST",
      who: "admin",
    });
    expect(viaQuery.status).toBe(400);
    expect(w.store.rows.size).toBe(before);
    expect(viaGet.headers.get("set-cookie")).toBeNull();
    expect(viaQuery.headers.get("set-cookie")).toBeNull();
  });

  test("refusals are written to the trail once a minute for each person, not once an attempt", async () => {
    const clock = { now: Date.now() };
    const w = world(clock);
    for (let attempt = 0; attempt < 25; attempt += 1)
      await w.ask("/api/pairings/redeem", {
        method: "POST",
        who: "admin",
        body: { code: "GGGGG-GGGGG" },
      });
    const failed = () =>
      w.events.filter((event) => event.eventType === "pairing.redeem_failed");
    expect(failed()).toHaveLength(1);
    // Another person has a window of their own.
    await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "user",
      body: { code: "GGGGG-GGGGG" },
    });
    expect(failed()).toHaveLength(2);
    // And the next minute, the first refusal is written again.
    clock.now += 61_000;
    await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code: "GGGGG-GGGGG" },
    });
    expect(failed()).toHaveLength(3);
  });

  test("a browser that already holds a live pairing is not paired again, and the code is not used up", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    const rows = () => w.store.rows.size;
    const before = rows();
    const refused = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      cookie: pairedCookie(config, "admin"),
      body: { code },
    });
    expect(refused.status).toBe(409);
    expect(refused.headers.get("set-cookie")).toBeNull();
    expect(rows()).toBe(before);
    // The same code is still good for a browser that is not paired.
    const ok = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    expect(ok.status).toBe(200);
    expect(rows()).toBe(before + 1);
  });

  test("redeemed with nobody signed in is nobody's: 401, and nothing is made", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    const answer = await w.ask("/api/pairings/redeem", {
      method: "POST",
      body: { code },
    });
    expect(answer.status).toBe(401);
    expect(answer.headers.get("set-cookie")).toBeNull();
  });

  test("redeeming is limited: per person, and per address, and the answer says to wait", async () => {
    const w = world();
    let limited = 0;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const answer = await w.ask("/api/pairings/redeem", {
        method: "POST",
        who: "admin",
        body: { code: "BBBBB-BBBBB" },
      });
      if (answer.status === 429) {
        limited += 1;
        expect(answer.headers.get("retry-after")).toBe("60");
      }
    }
    expect(limited).toBeGreaterThan(0);

    // One address, several people: the address is limited too.
    const v = world();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1)
      statuses.push(
        (
          await v.ask("/api/pairings/redeem", {
            method: "POST",
            who: (["admin", "user", "ghost"] as const)[attempt % 3] as Who,
            body: { code: `${attempt}`.padStart(10, "C") },
            peer: peerAt("198.51.100.4"),
          })
        ).status,
      );
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(
      0,
    );
    // The first tries are answered as wrong codes, not as limits.
    expect(statuses[0]).toBe(400);

    // The address alone, with a different person each time so that no person's own limit is reached.
    const address = "198.51.100.9";
    const outcomes: string[] = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const outcome = await v.pairings.checkCode(
        `someone-${attempt}`,
        address,
        "DDDDD-DDDDD",
      );
      outcomes.push(outcome.ok ? "ok" : outcome.reason);
    }
    expect(outcomes.slice(0, 30)).not.toContain("rate_limited");
    expect(outcomes[30]).toBe("rate_limited");

    // Loopback is every peer behind a tunnel or Docker: no address limit there, so nobody can spend it for the rest.
    const behind: string[] = [];
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const outcome = await v.pairings.checkCode(
        `behind-${attempt}`,
        "127.0.0.1",
        "EEEEE-EEEEE",
      );
      behind.push(outcome.ok ? "ok" : outcome.reason);
    }
    expect(behind).not.toContain("rate_limited");
    // The person's own limit stays there.
    const own: string[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const outcome = await v.pairings.checkCode(
        "one-person",
        "127.0.0.1",
        "FFFFF-FFFFF",
      );
      own.push(outcome.ok ? "ok" : outcome.reason);
    }
    expect(own.slice(0, 10)).not.toContain("rate_limited");
    expect(own[10]).toBe("rate_limited");
  });
});

describe("the phone", () => {
  test("a remote session redeems for its own person and is then at the computer, as a device", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    // The phone: signed in, no pairing, so remote.
    const phone = await w.json(await w.ask("/api/me", { who: "admin" }));
    expect(phone.remote).toBe(true);
    const redeemed = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code, label: "  My   phone\n" },
    });
    expect(redeemed.status).toBe(200);
    expect(redeemed.headers.get("cache-control")).toBe("no-store");
    const setCookie = redeemed.headers.get("set-cookie") as string;
    expect(setCookie).toMatch(
      new RegExp(
        `^${pairCookieName(config.port)}=[A-Za-z0-9_-]{43}; Path=/api; Max-Age=34560000; HttpOnly; SameSite=Strict$`,
      ),
    );
    const body = await w.json(redeemed);
    expect(body.pairing).toMatchObject({ kind: "device", label: "My phone" });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(setCookie).not.toContain(SECRET);

    const cookie = setCookie.split(";")[0] as string;
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie }))).remote,
    ).toBe(false);
    // The phone's token is the phone's person's alone.
    expect(
      (await w.json(await w.ask("/api/me", { who: "user", cookie }))).remote,
    ).toBe(true);
    // And it cannot make a code.
    expect(
      (
        await w.ask("/api/pairings/code", {
          method: "POST",
          who: "admin",
          cookie,
        })
      ).status,
    ).toBe(403);
  });

  test("the label has a default and a limit, and is only a name", async () => {
    const w = world();
    for (const [label, expected] of [
      [undefined, "Phone or other browser"],
      ["   ", "Phone or other browser"],
      ["x".repeat(150), "x".repeat(60)],
    ] as const) {
      const { code } = await w.mint("admin");
      const body = await w.json(
        await w.ask("/api/pairings/redeem", {
          method: "POST",
          who: "admin",
          body: { code, ...(label === undefined ? {} : { label }) },
        }),
      );
      expect(body.pairing.label).toBe(expected);
    }
  });
});

describe("revoking and renaming", () => {
  async function phone(w: ReturnType<typeof world>) {
    const { code } = await w.mint("admin");
    const answer = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code, label: "Phone" },
    });
    const cookie = (answer.headers.get("set-cookie") as string).split(
      ";",
    )[0] as string;
    const { pairing } = await w.json(answer);
    return { cookie, id: pairing.id as string };
  }

  test("a revoked pairing is remote on the very next request, with no other change", async () => {
    const w = world();
    const { cookie, id } = await phone(w);
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie }))).remote,
    ).toBe(false);
    const revoked = await w.ask(`/api/pairings/${id}`, {
      method: "DELETE",
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(revoked.status).toBe(200);
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie }))).remote,
    ).toBe(true);
    // A second revoke finds nothing.
    expect(
      (
        await w.ask(`/api/pairings/${id}`, {
          method: "DELETE",
          who: "admin",
          cookie: pairedCookie(config),
        })
      ).status,
    ).toBe(404);
  });

  test("a pairing that has ended is remote on the very next request", async () => {
    const clock = { now: Date.now() };
    const w = world(clock);
    const { cookie } = await phone(w);
    clock.now += 401 * 86_400_000;
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie }))).remote,
    ).toBe(true);
  });

  test("a computer revokes any pairing of the person; a device only itself", async () => {
    const w = world();
    const { cookie, id } = await phone(w);
    // The phone cannot end the computer's pairing.
    const refused = await w.ask("/api/pairings/seed-admin-computer", {
      method: "DELETE",
      who: "admin",
      cookie,
    });
    expect(refused.status).toBe(403);
    // Nor rename it.
    expect(
      (
        await w.ask("/api/pairings/seed-admin-computer", {
          method: "PATCH",
          who: "admin",
          cookie,
          body: { label: "mine now" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await w.json(
          await w.ask("/api/me", {
            who: "admin",
            cookie: pairedCookie(config),
          }),
        )
      ).remote,
    ).toBe(false);
    // It ends itself, and its cookie is cleared with the answer.
    const own = await w.ask(`/api/pairings/${id}`, {
      method: "DELETE",
      who: "admin",
      cookie,
    });
    expect(own.status).toBe(200);
    expect(own.headers.getSetCookie().join("\n")).toContain(
      `${pairCookieName(config.port)}=; Path=/api; Max-Age=0`,
    );
  });

  test("another person's pairing is not found, and nothing is ended", async () => {
    const w = world();
    const answer = await w.ask("/api/pairings/seed-user-computer", {
      method: "DELETE",
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(answer.status).toBe(404);
    expect(
      (
        await w.json(
          await w.ask("/api/me", {
            who: "user",
            cookie: pairedCookie(config, "user"),
          }),
        )
      ).remote,
    ).toBe(false);
  });

  test("a computer renames a pairing; the name is cleaned and cut", async () => {
    const w = world();
    const { cookie, id } = await phone(w);
    expect(
      (
        await w.ask(`/api/pairings/${id}`, {
          method: "PATCH",
          who: "admin",
          cookie: pairedCookie(config),
          body: { label: `Maya's\tphone ${"x".repeat(100)}` },
        })
      ).status,
    ).toBe(200);
    void cookie;
    const list = await w.json(
      await w.ask("/api/pairings", {
        who: "admin",
        cookie: pairedCookie(config),
      }),
    );
    const named = (list.pairings ?? []).find((each) => each.id === id);
    expect(named?.label.startsWith("Maya's phone x")).toBe(true);
    expect(named?.label.length).toBe(60);
  });
});

describe("the old cookie", () => {
  const upgraded = (w: ReturnType<typeof world>) =>
    [...w.store.rows.values()].filter((row) => !row.id.startsWith("seed-"));

  test("a signed-in browser that holds it is upgraded once to its own computer pairing, and is paired on that very request", async () => {
    const w = world();
    const answer = await w.ask("/api/me", {
      who: "admin",
      cookie: legacyCookie(config),
      headers: { "user-agent": "Mozilla/5.0 Chrome/130.0 Safari/537.36" },
    });
    expect((await w.json(answer)).remote).toBe(false);
    const cookies = answer.headers.getSetCookie();
    expect(cookies[0]).toMatch(
      new RegExp(`^${pairCookieName(config.port)}=[A-Za-z0-9_-]{43}; `),
    );
    expect(cookies[1]).toStartWith(
      `${installCookieName(config.port)}=; Path=/api; Max-Age=0`,
    );
    expect(cookies.join("\n")).not.toContain(SECRET);
    expect(upgraded(w)).toHaveLength(1);
    expect(upgraded(w)[0]).toMatchObject({
      userId: "u-admin",
      kind: "computer",
      label: "Chrome on this computer",
    });
    // The new cookie is the one that works from now on, and the old one is no longer needed.
    const next = (cookies[0] as string).split(";")[0] as string;
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie: next })))
        .remote,
    ).toBe(false);
    expect(upgraded(w)).toHaveLength(1);
    expect(w.events.map((event) => event.eventType)).toEqual([
      "pairing.redeemed",
    ]);
    expect(w.events[0]?.payload).toMatchObject({
      kind: "computer",
      via: "legacy_cookie",
    });
  });

  test("the requests a browser sends together share one upgrade, and one cookie", async () => {
    const w = world();
    const answers = await Promise.all(
      Array.from({ length: 6 }, () =>
        w.ask("/api/me", { who: "admin", cookie: legacyCookie(config) }),
      ),
    );
    expect(upgraded(w)).toHaveLength(1);
    expect(
      new Set(answers.map((each) => each.headers.getSetCookie()[0])).size,
    ).toBe(1);
  });

  test("it pairs nobody without a session, nor with a value that is not the secret", async () => {
    const w = world();
    await w.ask("/api/capabilities", { cookie: legacyCookie(config) });
    await w.ask("/api/me", {
      who: "admin",
      cookie: `${installCookieName(config.port)}=${"x".repeat(64)}`,
    });
    const refused = await w.ask("/api/me", {
      who: "admin",
      cookie: `${installCookieName(config.port)}=${SECRET.slice(0, 63)}`,
    });
    expect((await w.json(refused)).remote).toBe(true);
    expect(upgraded(w)).toHaveLength(0);
  });

  test("it is for the person signed in: a user who holds it gets a pairing of their own, never the administrator's", async () => {
    const w = world();
    await w.ask("/api/me", { who: "user", cookie: legacyCookie(config) });
    expect(upgraded(w).map((row) => row.userId)).toEqual(["u-user"]);
  });
});

describe("the old cookie, from anywhere but this machine", () => {
  const upgraded = (w: ReturnType<typeof world>) =>
    [...w.store.rows.values()].filter((row) => !row.id.startsWith("seed-"));

  test("a copy of it from another address pairs nothing: the session stays remote, and nothing is made", async () => {
    const w = world();
    const answer = await w.ask("/api/me", {
      who: "admin",
      cookie: legacyCookie(config),
      peer: peerAt("203.0.113.7"),
    });
    expect((await w.json(answer)).remote).toBe(true);
    expect(answer.headers.getSetCookie()).toEqual([]);
    expect(upgraded(w)).toHaveLength(0);
    expect(w.events).toEqual([]);
  });

  test("nor through a tunnel on this machine: loopback with the headers an intermediary adds", async () => {
    const w = world();
    for (const headers of [
      { "x-forwarded-for": "203.0.113.7" },
      { forwarded: "for=203.0.113.7" },
      { "cf-connecting-ip": "203.0.113.7" },
      { "tailscale-user-login": "someone@example.com" },
    ] as Record<string, string>[]) {
      const answer = await w.ask("/api/me", {
        who: "admin",
        cookie: legacyCookie(config),
        headers,
      });
      expect([headers, (await w.json(answer)).remote]).toEqual([headers, true]);
    }
    expect(upgraded(w)).toHaveLength(0);
  });

  test("and a revoked pairing is not made again by it: the old cookie converts nothing away from this machine", async () => {
    const w = world();
    const first = await w.ask("/api/me", {
      who: "admin",
      cookie: legacyCookie(config),
    });
    const cookie = (first.headers.getSetCookie()[0] as string).split(
      ";",
    )[0] as string;
    const [row] = upgraded(w);
    expect(
      (
        await w.ask(`/api/pairings/${row?.id}`, {
          method: "DELETE",
          who: "admin",
          cookie: pairedCookie(config, "admin"),
        })
      ).status,
    ).toBe(200);
    // The thief holds a copy of the old cookie and comes from the network.
    const again = await w.ask("/api/me", {
      who: "admin",
      cookie: `${legacyCookie(config)}; ${cookie}`,
      peer: peerAt("203.0.113.7"),
    });
    expect((await w.json(again)).remote).toBe(true);
    expect(upgraded(w).filter((each) => !each.revokedAt)).toHaveLength(0);
  });

  test("after 16 February 2027 it pairs nothing even at this machine: the end is in the code", async () => {
    const clock = { now: LEGACY_UPGRADE_ENDS - 1_000 };
    const w = world(clock);
    const before = await w.ask("/api/me", {
      who: "admin",
      cookie: legacyCookie(config),
    });
    expect((await w.json(before)).remote).toBe(false);
    clock.now = LEGACY_UPGRADE_ENDS;
    const after = await w.ask("/api/me", {
      who: "user",
      cookie: legacyCookie(config),
    });
    expect((await w.json(after)).remote).toBe(true);
    expect(after.headers.getSetCookie()).toEqual([]);
    expect(upgraded(w).map((row) => row.userId)).toEqual(["u-admin"]);
  });

  test("a person who reaches FreeDuet through a tunnel on this machine, and held the old cookie, becomes the computer with one open.sh", async () => {
    const w = world();
    const publicHeaders = {
      "x-forwarded-for": "203.0.113.7",
      "x-forwarded-proto": "https",
    };
    // After the update: signed in, the old cookie in the browser, through the public address. Remote, and told so.
    const asked = (path: string, extra: Record<string, unknown> = {}) =>
      w.ask(path, {
        who: "admin",
        // A tunnel or reverse proxy on this machine: the socket is loopback, the headers say where it came from.
        headers: publicHeaders,
        ...extra,
      });
    expect(
      (await w.json(await asked("/api/me", { cookie: legacyCookie(config) })))
        .remote,
    ).toBe(true);
    // On the machine, open.sh asks the launcher's door for a one-time link with the secret as the bearer.
    const mintLink = await w.ask("/internal/pairing", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    expect(mintLink.status).toBe(200);
    const { path } = await w.json(mintLink);
    // The browser opens it through the public address, signed in as the administrator.
    const paired = await asked(path, { cookie: legacyCookie(config) });
    expect(paired.status).toBe(303);
    const setCookies = paired.headers.getSetCookie();
    expect(setCookies[0]).toMatch(
      new RegExp(`^${pairCookieName(config.port)}=[A-Za-z0-9_-]{43}; `),
    );
    expect(setCookies.join("\n")).not.toContain(SECRET);
    const cookie = (setCookies[0] as string).split(";")[0] as string;
    // With the NEW token it is the computer, still through the public address, and can pair a phone.
    expect((await w.json(await asked("/api/me", { cookie }))).remote).toBe(
      false,
    );
    expect(
      (await asked("/api/pairings/code", { method: "POST", cookie })).status,
    ).toBe(200);
    expect(upgraded(w).map((row) => [row.userId, row.kind])).toEqual([
      ["u-admin", "computer"],
    ]);
  });
});

describe("the Secure flag follows the app address", () => {
  test("a boot notice when the public address is https and the app address is not, and none otherwise", () => {
    const https = "https://freeduet.example";
    const http = "http://localhost:3000";
    expect(pairingSecureNotice({ publicUrl: https, appUrl: http })).toContain(
      "OPENBOT_APP_URL",
    );
    expect(
      pairingSecureNotice({ publicUrl: https, appUrl: undefined }),
    ).not.toBeNull();
    expect(pairingSecureNotice({ publicUrl: https, appUrl: https })).toBeNull();
    expect(pairingSecureNotice({ publicUrl: http, appUrl: http })).toBeNull();
    expect(pairingSecureNotice({})).toBeNull();
  });
});

describe("the installation secret", () => {
  test("changing it ends every pairing, at once and at the next start", async () => {
    const w = world();
    const { createBrowserPairings } = await import(
      "../src/auth/browser-pairings"
    );
    const events: AuditEventInput[] = [];
    const next = createBrowserPairings({
      store: w.store,
      secret: `${SECRET}-changed`,
      port: config.port,
      audit: { insert: async (event) => void events.push(event) },
    });
    const request = new Request(`${ORIGIN}/api/me`, {
      headers: { cookie: pairedCookie(config) },
    });
    expect(await w.pairings.standing(request, "u-admin")).not.toBeNull();
    expect(await next.standing(request, "u-admin")).toBeNull();
    expect(await next.sweepStale()).toBe(6);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "pairing.revoked",
      payload: { by: "installation_secret_changed", count: 6 },
    });
    // Idempotent: the second start finds nothing to end.
    expect(await next.sweepStale()).toBe(0);
    expect(events).toHaveLength(1);
  });
});

describe("the trail and the logs", () => {
  test("every mint, redeem, failed redeem and revoke is a row, with no token, no code and no secret in any of them", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code: "WRONG-CODE2" },
    });
    const redeemed = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code, label: "Phone" },
    });
    const cookie = (redeemed.headers.get("set-cookie") as string).split(
      ";",
    )[0] as string;
    const token = cookie.split("=")[1] as string;
    const { pairing } = await w.json(redeemed);
    await w.ask(`/api/pairings/${pairing.id}`, {
      method: "DELETE",
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(w.events.map((event) => event.eventType)).toEqual([
      "pairing.minted",
      "pairing.redeem_failed",
      "pairing.redeemed",
      "pairing.revoked",
    ]);
    expect(w.events[0]).toMatchObject({
      actorUserId: "u-admin",
      targetType: "browser_pairing",
    });
    expect(w.events[1]?.payload).toEqual({ reason: "wrong_or_expired" });
    expect(w.events[2]?.payload).toEqual({ kind: "device", via: "code" });
    expect(w.events[3]).toMatchObject({
      targetId: pairing.id,
      payload: { by: "seed-admin-computer" },
    });
    const trail = JSON.stringify(w.events);
    for (const secret of [
      token,
      code,
      code.replace("-", ""),
      SECRET,
      pairedCookie(config).split("=")[1] as string,
    ])
      expect(trail).not.toContain(secret);
    expect(trail).not.toContain(
      createHash("sha256").update(token).digest("hex"),
    );
  });

  test("a mint that cannot be written to the trail makes no code", async () => {
    const built = assembleSignIn(
      config,
      {},
      {},
      {
        audit: {
          insert: async () => {
            throw new Error("trail is down");
          },
        },
      },
    );
    const answer = await built.app.request(
      `${ORIGIN}/api/pairings/code`,
      {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "x-test-session": "admin",
          cookie: pairedCookie(config),
        },
        body: "{}",
      },
      LOOPBACK_PEER,
    );
    expect(answer.status).toBe(500);
  });

  test("nothing logs the token, the code or the secret", async () => {
    const w = world();
    const { code } = await w.mint("admin");
    await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "user",
      body: { code },
    });
    const redeemed = await w.ask("/api/pairings/redeem", {
      method: "POST",
      who: "admin",
      body: { code },
    });
    const token = (
      (redeemed.headers.get("set-cookie") as string).split("=")[1] as string
    ).split(";")[0] as string;
    await w.ask("/api/me", { who: "admin", cookie: legacyCookie(config) });
    const logged = Object.values(quiet)
      .flatMap((spy) => spy.mock.calls)
      .map((call) => JSON.stringify(call))
      .join("\n");
    for (const forbidden of [token, code, code.replace("-", ""), SECRET])
      expect(logged).not.toContain(forbidden);
  });
});

describe("the doors that existed keep their word", () => {
  test("the launcher's door still wants the secret, and a browser that is paired does not get past it with a cookie", async () => {
    const w = world();
    const answer = await w.ask("/internal/pairing", {
      method: "POST",
      who: "admin",
      cookie: pairedCookie(config),
    });
    expect(answer.status).toBe(401);
  });

  test("the link at the computer pairs the administrator signed in, and a remote session cannot be paired by a code that was never made", async () => {
    const w = world();
    const mintLink = await w.ask("/internal/pairing", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const { path } = await w.json(mintLink);
    const paired = await w.ask(path, { who: "admin" });
    expect(paired.status).toBe(303);
    const cookie = (paired.headers.getSetCookie()[0] as string).split(
      ";",
    )[0] as string;
    expect(
      (await w.json(await w.ask("/api/me", { who: "admin", cookie }))).remote,
    ).toBe(false);
    // That cookie is the administrator's: a second signed-in person with it is remote.
    expect(
      (await w.json(await w.ask("/api/me", { who: "user", cookie }))).remote,
    ).toBe(true);
    // And it can make a code, because it is a computer pairing.
    expect(
      (
        await w.ask("/api/pairings/code", {
          method: "POST",
          who: "admin",
          cookie,
        })
      ).status,
    ).toBe(200);
  });
});
