import { describe, expect, test } from "bun:test";
import {
  CHANGE_SETTING_TOOL,
  readSettingChange,
  SETTING_CHANGES_PATH,
  type SettingChangeResult,
  settingChangeResult,
} from "./setting-change";

const CHANGE: SettingChangeResult = {
  changeId: "8f1c2e4a-0000-4000-8000-000000000001",
  agentId: "iris",
  setting: "notifications",
  previousValue: "all",
  newValue: "needs_input",
};

describe("the contract's names", () => {
  test("the tool and the routes are the names the server and the app both use", () => {
    expect(CHANGE_SETTING_TOOL).toBe("change_setting");
    expect(SETTING_CHANGES_PATH).toBe("/api/settings-changes");
  });
});

describe("the success result the card is drawn from", () => {
  test("reads back as the change it was written from, with the member's note left out", () => {
    const text = settingChangeResult(CHANGE, "Done: a note for the member.");
    expect(readSettingChange(text)).toEqual(CHANGE);
    expect(text).toContain("Done: a note for the member.");
  });

  test("a result the runtime encoded once more is read the same way", () => {
    const once = settingChangeResult(CHANGE, "note");
    expect(readSettingChange(JSON.stringify(once))).toEqual(CHANGE);
  });

  test("a refusal, or any sentence that is not the change, draws nothing", () => {
    expect(
      readSettingChange(
        "That setting cannot be changed from chat. Only you can change it, in the app's settings.",
      ),
    ).toBeNull();
    expect(readSettingChange("")).toBeNull();
    expect(readSettingChange(undefined)).toBeNull();
    expect(readSettingChange(42)).toBeNull();
    expect(readSettingChange("[1,2]")).toBeNull();
    expect(readSettingChange("null")).toBeNull();
  });

  test("a change to a setting other than notifications, or to a level chat never sets, draws nothing", () => {
    for (const bad of [
      { ...CHANGE, setting: "approvals" },
      { ...CHANGE, newValue: "none" },
      { ...CHANGE, previousValue: "none" },
      { ...CHANGE, newValue: "everything" },
    ])
      expect(readSettingChange(JSON.stringify(bad))).toBeNull();
  });

  test("a change without its id or its Bot draws nothing", () => {
    expect(
      readSettingChange(JSON.stringify({ ...CHANGE, changeId: "" })),
    ).toBeNull();
    expect(
      readSettingChange(JSON.stringify({ ...CHANGE, agentId: 7 })),
    ).toBeNull();
  });
});
