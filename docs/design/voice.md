# Voice plan: read aloud and a call

Plan only, no product code. Written 2026-11-14 for the roadmap row "Voice" ([ROADMAP.md](../ROADMAP.md), Later). Read on origin/main at commit 452e060.

Tags: **[code: path:line]** read in this repository on origin/main. **[doc: URL]** stated by a public page, read 2026-11-14. **[assumed]** my inference, or not checked. Nothing tagged [assumed] may be built on as fact.

## 1. What the person gets

- Members read their answers aloud on the person's own computer, at no cost. No audio leaves the machine unless the person turns on a cloud voice with their own key.
- The person talks to a member in a call: first push-to-talk, later a live conversation.
- Nothing is recorded or kept unless the person asks. Today's live call keeps its transcript, so this plan changes that (decision D1).

## 2. What exists today

### 2.1 Dictation (speech to text): optional, off by default

| Step | Where | What it does |
|---|---|---|
| Switch | [code: openbot/.env.example:261-297] (all commented); [code: openbot/scripts/start.sh:265-269] | Off unless `FREEDUET_DICTATION=local`. Then `start.sh` starts the `whisper` service. |
| Record | [code: openbot/app/src/components/channels/composer/dictation-controls.tsx:32]; [code: openbot/app/src/lib/dictation/recording.ts:44-49] | "Dictate a message" button, shown only when transcription is on ([code: openbot/app/src/components/channels/composer/use-dictation.ts:38]). `MediaRecorder` in WebM/Opus, MP4 or WAV. |
| Limits | [code: openbot/app/src/lib/dictation/session.ts:82]; [code: openbot/shared/dictation.ts:1-3] | Stops at 120 s. 10 MiB at most. 60 s timeout. |
| Upload | [code: openbot/app/src/lib/dictation/recording.ts:141-150] | One file, sent after Stop. No streaming. The browser's language code is sent as a hint. |
| Server | [code: openbot/server/src/app.ts:692-696]; [code: openbot/server/src/dictation/routes.ts:35, 44-46, 59-60, 70, 94] | Route `/api/audio/transcriptions`. Header check, one request per person and 8 per process, size limit, 60 s timeout. No disk write in this path (grep found none). |
| Adapter | [code: openbot/server/src/dictation/provider.ts:30-46, 72-74] | Multipart POST to `${TRANSCRIPTION_BASE_URL}/audio/transcriptions`. |
| Local service | [code: openbot/docker-compose.yml:466-500]; [code: openbot/whisper/entrypoint.sh:50-62] | whisper.cpp v1.9.5 at a pinned commit ([code: openbot/whisper/Dockerfile:21-30]). CPU only. Port 4240 on 127.0.0.1 only ([code: openbot/docker-compose.yml:477]). Read-only root, `cap_drop: ALL`, 128 MB `/tmp`. Converted audio is written to `/tmp` ([code: openbot/whisper/entrypoint.sh:59]). Whether it is deleted afterwards: [assumed], not checked. |
| Models | [code: openbot/shared/whisper-models.ts:40-65, 85-92]; [code: openbot/whisper/fetch-model.ts:14-15, 81-87, 103-105, 123-126] | Closed list, SHA-256 pinned. A file that does not match is deleted. Default `large-v3-turbo-q5_0`. |

What it costs, as far as the code and docs say:

- **Disk.** Model files: 574,041,195 bytes (default), 1,624,555,275 (`large-v3-turbo`), 487,601,967 (`small`), 147,951,465 (`base`). VAD model: 885,098 bytes ([code: openbot/shared/whisper-models.ts:44, 50, 56, 62, 89]). Image size: not measured [assumed unknown].
- **Memory.** The maintainer measured 783 MB (default) and 1.75 GB (`large-v3-turbo`) ([code: docs/M1_PLAN.md:185]). The doc does not name the metric; read as memory in use [assumed]. whisper.cpp's own table lists about 852 MB for `small` and about 3.9 GB for `large` ([doc: https://github.com/ggml-org/whisper.cpp], "Memory usage", with no note on what the figure measures).
- **Speed and accuracy.** On 100 Italian FLEURS read clips with 16 threads, the maintainer measured: default WER 2.8%, median 9.78 s per request, p95 17.42 s; `small` WER 7.9%, 1.83 s ([code: docs/M1_PLAN.md:185]). Clip lengths are not in the doc. The eval records them ([code: evals/dictation/wer.ts:143-147]), so the real-time factor is unknown here. Sending the language roughly halved the time at 4 threads ([code: docs/M1_PLAN.md:185]).
- **Limits.** The test set is read speech, not a phone call ([code: docs/M1_PLAN.md:170]). An empty transcript shows "No speech was detected" ([code: openbot/server/src/dictation/routes.ts:103-105]). "Transcribe and send" submits the text with no review step ([code: openbot/app/src/components/channels/composer/dictation-controls.tsx:208-209]).

