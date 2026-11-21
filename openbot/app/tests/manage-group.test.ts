import { expect, test } from "bun:test";
import { showsManageGroup } from "@/freeduet/manage-group";
import { MANAGE_PAGES } from "@/components/shell/menu-sheet";
import { appConfig } from "@/lib/generated/application-config";
import { SETTINGS_PLACES } from "@/routes/_authed/settings/index";

/*
 * D-less UI rule: FreeDuet's own package hides the sidebar's Manage group, because every page in it
 * is one place in Settings. Any other package keeps Manage. Settings must still link every page
 * Manage listed, and the Bots unread badge that Manage carried.
 */

test("Manage is hidden for FreeDuet's package and shown for any other package", () => {
  expect(showsManageGroup("freeduet")).toBe(false);
  expect(showsManageGroup("openduet")).toBe(true);
  expect(showsManageGroup("fintech")).toBe(true);
});

test("the loaded package decides Manage: hidden only when it is FreeDuet's", () => {
  expect(showsManageGroup(appConfig.brand.tenantId)).toBe(
    appConfig.brand.tenantId !== "freeduet",
  );
});

test("Settings links every page that Manage listed, and Admin", () => {
  const targets = [...MANAGE_PAGES.map((page) => page.to), "/admin"];
  for (const to of targets) {
    expect(SETTINGS_PLACES.some((place) => place.to === to)).toBe(true);
  }
});

test("Settings carries the Bots badge that Manage showed", () => {
  const bots = SETTINGS_PLACES.find((place) => place.to === "/bots");
  expect(bots?.badge).toBeDefined();
});
