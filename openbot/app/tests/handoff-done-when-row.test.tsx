import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { ConversationView } from "@/components/channels/conversation-view";
import { HandoffTool } from "@/lib/copilot/handoff-tool";
import { HANDED_OVER } from "@/lib/copilot/markers";
import { settleReactWork } from "./settle-react-work";

/**
 * The "done when" line of a hand-off as a person meets it in Chat (docs/design/handoff-done-when.md):
 * under the row for the hand-off, in small text, as the characters it is, and nothing at all when the
 * Bot wrote none or the hand-off was turned away. Drawn by the real renderer in the real transcript.
 */

const originalFetch = globalThis.fetch;
beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  globalThis.fetch = Object.assign(
    async () => Response.json({ error: "Not found" }, { status: 404 }),
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

const WENT = `${HANDED_OVER}Portia. It has not replied yet: its answer arrives later as a separate message in this conversation.`;
const TURNED_AWAY =
  "That handoff was not sent: You have not been given Portia to hand work to. An administrator grants that.";

/** The person asks, the Bot hands the job on and says so; `result` is what the tool answered. */
function handedOn(
  args: Record<string, unknown>,
  result: string | null,
): Message[] {
  const call: Message = {
    id: "a1",
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "call-1",
        type: "function",
        function: { name: "message_bot", arguments: JSON.stringify(args) },
      },
    ],
  };
  return [
    { id: "u1", role: "user", content: "Find me five venues for the launch." },
    call,
    ...(result === null
      ? []
      : ([
          { id: "t1", role: "tool", toolCallId: "call-1", content: result },
        ] as Message[])),
    { id: "a2", role: "assistant", content: "I asked Portia for the venues." },
  ];
}

const queries = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Chat({ messages }: { messages: Message[] }) {
  return (
    <QueryClientProvider client={queries}>
      <CopilotKitProvider>
        <HandoffTool />
        <ConversationView
          busy={false}
          messages={messages}
          onSubmit={() => {}}
        />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}

const ASK = { bot: "Portia", task: "List five venues for the launch" };

/** The row has been drawn: the Bot's own line about it comes after the row, so it is there too. */
async function drawn(messages: Message[]) {
  const view = render(<Chat messages={messages} />);
  await view.findByText(/I asked Portia for the venues/);
  await view.findByText(/Asked Portia/);
  return view;
}
const lineOf = (container: HTMLElement) =>
  container.querySelector("[data-done-when]");

test("the line is drawn under the hand-off, where it reads without opening anything", async () => {
  const view = await drawn(
    handedOn(
      {
        ...ASK,
        done_when: "the list has exactly five venues, each with a price",
      },
      WENT,
    ),
  );
  const line = lineOf(view.container);
  expect(line?.textContent).toBe(
    "Done when: the list has exactly five venues, each with a price",
  );
  // It is not part of what opens: it stands outside the row's disclosure.
  expect(line?.closest("details")).toBeNull();
});

test("the line is drawn while the hand-off is still going out", async () => {
  const view = await drawn(
    handedOn({ ...ASK, done_when: "the list has exactly five venues" }, null),
  );
  expect(lineOf(view.container)?.textContent).toBe(
    "Done when: the list has exactly five venues",
  );
});

test("guard: a hand-off with no line draws none, and says nothing about one", async () => {
  const view = await drawn(handedOn(ASK, WENT));
  expect(lineOf(view.container)).toBeNull();
  expect(view.container.textContent).not.toContain("Done when");
});

test("guard: a line that is only spaces or breaks draws none", async () => {
  const view = await drawn(handedOn({ ...ASK, done_when: " \n\t " }, WENT));
  expect(lineOf(view.container)).toBeNull();
  expect(view.container.textContent).not.toContain("Done when");
});

test("guard: a hand-off that was turned away draws no line: nothing was asked", async () => {
  const view = await drawn(
    handedOn(
      { ...ASK, done_when: "the list has exactly five venues" },
      TURNED_AWAY,
    ),
  );
  expect(lineOf(view.container)).toBeNull();
  expect(view.container.textContent).not.toContain("Done when");
});

test("markup and links are shown as the characters they are, never drawn", async () => {
  const written =
    'the list is <b>ready</b>, see <a href="https://evil.example/x">this</a> or [here](https://evil.example/y) <img src="https://evil.example/z.png"> <script>alert(1)</script>';
  const view = await drawn(handedOn({ ...ASK, done_when: written }, WENT));
  const line = lineOf(view.container);
  expect(line?.textContent).toBe(`Done when: ${written}`);
  // Text and nothing else inside it: no element, so no link to follow and nothing that loads.
  expect(line?.childElementCount).toBe(0);
  expect(view.container.querySelector("a[href*='evil.example']")).toBeNull();
  expect(view.container.querySelector("img[src*='evil.example']")).toBeNull();
  expect(view.container.querySelector("script")).toBeNull();
});

test("a line is one line: breaks of every kind show as a single space, and direction controls are dropped", async () => {
  const view = await drawn(
    handedOn(
      {
        ...ASK,
        done_when: "the list\nhas five\r\n\r\npoints\u2028and\u202e a price",
      },
      WENT,
    ),
  );
  expect(lineOf(view.container)?.textContent).toBe(
    "Done when: the list has five points and a price",
  );
});

test("200 characters are drawn whole; 201 are not drawn at all, as the server would refuse them", async () => {
  const exact = "y".repeat(200);
  const whole = await drawn(handedOn({ ...ASK, done_when: exact }, WENT));
  expect(lineOf(whole.container)?.textContent).toBe(`Done when: ${exact}`);
  cleanup();

  const over = await drawn(
    handedOn({ ...ASK, done_when: "y".repeat(201) }, WENT),
  );
  expect(lineOf(over.container)).toBeNull();
  expect(over.container.textContent).not.toContain("yyyy");
});

test("guard: the row itself is unchanged by a line: the same label, the same parts", async () => {
  const view = await drawn(
    handedOn(
      {
        ...ASK,
        constraints: "Only places in Lisbon",
        expecting: "A short list",
        done_when: "the list has exactly five venues",
      },
      WENT,
    ),
  );
  expect(view.container.textContent).toContain("Asked Portia");
  expect(view.container.textContent).toContain("Only places in Lisbon");
  expect(view.container.textContent).toContain("Wanted back: A short list");
});
