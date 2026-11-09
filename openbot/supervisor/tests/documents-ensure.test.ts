import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import Docker from "dockerode";
import { ensure } from "../src/docker";
import { DOCUMENTS_LABEL } from "../src/documents";
import { namesFor } from "../src/names";

/**
 * What `ensure` does about the documents folder, against an engine that is only a record.
 *
 * Nothing here needs a Docker daemon. The methods `ensure` calls are replaced on dockerode's prototype
 * for the length of this file and put back after it, which keeps the fake from reaching any other
 * test file the way a module mock would. The question is which calls `ensure` makes: a computer whose
 * documents folder is not the one wanted is removed WITHOUT its volumes and created again, and one
 * that is current is left alone.
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
const created: Array<{
  name: string;
  labels: Record<string, string>;
  binds: string[];
}> = [];

function missing(): never {
  throw Object.assign(new Error("no such container"), { statusCode: 404 });
}

const original = {
  getContainer: Docker.prototype.getContainer,
  getImage: Docker.prototype.getImage,
  getVolume: Docker.prototype.getVolume,
  createContainer: Docker.prototype.createContainer,
  createVolume: Docker.prototype.createVolume,
};

const patched = Docker.prototype as unknown as Record<string, unknown>;
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
  created.push({
    name: options.name,
    labels: options.Labels,
    binds: options.HostConfig.Binds,
  });
  containers.set(options.name, {
    labels: options.Labels,
    env: options.Env,
    binds: options.HostConfig.Binds,
    running: false,
  });
  return {};
};
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

afterAll(() => {
  Object.assign(Docker.prototype, original);
});

const named = namesFor("freeduet");
if (!named.ok) throw new Error(named.reason);
const names = named.names;
const BIND = "/mnt/documents:/workspace/documenti:ro";

const options = (documents?: { path: string; bots: string[] }) => ({
  image: "openbot-agent-computer:test",
  environment: ["COMPUTER_BOT_ID=freeduet"],
  readyTimeoutMs: 2_000,
  ...(documents ? { documents } : {}),
});

/** A computer that exists, as an earlier run of the supervisor left it. */
function existing(labels: Record<string, string> = {}, running = true) {
  volumes.add(names.profileVolume);
  volumes.add(names.workspaceVolume);
  containers.set(names.container, {
    labels: {
      "openbot.supervisor": "true",
      "openbot.bot-id": names.botId,
      "openbot.namespace": "openbot",
      ...labels,
    },
    env: ["COMPUTER_BOT_ID=freeduet"],
    binds: [],
    running,
  });
}

beforeEach(() => {
  containers.clear();
  volumes.clear();
  calls.length = 0;
  removeOptions.length = 0;
  created.length = 0;
});

const documents = { path: "/mnt/documents", bots: ["freeduet"] };

describe("ensure and the documents folder", () => {
  test("a new computer for a listed Bot is created with the folder, read-only, and the label", async () => {
    await ensure(names, options(documents));

    expect(created).toHaveLength(1);
    expect(created[0]?.binds).toContain(BIND);
    expect(created[0]?.labels[DOCUMENTS_LABEL]).toBe("/mnt/documents");
    expect(calls.some((call) => call.startsWith("container.remove"))).toBe(
      false,
    );
  });

  test("a new computer with the feature off has no folder and no label", async () => {
    await ensure(names, options());

    expect(created).toHaveLength(1);
    expect(created[0]?.binds.some((bind) => bind.includes("documenti"))).toBe(
      false,
    );
    expect(created[0]?.labels[DOCUMENTS_LABEL]).toBeUndefined();
  });

  test("a computer made before the folder was set up is replaced, and keeps its volumes", async () => {
    existing();

    await ensure(names, options(documents));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(removeOptions).toEqual([{ force: true, v: false }]);
    // Created again with the folder, and the Bot's own storage is untouched.
    expect(created).toHaveLength(1);
    expect(created[0]?.binds).toContain(BIND);
    expect(created[0]?.labels[DOCUMENTS_LABEL]).toBe("/mnt/documents");
    expect(calls.filter((call) => call.startsWith("volume.remove"))).toEqual(
      [],
    );
    expect(volumes.has(names.profileVolume)).toBe(true);
    expect(volumes.has(names.workspaceVolume)).toBe(true);
  });

  test("a computer holding another folder is replaced", async () => {
    existing({ [DOCUMENTS_LABEL]: "/mnt/old" });

    await ensure(names, options(documents));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(created[0]?.labels[DOCUMENTS_LABEL]).toBe("/mnt/documents");
    expect(calls.filter((call) => call.startsWith("volume.remove"))).toEqual(
      [],
    );
  });

  test("turning the feature off replaces the computer that has the folder", async () => {
    existing({ [DOCUMENTS_LABEL]: "/mnt/documents" });

    await ensure(names, options());

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(removeOptions).toEqual([{ force: true, v: false }]);
    expect(created).toHaveLength(1);
    expect(created[0]?.binds.some((bind) => bind.includes("documenti"))).toBe(
      false,
    );
    expect(created[0]?.labels[DOCUMENTS_LABEL]).toBeUndefined();
    expect(calls.filter((call) => call.startsWith("volume.remove"))).toEqual(
      [],
    );
  });

  test("taking the Bot off the list replaces its computer the same way", async () => {
    existing({ [DOCUMENTS_LABEL]: "/mnt/documents" });

    await ensure(names, options({ path: "/mnt/documents", bots: ["otto"] }));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(created[0]?.binds.some((bind) => bind.includes("documenti"))).toBe(
      false,
    );
  });

  test("a computer that already holds the folder is left alone", async () => {
    existing({ [DOCUMENTS_LABEL]: "/mnt/documents" });

    await ensure(names, options(documents));

    expect(calls.some((call) => call.startsWith("container.remove"))).toBe(
      false,
    );
    expect(created).toEqual([]);
  });

  test("a computer from before this feature is left alone while the feature is off", async () => {
    existing();

    await ensure(names, options());

    expect(calls.some((call) => call.startsWith("container.remove"))).toBe(
      false,
    );
    expect(created).toEqual([]);
  });

  test("a Bot that is not listed keeps its computer while the feature is on for others", async () => {
    existing();

    await ensure(names, options({ path: "/mnt/documents", bots: ["otto"] }));

    expect(calls.some((call) => call.startsWith("container.remove"))).toBe(
      false,
    );
    expect(created).toEqual([]);
  });

  test("a stopped computer with the wrong folder is replaced and started", async () => {
    existing({}, false);

    await ensure(names, options(documents));

    expect(calls).toContain(`container.remove ${names.container}`);
    expect(calls).toContain(`container.start ${names.container}`);
    expect(created[0]?.binds).toContain(BIND);
  });
});
