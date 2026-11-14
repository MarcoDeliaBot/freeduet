import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { Message } from "@ag-ui/core";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  type OfferedFile,
  offeredFileResult,
} from "@openbot/shared/member-file";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { ConversationView } from "@/components/channels/conversation-view";
import {
  fileSizeText,
  MemberFileCard,
  MemberFileTool,
} from "@/freeduet/member-file-card";
import { CARD_TABLES } from "@/freeduet/person-language/cards";
import { CardLanguageProvider } from "@/freeduet/person-language/use-card-text";
import { settleReactWork } from "./settle-react-work";

/**
 * D38: a file a member made, as the card the person meets in the conversation, and what its Download
 * button does. Drawn by the real renderer in the real transcript; the browser's side of a download
 * (a blob URL and a click on an anchor) is recorded, because a test cannot save a file.
 */

const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let originalClick: typeof HTMLAnchorElement.prototype.click;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));

/** What the browser was asked to do: the blobs it made URLs for, the anchors it clicked, the URLs it let go. */
const made: Blob[] = [];
const clicked: { href: string; download: string; connected: boolean }[] = [];
const revoked: string[] = [];
const asked: { url: string; credentials: RequestCredentials | undefined }[] =
  [];

beforeEach(() => {
  made.length = 0;
  clicked.length = 0;
  revoked.length = 0;
  asked.length = 0;
  URL.createObjectURL = (blob: Blob) => {
    made.push(blob);
    return `blob:http://localhost/${made.length}`;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicked.push({
      href: this.href,
      download: this.download,
      connected: this.isConnected,
    });
  };
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  HTMLAnchorElement.prototype.click = originalClick;
});

afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

const FILE: OfferedFile = {
  botId: "video",
  path: "out/final.mp4",
  name: "final.mp4",
  bytes: 1_234_567,
};
const BYTES = Uint8Array.from({ length: 300 }, (_, index) => index % 256);

/**
 * The server answering the download route with `answer`, and recording what it was asked. The rest
 * of the app asks for other things (the open approvals, for one) and is told there is nothing.
 */
function serve(answer: () => Response | Promise<Response>) {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("/api/computers/"))
        return Response.json({ error: "Not found" }, { status: 404 });
      asked.push({ url, credentials: init?.credentials });
      return answer();
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
}

const served = () =>
  new Response(BYTES, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="final.mp4"',
    },
  });

function card(file: OfferedFile = FILE, language: "it" | null = null) {
  return render(
    <CardLanguageProvider language={language}>
      <MemberFileCard file={file} />
    </CardLanguageProvider>,
  );
}

