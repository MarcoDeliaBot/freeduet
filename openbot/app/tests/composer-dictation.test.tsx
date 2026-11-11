import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { Composer } from "@/components/channels/composer/composer";
import { deploymentKeys } from "@/lib/deployment/queries";
import * as recording from "@/lib/dictation/recording";
import { queryClient } from "@/query-client";
import { settleReactWork } from "./settle-react-work";

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => {
  cleanup();
  queryClient.clear();
});
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

for (const variant of ["compact", "default"] as const) {
  for (const action of [
    "stop",
    "send",
    "retry-send",
    "failed-send",
    "cancel",
  ] as const) {
    test(`${variant} dictation: ${action} preserves the draft and follows the selected action`, async () => {
      queryClient.setQueryData(deploymentKeys.capabilities(), {
        generativeUi: true,
        transcription: true,
      });
      const audio = new Blob(["recording"], { type: "audio/webm" });
      const supported = spyOn(recording, "recordingSupported").mockReturnValue(
        true,
      );
      const start = spyOn(recording, "startRecording").mockResolvedValue({
        finish: async () => audio,
        cancel() {},
      });
      const result = Promise.withResolvers<string>();
      let attempts = 0;
      const transcribe = spyOn(
        recording,
        "transcribeRecording",
      ).mockImplementation(() => {
        if (action === "retry-send" && attempts++ === 0)
          return Promise.reject(new Error("Please retry transcription"));
        return result.promise;
      });
      const sent: string[] = [];
      try {
        const view = render(
          <Composer
            compact={variant === "compact"}
            initialValue="Existing draft"
            onSubmit={(draft) => {
              sent.push(draft.text);
              if (action === "failed-send")
                throw new Error("Agent unavailable");
            }}
          />,
        );
        fireEvent.click(
          view.getByRole("button", { name: "Dictate a message" }),
        );
        await waitFor(() => expect(view.getByText("Listening")).toBeDefined());
        expect(view.queryByRole("textbox", { name: "Message" })).toBeNull();
        expect(
          view.queryByRole("button", { name: "Dictate a message" }),
        ).toBeNull();
        expect(
          view.getByRole("img", { name: "Live audio waveform" }),
        ).toBeDefined();
        const form = view.container.querySelector("form");
        if (!form) throw new Error("Missing composer form");
        fireEvent.submit(form);
        expect(sent).toEqual([]);
        if (action === "cancel") {
          fireEvent.click(
            view.getByRole("button", { name: "Cancel dictation" }),
          );
          await waitFor(() =>
            expect(
              view.getByRole("textbox", { name: "Message" }).textContent,
            ).toBe("Existing draft"),
          );
          expect(transcribe).not.toHaveBeenCalled();
          expect(sent).toEqual([]);
          return;
        }
        fireEvent.click(
          view.getByRole("button", {
            name:
              action === "stop" ? "Stop and transcribe" : "Transcribe and send",
          }),
        );
        await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
        if (action === "retry-send") {
          await waitFor(() =>
            expect(view.getByRole("alert").textContent).toContain(
              "Please retry",
            ),
          );
          expect(sent).toEqual([]);
          fireEvent.click(view.getByRole("button", { name: "Retry" }));
          await waitFor(() => expect(transcribe).toHaveBeenCalledTimes(2));
        }
        fireEvent.submit(form);
        expect(sent).toEqual([]);
        await act(async () => {
          result.resolve("dictated words");
          await result.promise;
        });
        if (action === "stop" || action === "failed-send") {
          await waitFor(() =>
            expect(
              view.getByRole("textbox", { name: "Message" }).textContent,
            ).toContain("Existing draft dictated words"),
          );
        }
        if (action === "stop") {
          expect(sent).toEqual([]);
          fireEvent.submit(form);
        }
        await waitFor(() =>
          expect(sent).toEqual(["Existing draft dictated words"]),
        );
      } finally {
        cleanup();
        supported.mockRestore();
        start.mockRestore();
        transcribe.mockRestore();
      }
    });
  }
}

/**
 * A page that is not secure (a phone opening http://<the computer's address>:3010) gets no
 * microphone from the browser at all. The button used to sit disabled with its reason in a `title`,
 * which a touch screen never shows: it simply did nothing.
 */
for (const variant of ["compact", "default"] as const) {
  test(`${variant} dictation: on a page that is not secure the mic says why, in one sentence`, async () => {
    queryClient.setQueryData(deploymentKeys.capabilities(), {
      generativeUi: true,
      transcription: true,
    });
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    try {
      const view = render(
        <Composer compact={variant === "compact"} onSubmit={() => {}} />,
      );
      const mic = view.getByRole("button", { name: "Dictate a message" });
      expect((mic as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(mic);
      await waitFor(() => expect(view.getByRole("alert")).toBeDefined());
      expect(view.getByRole("alert").textContent).toBe(
        "The microphone only works on a secure page. Open FreeDuet on the computer where it runs (localhost), or ask whoever runs it to put it behind https.",
      );
      fireEvent.click(view.getByRole("button", { name: "Cancel dictation" }));
      await waitFor(() =>
        expect(
          view.getByRole("button", { name: "Dictate a message" }),
        ).toBeDefined(),
      );
    } finally {
      Reflect.deleteProperty(window, "isSecureContext");
    }
  });
}
