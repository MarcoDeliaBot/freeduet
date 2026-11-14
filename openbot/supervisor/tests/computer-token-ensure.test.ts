import { beforeEach, describe, expect, mock, test } from "bun:test";
import { computerTokenFor } from "../src/computer-token";
import { environmentFor } from "../src/environment";
import { namesFor, NAMESPACE } from "../src/names";

/**
 * What the supervisor gives each Bot's computer as its token, and what it does about computers that
 * were made when every computer shared one (docs/design/per-computer-token.md).
 *
 * The engine is a record: dockerode is replaced by a fake class through a module mock, as in
 * documents-ensure.test.ts, because the root `tests` job does not install the supervisor's own
 * dependencies. The questions are about the calls `ensure` makes and what it says back: two Bots get
 * different tokens, a computer that is made again gets the token it had, the secret the tokens are
 * made from is in nothing the engine is asked to create, and an old computer holding the shared token
 * is replaced with its volumes kept.
 */

type Fake = {
  labels: Record<string, string>;
  env: string[];
  binds: string[];
  running: boolean;
};

const containers = new Map<string, Fake>();
const volumes = new Set<string>();
const calls: string[] = [];
const removeOptions: unknown[] = [];
/** Everything each `createContainer` was given, whole, so a secret cannot hide in a field nobody thought of. */
const payloads: unknown[] = [];

function missing(): never {
  throw Object.assign(new Error("no such container"), { statusCode: 404 });
}

class FakeDocker {}
const patched = FakeDocker.prototype as unknown as Record<string, unknown>;
patched.getImage = () => ({ inspect: async () => ({ Id: "sha256:current" }) });
patched.getVolume = (name: string) => ({
  remove: async () => {
    calls.push(`volume.remove ${name}`);
    volumes.delete(name);
  },
});
patched.createVolume = async (options: { Name: string }) => {
  calls.push(`volume.create ${options.Name}`);
  if (volumes.has(options.Name)) {
    throw Object.assign(new Error("exists"), { statusCode: 409 });
  }
  volumes.add(options.Name);
  return {};
};
patched.createContainer = async (options: {
  name: string;
  Labels: Record<string, string>;
  Env: string[];
  HostConfig: { Binds: string[] };
}) => {
  calls.push(`container.create ${options.name}`);
  payloads.push(structuredClone(options));
  containers.set(options.name, {
    labels: options.Labels,
    env: options.Env,
    binds: options.HostConfig.Binds,
    running: false,
  });
  return {};
};
patched.listContainers = async () =>
  [...containers.entries()].map(([name, found]) => ({
    Names: [`/${name}`],
    Labels: found.labels,
    State: found.running ? "running" : "created",
    Created: 1_700_000_000,
    Ports: [{ PrivatePort: 4100, PublicPort: 49152 }],
  }));
patched.getContainer = (name: string) => ({
  inspect: async () => {
    const found = containers.get(name);
    if (!found) missing();
    return {
      State: {
        Status: found.running ? "running" : "created",
        Running: found.running,
        StartedAt: "2026-11-09T00:00:00Z",
      },
      Config: { Labels: found.labels, Env: found.env },
      Image: "sha256:current",
      NetworkSettings: { Ports: { "4100/tcp": [{ HostPort: "49152" }] } },
    };
  },
  remove: async (options: unknown) => {
    calls.push(`container.remove ${name}`);
    removeOptions.push(options);
    if (!containers.delete(name)) missing();
  },
  start: async () => {
    calls.push(`container.start ${name}`);
    const found = containers.get(name);
    if (!found) missing();
    found.running = true;
  },
});

mock.module("dockerode", () => ({ default: FakeDocker }));
/*
 * Under a name of its own, so this file gets a copy of `docker.ts` that holds THIS fake. A module is
 * evaluated once per process and `docker.ts` builds its client when it is evaluated, so whichever
 * test file imported it first (documents-ensure.test.ts does, and the root run walks every file in one
 * process) would otherwise decide which fake every later file's calls go to, and these cases would
 * pass alone and fail in the suite. The query is part of the specifier and changes nothing in the file.
 */
const dockerModule = "../src/docker?computer-token-ensure";
const { ensure, listOwned, reset, tokenOfOwned } = (await import(
  dockerModule
)) as typeof import("../src/docker");

