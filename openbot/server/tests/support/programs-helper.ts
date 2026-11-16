/**
 * A stand-in for the programs helper, in process (docs/design/programs-on-your-computer.md, S1).
 *
 * It signs and checks with node:crypto alone, written from the wire format in the design note and in
 * `programs/protocol.ts`, and imports nothing from the server's own protocol module: a mistake in one
 * reading of the format is then found by the other. The real helper (S2) is a separate program.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

const mac = (secret: string | Buffer, text: string) =>
  createHmac("sha256", secret).update(text).digest("hex");

export type WireOperation = {
  v: number;
  operationId: string;
  actorId: string;
  botId: string;
  action: Record<string, string>;
  issuedAt: number;
  expiresAt: number;
  mac: string;
};

/** The text an operation's mac covers: fixed order, one field per line, absent fields empty. */
export function operationText(op: Omit<WireOperation, "mac">): string {
  const a = op.action;
  return [
    "op1",
    op.operationId,
    op.actorId,
    op.botId,
    a.kind ?? "",
    a.id ?? "",
    a.source ?? "",
    a.versionNow ?? "",
    a.versionAvailable ?? "",
    a.version ?? "",
    String(op.issuedAt),
    String(op.expiresAt),
  ].join("\n");
}

export function pollBody(
  secret: string | Buffer,
  actorId: string,
  at: number,
  overrides: { nonce?: string; secret?: string | Buffer } = {},
) {
  const nonce = overrides.nonce ?? randomUUID();
  return {
    actorId,
    ts: at,
    nonce,
    mac: mac(overrides.secret ?? secret, `poll1\n${actorId}\n${at}\n${nonce}`),
  };
}

export function resultBody(
  secret: string | Buffer,
  input: {
    actorId: string;
    operationId: string;
    at: number;
    ok: boolean;
    payload: unknown;
    nonce?: string;
  },
) {
  const nonce = input.nonce ?? randomUUID();
  const payload = JSON.stringify(input.payload);
  const digest = createHash("sha256").update(payload).digest("hex");
  return {
    actorId: input.actorId,
    operationId: input.operationId,
    ts: input.at,
    nonce,
    ok: input.ok,
    payload,
    mac: mac(
      secret,
      [
        "res1",
        input.operationId,
        input.actorId,
        String(input.at),
        nonce,
        String(input.ok),
        digest,
      ].join("\n"),
    ),
  };
}

/** Whether an operation's mac verifies under `secret`, as the helper checks before running it. */
export const operationIsGenuine = (
  secret: string | Buffer,
  op: WireOperation,
): boolean => {
  const { mac: given, ...rest } = op;
  return mac(secret, operationText(rest)) === given;
};

export const INSTALLED = {
  items: [
    {
      name: "ExampleEdit",
      id: "Example.ExampleEdit",
      version: "4.2.1",
      source: "winget",
    },
  ],
};
export const UPDATES = {
  items: [
    {
      name: "ExampleEdit",
      id: "Example.ExampleEdit",
      versionNow: "4.2.1",
      versionAvailable: "4.3.0",
      source: "winget",
    },
  ],
};
