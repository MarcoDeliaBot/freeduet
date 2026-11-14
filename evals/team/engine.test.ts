/*
 * The engine a team eval run certifies (engine.ts, docs/ENGINES_PLAN.md section 9.1, slice 4): the name
 * the runner is given, checked against the eval stack's own report before anything is created, the
 * engine each case records (the one the stack lists alone, else unknown: the stack reports no engine per
 * answer), thresholds that stay with one engine, and the engine name a public report carries. Offline: a
 * scripted stack and a scripted grader, no model and no eval stack.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  askTheStack,
  attributeAnswers,
  checkEngine,
  chooseEngine,
  DEFAULT_ENGINE,
  type EngineChoice,
  engineCheckText,
  engineNamed,
  engineNote,
  engineRefusal,
  engineVerdict,
  regradeClash,
  type StackAnswer,
  type StackEngine,
  UNKNOWN_ENGINE,
} from "./engine";

const HERE = import.meta.dir;
const RUN = join(HERE, "run.ts");
const TODAY = new Date().toISOString().slice(0, 10);

const ready: StackEngine = {
  id: "claude-code",
  state: "ready",
  available: true,
  installed: true,
};
const answer = (...engines: StackEngine[]): StackAnswer => ({ engines });

/** What the check says of Claude Code when the stack lists it alone. */
const ALONE =
  "claude-code is available on the eval stack (state ready). The stack lists claude-code alone, so it ran every turn (docs/M1_PLAN.md, D34 point 1), and each case records it.";

