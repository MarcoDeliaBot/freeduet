/**
 * Which approval requests a remote session may answer (docs/design/phone-and-remote.md 3.5.3): an ordinary
 * one, once, and nothing the person must do themselves or that changes what the assistants may do. The rule,
 * and the route that carries it, through the assembled app.
 */
import { describe, expect, test } from "bun:test";
import {
  REMOTE_ANSWER_SENTENCE,
  remoteMayAnswer,
} from "../src/approvals/remote-answer";
import type { ApprovalAction } from "../src/approvals/types";
import { LOOPBACK_PEER } from "./support/loopback-peer";
import {
  assembleSignIn,
  pairedCookie,
  signInConfig,
} from "./support/signin-app";

/** An ordinary card: a plain email, asked about, with the gate's verdict recorded. */
const ORDINARY = {
  actorId: "u-admin",
  botId: "otto",
  toolRef: "mcp__gmail__GMAIL_SEND_EMAIL",
  effect: "send",
  scope: "alice@example.test",
  args: { to: "alice@example.test", subject: "Lunch", body: "At one?" },
  runId: "r1",
  threadId: "t1",
  toolCallId: "c1",
  actionDigest: "d1",
  policy: { behaviour: "ask", source: "default", reason: "Asked every time." },
} as unknown as ApprovalAction;

const variant = (changes: Record<string, unknown>) =>
  ({ ...ORDINARY, ...changes }) as unknown as ApprovalAction;

/** What the gate records for each way it settles a request, besides an ordinary ask. */
const policy = (changes: Record<string, unknown>) =>
  variant({ policy: { ...ORDINARY.policy, ...changes } });