### 2.2 Live voice call: already in the code, cloud only, off by default

- **Switch.** Off unless `VOICE_PROVIDER`, `VOICE_MODEL` and `VOICE_API_KEY` are set ([code: openbot/server/src/voice/config.ts:16-22]). The widget needs the `voice` capability ([code: openbot/server/src/app.ts:536]; [code: openbot/app/src/lib/voice/use-voice-call.ts:54]).
- **Two cloud engines.** OpenAI realtime over WebRTC: the server exchanges the SDP offer with `api.openai.com/v1/realtime/calls` ([code: openbot/server/src/voice/provider.ts:199-273, 249]). xAI realtime over WebSocket with PCM at 24 kHz ([code: openbot/server/src/voice/provider.ts:120-197]; [code: openbot/app/src/lib/voice/websocket.ts:96]). The browser takes the microphone ([code: openbot/app/src/lib/voice/webrtc.ts:44-48, 113]) and streams to the provider directly, as the guide says ([code: openbot/docs/configuration.md:486]).
- **What leaves the machine in a call.** Microphone audio, to the provider. The call context as text, up to 12,000 characters: recent thread messages and earlier voice chats ([code: openbot/app/src/lib/voice/session.ts:154-164]; [code: openbot/app/src/components/channels/channel-chat.tsx:1413-1416]). Each agent answer, returned as text so the voice model can read it aloud ([code: openbot/app/src/lib/voice/session.ts:316-334]; [code: openbot/server/src/voice/provider.ts:84-87]).
- **Tools and turns.** One tool, `ask_agent` ([code: openbot/server/src/voice/provider.ts:94-95]). A request is refused while a turn runs ([code: openbot/app/src/components/channels/channel-chat.tsx:1421-1428]). Barge-in: on the OpenAI path, server voice detection with `interrupt_response: true` ([code: openbot/server/src/voice/provider.ts:235-239]); on the xAI path the browser cuts playback ([code: openbot/app/src/lib/voice/websocket.ts:198-218]).
- **Transcripts are kept.** Ending a call saves it ([code: openbot/app/src/lib/voice/use-voice-call.ts:30]) into table `voice_sessions` ([code: openbot/server/src/voice/sessions.ts:198-209]). The browser also keeps unsaved transcripts in local storage ([code: openbot/app/src/lib/voice/outbox.ts:21]). The session routes are only GET and POST ([code: openbot/server/src/voice/session-routes.ts:29, 47]). No route or job deletes a session; rows go only with their channel or user ([code: openbot/server/src/db/schema/voice.ts:21, 24]).
- **Limits.** 15 minutes per call ([code: openbot/app/src/lib/voice/session.ts:176]). Five connection attempts per person per minute ([code: openbot/server/src/voice/routes.ts:19-20]).
- **Approvals.** No approval code in `server/src/voice` or `app/src/lib/voice` (grep). No code connects a spoken answer to an approval card.
- **Roadmap conflict.** The roadmap says the voice engine "is not chosen yet" ([code: docs/ROADMAP.md:59]). The code already has two cloud engines.

### 2.3 Read aloud (text to speech): not in the code

No speech synthesis call, read-aloud control or TTS service in `openbot/app/src` or `openbot/server/src` (grep: none). TTS appears only in skill text in `openbot/examples/freeduet/skills.yaml`, as a service a skill may name ([code: openbot/examples/freeduet/skills.yaml:1604, 1612]).

### 2.4 Plan row

F17 "Voice in", milestone M5, plans dictation for Iris and Wren ([code: docs/PROJECT.md:198]).

## 3. The design

### 3.1 Smallest version worth shipping (V1)

Two parts, no new server code.

