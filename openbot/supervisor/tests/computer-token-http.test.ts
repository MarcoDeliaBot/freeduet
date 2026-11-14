/**
 * The real supervisor process, asked over HTTP what token each Bot's computer holds, with a fake
 * Docker behind it (docs/design/per-computer-token.md).
 *
 * What the unit tests beside it cannot say is whether `index.ts` joins the pieces: that the secret
 * `environmentFor` makes tokens from is the one this process was started with, that the answer to
 * `ensure` carries the token the container was really created with, that `GET /computers/:bot/token`
 * answers only to the supervisor's own bearer, and that the secret reaches the engine in no byte of
 * what it is asked to create. The daemon is a fake on a unix socket in a temporary directory, keeping
 * the containers it was asked to make and a record of every call, so each of those is a fact about
 * what it saw.
 *
 * It needs this directory's own dependencies (Hono and Dockerode), which the root install does not
 * reach. Without them the suite skips; the `types (supervisor)` job installs them and runs this file.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computerTokenFor } from "../src/computer-token";

const root = join(import.meta.dir, "..");
const installed = (() => {
  try {
    Bun.resolveSync("hono", root);
    Bun.resolveSync("dockerode", root);
    return true;
  } catch {
    return false;
  }
})();

const NAMESPACE = "pertoken";
/** Long, as scripts/start.sh makes it: the secret every Bot's token is made from. */
const KEY = "d0c4e5a1b2c3".repeat(6);
/** What every computer used to be given, and what a deployment still sets for the computer it runs without a supervisor. */
const SHARED = "the-token-every-computer-used-to-share";

const labelsFor = (bot: string) => ({
  "openbot.supervisor": "true",
  "openbot.bot-id": bot,
  "openbot.namespace": NAMESPACE,
});

type Held = {
  labels: Record<string, string>;
  env: string[];
  running: boolean;
};

/**
 * A Docker daemon that makes and keeps containers and volumes, says every one of them is healthy, and
 * writes down each call with the body it came with.
 */