/** A fetch that answers with `reply` and records the address, the agent token and the redirect rule of each request. */
function stubFetch(reply: () => Response) {
  const seen: { url: string; token: string | null; redirect?: string }[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    seen.push({
      url: String(input),
      token: new Headers(init?.headers).get("x-openbot-agent-token"),
      redirect: init?.redirect,
    });
    return reply();
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

// ── Names and the choice ──────────────────────────────────────────────────────────────────────────

describe("engine names", () => {
  test("a name the report's file name can carry is accepted, and the space around it is dropped", () => {
    expect(engineNamed("claude-code", "--engine")).toBe("claude-code");
    expect(engineNamed("  cli-test  ", "--engine")).toBe("cli-test");
    expect(engineNamed("openrouter.free_1", "--engine")).toBe(
      "openrouter.free_1",
    );
  });

  test("a name with a slash, a space, a leading dash or dot, or more than 64 characters is refused in plain words", () => {
    for (const bad of ["a/b", "a b", "-x", ".x", "..", "x".repeat(65)])
      expect(() => engineNamed(bad, "--engine")).toThrow(
        "is not an engine the runner can certify",
      );
  });

  test("an empty name is refused, and so are the names the runner keeps for itself", () => {
    expect(() => engineNamed("   ", "--engine")).toThrow(
      `--engine needs an engine name, such as ${DEFAULT_ENGINE}.`,
    );
    expect(() => engineNamed("unknown", "FREEDUET_EVAL_ENGINE")).toThrow(
      'FREEDUET_EVAL_ENGINE "unknown" is not an engine the runner can certify',
    );
    expect(() => engineNamed("fake", "--engine")).toThrow(
      '--engine "fake" is not an engine the runner can certify',
    );
  });
});

describe("choosing the engine", () => {
  test("the flag beats the environment, the environment beats the default, the default is Claude Code", () => {
    expect(chooseEngine({ flag: "cli-test", env: "codex" })).toEqual({
      name: "cli-test",
      from: "flag",
    });
    expect(chooseEngine({ env: "codex" })).toEqual({
      name: "codex",
      from: "env",
    });
    expect(chooseEngine({ env: "  " })).toEqual({
      name: "claude-code",
      from: "default",
    });
    expect(chooseEngine({})).toEqual({ name: "claude-code", from: "default" });
  });

  test("an empty --engine is refused rather than falling through to the environment", () => {
    expect(() => chooseEngine({ flag: "", env: "codex" })).toThrow(
      "--engine needs an engine name",
    );
  });

  test("an unusable environment name is refused, and named as the environment", () => {
    expect(() => chooseEngine({ env: "my engine" })).toThrow(
      'FREEDUET_EVAL_ENGINE "my engine" is not an engine the runner can certify',
    );
  });
});

// ── Asking the stack ──────────────────────────────────────────────────────────────────────────────

describe("asking the eval stack which engines it runs", () => {
  test("sends the token to the agent's /engines and returns its engine list as it answered it", async () => {
    const list = [
      {
        id: "claude-code",
        label: "Claude Code",
        kind: "cli",
        state: "ready",
        available: true,
        installed: true,
        signed_in: true,
        probe_problem: null,
      },
    ];
    const { fetchImpl, seen } = stubFetch(() =>
      Response.json({ engines: list, problems: [] }),
    );
    const found = await askTheStack({
      agentUrl: "http://agent.test:4231/",
      token: "tok-1",
      fetchImpl,
    });
    expect(found).toEqual({ engines: list });
    expect(seen).toEqual([
      {
        url: "http://agent.test:4231/engines",
        token: "tok-1",
        redirect: "manual",
      },
    ]);
  });

  test("keeps a path the agent address has, with or without its trailing slash", async () => {
    for (const [agentUrl, engines] of [
      ["http://agent.test/fd/", "http://agent.test/fd/engines"],
      ["http://agent.test", "http://agent.test/engines"],
    ] as const) {
      const { fetchImpl, seen } = stubFetch(() =>
        Response.json({ engines: [] }),
      );
      await askTheStack({ agentUrl, token: "t", fetchImpl });
      expect(seen[0]?.url).toBe(engines);
    }
  });

  test("an answer that is not 200 is a problem, and the token is never quoted", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response("nope", { status: 404 }),
    );
    const found = await askTheStack({
      agentUrl: "http://agent.test:4231/",
      token: "tok-secret-1",
      fetchImpl,
    });
    expect(found).toEqual({ problem: "the agent answered HTTP 404" });
    expect(JSON.stringify(found)).not.toContain("tok-secret-1");
  });

  test("a redirect is not followed, so the token is not sent on to another address", async () => {
    const { fetchImpl, seen } = stubFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://elsewhere.test/engines" },
        }),
    );
    expect(
      await askTheStack({
        agentUrl: "http://agent.test:4231/",
        token: "tok-redirect",
        fetchImpl,
      }),
    ).toEqual({ problem: "the agent answered HTTP 302" });
    expect(seen).toEqual([
      {
        url: "http://agent.test:4231/engines",
        token: "tok-redirect",
        redirect: "manual",
      },
    ]);
  });

  test("a stack that cannot be reached is a problem, not a refusal", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(
      await askTheStack({
        agentUrl: "http://agent.test:4231/",
        token: "t",
        fetchImpl,
      }),
    ).toEqual({ problem: "the agent did not answer (fetch failed)" });
  });

  test("an answer that is not JSON, or has no engine list, or lists an engine without its fields, is a problem", async () => {
    const notJson = stubFetch(() => new Response("<html></html>"));
    expect(
      await askTheStack({
        agentUrl: "http://agent.test/",
        token: "t",
        fetchImpl: notJson.fetchImpl,
      }),
    ).toEqual({ problem: "the agent's answer was not JSON" });

    const noList = stubFetch(() => Response.json({ problems: [] }));
    expect(
      await askTheStack({
        agentUrl: "http://agent.test/",
        token: "t",
        fetchImpl: noList.fetchImpl,
      }),
    ).toEqual({ problem: "the agent's answer had no engine list" });

    const noAvailable = stubFetch(() =>
      Response.json({ engines: [{ id: "claude-code", state: "ready" }] }),
    );
    expect(
      await askTheStack({
        agentUrl: "http://agent.test/",
        token: "t",
        fetchImpl: noAvailable.fetchImpl,
      }),
    ).toEqual({ problem: "the agent's answer had no engine list" });
  });

  test("an agent address that is not a URL is a problem, and nothing is sent", async () => {
    const { fetchImpl, seen } = stubFetch(() => Response.json({ engines: [] }));
    expect(
      await askTheStack({ agentUrl: "not a url", token: "t", fetchImpl }),
    ).toEqual({ problem: "the agent address in the settings is not a URL" });
    expect(seen).toEqual([]);
  });
});

// ── Verdicts, refusals and the lines the report keeps ─────────────────────────────────────────────