1. **Read aloud in the browser.** A "Read aloud" control under each member reply, and a switch in settings. Both off by default. It uses the Web Speech API's speech synthesis and only voices whose `localService` is true. MDN defines that as a voice "supplied by a local speech synthesizer service" ([doc: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService]). If no local Italian voice exists, the switch says so and stays off. Text is cleaned first: no code blocks, no table cells read one by one. The switch is kept in the browser, as the voice outbox already does ([code: openbot/app/src/lib/voice/outbox.ts:21]).
2. **Push-to-talk turn.** Hold the microphone. Dictation (section 2.1) fills the draft, and the text is sent as a normal chat message. The member's reply is read aloud. States: idle, listening, transcribing, waiting, speaking. A press during speech stops it and starts listening. No barge-in in V1. An approval card stays on screen. The call says "please check the card in the chat" and does not read a spoken yes or no as an answer.

Why this one: it needs nothing new on the server, costs nothing by default, writes no audio file and keeps nothing new. Its speed is the speed of local dictation: with the default model, a median of 9.78 s per request on the maintainer's computer (decision D4).

Browser facts behind V1:

- Speech synthesis is "Baseline widely available" since September 2018 ([doc: https://developer.mozilla.org/docs/Web/API/SpeechSynthesis]).
- Speech recognition is "limited availability": Chrome and Edge 139 and later, Firefox 160 listed, Safari not supported ([doc: https://web-platform-dx.github.io/web-features-explorer/features/speech-recognition]). V1 does not use it.
- Firefox includes no voices of its own, and on desktop Chrome the preloaded voices all need online access and have no lower-quality offline variant ([doc: https://readium.org/speech/docs/WebSpeech.html]). So V1 skips network voices. [assumed] A network voice sends the text to a remote service.
- For recognition, MDN says the platform's service is the default, and local processing is something the page can ask for ([doc: https://developer.mozilla.org/docs/Web/API/Web_Speech_API]). Chrome's proposal page does not say where the default runs ([doc: https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I]).

### 3.2 What comes after

- **V2: local neural voice on the server (CPU).** Opt-in like dictation (`FREEDUET_TTS=local`). A closed voice list pinned by SHA-256, as in `whisper-models.ts`. Audio returned to the browser and kept in memory only. Runtime candidate: sherpa-onnx, Apache-2.0 per an aggregator page ([doc: https://awesome.ecosyste.ms/projects/github.com%2Fk2-fsa%2Fsherpa-onnx]); the repository itself was not opened. Needs D2, D5 and a benchmark on the maintainer's computer. Size L.
- **V3: cloud voice with the person's own key.** Off by default. The `VOICE_*` path stays as it is. Needs D1 and D6. Size M.
- **V4: real-time duplex on this computer.** Not recommended now. Speech-to-text is batch (one file after Stop). Voice detection runs inside the whisper server ([code: openbot/whisper/entrypoint.sh:54]), not on a live stream. The default model needs about 10 s per request. The cloud call already has barge-in.

### 3.3 Local text-to-speech engines

Read from public pages on 2026-11-14. Nothing was installed or measured here.

| Engine | Italian | Code licence | Voice licence | Size | Speed claim | Usable in an MIT product? |
|---|---|---|---|---|---|---|
| Piper | Yes, `it_IT` ([doc: https://github.com/rhasspy/piper/blob/6c5e283439f8400aa7a2652aafbedfb77ca3fc22/README.md?plain=1]) | MIT per an aggregator page ([doc: https://awesome.ecosyste.ms/projects/github.com%2Frhasspy%2Fpiper]); the README names no code licence. Repo archived read-only on 6 Oct 2025; the README names no successor. A GPLv3 line exists as piper1-gpl, which moved to the OHF-Voice organisation ([doc: https://github.com/OHF-Voice/piper1-gpl/releases]). Link between the two: [assumed]. | The voices repository card says `license: mit` ([doc: https://huggingface.co/rhasspy/piper-voices/blob/main/README.md?code=true]); no per-voice licence on it. Italian `riccardo` x_low folder: 28.2 MB ([doc: https://huggingface.co/rhasspy/piper-voices/tree/a5400b9af996fd43eab8da0801c320629828f62a/it/it_IT/riccardo]). Its licence and dataset: not read [assumed open]. | Voice folder 28.2 MB | "fast, local neural text to speech", "optimized for the Raspberry Pi 4"; no figures (README) | Archived MIT line: candidate, after the voice check. GPLv3 line: no. |
| Kokoro-82M | Yes: `if_sara`, `im_nicola`; Target Quality B and Overall Grade C, which the page calls estimates, with no letter scale explained ([doc: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md]) | Apache-2.0 ([doc: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md]) | Training: permissive or non-copyrighted audio; CC BY 3.0 and CC BY 4.0 sources named. The Italian table has no licence column; the CC BY column appears only in the Japanese and French tables ([doc: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md]). | 82 million parameters. File size not read [assumed about 0.3 GB at 32-bit]. | Raspberry Pi 4 real-time factor 3.19 at 4 threads; the page does not define the factor ([doc: https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html]) | Model: candidate. The card's example installs espeak-ng (GPL-3.0-or-later, [doc: https://github.com/espeak-ng/espeak-ng/]) and does not say why: decision D5. |
| XTTS-v2 | Yes ([doc: https://huggingface.co/coqui/XTTS-v2/blob/v2.0.1/README.md]) | Model under Coqui Public Model License: "only non-commercial use" ([doc: https://huggingface.co/coqui/XTTS-v1/raw/main/LICENSE]). Code licence not checked [assumed]. | Same licence | Not stated | "< 200ms" streaming latency; hardware not named ([doc: https://coqui-tts.readthedocs.io/en/latest/models/xtts.html]) | No. Non-commercial, and it clones voices from a short clip, which is out of scope. |
| MeloTTS | No: English, Spanish, French, Chinese, Japanese, Korean ([doc: https://github.com/myshell-ai/MeloTTS]) | MIT ([doc: https://github.com/myshell-ai/MeloTTS]) | Not stated | Not read | "Fast enough for CPU real-time inference"; no figures (same README) | Licence fits, but no Italian. Not a candidate. |

### 3.4 Call options compared

| Option | Built? | Latency | Barge-in | What leaves the machine | Verdict |
|---|---|---|---|---|---|
| Push-to-talk, local (V1) | No | Recording, upload and transcription (9.78 s median with the default model; 1.83 s with `small`), then the member's turn | Stop button only | Nothing, with local voices and local whisper | Smallest first version |
| Live cloud call (exists) | Yes, opt-in | Provider's realtime latency, not measured here | Yes (server detection on the OpenAI path) | Microphone audio, call context, agent answers; transcripts kept in the database | Keep as opt-in; fix transcripts (D1) |
| Local duplex | No | Needs streaming speech-to-text and speech | Needs detection on a live stream | Nothing | Later (V4) |

### 3.5 Interruptions

- V1: a press stops speech. The chat's stop button stops the member's turn ([code: openbot/docs/configuration.md:494]; the busy message names it: [code: openbot/app/src/lib/voice/session.ts:331-334]).
- Cloud call: barge-in is on (section 2.2).
- Hanging up does not undo work already started ([code: openbot/docs/configuration.md:494]). The plan keeps that rule.

### 3.6 Approval cards by voice

- Rule: a spoken "yes" never approves a send, a payment or any account action ([code: CLAUDE.md, "Rules that never bend"]).
- Today: no code connects a spoken answer to an approval card (section 2.2).
- V1: the call reads a short line about the card and handles no spoken yes or no.
- Open: decision D3.

### 3.7 Voice cloning: out

A real person's voice needs that person's consent. XTTS-v2 clones from a short clip ([doc: https://huggingface.co/coqui/XTTS-v2/blob/v2.0.1/README.md]). No version of this plan clones a voice.

## 4. Slices (one PR each)

| # | Builds | Tests that prove it | Needs first | Size |
|---|---|---|---|---|
| S1 | Read-aloud control, settings switch, text cleaning, local-voice filter. New `openbot/app/src/lib/voice/speech.ts`; touches `chat-transcript.tsx` | Unit: voice filter (`localService` only, Italian match), text cleaning, off by default. Component: stubbed `speechSynthesis`; nothing spoken without the switch | D2 | S |
| S2 | Push-to-talk turn: a state machine over the existing dictation hook; no server change | Unit: each state, and stop. Extend `openbot/scripts/freeduet-dictation-e2e.ts` to one full turn with a fake reply. Latency from proof 7a on the maintainer's computer | S1; D4; `FREEDUET_DICTATION=local` on the test stack | M |
| S3 | Call transcripts opt-in: off by default, no save without the setting, delete of a person's own sessions | Server: delete touches only own rows; `LOOPBACK_PEER` where a person is needed. App: no save with the setting off | D1 | M |
| S4 | Docs match the code: the roadmap row names the two cloud engines and local dictation | Docs review; no code | D6 | S |
| S5 | V2 local voice: `FREEDUET_TTS=local`, closed voice list with pinned SHA-256, service behind a profile, audio in memory only | Registry test (sizes and hashes equal the pinned values); fetch test like `fetch-model.test.ts`; route tests (size limit, `no-store`, 503 when off); CPU benchmark on the maintainer's computer. A new Dockerfile is added to `openbot/.github/published-images.json` | D2, D5 | L |
| S6 | V3 cloud voice with the person's own key | Route tests; no call without the key; privacy text checked | D1, S3 | M |

## 5. Rules that must hold

- **Logins first.** A metered voice is never first and never on by default. A cloud voice uses the person's own key and stays off ([code: CLAUDE.md, "Rules that never bend"]).
- **No subscription credential** is read, copied or forwarded. `VOICE_API_KEY` is an API key set by the operator, never a login.
- **No secrets and no personal data** in the repository. Tests use the FLEURS clips already in the eval cache.
- **Account actions keep the person's approval.** A voice never gives it (section 3.6).
- **No audio leaves the machine** unless the person turns on a cloud voice with their own key. Audio stays in memory.
- **Nothing recorded or kept** unless the person asks. The live call breaks this today (D1).
- **Change only what a slice asks.** Upstream files get a row in `docs/UPSTREAM_TOUCHES.md`. `chat-transcript.tsx` already has one ([code: docs/UPSTREAM_TOUCHES.md:133]).
- **Licences.** Third-party code and voices go in `NOTICE.md`. The CC BY sources named on the Kokoro card carry their own terms: read them before use [assumed].
- **Public wording.** The repository names no private project and no source of ideas ([code: CLAUDE.md, "Public wording"]).

## 6. Open decisions for the maintainer

| # | Decision | Options | Recommendation | Reason |
|---|---|---|---|---|
| D1 | Keep call transcripts? Today they are saved at call end and kept in the browser until saved | (a) keep as is; (b) opt-in, off by default; (c) delete after N days | (b) | Nothing is kept unless the person asks (section 5) |
| D2 | Engine for the first read-aloud | (a) browser voices, local only; (b) local neural voice on the server (Piper or Kokoro); (c) cloud voice with own key | (a) now; (b) after a benchmark and the licence check | (a) costs nothing, needs no install, writes no file |
| D3 | Can a spoken answer ever approve an action? | (a) never by voice; (b) spoken yes for low-risk items; (c) spoken phrase bound to the card on screen | (a) for every version in this plan | A spoken yes is not the person's written approval; (c) can be designed later |
| D4 | Which local speech-to-text model for calls | (a) default `large-v3-turbo-q5_0`: WER 2.8%, median 9.78 s; (b) `small`: WER 7.9%, 1.83 s; (c) measure both on call-like clips first | (c), then choose | 9.78 s per request is slow for a conversation; `small` makes more errors. The figures come from read speech |
| D5 | Licences of voices and tools | (a) only MIT or Apache-2.0 code and voices with clear licences; (b) a GPL component as a separate program the person installs; (c) CC BY voices with attribution | (a) and (c); no GPL component in the image | A copyleft component in an MIT product needs a licence review [assumed] |
| D6 | Status of the existing cloud call in the roadmap and docs | (a) describe the two cloud engines, off by default; (b) hide until the design is chosen; (c) remove one engine | (a) | The code works behind `VOICE_*`; the roadmap says "not chosen yet" |

## 7. What was not verified

- Piper's Italian voice licence and dataset: the model card of `it_IT-riccardo-x_low` was not reached.
- Kokoro's per-voice data licence, and whether sherpa-onnx's Kokoro path needs espeak-ng data (the sherpa page does not say).
- File sizes of Kokoro, XTTS-v2 and MeloTTS, and speed on any CPU of this project. Nothing was installed or run.
- Whether whisper deletes converted audio in `/tmp`, and the whisper image size.
- Where Chrome's default recognition runs, and what text the Google voices send. The Readium page says the Chrome Desktop voices need online access ([doc: https://readium.org/speech/docs/WebSpeech.html]); no source here says where recognition runs.
- `localService` in a real browser. MDN and the Readium page describe it differently; this plan uses MDN.
- Whether a pending approval counts as a running turn in the busy check ([code: openbot/app/src/components/channels/channel-chat.tsx:1421-1428]).
- Local full-duplex speech models: not surveyed.
- Firefox 160 recognition support: taken from the feature page, not tested.
- Three licence statements come from secondary pages, not the project's own licence file: Piper's MIT code licence and sherpa-onnx's Apache-2.0 (both from an aggregator page), and XTTS-v2's Coqui Public Model License (read from the XTTS-v1 repository). Read each project's licence file before use.
