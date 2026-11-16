/**
 * The programs broker (docs/design/programs-on-your-computer.md, S1, D60): queue, lease, expiry, stop and
 * the HMAC on every poll and every operation, against a helper played in process.
 *
 * The clock is a variable the test moves; nothing here waits for a timer or counts ticks.
 */
import { describe, expect, test } from "bun:test";
import {
  createProgramsBroker,
  ProgramsRefusedError,
} from "../src/programs/broker";
import { parseAction } from "../src/programs/protocol";
import {
  INSTALLED,
  operationIsGenuine,
  pollBody,
  resultBody,
  UPDATES,
  type WireOperation,
} from "./support/programs-helper";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

async function setup(options: { on?: boolean; up?: boolean } = {}) {
  const clock = { at: 1_000_000 };
  const state = { on: options.on ?? true };
  const broker = createProgramsBroker({
    deploymentKey: KEY,
    now: () => clock.at,
    enabled: async () => state.on,
    sweepEveryMs: 0,
  });
  const actor = `person-${crypto.randomUUID()}`;
  const secret = broker.helperSecretFor(actor);
  const poll = (overrides?: Parameters<typeof pollBody>[3]) =>
    broker.poll(pollBody(secret, actor, clock.at, overrides));
  /** One poll that must bring one operation, which must be genuine. */
  const fetchOne = async (): Promise<WireOperation> => {
    const got = await poll();
    if (!got.ok) throw new Error(`poll refused: ${got.reason}`);
    const [op] = got.operations as unknown as WireOperation[];
    if (!op) throw new Error("no operation");
    expect(operationIsGenuine(secret, op)).toBe(true);
    return op;
  };
  const answer = (
    op: WireOperation,
    payload: unknown,
    extra: Partial<Parameters<typeof resultBody>[1]> = {},
  ) =>
    broker.result(
      resultBody(secret, {
        actorId: actor,
        operationId: op.operationId,
        at: clock.at,
        ok: true,
        payload,
        ...extra,
      }),
    );
  /** Let a call reach the queue: the broker asks the switch before it queues. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  // The helper is polling, as it does, unless a test says it is not.
  if (options.up !== false) await poll();
  return { broker, clock, state, actor, secret, poll, fetchOne, answer, flush };
}

describe("the operation schema has no command", () => {
  test("the four fixed actions parse, with exactly their own fields", () => {
    expect(parseAction({ kind: "list_installed" })).toEqual({
      kind: "list_installed",
    });
    expect(parseAction({ kind: "list_updates" })).toEqual({
      kind: "list_updates",
    });
    expect(
      parseAction({
        kind: "update_one",
        id: "Example.ExampleEdit",
        source: "winget",
        versionNow: "4.2.1",
        versionAvailable: "4.3.0",
      }).kind,
    ).toBe("update_one");
    expect(
      parseAction({
        kind: "install_one",
        id: "Example.ExampleEdit",
        source: "msstore",
        version: "4.3.0",
      }).kind,
    ).toBe("install_one");
  });

  test("a payload carrying a command, an extra argument or an unknown action is rejected", () => {
    const bad: unknown[] = [
      { kind: "list_installed", command: "winget list" },
      { kind: "list_installed", args: ["--all"] },
      { kind: "list_updates", id: "Example.ExampleEdit" },
      { kind: "run_command", command: "calc.exe" },
      { kind: "uninstall_one", id: "Example.ExampleEdit" },
      {
        kind: "install_one",
        id: "x",
        source: "winget",
        version: "1",
        command: "x",
      },
      { kind: "update_one", id: "x", source: "winget", versionNow: "1" },
      {
        kind: "update_one",
        id: "x",
        source: "chocolatey",
        versionNow: "1",
        versionAvailable: "2",
      },
      { kind: "install_one", id: "a\nb", source: "winget", version: "1" },
      { command: "winget list" },
      {},
      "list_installed",
      null,
    ];
    for (const value of bad) expect(() => parseAction(value)).toThrow();
  });

  test("the schema source has no field named command at all", async () => {
    const text = await Bun.file(
      new URL("../src/programs/protocol.ts", import.meta.url),
    ).text();
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bcommand\b/i);
  });
});

describe("a poll is checked every time", () => {
  test("a correct poll is answered, and brings the operation", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    const op = await t.fetchOne();
    expect(op.action).toEqual({ kind: "list_installed" });
    expect(op.actorId).toBe(t.actor);
    expect(op.botId).toBe("fixer");
    await t.answer(op, INSTALLED);
    await expect(call).resolves.toMatchObject({ kind: "list_installed" });
  });

  test("a wrong mac, a mac made with another person's secret and a body with a missing field are refused", async () => {
    const t = await setup();
    const other = createProgramsBroker({
      deploymentKey: KEY,
      enabled: async () => true,
      sweepEveryMs: 0,
    }).helperSecretFor("someone-else");
    for (const got of [
      await t.poll({ secret: "not-the-secret" }),
      await t.poll({ secret: other }),
      await t.broker.poll({ actorId: t.actor, ts: t.clock.at, nonce: "n" }),
      await t.broker.poll({
        ...pollBody(t.secret, t.actor, t.clock.at),
        mac: "",
      }),
      await t.broker.poll(null),
    ])
      expect(got.ok).toBe(false);
  });

  test("an expired timestamp is refused, and so is one from the future", async () => {
    const t = await setup();
    const stale = await t.broker.poll(
      pollBody(t.secret, t.actor, t.clock.at - 31_000),
    );
    const early = await t.broker.poll(
      pollBody(t.secret, t.actor, t.clock.at + 31_000),
    );
    expect(stale.ok).toBe(false);
    expect(early.ok).toBe(false);
    const fine = await t.broker.poll(
      pollBody(t.secret, t.actor, t.clock.at - 29_000),
    );
    expect(fine.ok).toBe(true);
  });

  test("a replayed poll (same nonce) is refused, the first time it passed", async () => {
    const t = await setup();
    const body = pollBody(t.secret, t.actor, t.clock.at);
    expect((await t.broker.poll(body)).ok).toBe(true);
    const again = await t.broker.poll(body);
    expect(again).toMatchObject({ ok: false });
  });

  test("an unauthenticated poll never uses up a nonce, and counts as no connection", async () => {
    const t = await setup({ up: false });
    await t.poll({ secret: "not-the-secret", nonce: "n-1" });
    expect(t.broker.statusFor(t.actor).connected).toBe(false);
    const good = await t.broker.poll(
      pollBody(t.secret, t.actor, t.clock.at, { nonce: "n-1" }),
    );
    expect(good.ok).toBe(true);
    expect(t.broker.statusFor(t.actor).connected).toBe(true);
  });
});

describe("a result is checked every time", () => {
  test("a wrong mac, a swapped payload, an expired timestamp and a replayed nonce are refused", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    call.catch(() => {});
    const op = await t.fetchOne();
    const genuine = resultBody(t.secret, {
      actorId: t.actor,
      operationId: op.operationId,
      at: t.clock.at,
      ok: true,
      payload: INSTALLED,
    });
    expect(t.broker.result({ ...genuine, mac: "00".repeat(32) }).ok).toBe(
      false,
    );
    // The payload is what the mac covers: another one under the same mac is refused.
    expect(
      t.broker.result({ ...genuine, payload: JSON.stringify(UPDATES) }).ok,
    ).toBe(false);
    const stale = resultBody(t.secret, {
      actorId: t.actor,
      operationId: op.operationId,
      at: t.clock.at - 31_000,
      ok: true,
      payload: INSTALLED,
    });
    expect(t.broker.result(stale).ok).toBe(false);
    const forged = resultBody("not-the-secret", {
      actorId: t.actor,
      operationId: op.operationId,
      at: t.clock.at,
      ok: true,
      payload: INSTALLED,
    });
    expect(t.broker.result(forged).ok).toBe(false);
    // None of those settled it: the genuine one still does.
    expect(t.broker.result(genuine).ok).toBe(true);
    await expect(call).resolves.toBeDefined();
    // The same body again: the nonce and the operation are spent.
    expect(t.broker.result(genuine).ok).toBe(false);
  });

  test("a result for an operation id already answered is refused, with a fresh nonce and mac", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_updates" },
    });
    await t.flush();
    const op = await t.fetchOne();
    expect((await t.answer(op, UPDATES)).ok).toBe(true);
    await call;
    expect((await t.answer(op, UPDATES)).ok).toBe(false);
  });

  test("a result for an operation never leased, or for another person's, is refused", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    call.catch(() => {});
    const queued = t.broker.statusFor(t.actor);
    expect(queued.pending).toBe(1);
    // Not leased yet: an id nobody was handed cannot be answered.
    expect(
      t.broker.result(
        resultBody(t.secret, {
          actorId: t.actor,
          operationId: "guess",
          at: t.clock.at,
          ok: true,
          payload: INSTALLED,
        }),
      ).ok,
    ).toBe(false);
    const op = await t.fetchOne();
    const otherSecret = t.broker.helperSecretFor("another-person");
    expect(
      t.broker.result(
        resultBody(otherSecret, {
          actorId: "another-person",
          operationId: op.operationId,
          at: t.clock.at,
          ok: true,
          payload: INSTALLED,
        }),
      ).ok,
    ).toBe(false);
  });

  test("an answer that is not in the agreed shape fails the call and gives the model nothing raw", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const failed = call.then(
      () => "resolved",
      (error: unknown) => error,
    );
    const op = await t.fetchOne();
    await t.answer(op, {
      items: [
        {
          name: "x",
          id: "y",
          version: "1",
          source: "winget",
          command: "rm -rf /",
        },
      ],
    });
    const error = await failed;
    expect(error).toBeInstanceOf(ProgramsRefusedError);
  });

  test("a list is cut at 500 rows and 120 characters a field, and control characters go", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const op = await t.fetchOne();
    const long = "A".repeat(300);
    const items = Array.from({ length: 600 }, (_, n) => ({
      name: `${long}\u0007${n}`,
      id: `Example.P${n}`,
      version: "1.0",
      source: "winget",
    }));
    await t.answer(op, { items });
    const got = (await call) as {
      items: { name: string }[];
      truncated: boolean;
    };
    expect(got.items.length).toBe(500);
    expect(got.truncated).toBe(true);
    expect(got.items[0]?.name.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(got)).not.toContain("\u0007");
  });
});

describe("lease, expiry and stop", () => {
  test("an operation is leased once: a second poll brings nothing, and the id is never offered again", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    call.catch(() => {});
    const op = await t.fetchOne();
    t.clock.at += 20_000; // past the 15 s lease
    const again = await t.poll();
    expect(again).toMatchObject({ ok: true, operations: [] });
    expect(op.operationId).toBeTruthy();
  });

  test("an operation expires after 120 s unanswered: the call fails, and a late answer is refused", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const failed = call.then(
      () => "resolved",
      (error: unknown) => error,
    );
    const op = await t.fetchOne();
    t.clock.at += 119_000;
    t.broker.sweep();
    expect(t.broker.statusFor(t.actor).pending).toBe(1);
    t.clock.at += 2_000;
    t.broker.sweep();
    expect(await failed).toBeInstanceOf(ProgramsRefusedError);
    expect(t.broker.statusFor(t.actor).pending).toBe(0);
    expect((await t.answer(op, INSTALLED)).ok).toBe(false);
  });

  test("the operation carries its own expiry, and it is inside the mac", async () => {
    const t = await setup();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    call.catch(() => {});
    const op = await t.fetchOne();
    expect(op.expiresAt - op.issuedAt).toBe(120_000);
    expect(
      operationIsGenuine(t.secret, { ...op, expiresAt: op.expiresAt + 1 }),
    ).toBe(false);
    expect(
      operationIsGenuine(t.secret, { ...op, action: { kind: "list_updates" } }),
    ).toBe(false);
    expect(
      operationIsGenuine(t.secret, { ...op, actorId: "someone-else" }),
    ).toBe(false);
    expect(operationIsGenuine(t.secret, { ...op, botId: "iris" })).toBe(false);
  });

  test("no helper polling means no call is queued at all", async () => {
    const t = await setup({ up: false });
    await expect(
      t.broker.call({
        actorId: t.actor,
        botId: "fixer",
        action: { kind: "list_installed" },
      }),
    ).rejects.toBeInstanceOf(ProgramsRefusedError);
    expect(t.broker.statusFor(t.actor).pending).toBe(0);
  });

  test("the connection lapses 15 s after the last good poll", async () => {
    const t = await setup({ up: false });
    await t.poll();
    expect(t.broker.statusFor(t.actor).connected).toBe(true);
    t.clock.at += 16_000;
    expect(t.broker.statusFor(t.actor).connected).toBe(false);
  });

  test("one operation at a time for a person: a second call is refused while one is in flight", async () => {
    const t = await setup();
    const first = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    first.catch(() => {});
    await t.poll();
    await expect(
      t.broker.call({
        actorId: t.actor,
        botId: "fixer",
        action: { kind: "list_updates" },
      }),
    ).rejects.toBeInstanceOf(ProgramsRefusedError);
  });

  test("stop fails what is queued and what is leased, and queues a stop for the helper", async () => {
    const t = await setup();
    await t.poll();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const failed = call.then(
      () => "resolved",
      (error: unknown) => error,
    );
    const op = await t.fetchOne();
    t.broker.stop(t.actor);
    const error = await failed;
    expect(error).toBeInstanceOf(ProgramsRefusedError);
    expect(String((error as Error).message).toLowerCase()).toContain("stop");
    expect((await t.answer(op, INSTALLED)).ok).toBe(false);
    const next = await t.poll();
    expect(
      next.ok &&
        next.operations.map((o) => (o.action as { kind: string }).kind),
    ).toEqual(["stop"]);
    const [stop] = (next.ok
      ? next.operations
      : []) as unknown as WireOperation[];
    expect(operationIsGenuine(t.secret, stop as WireOperation)).toBe(true);
  });

  test("another person's stop touches nothing of this one's", async () => {
    const t = await setup();
    await t.poll();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    t.broker.stop("somebody-else");
    const op = await t.fetchOne();
    await t.answer(op, INSTALLED);
    await expect(call).resolves.toBeDefined();
  });
});

describe("the switch turned off while an operation runs", () => {
  test("the running one finishes, the queued one fails, and no new one is leased or accepted", async () => {
    const t = await setup();
    await t.poll();
    const running = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const op = await t.fetchOne(); // leased: running
    t.state.on = false;
    t.broker.switchedOff(t.actor);
    // The one already running is let finish and its answer is taken.
    expect((await t.answer(op, INSTALLED)).ok).toBe(true);
    await expect(running).resolves.toMatchObject({ kind: "list_installed" });
    // A new one is refused at the door.
    await expect(
      t.broker.call({
        actorId: t.actor,
        botId: "fixer",
        action: { kind: "list_updates" },
      }),
    ).rejects.toBeInstanceOf(ProgramsRefusedError);
  });

  test("an operation still queued when the switch goes off fails and is never leased", async () => {
    const t = await setup();
    await t.poll();
    const queued = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    const failed = queued.then(
      () => "resolved",
      (error: unknown) => error,
    );
    t.state.on = false;
    t.broker.switchedOff(t.actor);
    expect(await failed).toBeInstanceOf(ProgramsRefusedError);
    const got = await t.poll();
    expect(
      got.ok &&
        got.operations.filter(
          (o) => (o.action as { kind: string }).kind !== "stop",
        ),
    ).toEqual([]);
  });

  test("while it is off the poll is answered with an empty list even if something was queued by a race", async () => {
    const t = await setup();
    await t.poll();
    const queued = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    queued.catch(() => {});
    t.state.on = false; // turned off with no call to switchedOff yet
    const got = await t.poll();
    expect(got).toMatchObject({ ok: true, operations: [] });
  });
});

describe("the secret", () => {
  test("it is derived per person from the deployment key, differs between people, and is not the key", () => {
    const broker = createProgramsBroker({
      deploymentKey: KEY,
      enabled: async () => true,
      sweepEveryMs: 0,
    });
    const a = broker.helperSecretFor("a").toString("hex");
    const b = broker.helperSecretFor("b").toString("hex");
    expect(a).not.toBe(b);
    expect(a).not.toContain(KEY);
    expect(a).toBe(broker.helperSecretFor("a").toString("hex"));
  });

  test("nothing the broker returns about a person carries it", async () => {
    const t = await setup();
    await t.poll();
    const call = t.broker.call({
      actorId: t.actor,
      botId: "fixer",
      action: { kind: "list_installed" },
    });
    await t.flush();
    call.catch(() => {});
    const op = await t.fetchOne();
    const shown = JSON.stringify([t.broker.statusFor(t.actor), op]);
    expect(shown).not.toContain(t.secret.toString("hex"));
    expect(shown).not.toContain(KEY);
  });
});
