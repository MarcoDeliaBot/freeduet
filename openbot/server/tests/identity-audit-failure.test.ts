import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { logLinkAuditFailure } from "../src/identity/audit-failure";

let spy: ReturnType<typeof spyOn>;
beforeEach(() => {
  spy = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => spy.mockRestore());

/**
 * The line this test's own call logged. Other tests can log late into this spy, and a console.error
 * spy that another file never restored is reused by spyOn here with its earlier calls, so calls[0]
 * is not necessarily ours. The record is the most recent JSON line whose type is
 * identity-link-audit-failed; a line that is not JSON, or another type, is skipped.
 */
function auditRecord(): { line: string; record: Record<string, unknown> } {
  const calls = spy.mock.calls;
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const line = calls[index]?.[0];
    if (typeof line !== "string") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = parsed as Record<string, unknown> | null;
    if (record !== null && record.type === "identity-link-audit-failed")
      return { line, record };
  }
  throw new Error("no identity-link-audit-failed line was logged");
}

function logged(error: unknown): Record<string, unknown> {
  logLinkAuditFailure("github", error);
  return auditRecord().record;
}

function pgError(errno: string, message = "boom user-123"): Error {
  const error = new Error(message);
  error.name = "PostgresError";
  Object.assign(error, { errno, code: "ERR_POSTGRES_SERVER_ERROR" });
  return error;
}

test("reports the SQLSTATE of a Postgres error", () => {
  expect(logged(pgError("57014"))).toEqual({
    type: "identity-link-audit-failed",
    provider: "github",
    errorName: "PostgresError",
    errorCode: "57014",
  });
});

test("reports the SQLSTATE of a Postgres error wrapped as a cause", () => {
  const wrapper = new Error("Failed query: insert ... params: user-123", {
    cause: pgError("23505"),
  });
  expect(logged(wrapper).errorCode).toBe("23505");
});

test("does not report system error codes as a SQLSTATE", () => {
  for (const code of ["EPIPE", "EPERM", "ECONNRESET"]) {
    spy.mockClear();
    const error = Object.assign(new Error("sys"), { code, errno: code });
    expect(logged(error)).not.toHaveProperty("errorCode");
    spy.mockClear();
    expect(logged(new Error("w", { cause: error }))).not.toHaveProperty(
      "errorCode",
    );
  }
});

test("omits errorCode when there is none", () => {
  expect(logged(new Error("x"))).not.toHaveProperty("errorCode");
});

test("handles non-Error thrown values", () => {
  for (const value of ["str", null, undefined, 42, { errno: "23505" }]) {
    spy.mockClear();
    const out = logged(value);
    expect(out.errorName).toBe("unknown");
    expect(out).not.toHaveProperty("errorCode");
  }
});

test("never logs the message or ids", () => {
  logLinkAuditFailure("slack", pgError("23505", "secret user-123"));
  expect(auditRecord().line).not.toContain("user-123");
});

test("reads its own record when other console.error lines come first", () => {
  // Another test's late log and a line that is not JSON at all reach the same spy first.
  console.error(
    JSON.stringify({
      type: "routine-run-channel-unrecorded",
      routineId: "r",
      routineRunId: "run-1",
      reason: "routineStore.recordRunChannel is not a function",
    }),
  );
  console.error("a plain line, not JSON");
  expect(logged(pgError("57014"))).toEqual({
    type: "identity-link-audit-failed",
    provider: "github",
    errorName: "PostgresError",
    errorCode: "57014",
  });
});
