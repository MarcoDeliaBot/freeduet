/**
 * Settings in chat, slice 1 (docs/design/settings-in-chat.md): the server's own list of the settings a
 * member may change in chat, and nothing else. The list is code and it is matched exactly. It is never
 * a name pattern, and what the model says about a setting does not add to it.
 */
import { describe, expect, test } from "bun:test";
import { catalogueEntry, classifyTool } from "../src/plugins/catalogue";
import {
  CHAT_SETTING_NAMES,
  decideSettingRequest,
  NOT_ON_THE_LIST,
} from "../src/settings-in-chat/allow-list";

describe("the list holds only the settings that are harmless to change from chat", () => {
  test("slice 1 offers one setting: how much a member may interrupt the person", () => {
    expect([...CHAT_SETTING_NAMES]).toEqual(["notifications"]);
  });

  test("notifications takes all and needs_input", () => {
    expect(decideSettingRequest("notifications", "all")).toEqual({
      ok: true,
      setting: "notifications",
      value: "all",
    });
    expect(decideSettingRequest("notifications", "needs_input")).toEqual({
      ok: true,
      setting: "notifications",
      value: "needs_input",
    });
  });

  test("none is the person's own choice in the app, so a member cannot set it", () => {
    const decision = decideSettingRequest("notifications", "none");
    expect(decision.ok).toBeFalse();
    if (!decision.ok) expect(decision.message).toContain("in the app");
  });

  test("any other value is refused, and nothing is guessed from it", () => {
    for (const value of ["loud", "", "ALL", " all", "needs input", 3, null]) {
      const decision = decideSettingRequest("notifications", value);
      expect(decision.ok).toBeFalse();
    }
    expect(decideSettingRequest("notifications", undefined).ok).toBeFalse();
  });
});

describe("a setting that is not on the list is refused in plain words", () => {
  // Full access, approvals, the switches, connections, grants, routines, triggers, payments and
  // credentials, and the names of harmless settings that are not on the slice 1 list yet.
  const NOT_ON_LIST = [
    "fullAccess",
    "fullAccessWithoutPayments",
    "askBeforeChanges",
    "autoReview",
    "approvals",
    "approvalRules",
    "teamRules",
    "computer",
    "browser",
    "network",
    "cloudComputer",
    "cloudBrowser",
    "cloudNetwork",
    "connections",
    "grants",
    "routines",
    "triggers",
    "payments",
    "credentials",
    "apiKey",
    "password",
    "sharing",
    "permissions",
    "engines",
    "signIn",
    "tone",
    "language",
    "name",
    "routineTime",
  ];

  for (const setting of NOT_ON_LIST)
    test(`${setting} is refused and the person is told to change it in the app`, () => {
      const decision = decideSettingRequest(setting, "all");
      expect(decision.ok).toBeFalse();
      if (!decision.ok) {
        expect(decision.message).toBe(NOT_ON_THE_LIST);
        expect(decision.message).toContain("app's settings");
      }
    });

  test("the list is matched exactly: a name that only contains a listed one is refused", () => {
    for (const setting of [
      "notificationsFullAccess",
      "notifications ",
      "Notifications",
      "notifications.all",
      "notificationsAll",
    ]) {
      expect(decideSettingRequest(setting, "all").ok).toBeFalse();
    }
  });

  test("a missing or blank setting name is refused, and asks which one", () => {
    for (const setting of [undefined, null, 7, "", "   "]) {
      const decision = decideSettingRequest(setting, "all");
      expect(decision.ok).toBeFalse();
      if (!decision.ok) expect(decision.message).toContain("Say which setting");
    }
  });
});

describe("the Settings connector is one write and no read", () => {
  test("the catalogue holds a built-in settings entry, so a person can grant it", () => {
    const entry = catalogueEntry("settings");
    if (!entry) throw new Error("the catalogue has no settings entry");
    expect(entry.host).toBe("builtin://settings");
    expect(entry.auth.kind).toBe("builtin");
  });

  test("change_setting is a write, and the connector names no read", () => {
    const entry = catalogueEntry("settings");
    if (!entry) throw new Error("the catalogue has no settings entry");
    expect(classifyTool(entry, "change_setting", true)).toBe("write");
    expect(entry.writeTools).toEqual(["change_setting"]);
    expect(entry.readTools).toEqual([]);
  });
});
