import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { DictationButton } from "@/components/channels/composer/dictation-controls";
import { VoiceCallWidget } from "@/components/channels/voice-call-widget";
import { CATALOGS, SOURCE } from "@/freeduet/i18n/catalogs";
import { AppLanguageValue } from "@/freeduet/i18n/provider";
import { createTranslator } from "@/freeduet/i18n/translate";
import { transcribeRecording } from "@/lib/dictation/recording";
import { DictationSession } from "@/lib/dictation/session";
import { connectVoice } from "@/lib/voice/connection";
import { settleReactWork } from "./settle-react-work";

/** D181 stage 2n: the voice call and the dictation controls read the app language, and so do their errors. */

const itT = createTranslator(SOURCE, CATALOGS, "it");

const originalFetch = globalThis.fetch;

beforeAll(() => {
  GlobalRegistrator.register({ url: "http://localhost/" });
  // The widget asks who is signed in; no person is, so no request leaves the test.
  globalThis.fetch = Object.assign(
    async () => new Response(null, { status: 401 }),
    { preconnect: originalFetch.preconnect },
  );
});
afterEach(() => {
  cleanup();
});
afterAll(async () => {
  await settleReactWork();
  globalThis.fetch = originalFetch;
  GlobalRegistrator.unregister();
});

/** A call that is connected and quiet: the widget shows its ready line and its controls. */
const connectedCall = {
  state: {
    phase: "connected",
    muted: false,
    listening: false,
    speaking: false,
    working: false,
    seconds: 0,
    transcript: "",
    reply: "",
  },
  session: { end() {}, mute() {}, start: async () => {} },
  minimized: false,
  setMinimized() {},
} as never;

/** A dictation session that is idle and can record. */
const idleDictation = {
  available: true,
  supported: true,
  busy: false,
  session: {
    start: async () => {},
    cancel() {},
    finish: async () => {},
    retry: async () => {},
  },
  state: { phase: "idle", seconds: 0, canRetry: false },
} as never;

function labelled(container: HTMLElement, label: string) {
  return container.querySelector(`[aria-label="${label}"]`);
}

test("the voice call widget reads Italian with the language it, English with en", () => {
  const italian = render(
    <AppLanguageValue language="it">
      <VoiceCallWidget
        agentId="leo"
        avatarSeed="leo"
        call={connectedCall}
        name="Leo"
        taskRunning={false}
      />
    </AppLanguageValue>,
  );
  expect(italian.getByRole("status").textContent).toBe("Pronto quando vuoi");
  expect(labelled(italian.container, "Disattiva il tuo microfono")).not.toBeNull();
  expect(labelled(italian.container, "Mute your microphone")).toBeNull();
  cleanup();

  const english = render(
    <AppLanguageValue language="en">
      <VoiceCallWidget
        agentId="leo"
        avatarSeed="leo"
        call={connectedCall}
        name="Leo"
        taskRunning={false}
      />
    </AppLanguageValue>,
  );
  expect(english.getByRole("status").textContent).toBe("Ready when you are");
  expect(labelled(english.container, "Mute your microphone")).not.toBeNull();
});

test("the dictation controls read Italian with the language it, English with en", () => {
  const italian = render(
    <AppLanguageValue language="it">
      <DictationButton dictation={idleDictation} disabled={false} />
    </AppLanguageValue>,
  );
  expect(labelled(italian.container, "Detta un messaggio")).not.toBeNull();
  cleanup();

  const english = render(
    <AppLanguageValue language="en">
      <DictationButton dictation={idleDictation} disabled={false} />
    </AppLanguageValue>,
  );
  expect(labelled(english.container, "Dictate a message")).not.toBeNull();
});

test("a dictation error comes out in the language asked for, and English without one", async () => {
  const signal = new AbortController().signal;
  await expect(
    transcribeRecording(new Blob([]), signal, itT),
  ).rejects.toThrow("La registrazione è vuota o non supportata. Registra di nuovo.");
  await expect(transcribeRecording(new Blob([]), signal)).rejects.toThrow(
    "The recording is empty or unsupported. Please record again.",
  );
});

test("the dictation session's own error reads in the language given to it", async () => {
  const session = new DictationSession({
    record: async () => {
      throw new DOMException("denied", "NotAllowedError");
    },
    transcribe: async () => "",
    onTranscript() {},
    t: itT,
  });
  await session.start();
  expect(session.getSnapshot().error).toBe(
    "L'accesso al microfono è stato negato. Consentilo nel browser e riprova.",
  );
});

test("a voice call error comes out in the language given to it", async () => {
  const controller = new AbortController();
  // Without a microphone API the call says why it cannot start, in the language asked for.
  const error = await connectVoice({
    channelId: "channel",
    signal: controller.signal,
    onEvent() {},
    onError() {},
    onOutput() {},
    t: itT,
  }).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(
    "Le chiamate vocali richiedono un browser supportato e HTTPS o localhost.",
  );
});
