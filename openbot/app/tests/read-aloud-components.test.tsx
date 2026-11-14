import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ReadAloudControl } from "@/components/channels/chat-transcript";
import { ReadAloudSetting } from "@/components/settings/read-aloud-setting";
import { READ_ALOUD_KEY } from "@/lib/voice/speech";

/**
 * Read aloud, docs/design/voice.md slice S1, as drawn: the Settings switch and the control under a
 * reply. The browser's speech engine is a stub that records what it was asked to say. Nothing is
 * spoken unless the switch is on and a local Italian voice exists.
 */

type StubVoice = { name: string; lang: string; localService: boolean };
let voices: StubVoice[] = [];
const spoken: { text: string; lang: string; voice: string }[] = [];

class StubUtterance {
  text: string;
  lang = "";
  voice: StubVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
const stubSynth = {
  getVoices: () => voices,
  speak: (utterance: StubUtterance) => {
    spoken.push({
      text: utterance.text,
      lang: utterance.lang,
      voice: utterance.voice?.name ?? "",
    });
  },
  cancel: () => undefined,
};

beforeAll(() => {
  GlobalRegistrator.register();
  Object.defineProperty(window, "speechSynthesis", {
    value: stubSynth,
    configurable: true,
  });
  Object.assign(globalThis, { SpeechSynthesisUtterance: StubUtterance });
});
afterAll(() => {
  GlobalRegistrator.unregister();
});
beforeEach(() => {
  voices = [];
  spoken.length = 0;
  window.localStorage.removeItem(READ_ALOUD_KEY);
});
afterEach(cleanup);

const local = { name: "Riccardo", lang: "it-IT", localService: true };
const network = { name: "Google italiano", lang: "it-IT", localService: false };

test("off by default: no Read aloud control under a reply, and nothing is spoken", () => {
  voices = [local];
  const view = render(<ReadAloudControl reply="Ciao, ecco la risposta." />);
  expect(view.queryByRole("button", { name: "Read aloud" })).toBeNull();
  expect(spoken).toEqual([]);
});

test("switched on with a local Italian voice: Read aloud speaks the cleaned reply once, and Stop stops it", () => {
  voices = [local];
  window.localStorage.setItem(READ_ALOUD_KEY, "on");
  const view = render(
    <ReadAloudControl reply={"Ciao **mondo**.\n```js\nx()\n```"} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Read aloud" }));
  expect(spoken).toEqual([
    { text: "Ciao mondo.", lang: "it-IT", voice: "Riccardo" },
  ]);
  expect(view.getByRole("button", { name: "Stop reading" })).toBeTruthy();
});

test("switched on with only a network voice: nothing is spoken, whatever the button does", () => {
  voices = [network];
  window.localStorage.setItem(READ_ALOUD_KEY, "on");
  const view = render(<ReadAloudControl reply="Ciao." />);
  fireEvent.click(view.getByRole("button", { name: "Read aloud" }));
  expect(spoken).toEqual([]);
});

test("the Settings switch does not turn on without a local Italian voice: it says so and stays off", () => {
  voices = [network];
  const view = render(<ReadAloudSetting />);
  fireEvent.click(view.getByRole("switch", { name: "Read replies aloud" }));
  expect(
    view.getByText(/No local Italian voice on this computer/),
  ).toBeTruthy();
  expect(window.localStorage.getItem(READ_ALOUD_KEY)).toBeNull();
});

test("the Settings switch turns on with a local Italian voice, and the control appears under replies", () => {
  voices = [local];
  const settings = render(<ReadAloudSetting />);
  fireEvent.click(settings.getByRole("switch", { name: "Read replies aloud" }));
  expect(window.localStorage.getItem(READ_ALOUD_KEY)).toBe("on");
  cleanup();
  const control = render(<ReadAloudControl reply="Ciao." />);
  expect(control.getByRole("button", { name: "Read aloud" })).toBeTruthy();
});