describe("the size of a file", () => {
  test.each([
    [0, "0 B"],
    [5, "5 B"],
    [1023, "1,023 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [340 * 1024, "340 KB"],
    [1_234_567, "1.2 MB"],
    [12_345_678, "12 MB"],
    [1_048_166, "1 MB"],
    [100 * 1024 * 1024, "100 MB"],
    [5 * 1024 ** 3, "5 GB"],
  ])("%d bytes is %s", (bytes, text) => {
    expect(fileSizeText(bytes, null)).toBe(text);
  });

  test("in Italian the decimal is a comma", () => {
    expect(fileSizeText(1_234_567, "it")).toBe("1,2 MB");
    expect(fileSizeText(1536, "it")).toBe("1,5 KB");
  });
});

describe("the card", () => {
  test("names the file, says how big it is, and offers a Download button", () => {
    const view = card();

    const region = view.getByRole("region", { name: "final.mp4" });
    expect(within(region).getByText("final.mp4")).toBeTruthy();
    expect(within(region).getByText("1.2 MB")).toBeTruthy();
    expect(
      within(region).getByRole("button", { name: "Download" }),
    ).toBeTruthy();
    // Nothing is fetched until the person presses it.
    expect(asked).toEqual([]);
  });

  test("is only a button: no link to follow, no frame, no object to open the file in", () => {
    const view = card();
    expect(
      view.container.querySelector("a, iframe, object, embed, img, video"),
    ).toBeNull();
  });

  test("a name that is unsafe to save is cleaned before it is drawn", () => {
    const view = card({ ...FILE, name: "../evil‮fdp.exe\n" });
    expect(view.getByRole("region", { name: ".._evilfdp.exe" })).toBeTruthy();
  });

  test("in Italian every word the app wrote is Italian", () => {
    const view = card(FILE, "it");

    expect(view.getByText("1,2 MB")).toBeTruthy();
    expect(
      view.getByRole("button", {
        name: CARD_TABLES.it["file.download"] as string,
      }),
    ).toBeTruthy();
    expect(
      view.queryByRole("button", {
        name: CARD_TABLES.en["file.download"] as string,
      }),
    ).toBeNull();
  });
});

describe("pressing Download", () => {
  test("fetches the file as the person and saves it under its own name, as bytes and nothing else", async () => {
    serve(served);
    const view = card();

    fireEvent.click(view.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(clicked.length).toBe(1));

    // The card's own URL, on this origin, with the person's session.
    expect(asked).toEqual([
      {
        url: "/api/computers/video/files/download?path=out%2Ffinal.mp4",
        credentials: "include",
      },
    ]);
    // Saved: an anchor with a download name, clicked while it was in the page, and let go afterwards.
    expect(clicked[0]).toEqual({
      href: "blob:http://localhost/1",
      download: "final.mp4",
      connected: true,
    });
    expect(revoked).toEqual(["blob:http://localhost/1"]);
    expect(made.length).toBe(1);
    expect(new Uint8Array(await made[0]?.arrayBuffer())).toEqual(BYTES);
    expect(view.container.querySelector("a")).toBeNull();
    expect(view.getByRole("status").textContent).toBe("Download started");
  });

  test("the saved file is opaque bytes whatever the server called it", async () => {
    serve(
      () =>
        new Response("<script>alert(1)</script>", {
          headers: { "content-type": "text/html" },
        }),
    );
    const view = card({ ...FILE, name: "page.html", path: "out/page.html" });

    fireEvent.click(view.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(made.length).toBe(1));

    expect(made[0]?.type).toBe("application/octet-stream");
    expect(clicked[0]?.download).toBe("page.html");
  });

  test("a name that is unsafe to save is saved under a safe one", async () => {
    serve(served);
    const view = card({ ...FILE, name: "../../evil‮fdp.exe" });

    fireEvent.click(view.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(clicked.length).toBe(1));

    expect(clicked[0]?.download).toBe(".._.._evilfdp.exe");
  });

  test("a path with characters a URL treats as its own travels as one value", async () => {
    serve(served);
    const view = card({ ...FILE, path: "a b/c&d=1#e.mp4" });

    fireEvent.click(view.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(asked.length).toBe(1));

    expect(asked[0]?.url).toBe(
      "/api/computers/video/files/download?path=a%20b%2Fc%26d%3D1%23e.mp4",
    );
  });

  test("while the file is on its way the button waits, and a second press asks for nothing", async () => {
    let release: (response: Response) => void = () => {};
    serve(() => new Promise<Response>((resolve) => (release = resolve)));
    const view = card();

    fireEvent.click(view.getByRole("button", { name: "Download" }));
    const waiting = await view.findByRole("button", { name: "Downloading…" });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(waiting);
    expect(asked.length).toBe(1);

    release(served());
    await waitFor(() => expect(clicked.length).toBe(1));
    expect(
      (await view.findByRole("button", {
        name: "Download",
      })) as HTMLButtonElement,
    ).toBeTruthy();
    expect(made.length).toBe(1);
  });

  test("a route that says no is shown as it says it, nothing is saved, and the button tries again", async () => {
    serve(() =>
      Response.json(
        { error: "There is no file at out/final.mp4." },
        { status: 404 },
      ),
    );
    const view = card();

    fireEvent.click(view.getByRole("button", { name: "Download" }));

    const alert = await view.findByRole("alert");
    expect(alert.textContent).toBe("There is no file at out/final.mp4.");
    expect(made).toEqual([]);
    expect(clicked).toEqual([]);
    expect(view.queryByRole("status")).toBeNull();

    // Pressed again, and answered, the message goes and the file is saved.
    serve(served);
    fireEvent.click(view.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(clicked.length).toBe(1));
    expect(view.queryByRole("alert")).toBeNull();
  });

  test("an answer with no message says that it could not be downloaded", async () => {
    serve(() => new Response("", { status: 500 }));
    const view = card();

    fireEvent.click(view.getByRole("button", { name: "Download" }));

    expect((await view.findByRole("alert")).textContent).toBe(
      "Couldn't download the file. Try again.",
    );
  });

  test("a network failure says so in the card's words, not the browser's", async () => {
    globalThis.fetch = Object.assign(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    const view = card();

    fireEvent.click(view.getByRole("button", { name: "Download" }));

    expect((await view.findByRole("alert")).textContent).toBe(
      "Couldn't download the file. Try again.",
    );
    expect(made).toEqual([]);
  });

  test("in Italian the button, the progress and the failure are Italian", async () => {
    serve(() => new Response("", { status: 500 }));
    const view = card(FILE, "it");

    fireEvent.click(view.getByRole("button", { name: "Scarica" }));

    expect((await view.findByRole("alert")).textContent).toBe(
      "Non ho potuto scaricare il file. Riprova.",
    );
  });
});

const CALL = {
  id: "call-1",
  type: "function" as const,
  function: {
    name: "offer_file",
    arguments: JSON.stringify({ path: FILE.path }),
  },
};

function transcript(result: string | null): Message[] {
  return [
    { id: "u1", role: "user", content: "Make me a video." },
    { id: "a1", role: "assistant", content: "", toolCalls: [CALL] },
    ...(result === null
      ? []
      : [
          {
            id: "t1",
            role: "tool" as const,
            toolCallId: CALL.id,
            content: result,
          },
        ]),
    ...(result === null
      ? []
      : [
          {
            id: "a2",
            role: "assistant" as const,
            content: "Your video is ready.",
          },
        ]),
  ];
}

function Chat({ messages }: { messages: Message[] }) {
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queries}>
      <CopilotKitProvider>
        <MemberFileTool />
        <ConversationView messages={messages} onSubmit={() => {}} />
      </CopilotKitProvider>
    </QueryClientProvider>
  );
}

