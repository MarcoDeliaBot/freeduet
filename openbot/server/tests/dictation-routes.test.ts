import { expect, test } from "bun:test";
import type { MiddlewareHandler } from "hono";
import { MAX_DICTATION_BYTES } from "@openbot/shared/dictation";
import type { AppVariables } from "../src/auth/guards";
import {
  createDictationRoutes,
  requestLanguage,
} from "../src/dictation/routes";

const user: MiddlewareHandler<{ Variables: AppVariables }> = async (
  context,
  next,
) => {
  context.set("actor", {
    id: "user-1",
    email: "person@example.com",
    role: "user",
  });
  await next();
};
function recording(type = "audio/webm", size = 8) {
  const body = new FormData();
  const extension = type.includes("webm") ? "webm" : "html";
  body.set(
    "file",
    new File([new Uint8Array(size)], `recording.${extension}`, { type }),
  );
  return { method: "POST", headers: { "x-openbot-dictation": "1" }, body };
}

test("requires authentication before processing audio", async () => {
  const app = createDictationRoutes(
    (context) => context.json({ error: "Authentication required." }, 401),
    {
      transcribe: async () => {
        throw new Error("Must not run");
      },
    },
  );
  expect((await app.request("/transcriptions", recording())).status).toBe(401);
});
test("disabled service and cross-site forms cannot transcribe", async () => {
  const app = createDictationRoutes(user, undefined);
  expect((await app.request("/transcriptions", recording())).status).toBe(503);
  expect(
    (await app.request("/transcriptions", { ...recording(), headers: {} }))
      .status,
  ).toBe(403);
});
test("returns text without storing audio, and normalizes codec MIME parameters", async () => {
  const app = createDictationRoutes(user, {
    transcribe: async (file) => {
      expect(file.name).toBe("recording.webm");
      expect(file.type).toBe("audio/webm");
      return "Hello world";
    },
  });
  const result = await app.request(
    "/transcriptions",
    recording("audio/webm;codecs=opus"),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ text: "Hello world" });
});
test("rejects empty, unsupported, malformed and oversized recordings", async () => {
  const app = createDictationRoutes(user, {
    transcribe: async () => {
      throw new Error("Must not run");
    },
  });
  expect(
    (await app.request("/transcriptions", recording("audio/webm", 0))).status,
  ).toBe(400);
  expect(
    (await app.request("/transcriptions", recording("text/html"))).status,
  ).toBe(415);
  expect(
    (
      await app.request(
        "/transcriptions",
        recording("audio/webm", MAX_DICTATION_BYTES + 1),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await app.request(
        "/transcriptions",
        recording("audio/webm", MAX_DICTATION_BYTES + 100_000),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await app.request("/transcriptions", {
        method: "POST",
        headers: { "x-openbot-dictation": "1" },
        body: "broken",
      })
    ).status,
  ).toBe(400);
});
test("silence and upstream failures are actionable and do not leak secrets", async () => {
  const silence = createDictationRoutes(user, { transcribe: async () => "" });
  expect((await silence.request("/transcriptions", recording())).status).toBe(
    422,
  );
  const failure = createDictationRoutes(user, {
    transcribe: async () => {
      throw new Error("secret-key");
    },
  });
  const response = await failure.request("/transcriptions", recording());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("secret-key");
});
test("limits simultaneous requests and releases the slot after failure", async () => {
  const gate = Promise.withResolvers<string>();
  const started = Promise.withResolvers<void>();
  const app = createDictationRoutes(user, {
    transcribe: async () => {
      started.resolve();
      return gate.promise;
    },
  });
  const first = app.request("/transcriptions", recording());
  await started.promise;
  expect((await app.request("/transcriptions", recording())).status).toBe(429);
  gate.reject(new Error("network unavailable"));
  expect((await first).status).toBe(502);
  expect((await app.request("/transcriptions", recording())).status).toBe(502);
});
test("a transcript of only whitespace is the same 'nothing heard' answer as an empty one, whatever the provider", async () => {
  for (const heard of ["", " ", "\n", " \n\t \n"]) {
    const app = createDictationRoutes(user, { transcribe: async () => heard });
    const response = await app.request("/transcriptions", recording());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "No speech was detected. Try recording again.",
    });
  }
});

function withLanguage(value: string | File) {
  const request = recording();
  (request.body as FormData).set("language", value);
  return request;
}
test("the language the browser sends reaches the provider as a validated hint", async () => {
  const seen: (string | undefined)[] = [];
  const app = createDictationRoutes(user, {
    transcribe: async (_file, _signal, hint) => {
      seen.push(hint?.language);
      return "ok";
    },
  });
  await app.request("/transcriptions", withLanguage("it"));
  await app.request("/transcriptions", withLanguage(" IT "));
  await app.request("/transcriptions", recording());
  expect(seen).toEqual(["it", "it", undefined]);
});
test("a hostile language is dropped, not passed on and not an error", async () => {
  const seen: (string | undefined)[] = [];
  const app = createDictationRoutes(user, {
    transcribe: async (_file, _signal, hint) => {
      seen.push(hint?.language);
      return "ok";
    },
  });
  const hostile = [
    "it; rm -rf /",
    "../../etc/passwd",
    "xx",
    "ita",
    "it\r\nX-Evil: 1",
    "a".repeat(5000),
    "",
    new File(["it"], "it.txt"),
  ];
  for (const value of hostile) {
    const response = await app.request("/transcriptions", withLanguage(value));
    expect(response.status).toBe(200);
  }
  expect(seen).toEqual(hostile.map(() => undefined));
});
test("requestLanguage accepts only a string that is one of Whisper's codes", () => {
  expect(requestLanguage("it")).toBe("it");
  expect(requestLanguage("EN")).toBe("en");
  expect(requestLanguage(undefined)).toBeUndefined();
  expect(requestLanguage(null)).toBeUndefined();
  expect(requestLanguage(7)).toBeUndefined();
  expect(requestLanguage("it-IT")).toBeUndefined();
});
