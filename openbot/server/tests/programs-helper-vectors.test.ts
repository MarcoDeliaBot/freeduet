/**
 * Cross-language signing vectors for the Windows helper (docs/design/programs-on-your-computer.md, S2, D62).
 *
 * The helper (`scripts/programs-helper/FreeDuetProgramsHelper.ps1`) is PowerShell and signs with its own code. The
 * vectors below are made here, by the server's own `protocol.ts`, and committed as `hmac-vectors.json`; the Pester
 * tests of the helper (which run on the Windows runner) assert that the PowerShell code gives the same text and the
 * same mac for the same inputs. This test fails when the committed file is not what `protocol.ts` makes now, so a
 * change of the wire format cannot leave the helper behind unnoticed. To rewrite the file after a deliberate
 * change: `UPDATE_VECTORS=1 bun test tests/programs-helper-vectors.test.ts` from `openbot/server`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  macOfPoll,
  macOfResult,
  operationText,
  pollText,
  resultText,
  type SignedOperation,
  signOperation,
} from "../src/programs/protocol";

const FILE = join(
  import.meta.dir,
  "..",
  "..",
  "scripts",
  "programs-helper",
  "hmac-vectors.json",
);
const SECRET_HEX =
  "00112233445566778899aabbccddeeff102132435465768798a9bacbdcedfe0f";
const secret = Buffer.from(SECRET_HEX, "hex");
const ACTOR = "user-1";

function build() {
  const poll = [
    {
      actorId: ACTOR,
      ts: 1_790_000_000_123,
      nonce: "n0nce0000000000000000000000000001",
    },
    { actorId: "ué-2", ts: 5, nonce: "x" },
  ].map((input) => ({
    ...input,
    text: pollText(input),
    mac: macOfPoll(secret, input),
  }));
  const actions = [
    { kind: "list_installed" },
    { kind: "list_updates" },
    {
      kind: "update_one",
      id: "Example.Edité",
      source: "winget",
      versionNow: "4.2.1",
      versionAvailable: "4.3.0",
    },
    {
      kind: "install_one",
      id: "Example.Edit",
      source: "msstore",
      version: "1.0",
    },
    { kind: "stop" },
  ] as SignedOperation["action"][];
  const operations = actions.map((action, index) => {
    const base = {
      v: 1 as const,
      operationId: `00000000-0000-4000-8000-00000000000${index}`,
      actorId: ACTOR,
      botId: action.kind === "stop" ? "*" : "fixer",
      action,
      issuedAt: 1_790_000_000_000 + index,
      expiresAt: 1_790_000_120_000 + index,
    };
    const signed = signOperation(secret, base);
    return { operation: signed, text: operationText(base) };
  });
  const results = [
    {
      operationId: "00000000-0000-4000-8000-000000000000",
      actorId: ACTOR,
      ts: 1_790_000_001_000,
      nonce: "r1",
      ok: true,
      payload:
        '{"items":[{"name":"Caf\\u00e9 \\"Edit\\"","id":"Example.Edit","version":"4.2.1","source":"winget"}]}',
    },
    {
      operationId: "00000000-0000-4000-8000-000000000001",
      actorId: ACTOR,
      ts: 1_790_000_002_000,
      nonce: "r2",
      ok: false,
      payload: '{"error":"winget could not be started."}',
    },
    {
      operationId: "00000000-0000-4000-8000-000000000002",
      actorId: ACTOR,
      ts: 1_790_000_003_000,
      nonce: "r3",
      ok: true,
      payload: '{"items":[]}',
    },
  ].map((input) => ({
    ...input,
    text: resultText(input),
    mac: macOfResult(secret, input),
  }));
  return { secretHex: SECRET_HEX, poll, operations, results };
}

describe("signing vectors for the Windows helper", () => {
  test("the committed file is what protocol.ts makes now", () => {
    const now = `${JSON.stringify(build(), null, 2)}\n`;
    if (process.env.UPDATE_VECTORS === "1") writeFileSync(FILE, now);
    expect(readFileSync(FILE, "utf8")).toBe(now);
  });

  test("the vectors are not trivial: every mac differs and has 64 hex digits", () => {
    const v = build();
    const macs = [
      ...v.poll.map((x) => x.mac),
      ...v.operations.map((x) => x.operation.mac),
      ...v.results.map((x) => x.mac),
    ];
    expect(new Set(macs).size).toBe(macs.length);
    for (const mac of macs) expect(mac).toMatch(/^[0-9a-f]{64}$/);
  });
});