describe("the verdict on the chosen engine", () => {
  test("an engine the stack runs and has available is available, and the check line says its state", () => {
    const verdict = engineVerdict("claude-code", answer(ready));
    expect(verdict).toEqual({ verdict: "available", engine: ready });
    expect(engineCheckText("claude-code", verdict)).toBe(
      "claude-code is available on the eval stack (state ready).",
    );
  });

  test("an engine the stack does not run is absent, and its refusal names the engines the stack has", () => {
    const verdict = engineVerdict("codex", answer(ready));
    expect(verdict).toEqual({ verdict: "absent", engines: ["claude-code"] });
    expect(engineRefusal("codex", verdict, "--engine")).toBe(
      'The eval stack has no engine "codex", named by --engine: its engines are claude-code. Nothing was created. Name one of its engines, or leave --engine out to certify claude-code.',
    );
  });

  test("a stack that reports no engine at all says so in the refusal", () => {
    const verdict = engineVerdict("codex", answer());
    expect(engineRefusal("codex", verdict, "FREEDUET_EVAL_ENGINE")).toContain(
      "named by FREEDUET_EVAL_ENGINE: it reports no engines.",
    );
  });

  test("an engine the stack runs but cannot run now is refused with the time its limit lasts until", () => {
    const limited: StackEngine = {
      id: "claude-code",
      state: "open",
      available: false,
      installed: true,
      limited_until: "2026-11-15T09:00:00+00:00",
    };
    const verdict = engineVerdict("claude-code", answer(limited));
    expect(engineRefusal("claude-code", verdict, "--engine")).toBe(
      '"claude-code" is not available on the eval stack: it has hit its limit until 2026-11-15T09:00:00+00:00. Nothing was created. Make it available there, or name another engine.',
    );
  });

  test("a limit with no time, a signed-out engine and a missing one are each refused with their reason and the probe's words", () => {
    const noTime = engineVerdict(
      "claude-code",
      answer({ ...ready, state: "open", available: false }),
    );
    expect(noTime).toMatchObject({ why: "it has hit its limit" });

    const signedOut = engineVerdict(
      "claude-code",
      answer({
        ...ready,
        state: "signed_out",
        available: false,
        probe_problem: "not logged in",
      }),
    );
    expect(signedOut).toMatchObject({
      why: "it is signed out on the eval stack (not logged in)",
    });

    const missing = engineVerdict(
      "claude-code",
      answer({
        ...ready,
        available: false,
        installed: false,
        probe_problem: "command not found",
      }),
    );
    expect(missing).toMatchObject({
      why: "it is not installed on the stack (command not found)",
    });
  });

  test("a stack that cannot say is not a refusal: the check is not done, and the line says why", () => {
    const verdict = engineVerdict("cli-test", {
      problem: "the agent answered HTTP 404",
    });
    expect(verdict).toEqual({
      verdict: "unchecked",
      why: "the agent answered HTTP 404",
    });
    expect(engineRefusal("cli-test", verdict, "--engine")).toBeUndefined();
    expect(engineCheckText("cli-test", verdict)).toBe(
      "cli-test was not checked against the eval stack: the agent answered HTTP 404.",
    );
  });
});

