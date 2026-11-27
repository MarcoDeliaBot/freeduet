import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  act,
  cleanup,
  fireEvent,
  type RenderResult,
  render,
  waitFor,
} from "@testing-library/react";
import { Composer } from "@/components/channels/composer/composer";
import type { ComposerDraft } from "@/components/channels/composer/draft";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

/**
 * WHICH SENDS THE COMPOSER MARKS AS WORDS FROM THE MICROPHONE (docs/design/voice.md, D7 and D8).
 *
 * The decision: dictation the person never read before it was sent, "Transcribe and send", is not
 * their own written request, so its draft carries `voice: true` and the message made from it gets the
 * id the server reads as such. What the person could read and edit is theirs, so it is not marked: text
 * typed in the box, and dictation placed in the box with "Stop and transcribe" and then sent with the
 * Send button. Only the draft is looked at here; the id it becomes is pinned through the real channel in
 * `channel-voice-mark.test.tsx`, and the server's side in `voice-message-gate.integration.test.ts`.
 *
 * A draft is either marked or has no `voice` field at all, so "not marked" is read as the key being
 * absent, which is the stricter reading.
 *
 * THE HARNESS IS THIS REPOSITORY'S, as in `composer-dictation.test.tsx`: the recorder and the
 * transcriber are the spied seams, and nothing opens a microphone.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
// Seeded for every test, typed ones included: a composer asks for the deployment's capabilities when
// it mounts, and without an answer in the cache the request would go out to a port nobody listens on.
beforeEach(() =>
  queryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
  }),
);
afterEach(() => {
  cleanup();
  queryClient.clear();
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

const marked = (draft: ComposerDraft | undefined) =>
  draft !== undefined && "voice" in draft;

/** Runs `run` with a microphone that records and a transcriber that answers `transcript`. */
async function withDictation(
  transcript: string,
  run: (transcribed: () => number) => Promise<void>,
) {
  const supported = spyOn(recording, "recordingSupported").mockReturnValue(
    true,
  );
  const start = spyOn(recording, "startRecording").mockResolvedValue({
    finish: async () => new Blob(["recording"], { type: "audio/webm" }),
    cancel() {},
  });
  const transcribe = spyOn(recording, "transcribeRecording").mockResolvedValue(
    transcript,
  );
  try {
    await run(() => transcribe.mock.calls.length);
  } finally {
    cleanup();
    supported.mockRestore();
    start.mockRestore();
    transcribe.mockRestore();
  }
}

/** Starts a recording and presses the button that ends it, by the name the person reads. */
async function dictate(
  view: RenderResult,
  press: "Stop and transcribe" | "Transcribe and send",
  transcribed: () => number,
) {
  fireEvent.click(view.getByRole("button", { name: "Dictate a message" }));
  await waitFor(() => expect(view.getByText("Listening")).toBeDefined());
  fireEvent.click(view.getByRole("button", { name: press }));
  await waitFor(() => expect(transcribed()).toBe(1));
}

const box = (view: RenderResult) =>
  view.getByRole("textbox", { name: "Message" }).textContent;

/** The Send button, or Enter: the form's own submit, inside `act` because the send changes state. */
async function submit(view: RenderResult) {
  const form = view.container.querySelector("form");
  if (!form) throw new Error("Missing composer form");
  await act(async () => {
    fireEvent.submit(form);
  });
}