function fakeDocker(socket: string) {
  const containers = new Map<string, Held>();
  const volumes = new Set<string>();
  const calls: string[] = [];
  const created: string[] = [];
  const server = Bun.serve({
    unix: socket,
    async fetch(request) {
      const url = new URL(request.url, "http://docker.invalid");
      const path = url.pathname.replace(/^\/v\d+(\.\d+)?/, "");
      calls.push(`${request.method} ${path}${url.search ? url.search : ""}`);
      const one = /^\/containers\/([^/]+)\/(json|start|stop)$/.exec(path);
      const gone = /^\/containers\/([^/]+)$/.exec(path);
      if (request.method === "GET" && path === "/_ping")
        return new Response("OK");
      if (request.method === "GET" && path === "/containers/json")
        return Response.json(
          [...containers.entries()].map(([name, held]) => ({
            Names: [`/${name}`],
            Labels: held.labels,
            State: held.running ? "running" : "created",
            Created: 1_700_000_000,
            Ports: [],
          })),
        );
      // Not known to this daemon, which `ensure` reads as "keep the computer as it is".
      if (request.method === "GET" && /^\/images\/.+\/json$/.test(path))
        return Response.json({ message: "No such image" }, { status: 404 });
      if (request.method === "POST" && path === "/volumes/create") {
        const body = (await request.json()) as { Name: string };
        volumes.add(body.Name);
        return Response.json({ Name: body.Name }, { status: 201 });
      }
      if (request.method === "POST" && path === "/containers/create") {
        const body = await request.text();
        created.push(body);
        const parsed = JSON.parse(body) as {
          Labels: Record<string, string>;
          Env: string[];
        };
        const name = url.searchParams.get("name") ?? "";
        containers.set(name, {
          labels: parsed.Labels,
          env: parsed.Env,
          running: false,
        });
        return Response.json(
          { Id: `id-${name}`, Warnings: [] },
          { status: 201 },
        );
      }
      if (one) {
        const held = containers.get(one[1] ?? "");
        if (!held)
          return Response.json(
            { message: "No such container" },
            { status: 404 },
          );
        if (request.method === "GET" && one[2] === "json")
          return Response.json({
            State: {
              Status: held.running ? "running" : "created",
              Running: held.running,
              StartedAt: "2026-11-14T00:00:00Z",
              Health: { Status: "healthy" },
            },
            Config: { Labels: held.labels, Env: held.env },
            NetworkSettings: { Ports: {} },
            Image: "sha256:fake",
          });
        if (request.method === "POST" && one[2] === "start") {
          held.running = true;
          return new Response(null, { status: 204 });
        }
        if (request.method === "POST" && one[2] === "stop") {
          held.running = false;
          return new Response(null, { status: 204 });
        }
      }
      if (request.method === "DELETE" && gone) {
        if (!containers.delete(gone[1] ?? ""))
          return Response.json(
            { message: "No such container" },
            { status: 404 },
          );
        return new Response(null, { status: 204 });
      }
      if (request.method === "DELETE" && /^\/volumes\//.test(path)) {
        volumes.delete(path.replace("/volumes/", ""));
        return new Response(null, { status: 204 });
      }
      return Response.json(
        { message: "The fake daemon has no such call." },
        { status: 500 },
      );
    },
  });
  return {
    calls,
    created,
    containers,
    volumes,
    /** A computer as an earlier supervisor left it: running, with the volumes it was made with. */
    plant(bot: string, token: string) {
      containers.set(`${NAMESPACE}-computer-${bot}`, {
        labels: labelsFor(bot),
        env: [`COMPUTER_BOT_ID=${bot}`, `COMPUTER_TOKEN=${token}`],
        running: true,
      });
      volumes.add(`${NAMESPACE}-profile-${bot}`);
      volumes.add(`${NAMESPACE}-workspace-${bot}`);
    },
    clear() {
      containers.clear();
      volumes.clear();
      calls.length = 0;
      created.length = 0;
    },
    stop: () => server.stop(true),
  };
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port as number;
  await probe.stop(true);
  return port;
}

/** The environment of a supervisor that depends on nothing of this machine's own. */
function hermetic(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      /^(SPIRE_|FREEDUET_COMPUTER_|COMPUTER_|SUPERVISOR_|EGRESS_PROXY|DOCKER_)/.test(
        key,
      )
    )
      continue;
    env[key] = value;
  }
  return env;
}

async function start(supervisorToken: string, stderr: "ignore" | "pipe") {
  const directory = await mkdtemp(join(tmpdir(), "per-token-supervisor-"));
  const docker = fakeDocker(join(directory, "docker.sock"));
  const port = await freePort();
  const child = Bun.spawn([process.execPath, "src/index.ts"], {
    cwd: root,
    env: {
      ...hermetic(),
      COMPUTER_NAMESPACE: NAMESPACE,
      DOCKER_SOCKET: join(directory, "docker.sock"),
      PORT: String(port),
      SUPERVISOR_TOKEN: supervisorToken,
      // Both of these are in the supervisor's own environment, as a deployment sets them, and
      // neither may reach a computer.
      COMPUTER_TOKEN: SHARED,
      COMPUTER_BROWSER_MODE: "headless",
    },
    stdout: "ignore",
    stderr,
  });
  const end = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(`The supervisor exited with ${child.exitCode}.`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch {}
    if (Date.now() > end) throw new Error("The supervisor never answered.");
    await Bun.sleep(25);
  }
  return { port, directory, child, docker };
}

type Supervisor = Awaited<ReturnType<typeof start>>;

