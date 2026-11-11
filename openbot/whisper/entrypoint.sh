#!/bin/sh
# Download and check the model, then become the server (docs/M1_PLAN.md D25).
#
# Every option below was read from examples/server/server.cpp at whisper.cpp v1.9.5:
#   --inference-path  the route the POST is served on (server.cpp:255, :826). The OpenAI path, so the
#                     adapter's `${TRANSCRIPTION_BASE_URL}/audio/transcriptions` lands on it.
#   --convert         every upload goes through ffmpeg to 16 kHz mono WAV first (:256, :851-:878),
#                     which is what lets the browser's WebM/Opus and MP4/AAC be read. Without it the
#                     server decodes only what miniaudio does: WAV, FLAC, MP3 and Vorbis
#                     (examples/common-whisper.cpp:14-26, :166-:170).
#   --tmp-dir /tmp    where those converted files are written (:257); the container's tmpfs.
#   --language auto   the server's default language is English (:113); this makes it detect the
#                     language, and a `language` field in a request still overrides it (:558).
#   --suppress-nst    no non-speech tokens such as "[", "(" or music notes (:246, whisper.cpp
#                     src/whisper.cpp:6439), so silence does not come back as "[BLANK_AUDIO]".
#   --no-speech-thold 0.6 is the server's own default, written out so a change is a diff: a segment
#                     is dropped only when the no-speech probability is above it AND the average
#                     log probability is below -1.0 (src/whisper.cpp:7780).
# VAD stays off, which is the server's default (:123): on speech with long pauses it can cut out the
# speech itself.
# Threads and decoding: WHISPER_THREADS (default from the machine, threads.sh) and WHISPER_BEAM_SIZE
# (empty: the server's own greedy decoding; --beam-size at server.cpp:218, strategy at :927).
set -eu

. /app/whisper/threads.sh
THREADS="$(whisper_threads "$(nproc)" "${WHISPER_THREADS:-}")"
BEAM="$(whisper_beam_args "${WHISPER_BEAM_SIZE:-}")"
echo "whisper: $THREADS threads, ${BEAM:-greedy decoding}" >&2

MODEL_FILE="$(bun /app/whisper/fetch-model.ts)"

exec whisper-server \
  --model "$MODEL_FILE" \
  --threads "$THREADS" \
  $BEAM \
  --host 0.0.0.0 \
  --port 4240 \
  --inference-path /v1/audio/transcriptions \
  --convert \
  --tmp-dir /tmp \
  --language auto \
  --suppress-nst \
  --no-speech-thold 0.6