describe("the rule, request by request", () => {
  test("an ordinary request may be allowed once or denied", () => {
    expect(remoteMayAnswer("allow_once", ORDINARY)).toEqual({ allowed: true });
    expect(remoteMayAnswer("deny", ORDINARY)).toEqual({ allowed: true });
    // A card the person's own rule or the reviewer settled as "ask" is ordinary too.
    expect(
      remoteMayAnswer("allow_once", policy({ source: "auto_review" })).allowed,
    ).toBe(true);
    expect(
      remoteMayAnswer("allow_once", policy({ source: "always_ask" })).allowed,
    ).toBe(true);
  });

  test("allow always and handled are never answered from here, whatever the request", () => {
    for (const decision of ["allow_always", "handled", "", "ALLOW_ONCE", "x"])
      expect(remoteMayAnswer(decision, ORDINARY).allowed).toBe(false);
  });

  test("a request the gate handed to the person is not answered from here, nor denied", () => {
    for (const decision of ["allow_once", "deny"]) {
      expect(
        remoteMayAnswer(decision, policy({ behaviour: "hand_off" })).allowed,
      ).toBe(false);
      expect(
        remoteMayAnswer(decision, policy({ source: "safety" })).allowed,
      ).toBe(false);
      expect(
        remoteMayAnswer(
          decision,
          policy({
            review: { verdict: "hand_off", preApproved: false, reason: "x" },
          }),
        ).allowed,
      ).toBe(false);
      expect(
        remoteMayAnswer(
          decision,
          policy({
            review: {
              verdict: "needs_approval",
              preApproved: false,
              reason: "x",
              safety: "payments",
            },
          }),
        ).allowed,
      ).toBe(false);
    }
  });

  test("the safety check is run again, so a payment, a credential or a security setting is refused whatever the gate recorded", () => {
    const hits: Record<string, unknown>[] = [
      { toolRef: "mcp__stripe__create_payment_intent" },
      { toolRef: "mcp__shop__PLACE_ORDER", scope: "checkout" },
      { args: { action: "change the password for the account" } },
      { args: { note: "turn on two-factor" } },
      { toolRef: "mcp__admin__update_security_settings" },
      { args: { setting: "share with anyone" } },
      { toolRef: "mcp__bank__send_money" },
    ];
    for (const changes of hits)
      expect([
        changes,
        remoteMayAnswer("allow_once", variant(changes)).allowed,
      ]).toEqual([changes, false]);
  });

  test("a routine, a trigger, a setting, Full access, an app that is connected or authorised, and a computer are refused", () => {
    const refused: Record<string, unknown>[] = [
      { configuresAutomation: true },
      { changesSetting: true },
      { toolRef: "mcp__freeduet__set_full_access" },
      { toolRef: "mcp__composio__COMPOSIO_MANAGE_CONNECTIONS" },
      { toolRef: "mcp__gmail__authorize_account" },
      { toolRef: "mcp__github__oauth_install_app" },
      { toolRef: "mcp__drive__share_file" },
      { toolRef: "mcp__drive__grant_access" },
      { toolRef: "mcp__team__invite_member" },
      { toolRef: "computer_run_command", effect: "execute" },
      { toolRef: "computer_navigate", effect: "navigate" },
      { toolRef: "host/open_file", effect: "execute" },
    ];
    for (const changes of refused)
      expect([
        changes,
        remoteMayAnswer("allow_once", variant(changes)).allowed,
      ]).toEqual([changes, false]);
  });

  test("it fails closed: no recorded action, no recorded verdict, an unknown verdict", () => {
    expect(remoteMayAnswer("allow_once", undefined).allowed).toBe(false);
    expect(
      remoteMayAnswer("allow_once", variant({ policy: undefined })).allowed,
    ).toBe(false);
    for (const odd of [
      { source: "default" },
      { behaviour: "maybe", source: "default" },
      { behaviour: 7 },
    ])
      expect(
        remoteMayAnswer("allow_once", variant({ policy: odd })).allowed,
      ).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------
// The route, through the assembled app.
// ---------------------------------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";

function deployment(action: unknown, withSecret = true) {
  const config = signInConfig({}, withSecret);
  const { app, calls } = assembleSignIn(config, {}, { action });
  const answer = (
    decision: string,
    options: { paired?: boolean; who?: "admin" | "user" } = {},
  ) =>
    app.request(
      `${ORIGIN}/api/approvals/req-1/decision`,
      {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "x-test-session": options.who ?? "admin",
          ...(options.paired ? { cookie: pairedCookie(config) } : {}),
        },
        body: JSON.stringify({ decision }),
      },
      LOOPBACK_PEER,
    );
  return { answer, calls };
}

describe("a remote session answers through the route", () => {
  test("an ordinary request is allowed once, and denied: the decision is taken", async () => {
    const { answer, calls } = deployment(ORDINARY);
    expect((await answer("allow_once")).status).toBe(200);
    expect((await answer("deny")).status).toBe(200);
    expect(calls.decisions).toEqual([
      { id: "req-1", decision: "allow_once" },
      { id: "req-1", decision: "deny" },
    ]);
  });

  test("allow always and handled are refused with the sentence, and nothing is decided", async () => {
    const { answer, calls } = deployment(ORDINARY);
    for (const decision of ["allow_always", "handled"]) {
      const refused = await answer(decision);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({
        error: REMOTE_ANSWER_SENTENCE,
        code: "remote_session_limited",
      });
    }
    expect(calls.decisions).toEqual([]);
  });

  test("a request that is the person's to do, or that changes what the assistants may do, is refused whichever way it is answered", async () => {
    const dangerous = [
      policy({ behaviour: "hand_off", source: "safety" }),
      variant({ toolRef: "mcp__stripe__create_payment_intent" }),
      variant({ args: { note: "reset the password" } }),
      variant({ configuresAutomation: true }),
      variant({ changesSetting: true }),
      variant({ toolRef: "mcp__freeduet__set_full_access" }),
      variant({ toolRef: "mcp__composio__COMPOSIO_MANAGE_CONNECTIONS" }),
      variant({ policy: undefined }),
    ];
    for (const action of dangerous) {
      const { answer, calls } = deployment(action);
      for (const decision of ["allow_once", "deny"]) {
        const refused = await answer(decision);
        expect([JSON.stringify(action).slice(0, 60), refused.status]).toEqual([
          JSON.stringify(action).slice(0, 60),
          403,
        ]);
        expect(((await refused.json()) as { code?: string }).code).toBe(
          "remote_session_limited",
        );
      }
      // Left as it was: pending, for the computer.
      expect(calls.decisions).toEqual([]);
    }
  });

  test("the same person at the computer (paired) answers all of them as today", async () => {
    const dangerous = [
      policy({ behaviour: "hand_off", source: "safety" }),
      variant({ toolRef: "mcp__stripe__create_payment_intent" }),
      variant({ configuresAutomation: true }),
      variant({ policy: undefined }),
    ];
    for (const action of dangerous) {
      const { answer, calls } = deployment(action);
      for (const decision of ["allow_once", "allow_always", "deny", "handled"])
        expect((await answer(decision, { paired: true })).status).toBe(200);
      expect(calls.decisions.map((each) => each.decision)).toEqual([
        "allow_once",
        "allow_always",
        "deny",
        "handled",
      ]);
    }
  });

  test("a deployment with sign-in and no secret has nothing remote, so it answers as it always did", async () => {
    const { answer, calls } = deployment(
      variant({ toolRef: "mcp__stripe__create_payment_intent" }),
      false,
    );
    expect((await answer("allow_always")).status).toBe(200);
    expect(calls.decisions).toEqual([
      { id: "req-1", decision: "allow_always" },
    ]);
  });

  test("the request is read from the store, not from the call: a decision cannot describe the request away", async () => {
    // The body names nothing but the decision (a stricter body is refused), so the only description of the
    // request is the one the server recorded.
    const { app } = assembleSignIn(signInConfig(), {}, { action: ORDINARY });
    const rejected = await app.request(
      `${ORIGIN}/api/approvals/req-1/decision`,
      {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "x-test-session": "admin",
        },
        body: JSON.stringify({
          decision: "allow_once",
          action: { policy: { behaviour: "allow" } },
        }),
      },
      LOOPBACK_PEER,
    );
    expect(rejected.status).toBe(400);
  });
});