describe("the offer_file tool in the conversation", () => {
  test("a finished offer is the card, with the member's words after it", async () => {
    const view = render(
      <Chat
        messages={transcript(offeredFileResult(FILE, "A note for the member."))}
      />,
    );

    const region = await view.findByRole("region", { name: "final.mp4" });
    expect(
      within(region).getByRole("button", { name: "Download" }),
    ).toBeTruthy();
    expect(view.getByText("Your video is ready.")).toBeTruthy();
    // The note is for the member, not for the person.
    expect(view.queryByText("A note for the member.")).toBeNull();
  });

  test("a result the runtime encoded once more is the card too", async () => {
    const view = render(
      <Chat
        messages={transcript(
          JSON.stringify(offeredFileResult(FILE, "A note.")),
        )}
      />,
    );
    expect(await view.findByRole("region", { name: "final.mp4" })).toBeTruthy();
  });

  test("a refusal draws no card", async () => {
    const view = render(
      <Chat
        messages={transcript(
          "Refused. That file is 200 bytes and the download limit is 100.",
        )}
      />,
    );

    expect(await view.findByText("Your video is ready.")).toBeTruthy();
    expect(view.queryByRole("region", { name: "final.mp4" })).toBeNull();
    expect(view.queryByText("final.mp4")).toBeNull();
    expect(view.queryByRole("button", { name: "Download" })).toBeNull();
  });

  test("while the tool is looking at the file the line says so", async () => {
    const view = render(<Chat messages={transcript(null)} />);
    expect(await view.findByText("Getting the file ready")).toBeTruthy();
    expect(view.queryByRole("region", { name: "final.mp4" })).toBeNull();
    expect(view.queryByRole("button", { name: "Download" })).toBeNull();
  });

  test("the card in the conversation downloads like the card on its own", async () => {
    serve(served);
    const view = render(
      <Chat messages={transcript(offeredFileResult(FILE, "A note."))} />,
    );

    fireEvent.click(await view.findByRole("button", { name: "Download" }));

    await waitFor(() => expect(clicked.length).toBe(1));
    expect(asked[0]?.url).toBe(
      "/api/computers/video/files/download?path=out%2Ffinal.mp4",
    );
    expect(clicked[0]?.download).toBe("final.mp4");
  });
});
