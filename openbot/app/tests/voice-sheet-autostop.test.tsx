import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  jest,
  spyOn,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Composer } from "@/components/channels/composer/composer";
import {
  autoStopVerdict,
  FIRST_SPEECH_TIMEOUT_MS,
  SILENCE_STOP_MS,
} from "@/freeduet/voice/auto-stop";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

const restores: (() => void)[] = [];
const realAudioContext = (globalThis as { AudioContext?: unknown })
  .AudioContext;

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => {
  cleanup();
  queryClient.clear();
  jest.useRealTimers();
  (globalThis as { AudioContext?: unknown }).AudioContext = realAudioContext;
  for (const restore of restores.splice(0)) restore();
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

/** A fake level stream: the test sets the volume the analyser reports (0 is silence). */
function stubAnalyser() {
  const control = { amplitude: 0 };
  class FakeContext {
    createMediaStreamSource() {
      return { connect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData(samples: Uint8Array) {
          for (let i = 0; i < samples.length; i++)
            samples[i] = Math.round(
              128 + 127 * control.amplitude * (i % 2 === 0 ? 1 : -1),
            );
        },
      };
    }
    close() {
      return Promise.resolve();
    }
  }
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeContext;
  return control;
}

function stubDictation(text = "Call Leo") {
  queryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
  });
  const supported = spyOn(recording, "recordingSupported").mockReturnValue(
    true,
  );
  const start = spyOn(recording, "startRecording").mockResolvedValue({
    stream: { id: "mic" } as unknown as MediaStream,
    finish: async () => new Blob(["recording"], { type: "audio/webm" }),
    cancel() {},
  });
  const transcribe = spyOn(recording, "transcribeRecording").mockResolvedValue(
    text,
  );
  restores.push(() => {
    supported.mockRestore();
    start.mockRestore();
    transcribe.mockRestore();
  });
  return { transcribe };
}

async function openSheet() {
  jest.useFakeTimers({ now: new Date("2026-11-27T10:00:00Z") });
  const submitted: unknown[] = [];
  const view = render(
    <Composer compact glass onSubmit={(m) => void submitted.push(m)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Speak a message" }));
  await act(async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(100);
  });
  return { view, submitted };
}
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
const box = (view: ReturnType<typeof render>) =>
  view.getByRole("textbox", { name: "Message" });

test("the verdict: speech then 3 s of quiet stops, never before speech, 8 s with no speech gives up", () => {
  expect(autoStopVerdict(null, FIRST_SPEECH_TIMEOUT_MS - 1)).toBe("keep");
  expect(autoStopVerdict(null, FIRST_SPEECH_TIMEOUT_MS)).toBe("no-speech");
  expect(autoStopVerdict(SILENCE_STOP_MS - 1, 20_000)).toBe("keep");
  expect(autoStopVerdict(SILENCE_STOP_MS, 20_000)).toBe("silence");
  // Silence before the person has spoken is not "stop on silence".
  expect(autoStopVerdict(null, 5000)).toBe("keep");
});

test("speech then 3 s of silence stops by itself and puts the words in the box without sending", async () => {
  const level = stubAnalyser();
  const { transcribe } = stubDictation("Call Leo");
  const { view, submitted } = await openSheet();
  level.amplitude = 0.4;
  await advance(1000);
  level.amplitude = 0;
  await advance(SILENCE_STOP_MS - 500);
  expect(view.queryByRole("dialog") !== null).toBe(true);
  expect(transcribe).not.toHaveBeenCalled();
  await advance(1000);
  await advance(100);
  expect(transcribe).toHaveBeenCalledTimes(1);
  await advance(100);
  expect(view.queryByRole("dialog")).toBeNull();
  expect(box(view).textContent).toBe("Call Leo");
  expect(submitted).toEqual([]);
});

test("nothing said for 8 s stops quietly with a hint, no error, and the mic starts again", async () => {
  stubAnalyser();
  const { transcribe } = stubDictation();
  const { view } = await openSheet();
  await advance(FIRST_SPEECH_TIMEOUT_MS - 1000);
  expect(
    view.getByRole("button", { name: "Stop dictation and send" }),
  ).toBeTruthy();
  await advance(1500);
  expect(view.queryByRole("alert")).toBeNull();
  expect(view.getByRole("status").textContent).toContain(
    "I didn't hear anything",
  );
  expect(transcribe).not.toHaveBeenCalled();
  const start = view.getByRole("button", { name: "Start dictation" });
  fireEvent.click(start);
  await advance(100);
  expect(
    view.getByRole("button", { name: "Stop dictation and send" }),
  ).toBeTruthy();
});

test("the longest recording ends by itself with the words in the box", async () => {
  const level = stubAnalyser();
  stubDictation("A long one");
  const { view, submitted } = await openSheet();
  // Keep talking: the silence rule never fires, the length limit does.
  level.amplitude = 0.4;
  for (let i = 0; i < 125; i++) await advance(1000);
  await advance(200);
  expect(view.queryByRole("dialog")).toBeNull();
  expect(box(view).textContent).toBe("A long one");
  expect(submitted).toEqual([]);
});

test("the state is announced politely and the mic button's label follows the state", async () => {
  stubAnalyser();
  stubDictation();
  const { view } = await openSheet();
  const status = view.getByRole("status");
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.textContent).toBe("I'm listening, just start talking");
  const stop = view.getByRole("button", { name: "Stop dictation and send" });
  expect(stop.tagName).toBe("BUTTON");
  expect(stop.hasAttribute("disabled")).toBe(false);
});

test("what the person says is shown as a state, not as invented words", async () => {
  const level = stubAnalyser();
  stubDictation();
  const { view } = await openSheet();
  level.amplitude = 0.4;
  await advance(300);
  expect(view.getByRole("status").textContent).toBe(
    "Listening… I'll stop when you pause",
  );
});
