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
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { Composer } from "@/components/channels/composer/composer";
import { formatSeconds } from "@/freeduet/voice/level-meter";
import { levelOf } from "@/freeduet/voice/use-mic-level";
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

/** The byte waveform of a tone at `amplitude` (0..1 of full scale); 0 is silence (all 128). */
function wave(amplitude: number) {
  return (samples: Uint8Array) => {
    for (let i = 0; i < samples.length; i++)
      samples[i] = Math.round(128 + 127 * amplitude * (i % 2 === 0 ? 1 : -1));
  };
}

/** An analyser whose volume the test sets. It records the streams it was built on. */
function stubAnalyser() {
  const control = { amplitude: 0, sources: [] as unknown[], opened: 0 };
  class FakeContext {
    constructor() {
      control.opened++;
    }
    createMediaStreamSource(stream: unknown) {
      control.sources.push(stream);
      return { connect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData(samples: Uint8Array) {
          wave(control.amplitude)(samples);
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

function stubDictation({
  stream,
  transcribeWith,
}: {
  stream?: MediaStream;
  transcribeWith?: () => Promise<string>;
} = {}) {
  queryClient.setQueryData(deploymentKeys.capabilities(), {
    generativeUi: true,
    transcription: true,
  });
  const audio = new Blob(["recording"], { type: "audio/webm" });
  const supported = spyOn(recording, "recordingSupported").mockReturnValue(
    true,
  );
  const start = spyOn(recording, "startRecording").mockResolvedValue({
    ...(stream ? { stream } : {}),
    finish: async () => audio,
    cancel() {},
  });
  const transcribe = spyOn(recording, "transcribeRecording").mockImplementation(
    transcribeWith ??
      (() =>
        Promise.reject(
          new recording.NoSpeechError(
            "No speech was detected. Try recording again.",
          ),
        )),
  );
  restores.push(() => {
    supported.mockRestore();
    start.mockRestore();
    transcribe.mockRestore();
  });
  return { transcribe };
}

const fakeStream = { id: "mic" } as unknown as MediaStream;

async function openSheet() {
  const view = render(<Composer compact glass onSubmit={() => {}} />);
  fireEvent.click(view.getByRole("button", { name: "Speak a message" }));
  await view.findByRole("dialog", { name: "Say everything you need to do" });
  await waitFor(() =>
    expect(view.getByRole("status").textContent).toBe(
      "I'm listening, just start talking",
    ),
  );
  return view;
}

const sheetOpen = (view: ReturnType<typeof render>) =>
  view.queryByRole("dialog") !== null;
const hasAlert = (view: ReturnType<typeof render>) =>
  view.queryByRole("alert") !== null;
const textFocused = (view: ReturnType<typeof render>) =>
  view
    .getByRole("textbox", { name: "Message" })
    .contains(document.activeElement);

test("the keyboard with nothing said closes the sheet, shows no error and focuses the box", async () => {
  const analyser = stubAnalyser();
  const { transcribe } = stubDictation({ stream: fakeStream });
  const view = await openSheet();
  fireEvent.click(view.getByRole("button", { name: "Type instead" }));
  await waitFor(() => expect(sheetOpen(view)).toBe(false));
  await waitFor(() => expect(textFocused(view)).toBe(true));
  expect(hasAlert(view)).toBe(false);
  expect(view.queryByText(/No speech was detected/) === null).toBe(true);
  // Nothing was heard, so nothing is sent off to be written down.
  expect(transcribe).not.toHaveBeenCalled();
  expect(analyser.opened).toBeGreaterThan(0);
});

test("the keyboard with no way to measure still shows no error when the transcript is empty", async () => {
  (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
  const { transcribe } = stubDictation();
  const view = await openSheet();
  fireEvent.click(view.getByRole("button", { name: "Type instead" }));
  await waitFor(() => expect(sheetOpen(view)).toBe(false));
  await waitFor(() => expect(textFocused(view)).toBe(true));
  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(hasAlert(view)).toBe(false);
});

test("the keyboard after speech keeps the words and goes to the box", async () => {
  const analyser = stubAnalyser();
  stubDictation({
    stream: fakeStream,
    transcribeWith: async () => "Call Leo",
  });
  const view = await openSheet();
  analyser.amplitude = 0.4;
  await waitFor(() =>
    expect(
      Number(view.getByRole("meter").getAttribute("aria-valuenow")),
    ).toBeGreaterThan(0),
  );
  fireEvent.click(view.getByRole("button", { name: "Type instead" }));
  await waitFor(() => expect(sheetOpen(view)).toBe(false));
  await waitFor(() =>
    expect(view.getByRole("textbox", { name: "Message" }).textContent).toBe(
      "Call Leo",
    ),
  );
  expect(hasAlert(view)).toBe(false);
});

test("× shows no error either", async () => {
  stubAnalyser();
  const { transcribe } = stubDictation({ stream: fakeStream });
  const view = await openSheet();
  fireEvent.click(view.getByRole("button", { name: "Discard" }));
  await waitFor(() => expect(sheetOpen(view)).toBe(false));
  expect(hasAlert(view)).toBe(false);
  expect(transcribe).not.toHaveBeenCalled();
});

test("while listening the central button is a microphone that stops and sends", async () => {
  stubAnalyser();
  stubDictation({ stream: fakeStream });
  const view = await openSheet();
  const button = view.getByRole("button", { name: "Stop dictation and send" });
  expect(button.querySelector("svg") !== null).toBe(true);
  expect(view.queryByText("Tap the microphone when you're done") !== null).toBe(
    true,
  );
  expect(view.queryByRole("button", { name: "Send" }) === null).toBe(true);
});

test("the level meter follows the microphone, on the stream the recording already holds", async () => {
  const analyser = stubAnalyser();
  stubDictation({ stream: fakeStream });
  const view = await openSheet();
  const level = () =>
    Number(view.getByRole("meter").getAttribute("aria-valuenow"));
  await waitFor(() => expect(analyser.sources.length).toBe(1));
  expect(analyser.sources[0]).toBe(fakeStream);
  expect(analyser.opened).toBe(1);
  expect(level()).toBe(0);
  analyser.amplitude = 0.5;
  await waitFor(() => expect(level()).toBeGreaterThan(50));
  analyser.amplitude = 0;
  await waitFor(() => expect(level()).toBe(0));
});

test("the timer advances while listening", async () => {
  jest.useFakeTimers({ now: new Date("2026-11-27T10:00:00Z") });
  stubAnalyser();
  stubDictation({ stream: fakeStream });
  const view = render(<Composer compact glass onSubmit={() => {}} />);
  fireEvent.click(view.getByRole("button", { name: "Speak a message" }));
  await act(async () => {
    await Promise.resolve();
    jest.advanceTimersByTime(300);
  });
  expect(view.getByTestId("voice-timer").textContent).toBe("0:00");
  await act(async () => {
    jest.advanceTimersByTime(7000);
  });
  expect(view.getByTestId("voice-timer").textContent).toBe("0:07");
});

test("clock and level helpers", () => {
  expect(formatSeconds(7)).toBe("0:07");
  expect(formatSeconds(75)).toBe("1:15");
  expect(levelOf(new Uint8Array(8).fill(128))).toBe(0);
  const loud = new Uint8Array(8);
  wave(1)(loud);
  expect(levelOf(loud)).toBe(1);
});