describe("checking the engine before a run", () => {
  test("the default engine is asked about too: a stack that lists Claude Code alone gives its check, which main's output does not show", async () => {
    const { fetchImpl, seen } = stubFetch(() => Response.json({ engines: [ready] }));
    const check = await checkEngine(
      { name: DEFAULT_ENGINE, from: "default" },
      { MANAGED_AGENT_AG_UI_URL: "http://agent.test/", MANAGED_AGENT_TOKEN: "t" },
      fetchImpl,
    );
    expect(check).toEqual({
      text: ALONE,
      answeredBy: "claude-code",
      unchangedFromMain: true,
    });
    expect(seen.map((request) => request.url)).toEqual([
      "http://agent.test/engines",
    ]);
  });

  test("without the agent's address, or without its token, the check is not done and says which setting is missing; each case records unknown", async () => {
    const choice: EngineChoice = { name: "cli-test", from: "flag" };
    expect(await checkEngine(choice, {})).toEqual({
      text: "cli-test was not checked against the eval stack: the settings name no agent address (MANAGED_AGENT_AG_UI_URL). The stack's list of engines could not be read, so each case records its answering engine as unknown.",
      answeredBy: UNKNOWN_ENGINE,
      unchangedFromMain: false,
    });
    const noToken = await checkEngine(choice, {
      MANAGED_AGENT_AG_UI_URL: "http://agent.test/",
    });
    expect(noToken.text).toBe(
      "cli-test was not checked against the eval stack: the settings hold no agent token (MANAGED_AGENT_TOKEN). The stack's list of engines could not be read, so each case records its answering engine as unknown.",
    );
    expect(noToken.answeredBy).toBe(UNKNOWN_ENGINE);
  });

  test("an available engine passes with its check, and the token goes to the agent only", async () => {
    const { fetchImpl, seen } = stubFetch(() =>
      Response.json({ engines: [ready] }),
    );
    const check = await checkEngine(
      { name: "claude-code", from: "flag" },
      { MANAGED_AGENT_AG_UI_URL: "http://agent.test:4231/", MANAGED_AGENT_TOKEN: "tok-9" },
      fetchImpl,
    );
    expect(check).toEqual({
      text: ALONE,
      answeredBy: "claude-code",
      unchangedFromMain: false,
    });
    expect(seen).toEqual([
      {
        url: "http://agent.test:4231/engines",
        token: "tok-9",
        redirect: "manual",
      },
    ]);
  });

  test("an engine the stack does not run is refused, naming the setting it came from", async () => {
    const { fetchImpl } = stubFetch(() => Response.json({ engines: [ready] }));
    const env = {
      MANAGED_AGENT_AG_UI_URL: "http://agent.test/",
      MANAGED_AGENT_TOKEN: "t",
    };
    await expect(
      checkEngine({ name: "codex", from: "flag" }, env, fetchImpl),
    ).rejects.toThrow('The eval stack has no engine "codex", named by --engine');
    await expect(
      checkEngine({ name: "codex", from: "env" }, env, fetchImpl),
    ).rejects.toThrow("named by FREEDUET_EVAL_ENGINE");
  });

  test("the default engine is refused before anything is created when the stack does not list Claude Code", async () => {
    const { fetchImpl } = stubFetch(() =>
      Response.json({ engines: [{ ...ready, id: "codex" }] }),
    );
    await expect(
      checkEngine(
        { name: DEFAULT_ENGINE, from: "default" },
        { MANAGED_AGENT_AG_UI_URL: "http://agent.test/", MANAGED_AGENT_TOKEN: "t" },
        fetchImpl,
      ),
    ).rejects.toThrow(
      'The eval stack has no engine "claude-code", which a run without --engine or FREEDUET_EVAL_ENGINE certifies: its engines are codex. Nothing was created.',
    );
  });

  test("the default engine is not refused when the stack lists it but cannot run it now: its cases show the limit, as before", async () => {
    const limited: StackEngine = {
      ...ready,
      state: "open",
      available: false,
      limited_until: "2026-11-15T09:00:00+00:00",
    };
    const { fetchImpl } = stubFetch(() => Response.json({ engines: [limited] }));
    const check = await checkEngine(
      { name: DEFAULT_ENGINE, from: "default" },
      { MANAGED_AGENT_AG_UI_URL: "http://agent.test/", MANAGED_AGENT_TOKEN: "t" },
      fetchImpl,
    );
    expect(check.answeredBy).toBe("claude-code");
    expect(check.unchangedFromMain).toBe(true);
    expect(check.text).toContain(
      "claude-code is not available on the eval stack: it has hit its limit until 2026-11-15T09:00:00+00:00.",
    );
  });

  test("two engines listed: each case records unknown, for the default and for a chosen engine, and the check says which engines the stack lists", async () => {
    const codex: StackEngine = { id: "codex", state: "ready", available: true, installed: true };
    const { fetchImpl } = stubFetch(() => Response.json({ engines: [ready, codex] }));
    const env = { MANAGED_AGENT_AG_UI_URL: "http://agent.test/", MANAGED_AGENT_TOKEN: "t" };
    const expected = {
      text: "claude-code is available on the eval stack (state ready). The stack lists 2 engines (claude-code, codex). A member's chain and pin decide which one runs a turn, and the list shows neither, so each case records its answering engine as unknown.",
      answeredBy: UNKNOWN_ENGINE,
      unchangedFromMain: false,
    };
    expect(
      await checkEngine({ name: DEFAULT_ENGINE, from: "default" }, env, fetchImpl),
    ).toEqual(expected);
    expect(
      await checkEngine({ name: "claude-code", from: "flag" }, env, fetchImpl),
    ).toEqual(expected);
  });
});

// ── The rest of the report's engine rules ─────────────────────────────────────────────────────────