function ask(
  supervisor: Supervisor,
  path: string,
  options: { method?: string; token?: string | null } = {},
) {
  const { method = "GET", token = KEY } = options;
  return fetch(`http://127.0.0.1:${supervisor.port}${path}`, {
    method,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
}

async function stopSupervisor(supervisor: Supervisor) {
  supervisor.child.kill();
  await supervisor.child.exited;
  supervisor.docker.stop();
  await rm(supervisor.directory, { recursive: true, force: true });
}

const tokenOf = (bot: string) => computerTokenFor(KEY, NAMESPACE, bot);

describe.skipIf(!installed)(
  "the supervisor's own secret and the computers",
  () => {
    let supervisor: Supervisor;

    beforeAll(async () => {
      supervisor = await start(KEY, "ignore");
    }, 30_000);

    afterAll(async () => {
      if (supervisor) await stopSupervisor(supervisor);
    });

    test("each Bot's computer is made with a token of its own, and the answer to `ensure` says which", async () => {
      supervisor.docker.clear();

      const alpha = await ask(supervisor, "/computers/alpha/ensure", {
        method: "POST",
      });
      const beta = await ask(supervisor, "/computers/beta/ensure", {
        method: "POST",
      });

      expect(alpha.status).toBe(200);
      expect(beta.status).toBe(200);
      const alphaToken = ((await alpha.json()) as { token: string }).token;
      const betaToken = ((await beta.json()) as { token: string }).token;
      expect(alphaToken).toBe(tokenOf("alpha"));
      expect(betaToken).toBe(tokenOf("beta"));
      expect(alphaToken).not.toBe(betaToken);
      // The daemon was asked to make each computer holding exactly that token.
      const held = (bot: string) =>
        supervisor.docker.containers
          .get(`${NAMESPACE}-computer-${bot}`)
          ?.env.filter((line) => line.startsWith("COMPUTER_TOKEN="));
      expect(held("alpha")).toEqual([`COMPUTER_TOKEN=${tokenOf("alpha")}`]);
      expect(held("beta")).toEqual([`COMPUTER_TOKEN=${tokenOf("beta")}`]);
    });

    test("the secret the tokens are made from, and the shared token, are in no byte the daemon was asked to create", async () => {
      supervisor.docker.clear();
      await ask(supervisor, "/computers/alpha/ensure", { method: "POST" });
      await ask(supervisor, "/computers/beta/ensure", { method: "POST" });

      expect(supervisor.docker.created).toHaveLength(2);
      const everything = supervisor.docker.created.join("\n");
      expect(everything).not.toContain(KEY);
      expect(everything).not.toContain(SHARED);
      expect(everything).not.toContain("SUPERVISOR_TOKEN");
      // The one thing it holds that is a secret is that computer's own token, and no other's.
      expect(supervisor.docker.created[0]).toContain(tokenOf("alpha"));
      expect(supervisor.docker.created[0]).not.toContain(tokenOf("beta"));
    });

    test("a computer made again after a reset is given the token it had", async () => {
      supervisor.docker.clear();
      const first = (await (
        await ask(supervisor, "/computers/alpha/ensure", { method: "POST" })
      ).json()) as { token: string };
      expect(
        (await ask(supervisor, "/computers/alpha/reset", { method: "POST" }))
          .status,
      ).toBe(200);
      expect(supervisor.docker.containers.size).toBe(0);

      const second = (await (
        await ask(supervisor, "/computers/alpha/ensure", { method: "POST" })
      ).json()) as { token: string };

      expect(second.token).toBe(first.token);
      const answered = await ask(supervisor, "/computers/alpha/token");
      expect(await answered.json()).toEqual({
        botId: "alpha",
        token: first.token,
      });
    });

    test("a computer made before this, holding the shared token, is replaced with its volumes kept", async () => {
      supervisor.docker.clear();
      supervisor.docker.plant("alpha", SHARED);

      const answered = await ask(supervisor, "/computers/alpha/ensure", {
        method: "POST",
      });

      expect(answered.status).toBe(200);
      expect(((await answered.json()) as { token: string }).token).toBe(
        tokenOf("alpha"),
      );
      // Removed without its volumes, and made again on the same ones.
      const removal = supervisor.docker.calls.find((call) =>
        call.startsWith(`DELETE /containers/${NAMESPACE}-computer-alpha`),
      );
      expect(removal).toContain("v=false");
      expect(removal).toContain("force=true");
      expect(
        supervisor.docker.calls.filter((call) =>
          call.startsWith("DELETE /volumes"),
        ),
      ).toEqual([]);
      expect(supervisor.docker.volumes.has(`${NAMESPACE}-profile-alpha`)).toBe(
        true,
      );
      expect(
        supervisor.docker.volumes.has(`${NAMESPACE}-workspace-alpha`),
      ).toBe(true);
      expect(
        supervisor.docker.containers.get(`${NAMESPACE}-computer-alpha`)?.env,
      ).toContain(`COMPUTER_TOKEN=${tokenOf("alpha")}`);
    });

    test("the token route tells what a computer holds, and until it is replaced that is the old one", async () => {
      supervisor.docker.clear();
      supervisor.docker.plant("gamma", SHARED);

      const answered = await ask(supervisor, "/computers/gamma/token");

      expect(answered.status).toBe(200);
      expect(await answered.json()).toEqual({ botId: "gamma", token: SHARED });
      // Asking is not using: nothing was removed or created for it.
      expect(
        supervisor.docker.calls.filter((call) => !call.startsWith("GET ")),
      ).toEqual([]);
    });

    test("the token route answers only the supervisor's own bearer", async () => {
      supervisor.docker.clear();
      supervisor.docker.plant("alpha", tokenOf("alpha"));

      for (const token of [
        null,
        "",
        "not-the-token",
        SHARED,
        tokenOf("alpha"),
      ]) {
        const refused = await ask(supervisor, "/computers/alpha/token", {
          token,
        });
        expect(refused.status).toBe(401);
        expect(await refused.text()).not.toContain(tokenOf("alpha"));
      }
      // And it is Docker's last word: a request that was refused asked the daemon nothing.
      expect(supervisor.docker.calls).toEqual([]);
    });

    test("the token route refuses what is not a Bot id and has nothing for a Bot with no computer", async () => {
      supervisor.docker.clear();

      expect((await ask(supervisor, "/computers/not.a.bot/token")).status).toBe(
        400,
      );
      const none = await ask(supervisor, "/computers/ghost/token");
      expect(none.status).toBe(404);
    });

    test("a listing names the computers and none of their tokens", async () => {
      supervisor.docker.clear();
      supervisor.docker.plant("alpha", tokenOf("alpha"));
      supervisor.docker.plant("beta", tokenOf("beta"));

      const listed = await (await ask(supervisor, "/computers")).text();

      expect(listed).toContain("alpha");
      expect(listed).toContain("beta");
      expect(listed).not.toContain(tokenOf("alpha"));
      expect(listed).not.toContain(tokenOf("beta"));
      expect(listed).not.toContain(KEY);
    });
  },
);

describe.skipIf(!installed)(
  "a secret too short to make tokens from safely",
  () => {
    test("starts, as it always did, and says what a short one costs", async () => {
      const short = await start("short-secret", "pipe");
      try {
        // Still answers: refusing to start would stop every deployment that typed its own.
        expect(
          (await ask(short, "/computers", { token: "short-secret" })).status,
        ).toBe(200);
        short.child.kill();
        await short.child.exited;
        const said = await new Response(
          short.child.stderr as ReadableStream,
        ).text();
        expect(said).toContain("SUPERVISOR_TOKEN is 12 characters");
        expect(said).toContain("32 or more");
        // And never the secret itself.
        expect(said).not.toContain("short-secret");
      } finally {
        short.docker.stop();
        await rm(short.directory, { recursive: true, force: true });
      }
    }, 30_000);

    test("a long one starts without a word about it", async () => {
      const long = await start(KEY, "pipe");
      try {
        long.child.kill();
        await long.child.exited;
        const said = await new Response(
          long.child.stderr as ReadableStream,
        ).text();
        expect(said).not.toContain("characters");
      } finally {
        long.docker.stop();
        await rm(long.directory, { recursive: true, force: true });
      }
    }, 30_000);
  },
);
