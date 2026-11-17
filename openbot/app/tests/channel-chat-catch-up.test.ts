import type { Message } from "@copilotkit/react-core/v2";
import { describe, expect, test } from "bun:test";
import { mergeStoredMessages } from "@/components/channels/channel-chat";

/**
 * D69 (docs/M1_PLAN.md section 48). The relay of a hand-off's answer is stored in the person's own
 * conversation by the server while nobody here streams it. A send now reads the store first and
 * merges it with `mergeStoredMessages`, before the typed message is added. These pin what that
 * merge must do for the relay's case; the send itself needs the whole runtime and is not rendered.
 */

const say = (id: string, role: "user" | "assistant", content: string) =>
  ({ id, role, content }) as Message;

const ASKED = say("u1", "user", "clean my mail of spam");
const PASSED_ON = say("a1", "assistant", "I passed it on to Otto. He has not answered yet.");
const RELAY = say("a2", "assistant", "Otto moved 5 messages to Spam.");

describe("the stored relay reaches the list a send goes out with", () => {
  test("a stored reply the screen never saw is added after the turn it follows", () => {
    const merged = mergeStoredMessages([ASKED, PASSED_ON], [ASKED, PASSED_ON, RELAY], new Set());
    expect(merged.map((message) => message.id)).toEqual(["u1", "a1", "a2"]);
  });

  test("the typed message added afterwards is last, so it is the one read as typed", () => {
    const typed = say("u2", "user", "and the other mail?");
    const merged = [...mergeStoredMessages([ASKED, PASSED_ON], [ASKED, PASSED_ON, RELAY], new Set()), typed];
    expect(merged.at(-1)).toBe(typed);
    expect(merged.filter((message) => message.role === "user").at(-1)?.id).toBe("u2");
  });

  test("nothing the screen holds is dropped, also what the store does not have yet", () => {
    const localOnly = say("a9", "assistant", "streamed here, not stored yet");
    const merged = mergeStoredMessages([ASKED, PASSED_ON, localOnly], [ASKED, PASSED_ON, RELAY], new Set());
    expect(merged.map((message) => message.id).sort()).toEqual(["a1", "a2", "a9", "u1"]);
  });

  test("a store that is behind changes nothing and returns the same list", () => {
    const local = [ASKED, PASSED_ON, RELAY];
    expect(mergeStoredMessages(local, [ASKED], new Set())).toBe(local);
  });
});