describe("a regrade and the thresholds keep to one engine", () => {
  test("a regrade with no engine chosen, or the report's own engine, is allowed", () => {
    expect(
      regradeClash({ report: "r.json", ran: "claude-code", chosen: undefined }),
    ).toBeUndefined();
    expect(
      regradeClash({
        report: "r.json",
        ran: "claude-code",
        chosen: { name: "claude-code", from: "flag" },
      }),
    ).toBeUndefined();
  });

  test("a regrade with another engine chosen is refused, and the message names the report's engine", () => {
    expect(
      regradeClash({
        report: "2026-11-13-claude-code.json",
        ran: "claude-code",
        chosen: { name: "codex", from: "flag" },
      }),
    ).toBe(
      "2026-11-13-claude-code.json was run on claude-code. A regrade keeps that engine, so --engine codex cannot apply: leave it out, or name claude-code.",
    );
    expect(
      regradeClash({
        report: "old.json",
        ran: UNKNOWN_ENGINE,
        chosen: { name: "codex", from: "env" },
      }),
    ).toContain("FREEDUET_EVAL_ENGINE codex cannot apply");
  });

  test("the Engine line says what the check said and which engine the answers are attributed to; a regrade keeps the text its report recorded", () => {
    expect(
      engineNote({ engine: "claude-code", text: ALONE, regraded: false }),
    ).toBe(
      `Engine: claude-code. ${ALONE} The thresholds are for claude-code, the engine this run certifies, and say nothing about any other engine.`,
    );
    expect(
      engineNote({ engine: "claude-code", text: ALONE, regraded: true }),
    ).toBe(
      `Engine: claude-code. ${ALONE} A regrade calls no member, so the stack was not asked again.`,
    );
  });
});

describe("which engine answered each case", () => {
  test("one engine listed: it ran every turn, whatever its state, and each case records it", () => {
    expect(attributeAnswers(answer(ready))).toEqual({
      answeredBy: "claude-code",
      alone: true,
      note: "The stack lists claude-code alone, so it ran every turn (docs/M1_PLAN.md, D34 point 1), and each case records it.",
    });
    expect(
      attributeAnswers(answer({ ...ready, state: "open", available: false })),
    ).toMatchObject({ answeredBy: "claude-code", alone: true });
  });

  test("two or more engines listed: unknown, whichever of them can run now", () => {
    const codex: StackEngine = { ...ready, id: "codex" };
    expect(attributeAnswers(answer(ready, codex))).toEqual({
      answeredBy: UNKNOWN_ENGINE,
      alone: false,
      note: "The stack lists 2 engines (claude-code, codex). A member's chain and pin decide which one runs a turn, and the list shows neither, so each case records its answering engine as unknown.",
    });
  });

  test("a list that cannot be read is unknown; a list with no engine attributes no answer", () => {
    expect(
      attributeAnswers({ problem: "the agent answered HTTP 404" }),
    ).toEqual({
      answeredBy: UNKNOWN_ENGINE,
      alone: false,
      note: "The stack's list of engines could not be read, so each case records its answering engine as unknown.",
    });
    expect(attributeAnswers(answer())).toEqual({
      answeredBy: UNKNOWN_ENGINE,
      alone: false,
      note: "The stack lists no engine, so no answer is attributed.",
    });
  });
});

// ── The runner, as a process, against a scripted stack ────────────────────────────────────────────

/** One member, one case, a question (so no report line is due): the scripted grader passes its one check. */
const CASES = [
  "cases:",
  "  - id: concierge-1",
  "    member: concierge",
  '    request: "Any jazz ideas for a fan on a budget of 50?"',
  "    must:",
  "      - gives ideas",
  "    must_not: []",
  "",
].join("\n");

type Seen = { method: string; path: string; token: string | null };

/**
 * The eval stack as the runner meets it: GET /engines answers `engines` (or 404 when `engines` is
 * "missing"), the grader answers the one check, and the member's conversation is scripted.
 */