for (const variant of ["compact", "default"] as const) {
  test(`guard, ${variant}: words typed in the box and sent with the Send button are not marked`, async () => {
    const sent: ComposerDraft[] = [];
    const view = render(
      <Composer
        compact={variant === "compact"}
        initialValue="Write to ana@example.com saying good morning"
        onSubmit={(draft) => {
          sent.push(draft);
        }}
      />,
    );
    await submit(view);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe("Write to ana@example.com saying good morning");
    expect(marked(sent[0])).toBe(false);
  });

  test(`guard, ${variant}: dictation placed in the box with "Stop and transcribe" and sent with the Send button is not marked, because the person could read and edit it`, async () => {
    await withDictation("dictated words", async (transcribed) => {
      const sent: ComposerDraft[] = [];
      const view = render(
        <Composer
          compact={variant === "compact"}
          onSubmit={(draft) => {
            sent.push(draft);
          }}
        />,
      );
      await dictate(view, "Stop and transcribe", transcribed);
      await waitFor(() => expect(box(view)).toContain("dictated words"));
      expect(sent).toEqual([]);
      await submit(view);
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]?.text).toBe("dictated words");
      expect(marked(sent[0])).toBe(false);
    });
  });

  test(`${variant}: dictation sent with one press, "Transcribe and send", is marked as words from the microphone`, async () => {
    await withDictation("dictated words", async (transcribed) => {
      const sent: ComposerDraft[] = [];
      const view = render(
        <Composer
          compact={variant === "compact"}
          onSubmit={(draft) => {
            sent.push(draft);
          }}
        />,
      );
      await dictate(view, "Transcribe and send", transcribed);
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]?.text).toBe("dictated words");
      expect(sent[0]?.voice).toBe(true);
    });
  });

  test(`${variant}: words that were already in the box go out marked with the dictation, because the whole message was sent unread`, async () => {
    await withDictation("and tell Ana", async (transcribed) => {
      const sent: ComposerDraft[] = [];
      const view = render(
        <Composer
          compact={variant === "compact"}
          initialValue="Write to ana@example.com"
          onSubmit={(draft) => {
            sent.push(draft);
          }}
        />,
      );
      await dictate(view, "Transcribe and send", transcribed);
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]?.text).toBe("Write to ana@example.com and tell Ana");
      expect(sent[0]?.voice).toBe(true);
    });
  });

  test(`${variant}: the one press while the Bot is working parks a marked message, and nothing is sent`, async () => {
    await withDictation("dictated words", async (transcribed) => {
      const sent: ComposerDraft[] = [];
      const queued: ComposerDraft[] = [];
      const view = render(
        <Composer
          compact={variant === "compact"}
          pending
          onQueue={(draft) => {
            queued.push(draft);
          }}
          onSubmit={(draft) => {
            sent.push(draft);
          }}
        />,
      );
      await dictate(view, "Transcribe and send", transcribed);
      await waitFor(() => expect(queued).toHaveLength(1));
      expect(queued[0]?.text).toBe("dictated words");
      expect(queued[0]?.voice).toBe(true);
      expect(sent).toEqual([]);
    });
  });

  test(`${variant}: a one-press send that fails puts the words back in the box, and sending them again with the Send button is not marked, because they are on screen now`, async () => {
    await withDictation("dictated words", async (transcribed) => {
      const sent: ComposerDraft[] = [];
      const view = render(
        <Composer
          compact={variant === "compact"}
          onSubmit={(draft) => {
            sent.push(draft);
            if (sent.length === 1) throw new Error("Agent unavailable");
          }}
        />,
      );
      await dictate(view, "Transcribe and send", transcribed);
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]?.voice).toBe(true);
      await waitFor(() => expect(box(view)).toContain("dictated words"));
      await submit(view);
      await waitFor(() => expect(sent).toHaveLength(2));
      expect(sent[1]?.text).toBe("dictated words");
      expect(marked(sent[1])).toBe(false);
    });
  });
}

/*
 * THE SPOKEN MESSAGE SHEET. The shell's composer is the compact glass one, which takes a spoken
 * message in a sheet instead of inline: "Speak a message" opens it and starts the recording, the
 * sheet's "Send" transcribes and sends in one press, and "Type instead" places the words in the box.
 * It drives the composer's own dictation session, so it has to leave the same two marks as the
 * inline controls: one press is marked, and what is placed in the box and sent with the Send button
 * is not.
 */
async function speak(
  view: RenderResult,
  press: "Stop and send" | "Type instead",
  transcribed: () => number,
) {
  fireEvent.click(await view.findByRole("button", { name: "Speak a message" }));
  const control = await view.findByRole("button", { name: press });
  await waitFor(() => expect(control.hasAttribute("disabled")).toBe(false));
  fireEvent.click(control);
  await waitFor(() => expect(transcribed()).toBe(1));
}

test('the spoken message sheet: its "Send" is one press, and is marked as words from the microphone', async () => {
  await withDictation("dictated words", async (transcribed) => {
    const sent: ComposerDraft[] = [];
    const view = render(
      <Composer
        compact
        glass
        onSubmit={(draft) => {
          sent.push(draft);
        }}
      />,
    );
    await speak(view, "Stop and send", transcribed);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.text).toBe("dictated words");
    expect(sent[0]?.voice).toBe(true);
  });
});

test('guard: the spoken message sheet\'s "Type instead" places the words in the box, and sending them with the Send button is not marked', async () => {
  await withDictation("dictated words", async (transcribed) => {
    const sent: ComposerDraft[] = [];
    const view = render(
      <Composer
        compact
        glass
        onSubmit={(draft) => {
          sent.push(draft);
        }}
      />,
    );
    await speak(view, "Type instead", transcribed);
    await waitFor(() => expect(box(view)).toContain("dictated words"));
    expect(sent).toEqual([]);
    await submit(view);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.text).toBe("dictated words");
    expect(marked(sent[0])).toBe(false);
  });
});
