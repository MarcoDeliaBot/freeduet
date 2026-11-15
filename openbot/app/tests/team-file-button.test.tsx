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
import { TeamFileButton } from "@/freeduet/team-file-button";
import { settleReactWork } from "./settle-react-work";

/**
 * The "Download team file" control on the Bots roster (slice S2): shown to administrators only, and
 * what each state of it says. The browser's side of a download is recorded, because a test cannot
 * save a file.
 */

const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let originalClick: typeof HTMLAnchorElement.prototype.click;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

const clicked: { download: string }[] = [];
const asked: { url: string; credentials: RequestCredentials | undefined }[] =
  [];

type Reply = (url: string) => Promise<Response> | Response;

/** Routes the two requests the button makes: the signed-in person, and the export. */
function serve(role: "admin" | "user", exportReply: Reply) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, credentials: init?.credentials });
    if (url === "/api/me") {
      return Response.json({
        user: {
          id: "person-1",
          email: "person@example.test",
          name: "Person",
          role,
        },
      });
    }
    return exportReply(url);
  }) as typeof fetch;
}

beforeEach(() => {
  clicked.length = 0;
  asked.length = 0;
  URL.createObjectURL = (blob: Blob) => {
    void blob;
    return "blob:team-file";
  };
  URL.revokeObjectURL = () => {};
  originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicked.push({ download: this.download });
  };
});

afterEach(async () => {
  cleanup();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  HTMLAnchorElement.prototype.click = originalClick;
});

afterAll(() => {
  GlobalRegistrator.unregister();
});

function renderButton() {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queries}>
      <TeamFileButton />
    </QueryClientProvider>,
  );
}

describe("who sees the control", () => {
  test("a person who is not an administrator sees nothing", async () => {
    serve("user", () => new Response("never"));
    const screen = renderButton();
    await waitFor(() =>
      expect(asked.some((request) => request.url === "/api/me")).toBe(true),
    );
    await settleReactWork();
    expect(
      screen.queryByRole("button", { name: "Download team file" }),
    ).toBeNull();
    expect(asked.some((request) => request.url.includes("team-file"))).toBe(
      false,
    );
  });

  test("an administrator sees the button, which asks for the file with the person's session", async () => {
    serve("admin", () => new Response("{}"));
    const screen = renderButton();
    const button = await screen.findByRole("button", {
      name: "Download team file",
    });
    expect(button).toBeTruthy();
    expect(
      asked.some(
        (request) =>
          request.url === "/api/me" && request.credentials === "include",
      ),
    ).toBe(true);
  });
});

describe("what the button does", () => {
  test("a finished download saves the file under its name and says so", async () => {
    serve(
      "admin",
      () =>
        new Response('{"format":"freeduet-team/1"}\n', {
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    const screen = renderButton();
    fireEvent.click(
      await screen.findByRole("button", { name: "Download team file" }),
    );
    await waitFor(() =>
      expect(clicked).toEqual([{ download: "freeduet-team.json" }]),
    );
    const request = asked.find(
      (entry) => entry.url === "/api/freeduet/team-file/export",
    );
    expect(request?.credentials).toBe("include");
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  test("while the file is prepared the button is busy and cannot be pressed again", async () => {
    let release: (() => void) | undefined;
    serve(
      "admin",
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response("{}"));
        }),
    );
    const screen = renderButton();
    fireEvent.click(
      await screen.findByRole("button", { name: "Download team file" }),
    );
    const busy = await screen.findByRole("button", {
      name: "Preparing the team file…",
    });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    release?.();
    await waitFor(() => expect(clicked.length).toBe(1));
  });

  test("a refusal shows the server's one sentence and saves nothing", async () => {
    serve("admin", () =>
      Response.json(
        { error: "You have no member of your own to export yet." },
        { status: 409 },
      ),
    );
    const screen = renderButton();
    fireEvent.click(
      await screen.findByRole("button", { name: "Download team file" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("You have no member of your own to export yet."),
    ).toBeTruthy();
    expect(clicked).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Download team file" }),
    ).toBeTruthy();
  });
});