function scriptedStack(stack: { engines: StackEngine[] } | "missing") {
  const seen: Seen[] = [];
  const stored: Record<string, unknown>[] = [];
  let busy = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      seen.push({
        method: request.method,
        path,
        token: request.headers.get("x-openbot-agent-token"),
      });
      if (path === "/engines")
        return stack === "missing"
          ? Response.json({ error: "not found" }, { status: 404 })
          : Response.json({ engines: stack.engines, problems: [] });
      if (path === "/v1/messages")
        return Response.json({
          content: [
            {
              type: "text",
              text: '{"checks":[{"id":"must-1","holds":true,"reason":"ideas given"}]}',
            },
          ],
        });
      if (path === "/api/me")
        return Response.json({ user: { id: "eval-user" } });
      if (path === "/api/channels" && request.method === "GET")
        return Response.json({ channels: [], nextCursor: null });
      if (path === "/api/channels") {
        // The runner names the conversation and reads the name back (live.ts createChannel).
        const made = (await request.json()) as { name?: string };
        return Response.json({
          channel: { id: "ch1", threadId: "th1", name: made.name },
        });
      }
      if (path.startsWith("/api/plugins/for/"))
        return Response.json({ tools: [] });
      if (path === "/api/copilotkit/agent/concierge/run") {
        const run = (await request.json()) as {
          messages: Record<string, unknown>[];
        };
        stored.push(
          ...run.messages,
          {
            id: "a1",
            role: "assistant",
            content: "Ideas: a record, a ticket, a club night.",
          },
        );
        busy = 1;
        return Response.json({ joinToken: "j" });
      }
      if (path === "/api/copilotkit/agent/concierge/connect") {
        // Busy once after a run (a JSON answer with a run id), then idle (204), as live.ts runState reads it.
        if (busy > 0) {
          busy -= 1;
          return Response.json({ runId: "r" });
        }
        return new Response(null, { status: 204 });
      }
      if (path === "/api/copilotkit/threads/th1/messages")
        return Response.json({ messages: stored });
      if (path === "/api/approvals")
        return Response.json({ requests: [] });
      if (path === "/api/memory" && request.method === "GET")
        return Response.json({ memories: [] });
      return Response.json({ error: "not found" }, { status: 404 });
    },
  });
  return { url: server.url.origin, seen, stop: () => server.stop(true) };
}

/** The variables the eval settings give the runner, for the stack and its agent. */
const agentEnv = (url: string, token: string): Record<string, string> => ({
  MANAGED_AGENT_AG_UI_URL: url,
  MANAGED_AGENT_TOKEN: token,
});

/** The environment the runner sees, without the engine and stack variables this file sets itself. */
const STACK_ENV = [
  "FREEDUET_EVAL_ENGINE",
  "MANAGED_AGENT_AG_UI_URL",
  "MANAGED_AGENT_TOKEN",
  "FREEDUET_EVAL_COOKIE",
  "FREEDUET_INSTALL_SECRET",
  "FREEDUET_SERVER",
  "SERVER_PORT",
];

type Outcome = {
  code: number;
  stdout: string;
  stderr: string;
  /** Every report (.json and .md) in the directory, read after the run. */
  files: Record<string, string>;
};

