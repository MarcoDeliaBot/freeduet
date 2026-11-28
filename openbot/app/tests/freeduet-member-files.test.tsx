import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import {
  isFinishedPath,
  MemberFilesPanel,
} from "@/freeduet/member-files-panel";
import { settleReactWork } from "./settle-react-work";

/** The Files panel (D194): lists the finished work, says plainly when there is none, in Italian and English. */

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const originalFetch = global.fetch;
let answer: { status: number; body: unknown };
let asked: string[];

beforeEach(() => {
  asked = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return Response.json(answer.body, { status: answer.status });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function draw(language: "en" | "it") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AppLanguageValue language={language}>
        <MemberFilesPanel botId="ada" name="Ada" />
      </AppLanguageValue>
    </QueryClientProvider>,
  );
}

const listing = {
  files: [
    {
      path: "out/site/index.html",
      name: "index.html",
      bytes: 2048,
      modifiedMs: Date.UTC(2026, 10, 28, 9, 30),
    },
    {
      path: "out/report.pdf",
      name: "report.pdf",
      bytes: 10,
      modifiedMs: Date.UTC(2026, 10, 27, 9, 30),
    },
  ],
  truncated: false,
};

test("lists each finished file with its size and a Download, in English", async () => {
  answer = { status: 200, body: listing };
  const page = draw("en");
  await waitFor(() => expect(page.getByText("index.html")).toBeTruthy());
  expect(asked[0]).toBe("/api/computers/ada/files/finished");
  expect(page.getByText("report.pdf")).toBeTruthy();
  expect(page.getAllByRole("button", { name: "Download" }).length).toBe(2);
  expect(page.getByTestId("member-files").textContent).toContain("2 KB");
  expect(page.getByRole("button", { name: "Refresh" })).toBeTruthy();
});

test("lists the same files in Italian", async () => {
  answer = { status: 200, body: listing };
  const page = draw("it");
  await waitFor(() => expect(page.getByText("index.html")).toBeTruthy());
  expect(page.getAllByRole("button", { name: "Scarica" }).length).toBe(2);
  expect(page.getByRole("button", { name: "Aggiorna" })).toBeTruthy();
});

test("the empty state says finished work appears when the member saves it to out, in both languages", async () => {
  answer = { status: 200, body: { files: [], truncated: false } };
  const english = draw("en");
  await waitFor(() =>
    expect(english.getByRole("status").textContent).toBe(
      "Nothing here yet. Finished work appears here when Ada saves it to its out folder.",
    ),
  );
  cleanup();
  const italian = draw("it");
  await waitFor(() =>
    expect(italian.getByRole("status").textContent).toContain(
      "Il lavoro finito compare qui quando Ada lo salva nella sua cartella out.",
    ),
  );
});

test("says more files are not shown when the listing was capped", async () => {
  answer = { status: 200, body: { ...listing, truncated: true } };
  const page = draw("en");
  await waitFor(() =>
    expect(page.getByText(/More files are not shown/)).toBeTruthy(),
  );
});

test("a path outside out/ gets no Download", async () => {
  answer = {
    status: 200,
    body: {
      files: [
        { path: "secret.txt", name: "secret.txt", bytes: 1, modifiedMs: 1 },
        { path: "out/../x", name: "x", bytes: 1, modifiedMs: 1 },
        { path: "out/ok.txt", name: "ok.txt", bytes: 1, modifiedMs: 1 },
      ],
      truncated: false,
    },
  };
  const page = draw("en");
  await waitFor(() => expect(page.getByText("ok.txt")).toBeTruthy());
  expect(page.getAllByRole("button", { name: "Download" }).length).toBe(1);
  expect(isFinishedPath("out/a/b.txt")).toBe(true);
  expect(isFinishedPath("/out/a")).toBe(false);
  expect(isFinishedPath("out/")).toBe(false);
});

test("shows the server's sentence when the list cannot be read", async () => {
  answer = { status: 404, body: { error: "There is no such Bot." } };
  const page = draw("en");
  await waitFor(() =>
    expect(page.getByRole("alert").textContent).toContain("no such Bot"),
  );
});
