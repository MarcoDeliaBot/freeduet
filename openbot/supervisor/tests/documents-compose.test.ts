import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * What docker-compose.yml hands the supervisor for the documents folder.
 *
 * Rendered with `docker compose config`, the same way tests/compose.test.ts does, so the check is
 * on what Compose resolves and not on the text of the file.
 */

function composeAvailable(): boolean {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

type Rendered = {
  environment: Record<string, string>;
  volumes: Array<{
    type: string;
    source: string;
    target: string;
    read_only?: boolean;
  }>;
};

function supervisor(env: Record<string, string>): Rendered {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      "/dev/null",
      "--profile",
      "harness",
      "config",
      "--format",
      "json",
    ],
    {
      cwd: join(import.meta.dir, "..", ".."),
      env: {
        PATH: process.env.PATH ?? "",
        PICKED_HARNESS_IMAGE: "openbot-agent-langgraph-agui:test",
        ...env,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  return JSON.parse(output).services.supervisor as Rendered;
}

test.skipIf(!composeAvailable())(
  "the supervisor gets both settings, and the folder read-only at the same path",
  () => {
    const rendered = supervisor({
      FREEDUET_COMPUTER_DOCUMENTS: "/mnt/documents",
      FREEDUET_COMPUTER_DOCUMENTS_BOTS: "freeduet",
    });
    expect(rendered.environment.FREEDUET_COMPUTER_DOCUMENTS).toBe(
      "/mnt/documents",
    );
    expect(rendered.environment.FREEDUET_COMPUTER_DOCUMENTS_BOTS).toBe(
      "freeduet",
    );
    const mount = rendered.volumes.find(
      (volume) => volume.target === "/mnt/documents",
    );
    expect(mount).toMatchObject({
      type: "bind",
      source: "/mnt/documents",
      read_only: true,
    });
  },
  60_000,
);

test.skipIf(!composeAvailable())(
  "with nothing set the settings are empty and the folder is a stand-in, read-only, off the host",
  () => {
    const rendered = supervisor({});
    expect(rendered.environment.FREEDUET_COMPUTER_DOCUMENTS).toBe("");
    expect(rendered.environment.FREEDUET_COMPUTER_DOCUMENTS_BOTS).toBe("");
    const stand = rendered.volumes.find(
      (volume) => volume.target === "/documents-off",
    );
    // A named volume, not a bind: no host path is exposed to the supervisor when the feature is off.
    expect(stand).toMatchObject({
      type: "volume",
      source: "documents-off",
      read_only: true,
    });
  },
  60_000,
);
