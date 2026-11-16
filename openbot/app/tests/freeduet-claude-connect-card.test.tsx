import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { ConversationView } from "@/components/channels/conversation-view";
import { ClaudeConnectCard } from "@/freeduet/claude-connect-card";
import { settleReactWork } from "./settle-react-work";
import {
  CARD_WORDS,
  checkOutcome,
  claudeProblemOf,
  OUTCOME_WORDS,
  REBUILD_COMMAND,
  SIGN_IN_COMMAND,
} from "@/freeduet/claude-connect";

/**
 * First start (docs/design/first-start.md, S5 option b): the card under a turn that failed because Claude is not
 * connected or not installed. The server is faked: `/api/capabilities` and the check route.
 */

const originalFetch = globalThis.fetch;
const asked: { url: string; method: string; body: unknown }[] = [];
let capabilities: Record<string, unknown> = {};
let check: { status: number; body: unknown }[] = [];

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

beforeEach(() => {
  asked.length = 0;
  capabilities = {};
  check = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (url.endsWith("/api/capabilities")) return Response.json(capabilities);
    if (url.endsWith("/api/freeduet/engines/claude/check")) {
      const next = check.shift() ?? { status: 200, body: {} };
      return Response.json(next.body, { status: next.status });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function card(problem: "not_connected" | "not_installed" = "not_connected") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClaudeConnectCard problem={problem} reason="The sentence of the run." />
    </QueryClientProvider>,
  );
}

describe("claudeProblemOf: the card shows only when Claude is missing", () => {
  test("the two sentences the service gives are known, nothing else is", () => {
    expect(
      claudeProblemOf(
        "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password.",
      ),
    ).toBe("not_connected");
    expect(
      claudeProblemOf("Claude is not installed on this computer yet. Rebuild."),
    ).toBe("not_installed");
    for (const other of [
      "",
      "The stall watchdog stopped this turn.",
      "You have reached your Claude limit until 5 pm.",
      "Claude answered.",
    ])
      expect(claudeProblemOf(other)).toBeNull();
  });
});

describe("the card", () => {
  test("says in plain words that Claude is not connected and shows the exact command", async () => {
    const view = card();
    await waitFor(() => view.getByTestId("claude-connect-card"));
    expect(view.getByText(CARD_WORDS.not_connected.title)).toBeTruthy();
    expect(view.getByTestId("claude-connect-command").textContent).toBe(
      SIGN_IN_COMMAND,
    );
    expect(SIGN_IN_COMMAND).toBe(
      "cd openbot && docker compose exec -it agent-freeduet claude",
    );
  });

  test("a missing program shows the rebuild command", async () => {
    const view = card("not_installed");
    await waitFor(() => view.getByTestId("claude-connect-card"));
    expect(view.getByTestId("claude-connect-command").textContent).toBe(
      REBUILD_COMMAND,
    );
  });

  test("never has a field for a code: no input, no textarea, no password box", async () => {
    const view = card();
    await waitFor(() => view.getByTestId("claude-connect-card"));
    expect(view.container.querySelectorAll("input, textarea, select").length).toBe(0);
    expect(view.queryByRole("textbox")).toBeNull();
    expect(view.container.textContent?.toLowerCase()).not.toContain("paste the code");
  });

  test("Check again asks the server once, with no body, and says the sign-in is not seen yet", async () => {
    check = [{ status: 200, body: { reason: null, installed: true, signedIn: false } }];
    const view = card();
    await waitFor(() => view.getByTestId("claude-connect-card"));
    fireEvent.click(view.getByText("Check again"));
    await waitFor(() => view.getByText(OUTCOME_WORDS.not_connected));
    const checks = asked.filter((r) => r.url.endsWith("/claude/check"));
    expect(checks.length).toBe(1);
    expect(checks[0]?.method).toBe("POST");
    expect(checks[0]?.body).toBeUndefined();
  });

  test("pressed again after a sign-in, it says Claude is connected, with nothing reloaded", async () => {
    check = [
      { status: 200, body: { reason: null, installed: true, signedIn: false } },
      { status: 200, body: { reason: null, installed: true, signedIn: true } },
    ];
    const view = card();
    await waitFor(() => view.getByTestId("claude-connect-card"));
    fireEvent.click(view.getByText("Check again"));
    await waitFor(() => view.getByText(OUTCOME_WORDS.not_connected));
    fireEvent.click(view.getByText("Check again"));
    await waitFor(() => view.getByText(OUTCOME_WORDS.connected));
  });

  test("a hosted deployment gets the sentence and no card", async () => {
    capabilities = { deployment: "hosted" };
    const view = card();
    await waitFor(() => view.getByTestId("transcript-stopped"));
    expect(view.queryByTestId("claude-connect-card")).toBeNull();
    expect(view.container.textContent).not.toContain("docker compose");
  });

  test("until the deployment is known the sentence stands alone", () => {
    const view = card();
    expect(view.queryByTestId("claude-connect-card")).toBeNull();
    expect(view.getByTestId("transcript-stopped")).toBeTruthy();
  });
});

describe("under a failed turn in the real transcript", () => {
  function transcript(stopped: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <CopilotKitProvider>
          <ConversationView
            messages={[{ id: "u1", role: "user", content: "Hello Iris" }]}
            onSubmit={() => {}}
            stopped={stopped}
          />
        </CopilotKitProvider>
      </QueryClientProvider>,
    );
  }

  test("the not-connected sentence is drawn as the card", async () => {
    const view = transcript(
      "Claude is not connected yet. You sign in on Claude's own page; FreeDuet never sees your password.",
    );
    await view.findByTestId("claude-connect-card");
  });

  test("any other stop reason stays the red sentence, with no card and no request", async () => {
    const view = transcript("The stall watchdog stopped this turn.");
    expect(await view.findByTestId("transcript-stopped")).toBeTruthy();
    expect(view.queryByTestId("claude-connect-card")).toBeNull();
    expect(asked.filter((r) => r.url.includes("claude"))).toEqual([]);
  });
});

describe("checkOutcome", () => {
  test("each answer and each refusal is one outcome", () => {
    const ok = { reason: null } as const;
    expect(checkOutcome(200, { ...ok, installed: true, signedIn: true })).toBe("connected");
    expect(checkOutcome(200, { ...ok, installed: true, signedIn: false })).toBe("not_connected");
    expect(checkOutcome(200, { ...ok, installed: false, signedIn: null })).toBe("not_installed");
    expect(checkOutcome(200, { ...ok, installed: true, signedIn: null })).toBe("waiting");
    expect(checkOutcome(200, { reason: "unreachable", installed: null, signedIn: null })).toBe("no_engine");
    expect(checkOutcome(403, null)).toBe("elsewhere");
    expect(checkOutcome(404, null)).toBe("hosted");
    expect(checkOutcome(500, null)).toBe("no_engine");
  });
});
