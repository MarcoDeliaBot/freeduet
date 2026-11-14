import { describe, expect, test } from "bun:test";
import { computerTokenFor } from "../src/computer-token";
import { environmentFor } from "../src/environment";
import { NAMESPACE } from "../src/names";

/**
 * What a Bot's computer is told, and the installation's secret (docs/M1_PLAN.md D28).
 *
 * `FREEDUET_INSTALL_SECRET` is what tells the person's browser from a container that reaches the
 * server's published port, so the one place it must never arrive is a Bot's own computer, which is
 * such a container. `scripts/start.sh` writes it to `.env`, and the supervisor, which creates every
 * computer, can be started from an environment that holds all of `.env`. What a computer gets is built
 * by `environmentFor` alone (`index.ts` calls it and nothing else for `Env`), from an allow-list: its
 * Bot, its own token, the browser mode, the identity socket and the proxy settings.
 *
 * What its mounts are is pinned by `documents-ensure.test.ts` (`hostConfig`: the Bot's own two
 * volumes and nothing of the host), and what the Compose services are handed by `tests/compose.test.ts`.
 */

const INSTALL_SECRET = "d3adb33f".repeat(8);

/** The settings file of a laptop install, as the supervisor's own process may have it loaded. */
const WHOLE_ENV_FILE = {
  FREEDUET_INSTALL_SECRET: INSTALL_SECRET,
  FREEDUET_LOCAL_KEY: "local-key-value",
  ANTHROPIC_API_KEY: "anthropic-key-value",
  AGENT_TOOL_TOKEN: "agent-tool-token-value",
  MANAGED_AGENT_TOKEN: "managed-agent-token-value",
  WORKER_SHARED_SECRET: "worker-secret-value",
  SUPERVISOR_TOKEN: "supervisor-token-value",
  KEY_ENCRYPTION_KEY: "key-encryption-key-value",
  DATABASE_URL: "postgres://openbot:openbot@localhost:5432/openbot",
  COMPUTER_TOKEN: "computer-token-value",
  COMPUTER_BROWSER_MODE: "headless",
  EGRESS_PROXY_DEFAULT: "http://proxy.example:3128",
};

describe("a Bot's computer and the installation's secret", () => {
  test("is told what it is for, and nothing the settings file holds beyond that", () => {
    // Its own token, made from the supervisor's secret (computer-token.ts), and not the
    // `COMPUTER_TOKEN` this file also holds, which belongs to the computer a deployment runs without
    // a supervisor.
    expect(environmentFor("freeduet", WHOLE_ENV_FILE)).toEqual([
      "COMPUTER_BOT_ID=freeduet",
      `COMPUTER_TOKEN=${computerTokenFor("supervisor-token-value", NAMESPACE, "freeduet")}`,
      "COMPUTER_BROWSER_MODE=headless",
      "EGRESS_PROXY_DEFAULT=http://proxy.example:3128",
    ]);
  });

  test("is handed neither the deployment's shared token nor the secret its own is made from", () => {
    // The shared `COMPUTER_TOKEN` opens the computer a deployment runs without a supervisor, and the
    // supervisor's secret opens every Bot's: a computer that held either could open the others.
    const told = environmentFor("freeduet", WHOLE_ENV_FILE).join("\n");
    expect(told).not.toContain("computer-token-value");
    expect(told).not.toContain("supervisor-token-value");
    expect(told).not.toContain("SUPERVISOR_TOKEN");
  });

  test("is never handed the secret, by name or by value", () => {
    const told = environmentFor("freeduet", WHOLE_ENV_FILE).join("\n");
    expect(told).not.toContain("FREEDUET_INSTALL_SECRET");
    expect(told).not.toContain(INSTALL_SECRET);
  });

  test("is not handed it by a setting that merely contains it", () => {
    // A proxy setting is passed through verbatim, so the secret must not reach one by sharing a
    // value with it: only the names the allow-list knows are read at all.
    const told = environmentFor("freeduet", {
      ...WHOLE_ENV_FILE,
      PROXY_FOR_THE_REST: INSTALL_SECRET,
      FREEDUET_INSTALL_SECRET_BACKUP: INSTALL_SECRET,
    }).join("\n");
    expect(told).not.toContain(INSTALL_SECRET);
  });
});
