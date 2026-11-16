/**
 * The wire between the server and the programs helper (docs/design/programs-on-your-computer.md sections
 * 2.3 and 3, D60): the four fixed actions as types, and the signing of every poll, operation and result.
 *
 * NO COMMAND ANYWHERE. An action is a kind and typed fields: an id and a source, two versions. There is
 * no field that holds a command line, a flag or a path, and every object is strict, so a payload that
 * carries one is refused whole rather than trimmed. The helper builds its own command lines from one table
 * of its own (S2); nothing here can hand it one.
 *
 * THE SIGNING. HMAC-SHA-256 with a secret that only the server and the helper hold (`broker.ts`). The text
 * a mac covers is a fixed list of fields, one per line, so a helper written in any language can build it
 * without a canonical JSON writer:
 *
 *   poll       "poll1", actorId, ts, nonce
 *   operation  "op1", operationId, actorId, botId, kind, id, source, versionNow, versionAvailable, version,
 *              issuedAt, expiresAt                    (a field the kind does not have is the empty line)
 *   result     "res1", operationId, actorId, ts, nonce, ok, sha256(payload)       (payload: the exact text sent)
 *
 * Every poll and every result carries a timestamp (30 s either way) and a nonce used once; every operation
 * carries its own id, used once, and its own expiry, inside the mac. A field value has no control character
 * and no more than 200 characters, so no value can shift a line and read as another field.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** A poll or a result is refused when its timestamp is further than this from the server's clock. */
export const SKEW_MS = 30_000;
/** How long the helper counts as connected after a good poll. */
export const LEASE_MS = 15_000;
/** How long an operation lives, from the moment it is queued. */
export const OPERATION_TTL_MS = 120_000;
/** The most rows a list carries, and the most characters in one of its fields. */
export const MAX_ROWS = 500;
export const MAX_FIELD = 120;
/** The most text a result's payload may hold. */
export const MAX_PAYLOAD = 400_000;

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const text = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !CONTROL.test(value), "no control characters");
const source = z.enum(["winget", "msstore"]);

/**
 * The four fixed actions. Only the two lists are wired by the first slice; the other two exist so the
 * schema, the signing and the helper's table are written once, against all four.
 */
export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("list_installed") }),
  z.strictObject({ kind: z.literal("list_updates") }),
  z.strictObject({
    kind: z.literal("update_one"),
    id: text,
    source,
    versionNow: text,
    versionAvailable: text,
  }),
  z.strictObject({
    kind: z.literal("install_one"),
    id: text,
    source,
    version: text,
  }),
]);
export type ProgramsAction = z.infer<typeof actionSchema>;
export type ProgramsActionKind = ProgramsAction["kind"];

/** An action read strictly. Throws on anything but exactly one of the four, with exactly its fields. */
export function parseAction(value: unknown): ProgramsAction {
  return actionSchema.parse(value);
}

/** A control operation for the helper, not an action: it carries nothing but its kind. */
export type StopOperation = { kind: "stop" };

export type SignedOperation = {
  v: 1;
  operationId: string;
  actorId: string;
  botId: string;
  action: ProgramsAction | StopOperation;
  issuedAt: number;
  expiresAt: number;
  mac: string;
};

const hmac = (secret: Buffer, body: string) =>
  createHmac("sha256", secret).update(body).digest("hex");

/** Equal for strings of any length, in time that does not say where they differ. */
export function sameMac(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || given.length !== expected.length)
    return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const line = (value: string | number | boolean | undefined) =>
  value === undefined ? "" : String(value);

export function pollText(input: {
  actorId: string;
  ts: number;
  nonce: string;
}): string {
  return ["poll1", input.actorId, input.ts, input.nonce].join("\n");
}