/** The supervisor's own secret, long as scripts/start.sh makes it, and the shared one it used to hand out. */
const SUPERVISOR_SECRET = "5ec12e7c0ffee5ec12e7c0ffee".repeat(3);
const SHARED_TOKEN = "the-one-token-every-computer-used-to-share";
/** What the supervisor's process environment holds: both secrets, and neither belongs in a computer. */
const SUPERVISOR_ENV = {
  SUPERVISOR_TOKEN: SUPERVISOR_SECRET,
  COMPUTER_TOKEN: SHARED_TOKEN,
  COMPUTER_BROWSER_MODE: "headless",
};

function namesOf(bot: string) {
  const named = namesFor(bot);
  if (!named.ok) throw new Error(named.reason);
  return named.names;
}

const options = (bot: string) => ({
  image: "openbot-agent-computer:test",
  environment: environmentFor(bot, SUPERVISOR_ENV),
  readyTimeoutMs: 2_000,
});

const tokenOf = (bot: string) =>
  computerTokenFor(SUPERVISOR_SECRET, NAMESPACE, bot);

/** A computer that exists, as an earlier run of the supervisor left it, holding the token it was given. */
function existing(bot: string, token: string, running = true) {
  const names = namesOf(bot);
  volumes.add(names.profileVolume);
  volumes.add(names.workspaceVolume);
  containers.set(names.container, {
    labels: {
      "openbot.supervisor": "true",
      "openbot.bot-id": bot,
      "openbot.namespace": NAMESPACE,
    },
    env: [`COMPUTER_BOT_ID=${bot}`, `COMPUTER_TOKEN=${token}`],
    binds: [],
    running,
  });
}

/** The `COMPUTER_TOKEN` a computer was created holding. */
function tokenHeldBy(bot: string): string | undefined {
  return containers
    .get(namesOf(bot).container)
    ?.env.find((line) => line.startsWith("COMPUTER_TOKEN="))
    ?.slice("COMPUTER_TOKEN=".length);
}

beforeEach(() => {
  containers.clear();
  volumes.clear();
  calls.length = 0;
  removeOptions.length = 0;
  payloads.length = 0;
});

describe("each Bot's computer holds a token of its own", () => {
  test("two Bots are given different tokens, each made for that Bot", async () => {
    const alpha = await ensure(namesOf("alpha"), options("alpha"));
    const beta = await ensure(namesOf("beta"), options("beta"));

    expect(tokenHeldBy("alpha")).toBe(tokenOf("alpha"));
    expect(tokenHeldBy("beta")).toBe(tokenOf("beta"));
    expect(tokenHeldBy("alpha")).not.toBe(tokenHeldBy("beta"));
    // And it is the token the answer gives, which is what the server will present.
    expect(alpha.token).toBe(tokenOf("alpha"));
    expect(beta.token).toBe(tokenOf("beta"));
  });

  test("neither the shared token nor the secret the tokens are made from is given to any computer", async () => {
    await ensure(namesOf("alpha"), options("alpha"));
    await ensure(namesOf("beta"), options("beta"));

    expect(payloads).toHaveLength(2);
    // The whole of what the engine was asked to create, labels and commands and mounts included.
    const everything = JSON.stringify(payloads);
    expect(everything).not.toContain(SUPERVISOR_SECRET);
    expect(everything).not.toContain(SHARED_TOKEN);
    expect(everything).not.toContain("SUPERVISOR_TOKEN");
    // And what each computer holds is its own token and no other's.
    expect(everything).toContain(tokenOf("alpha"));
    expect(JSON.stringify(payloads[0])).not.toContain(tokenOf("beta"));
    expect(JSON.stringify(payloads[1])).not.toContain(tokenOf("alpha"));
  });

  test("a computer that is made again after a reset gets the token it had", async () => {
    const names = namesOf("alpha");
    const first = await ensure(names, options("alpha"));
    expect(await reset(names)).toBe(true);
    expect(containers.has(names.container)).toBe(false);

    const second = await ensure(names, options("alpha"));

    expect(second.token).toBe(first.token as string);
    expect(tokenHeldBy("alpha")).toBe(tokenOf("alpha"));
    expect(await tokenOfOwned(names)).toBe(tokenOf("alpha"));
  });

  test("a computer that already holds its token is left alone, and the answer still says it", async () => {
    existing("alpha", tokenOf("alpha"));

    const answer = await ensure(namesOf("alpha"), options("alpha"));

    expect(answer.token).toBe(tokenOf("alpha"));
    expect(calls.some((call) => call.startsWith("container.remove"))).toBe(
      false,
    );
    expect(payloads).toEqual([]);
  });
});