/** Runs the runner with `args` in `dir` and returns its exit code, its output and the reports it left there. */
async function runIn(
  dir: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<Outcome> {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !STACK_ENV.includes(key),
    ),
  ) as Record<string, string>;
  const child = Bun.spawn([process.execPath, RUN, ...args], {
    env: { ...base, FREEDUET_EVAL_GRADER_KEY: "test-key", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const files: Record<string, string> = {};
  for (const name of await readdir(dir))
    if (/\.(json|md)$/.test(name))
      files[name] = await readFile(join(dir, name), "utf8");
  return { code, stdout, stderr, files };
}

/** A directory holding the one-case cases file, removed afterwards. */
async function withCases<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "team-eval-engine-"));
  try {
    await writeFile(join(dir, "cases.yaml"), CASES);
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The flags of a live run of the one case, against `server`. */
const liveArgs = (dir: string, server: string, extra: string[]) => [
  "--cases",
  join(dir, "cases.yaml"),
  "--out",
  dir,
  "--server",
  server,
  "--grader-url",
  server,
  "--timeout",
  "60",
  "--no-computer",
  ...extra,
];

const LIVE = { timeout: 120_000 };

describe("the runner against the eval stack", () => {
  test(
    "a chosen engine the stack does not run is refused before anything is created",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({ engines: [{ ...ready, id: "codex" }] });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, ["--engine", "claude-code"]),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).not.toBe(0);
          expect(out.stderr).toContain(
            'The eval stack has no engine "claude-code", named by --engine: its engines are codex. Nothing was created.',
          );
          // Only the stack was asked, with the agent's token: no conversation, no run, no memory.
          expect(stack.seen).toEqual([
            { method: "GET", path: "/engines", token: "tok-engine" },
          ]);
          expect(out.files).toEqual({});
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a chosen engine the stack runs but cannot run now is refused, with the reason",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({
          engines: [
            {
              id: "claude-code",
              state: "open",
              available: false,
              installed: true,
              limited_until: "2026-11-15T09:00:00+00:00",
            },
          ],
        });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, ["--engine", "claude-code"]),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).not.toBe(0);
          expect(out.stderr).toContain(
            '"claude-code" is not available on the eval stack: it has hit its limit until 2026-11-15T09:00:00+00:00. Nothing was created.',
          );
          expect(stack.seen.map((request) => request.path)).toEqual([
            "/engines",
          ]);
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a name the file names cannot carry is refused before the stack is asked",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({ engines: [ready] });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, ["--engine", "a/b"]),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).not.toBe(0);
          expect(out.stderr).toContain(
            '--engine "a/b" is not an engine the runner can certify',
          );
          expect(stack.seen).toEqual([]);
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "an available engine runs: its report names the engine, the check, and the engine that answered each case; the public report and a regrade keep the engine",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({ engines: [ready] });
        try {
          const live = await runIn(
            dir,
            liveArgs(dir, stack.url, ["--engine", "claude-code"]),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(live.code).toBe(0);
          expect(live.stderr).toBe("");
          expect(live.stdout).toContain(
            `Engine: claude-code. ${ALONE} The thresholds are for claude-code, the engine this run certifies, and say nothing about any other engine.`,
          );
          const report = JSON.parse(
            live.files[`${TODAY}-claude-code.json`] ?? "null",
          );
          expect(report).toMatchObject({
            engine: "claude-code",
            engineCheck: ALONE,
          });
          expect(report.cases[0].transcript.engine).toBe("claude-code");
          const markdown = live.files[`${TODAY}-claude-code.md`] ?? "";
          expect(markdown).toContain(
            `Engine: claude-code. ${ALONE} The thresholds are for claude-code, the engine this run certifies, and say nothing about any other engine.`,
          );
          expect(markdown).toContain("**Thresholds: PASS**");

          // The public copy carries the engine's name, as the report it is made from does.
          const pub = await runIn(dir, [
            "--public",
            join(dir, `${TODAY}-claude-code.json`),
            "--cases",
            join(dir, "cases.yaml"),
            "--out",
            dir,
          ]);
          expect(pub.code).toBe(0);
          expect(
            JSON.parse(pub.files[`${TODAY}-claude-code-public.json`] ?? "null"),
          ).toMatchObject({ public: true, engine: "claude-code" });
          expect(pub.files[`${TODAY}-claude-code-public.md`]).toContain(
            `# Team eval, ${TODAY}, claude-code (public report)`,
          );

          // A regrade calls no member and keeps the engine: another one is refused, its own is not.
          const clash = await runIn(dir, [
            "--regrade",
            join(dir, `${TODAY}-claude-code.json`),
            "--reason",
            "engine check test",
            "--cases",
            join(dir, "cases.yaml"),
            "--out",
            dir,
            "--grader-url",
            stack.url,
            "--engine",
            "codex",
          ]);
          expect(clash.code).not.toBe(0);
          expect(clash.stderr).toContain(
            `${TODAY}-claude-code.json was run on claude-code. A regrade keeps that engine, so --engine codex cannot apply`,
          );
          const regraded = await runIn(dir, [
            "--regrade",
            join(dir, `${TODAY}-claude-code.json`),
            "--reason",
            "engine check test",
            "--cases",
            join(dir, "cases.yaml"),
            "--out",
            dir,
            "--grader-url",
            stack.url,
            "--engine",
            "claude-code",
          ]);
          expect(regraded.code).toBe(0);
          const name = `${TODAY}-claude-code-regraded-${TODAY}`;
          expect(
            JSON.parse(regraded.files[`${name}.json`] ?? "null"),
          ).toMatchObject({
            engine: "claude-code",
            engineCheck: ALONE,
          });
          expect(regraded.files[`${name}.md`]).toContain(
            `Engine: claude-code. ${ALONE} A regrade calls no member, so the stack was not asked again.`,
          );
        } finally {
          stack.stop();
        }
      }),
    { timeout: 180_000 },
  );

  test(
    "a stack that does not say which engines it has leaves the check not done, and the run goes on",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack("missing");
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, ["--engine", "cli-test"]),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).toBe(0);
          const unreadable =
            "cli-test was not checked against the eval stack: the agent answered HTTP 404. The stack's list of engines could not be read, so each case records its answering engine as unknown.";
          expect(out.stdout).toContain(`Engine: cli-test. ${unreadable}`);
          const report = JSON.parse(
            out.files[`${TODAY}-cli-test.json`] ?? "null",
          );
          expect(report.engineCheck).toBe(unreadable);
          expect(report.cases[0].transcript.engine).toBe(UNKNOWN_ENGINE);
          expect(out.files[`${TODAY}-cli-test.md`]).toContain(
            `Engine: cli-test. ${unreadable} The thresholds are for cli-test, the engine this run certifies, and say nothing about any other engine.`,
          );
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a default run asks the stack, and on a stack that lists Claude Code alone it prints and reports what main did: no Engine line, no check, and each case records claude-code",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({ engines: [ready] });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, []),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).toBe(0);
          expect(out.stderr).toBe("");
          expect(stack.seen).toContainEqual({
            method: "GET",
            path: "/engines",
            token: "tok-engine",
          });
          expect(out.stdout).not.toContain("Engine:");
          const markdown = out.files[`${TODAY}-claude-code.md`] ?? "";
          expect(markdown).not.toContain("Engine:");
          expect(markdown).toContain("**Thresholds: PASS**");
          const report = JSON.parse(
            out.files[`${TODAY}-claude-code.json`] ?? "null",
          );
          expect(report).not.toHaveProperty("engineCheck");
          expect(report).toMatchObject({ engine: "claude-code" });
          expect(report.cases[0].transcript.engine).toBe("claude-code");
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a default run on a stack that lists two engines records unknown for each case, and says why",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({
          engines: [ready, { ...ready, id: "codex" }],
        });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, []),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).toBe(0);
          expect(out.stdout).toContain(
            "Engine: claude-code. claude-code is available on the eval stack (state ready). The stack lists 2 engines (claude-code, codex). A member's chain and pin decide which one runs a turn, and the list shows neither, so each case records its answering engine as unknown.",
          );
          const report = JSON.parse(
            out.files[`${TODAY}-claude-code.json`] ?? "null",
          );
          expect(report.cases[0].transcript.engine).toBe(UNKNOWN_ENGINE);
          expect(out.files[`${TODAY}-claude-code.md`]).toContain(
            "**Thresholds: PASS**",
          );
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a default run on a stack that does not answer about its engines goes on, and each case records unknown",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack("missing");
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, []),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).toBe(0);
          expect(out.stdout).toContain(
            "Engine: claude-code. claude-code was not checked against the eval stack: the agent answered HTTP 404. The stack's list of engines could not be read, so each case records its answering engine as unknown.",
          );
          const report = JSON.parse(
            out.files[`${TODAY}-claude-code.json`] ?? "null",
          );
          expect(report.cases[0].transcript.engine).toBe(UNKNOWN_ENGINE);
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "a default run is refused before anything is created when the stack does not list Claude Code",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({ engines: [{ ...ready, id: "codex" }] });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, []),
            agentEnv(stack.url, "tok-engine"),
          );
          expect(out.code).not.toBe(0);
          expect(out.stderr).toContain(
            'The eval stack has no engine "claude-code", which a run without --engine or FREEDUET_EVAL_ENGINE certifies: its engines are codex. Nothing was created.',
          );
          expect(stack.seen).toEqual([
            { method: "GET", path: "/engines", token: "tok-engine" },
          ]);
          expect(out.files).toEqual({});
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test(
    "FREEDUET_EVAL_ENGINE names the engine when no flag is given, and is checked as the flag is",
    () =>
      withCases(async (dir) => {
        const stack = scriptedStack({
          engines: [{ ...ready, id: "cli-test" }],
        });
        try {
          const out = await runIn(
            dir,
            liveArgs(dir, stack.url, []),
            {
              ...agentEnv(stack.url, "tok-engine"),
              FREEDUET_EVAL_ENGINE: "cli-test",
            },
          );
          expect(out.code).toBe(0);
          expect(stack.seen[0]).toEqual({
            method: "GET",
            path: "/engines",
            token: "tok-engine",
          });
          expect(out.stdout).toContain(
            "Engine: cli-test. cli-test is available on the eval stack (state ready). The stack lists cli-test alone, so it ran every turn",
          );
          expect(out.files[`${TODAY}-cli-test.md`]).toContain(
            "Engine: cli-test.",
          );
        } finally {
          stack.stop();
        }
      }),
    LIVE,
  );

  test("--engine is refused with --fake and with --public, in plain words, and nothing is read", () =>
    withCases(async (dir) => {
      const fake = await runIn(dir, ["--fake", "--engine", "claude-code"]);
      expect(fake.code).not.toBe(0);
      expect(fake.stderr).toContain(
        "--engine chooses the engine of a live run. --fake replays recorded transcripts",
      );
      const pub = await runIn(dir, [
        "--public",
        join(dir, "missing.json"),
        "--engine",
        "claude-code",
      ]);
      expect(pub.code).not.toBe(0);
      expect(pub.stderr).toContain("--engine does not apply to --public");
    }),
    { timeout: 60_000 },
  );
});