export function operationText(operation: Omit<SignedOperation, "mac">): string {
  const a = operation.action as Record<string, string | undefined>;
  return [
    "op1",
    operation.operationId,
    operation.actorId,
    operation.botId,
    line(a.kind),
    line(a.id),
    line(a.source),
    line(a.versionNow),
    line(a.versionAvailable),
    line(a.version),
    line(operation.issuedAt),
    line(operation.expiresAt),
  ].join("\n");
}

export function resultText(input: {
  operationId: string;
  actorId: string;
  ts: number;
  nonce: string;
  ok: boolean;
  payload: string;
}): string {
  const digest = createHash("sha256").update(input.payload).digest("hex");
  return [
    "res1",
    input.operationId,
    input.actorId,
    input.ts,
    input.nonce,
    input.ok,
    digest,
  ].join("\n");
}

export const macOfPoll = (
  secret: Buffer,
  input: Parameters<typeof pollText>[0],
) => hmac(secret, pollText(input));

export const macOfResult = (
  secret: Buffer,
  input: Parameters<typeof resultText>[0],
) => hmac(secret, resultText(input));

export function signOperation(
  secret: Buffer,
  operation: Omit<SignedOperation, "mac">,
): SignedOperation {
  return { ...operation, mac: hmac(secret, operationText(operation)) };
}

/**
 * What the helper does with an operation before it runs one: the mac, the expiry, and an id it has not seen.
 * Written here so the server's tests and the helper's agree on one reading; the helper's own copy is S2.
 */
export function verifyOperation(
  secret: Buffer,
  operation: SignedOperation,
  now: number,
  seenIds: Set<string>,
): { ok: true } | { ok: false; why: "mac" | "expired" | "replayed" } {
  const { mac, ...rest } = operation;
  if (!sameMac(mac, hmac(secret, operationText(rest))))
    return { ok: false, why: "mac" };
  if (now >= operation.expiresAt) return { ok: false, why: "expired" };
  if (seenIds.has(operation.operationId)) return { ok: false, why: "replayed" };
  seenIds.add(operation.operationId);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------
// What the helper answers, read strictly. The member is never given the raw answer: it gets a list the
// server builds from these fields (3.3).
// ---------------------------------------------------------------------------------------------------

const cell = z.string().max(2000);
const installedRow = z.strictObject({
  name: cell,
  id: cell,
  version: cell,
  source: cell,
});
const updateRow = z.strictObject({
  name: cell,
  id: cell,
  versionNow: cell,
  versionAvailable: cell,
  source: cell,
});
export const installedAnswer = z.strictObject({
  items: z.array(installedRow).max(5_000),
});
export const updatesAnswer = z.strictObject({
  items: z.array(updateRow).max(5_000),
});

export type InstalledProgram = z.infer<typeof installedRow>;
export type UpdatableProgram = z.infer<typeof updateRow>;
export type ProgramsResult =
  | { kind: "list_installed"; items: InstalledProgram[]; truncated: boolean }
  | { kind: "list_updates"; items: UpdatableProgram[]; truncated: boolean };

/** One text field, with control characters gone and cut to the limit. */
export const clean = (value: string): string =>
  value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this removes
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FIELD);

function cleanRows<T extends Record<string, string>>(
  rows: T[],
): {
  items: T[];
  truncated: boolean;
} {
  const items = rows
    .slice(0, MAX_ROWS)
    .map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, clean(value)]),
        ) as T,
    );
  return { items, truncated: rows.length > MAX_ROWS };
}

/** The answer to an action, read strictly and cleaned. Throws when it is not in the agreed shape. */
export function readAnswer(
  kind: ProgramsActionKind,
  payload: string,
): ProgramsResult {
  const value: unknown = JSON.parse(payload);
  if (kind === "list_installed")
    return {
      kind,
      ...cleanRows(installedAnswer.parse(value).items),
    };
  if (kind === "list_updates")
    return { kind, ...cleanRows(updatesAnswer.parse(value).items) };
  throw new Error("This action has no answer in the first slice.");
}