describe("a computer made when every computer shared one token", () => {
  test("is replaced the next time its Bot is used, and what comes back holds only its own token", async () => {
    existing("alpha", SHARED_TOKEN);
    const names = namesOf("alpha");

    const answer = await ensure(names, options("alpha"));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(calls).toContain(`container.create ${names.container}`);
    expect(tokenHeldBy("alpha")).toBe(tokenOf("alpha"));
    expect(tokenHeldBy("alpha")).not.toBe(SHARED_TOKEN);
    expect(answer.token).toBe(tokenOf("alpha"));
    expect(answer.status).toBe("running");
  });

  test("is replaced without its volumes: the profile and the workspace are the ones it had", async () => {
    existing("alpha", SHARED_TOKEN);
    const names = namesOf("alpha");

    await ensure(names, options("alpha"));

    // `v: false` is what keeps the named volumes when the container goes (the same call that
    // replaces a computer for a new image or a new documents folder), and no volume is removed.
    expect(removeOptions).toEqual([{ force: true, v: false }]);
    expect(calls.filter((call) => call.startsWith("volume.remove"))).toEqual(
      [],
    );
    expect(volumes.has(names.profileVolume)).toBe(true);
    expect(volumes.has(names.workspaceVolume)).toBe(true);
    // And the new container mounts them: the same two, by name.
    expect(containers.get(names.container)?.binds).toEqual([
      `${names.profileVolume}:/profiles`,
      `${names.workspaceVolume}:/workspace`,
    ]);
  });

  test("keeps working with the token it has until its Bot is used, and says which that is", async () => {
    existing("alpha", SHARED_TOKEN);
    const names = namesOf("alpha");

    // Nothing has replaced it yet, and a caller that has to speak to it is told what it holds.
    expect(await tokenOfOwned(names)).toBe(SHARED_TOKEN);
    expect(calls).toEqual([]);

    await ensure(names, options("alpha"));

    expect(await tokenOfOwned(names)).toBe(tokenOf("alpha"));
  });

  test("a stopped one is replaced and started the same way", async () => {
    existing("alpha", SHARED_TOKEN, false);
    const names = namesOf("alpha");

    await ensure(names, options("alpha"));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(calls).toContain(`container.start ${names.container}`);
    expect(tokenHeldBy("alpha")).toBe(tokenOf("alpha"));
  });

  test("a Bot's neighbour is not touched when it is replaced", async () => {
    existing("alpha", SHARED_TOKEN);
    existing("beta", SHARED_TOKEN);

    await ensure(namesOf("alpha"), options("alpha"));

    expect(tokenHeldBy("alpha")).toBe(tokenOf("alpha"));
    // Beta's computer is replaced when beta is used, and not before.
    expect(tokenHeldBy("beta")).toBe(SHARED_TOKEN);
    expect(calls.filter((call) => call.includes("beta"))).toEqual([]);
  });
});

describe("reading the token of a computer", () => {
  test("says nothing for a Bot that has no computer", async () => {
    expect(await tokenOfOwned(namesOf("nobody"))).toBeNull();
  });

  test("says nothing for a container that only has the name and is not this supervisor's", async () => {
    const names = namesOf("alpha");
    containers.set(names.container, {
      labels: {},
      env: [`COMPUTER_TOKEN=${SHARED_TOKEN}`],
      binds: [],
      running: true,
    });

    expect(await tokenOfOwned(names)).toBeNull();
  });

  test("is not part of a listing, which names every computer and none of their tokens", async () => {
    await ensure(namesOf("alpha"), options("alpha"));
    await ensure(namesOf("beta"), options("beta"));

    const listed = await listOwned();

    expect(listed.map((computer) => computer.botId).sort()).toEqual([
      "alpha",
      "beta",
    ]);
    const body = JSON.stringify(listed);
    expect(body).not.toContain(tokenOf("alpha"));
    expect(body).not.toContain(tokenOf("beta"));
    for (const computer of listed) expect(computer).not.toHaveProperty("token");
  });
});
