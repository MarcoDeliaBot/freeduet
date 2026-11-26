import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { environmentFor } from "../src/environment";
import { namesFor } from "../src/names";

/**
 * D163: a computer that exists on an older image than the configured one is replaced, with its
 * named volumes kept. dockerode is a fake (as in computer-token-ensure.test.ts).
 */

type Fake = {
  image: string;
  labels: Record<string, string>;
  env: string[];
  binds: string[];
  running: boolean;
};
const containers = new Map<string, Fake>();
const volumes = new Set<string>();
const calls: string[] = [];
let currentImage: () => Promise<{ Id: string }> = async () => ({
  Id: "sha256:new",
});

const gone = (): never => {
  throw Object.assign(new Error("no such container"), { statusCode: 404 });
};
class FakeDocker {}
const p = FakeDocker.prototype as unknown as Record<string, unknown>;
p.getImage = () => ({ inspect: () => currentImage() });
p.getVolume = (name: string) => ({
  remove: async () => {
    calls.push(`volume.remove ${name}`);
    volumes.delete(name);
  },
});
p.createVolume = async (o: { Name: string }) => {
  calls.push(`volume.create ${o.Name}`);
  if (volumes.has(o.Name)) {
    throw Object.assign(new Error("exists"), { statusCode: 409 });
  }
  volumes.add(o.Name);
  return {};
};
p.createContainer = async (o: {
  name: string;
  Image: string;
  Labels: Record<string, string>;
  Env: string[];
  HostConfig: { Binds: string[] };
}) => {
  calls.push(`container.create ${o.name}`);
  containers.set(o.name, {
    image: "sha256:new",
    labels: o.Labels,
    env: o.Env,
    binds: o.HostConfig.Binds,
    running: false,
  });
  return {};
};
p.listContainers = async () => [];
p.getContainer = (name: string) => ({
  inspect: async () => {
    const f = containers.get(name) ?? gone();
    return {
      State: {
        Status: f.running ? "running" : "created",
        Running: f.running,
        StartedAt: "2026-11-09T00:00:00Z",
      },
      Config: { Labels: f.labels, Env: f.env },
      Image: f.image,
      NetworkSettings: { Ports: { "4100/tcp": [{ HostPort: "49152" }] } },
    };
  },
  remove: async (o: { v?: boolean }) => {
    calls.push(`container.remove ${name} v=${String(o.v)}`);
    if (!containers.delete(name)) gone();
  },
  start: async () => {
    calls.push(`container.start ${name}`);
    (containers.get(name) ?? gone()).running = true;
  },
});
mock.module("dockerode", () => ({ default: FakeDocker }));
const dockerModule = "../src/docker?image-refresh";
const { ensure } = (await import(
  dockerModule
)) as typeof import("../src/docker");

const names = (() => {
  const n = namesFor("alpha");
  if (!n.ok) throw new Error(n.reason);
  return n.names;
})();
const options = () => ({
  image: "freeduet-agent-computer:latest",
  environment: environmentFor("alpha", {
    SUPERVISOR_TOKEN: "s".repeat(40),
    COMPUTER_BROWSER_MODE: "headless",
  }),
  readyTimeoutMs: 2_000,
});

/** A computer left by an earlier run, on `image`, holding the token this supervisor would give it. */
async function seed(image: string) {
  await ensure(names, options());
  const f = containers.get(names.container) as Fake;
  f.image = image;
  calls.length = 0;
}

let logged: string[] = [];
beforeEach(() => {
  containers.clear();
  volumes.clear();
  calls.length = 0;
  logged = [];
  currentImage = async () => ({ Id: "sha256:new" });
  spyOn(console, "log").mockImplementation((m: string) => {
    logged.push(String(m));
  });
  spyOn(console, "warn").mockImplementation((m: string) => {
    logged.push(String(m));
  });
});

describe("a computer on an older image", () => {
  test("is replaced, with its volumes and labels kept, and one line says so", async () => {
    await seed("sha256:old1234567890abc");
    const before = { ...(containers.get(names.container) as Fake) };
    await ensure(names, options());

    expect(calls).toContain(`container.remove ${names.container} v=false`);
    expect(calls).toContain(`container.create ${names.container}`);
    expect(calls.some((c) => c.startsWith("volume.remove"))).toBe(false);
    const after = containers.get(names.container) as Fake;
    expect(after.image).toBe("sha256:new");
    expect(after.labels).toEqual(before.labels);
    expect(after.binds).toEqual(before.binds);
    expect(after.binds).toContain(`${names.profileVolume}:/profiles`);
    expect(after.binds).toContain(`${names.workspaceVolume}:/workspace`);
    expect(after.running).toBe(true);
    expect(logged).toEqual([
      "Replacing the computer for alpha: image old123456789 -> new",
    ]);
  });

  test("is left alone when the ids match", async () => {
    await seed("sha256:new");
    await ensure(names, options());
    expect(calls.some((c) => c.startsWith("container.remove"))).toBe(false);
    expect(logged).toEqual([]);
  });

  test("is kept, and the reason logged, when the current image cannot be inspected", async () => {
    await seed("sha256:old");
    currentImage = async () => {
      throw new Error("no such image");
    };
    await ensure(names, options());
    expect(calls.some((c) => c.startsWith("container.remove"))).toBe(false);
    expect(logged.join("\n")).toContain("not inspected");
    expect(logged.join("\n")).toContain("no such image");
  });
});
