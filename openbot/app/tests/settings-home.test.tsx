import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { SETTINGS_HOME_GROUPS, SettingsHome } from "@/freeduet/settings-home";
import { SETTINGS_PLACES } from "@/routes/_authed/settings/index";
import { settleReactWork } from "./settle-react-work";

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

function draw(isAdmin: boolean) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <SettingsHome isAdmin={isAdmin} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

const hrefs = (root: ParentNode) =>
  [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));

test("an administrator sees every group, Engines on top, every link a real route", async () => {
  const view = draw(true);
  await view.findByTestId("settings-engines");
  for (const group of SETTINGS_HOME_GROUPS) {
    expect(
      view.container.querySelector(`[data-group="${group.id}"]`),
    ).not.toBeNull();
  }
  const links = hrefs(view.container);
  expect(links).toContain("/admin/engines");
  const tree = readFileSync(
    join(import.meta.dir, "../src/routeTree.gen.ts"),
    "utf8",
  );
  for (const group of SETTINGS_HOME_GROUPS)
    for (const item of group.items)
      expect(tree).toContain(
        `'${item.to === "/bots" ? "/_authed/_app/bots/" : item.to === "/capabilities" ? "/_authed/_app/capabilities/" : item.to === "/connections" ? "/_authed/_app/connections/" : item.to === "/routines" ? "/_authed/_app/routines" : item.to === "/admin" ? "/_authed/admin/" : `/_authed${item.to}`}'`,
      );
});

test("a person who is not an administrator gets no Engines link and no Admin row", async () => {
  const view = draw(false);
  await view.findByRole("navigation");
  expect(
    view.container.querySelector("[data-testid='settings-engines']"),
  ).toBeNull();
  const links = hrefs(view.container);
  expect(links).not.toContain("/admin/engines");
  expect(links).not.toContain("/admin");
  expect(links).toContain("/settings/approvals");
});

test("every page the old Settings list reached is still reached from the home", () => {
  const reached = new Set<string>(
    SETTINGS_HOME_GROUPS.flatMap((g) => g.items.map((i) => String(i.to))),
  );
  reached.add("/admin/engines");
  for (const place of SETTINGS_PLACES)
    expect(reached.has(String(place.to))).toBe(true);
});
