import { describe, expect, test } from "bun:test";
import {
  isVoiceMessageId,
  keepVoiceMark,
  latestUserMessageIsVoice,
  markVoiceMessageId,
  VOICE_MESSAGE_ID_PREFIX,
} from "./voice-message";

/**
 * The mark of words that came from the microphone (docs/design/voice.md, D7 and D8). The prefix is the
 * contract between the app, which puts it on the id, and the server, which reads it; both import it
 * from here, and the server's tests write it out as a literal so that a change is seen on both sides.
 */

describe("the mark", () => {
  test("is the prefix `voice-`, which the server's tests also write out", () => {
    expect(VOICE_MESSAGE_ID_PREFIX).toBe("voice-");
  });

  test("markVoiceMessageId puts it in front of a fresh id and keeps the id whole", () => {
    expect(markVoiceMessageId("9f1c2d4e")).toBe("voice-9f1c2d4e");
    expect(isVoiceMessageId(markVoiceMessageId("9f1c2d4e"))).toBe(true);
  });

  test("isVoiceMessageId is a prefix test on a string and nothing else", () => {
    for (const id of ["voice-1", "voice-9f1c2d4e-0b7a-4c55-8a39-2e6d1f3b7a10"])
      expect(isVoiceMessageId(id)).toBe(true);
    for (const id of [
      "msg-1",
      "9f1c2d4e-0b7a-4c55-8a39-2e6d1f3b7a10",
      "handoff-1",
      "Voice-1",
      "voice",
      "a-voice-1",
      "invoice-1",
      "",
    ])
      expect(isVoiceMessageId(id)).toBe(false);
    for (const id of [undefined, null, 7, ["voice-1"], {}])
      expect(isVoiceMessageId(id)).toBe(false);
  });
});

describe("latestUserMessageIsVoice", () => {
  const user = (id: string) => ({ role: "user", id });

  test("reads the person's latest message and no other", () => {
    expect(latestUserMessageIsVoice([user("voice-1")])).toBe(true);
    expect(latestUserMessageIsVoice([user("voice-1"), user("msg-2")])).toBe(
      false,
    );
    expect(latestUserMessageIsVoice([user("msg-1"), user("voice-2")])).toBe(
      true,
    );
  });

  test("looks past a Bot's message and a tool's, and is not moved by their ids", () => {
    expect(
      latestUserMessageIsVoice([
        user("voice-1"),
        { role: "assistant", id: "msg-2" },
        { role: "tool", id: "msg-3" },
      ]),
    ).toBe(true);
    expect(
      latestUserMessageIsVoice([
        user("msg-1"),
        { role: "assistant", id: "voice-2" },
        { role: "tool", id: "voice-3" },
        { role: "system", id: "voice-4" },
      ]),
    ).toBe(false);
  });

  test("is false when there is nothing to read", () => {
    expect(latestUserMessageIsVoice(undefined)).toBe(false);
    expect(latestUserMessageIsVoice([])).toBe(false);
    expect(
      latestUserMessageIsVoice([{ role: "assistant", id: "voice-1" }]),
    ).toBe(false);
    expect(latestUserMessageIsVoice([{ role: "user" }])).toBe(false);
  });
});

describe("keepVoiceMark", () => {
  test("marks an id the server derived from a marked one", () => {
    expect(keepVoiceMark("voice-1", "group-user:voice-1:bot")).toBe(
      "voice-group-user:voice-1:bot",
    );
    expect(keepVoiceMark("voice-1", "task-t1")).toBe("voice-task-t1");
  });

  test("leaves an id alone when the one it came from was not marked", () => {
    expect(keepVoiceMark("msg-1", "group-user:msg-1:bot")).toBe(
      "group-user:msg-1:bot",
    );
    for (const source of [undefined, null, 7, "", "Voice-1", "invoice-1"])
      expect(keepVoiceMark(source, "task-t1")).toBe("task-t1");
  });

  test("does not mark twice", () => {
    expect(keepVoiceMark("voice-1", "voice-2")).toBe("voice-2");
  });
});
