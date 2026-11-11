# whisper: a local speech-to-text service for dictation (docs/M1_PLAN.md D25).
# Build context is openbot/, like the other images:
#   docker build -f whisper/Dockerfile openbot
#
# whisper.cpp, built from source at a pinned release on the CPU, with ffmpeg so the browser's WebM
# and MP4 recordings are read as well as WAV. It serves the OpenAI-shaped path, so the dictation
# adapter in the API server talks to it unchanged: base URL http://127.0.0.1:4240/v1.
#
# No model is baked in. fetch-model.ts downloads the one FREEDUET_WHISPER_MODEL names into the
# /models volume on first start, over https from its official repository, and refuses a file whose
# SHA-256 is not the one pinned in shared/whisper-models.ts.
#
# Built on the machine that runs it: whisper.cpp compiles for the CPU it is built on
# (GGML_NATIVE), so an image built here is not meant to be copied to a different processor.

FROM oven/bun:1.4.3 AS build

# A release tag, AND the commit it must point at. The build stops if they ever disagree, so a moved
# tag cannot change what is compiled. v1.9.5 is the release whose examples/server/server.cpp the
# options in entrypoint.sh were read from (docs/M1_PLAN.md D25).
ARG WHISPER_CPP_TAG=v1.9.5
ARG WHISPER_CPP_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "${WHISPER_CPP_TAG}" https://github.com/ggml-org/whisper.cpp.git . \
  && test "$(git rev-parse HEAD)" = "${WHISPER_CPP_COMMIT}"
# Static libraries, so the binary is one file. Only the server is built.
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
  && cmake --build build --target whisper-server -j "$(nproc)"


FROM oven/bun:1.4.3 AS runtime

# ffmpeg for `--convert`; libgomp1 is the OpenMP runtime the CPU build links.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
# Fails the build, here, if the binary or ffmpeg cannot start with the libraries this image has.
RUN whisper-server --help >/dev/null 2>&1 && ffmpeg -version >/dev/null

# Not root. /models is created here, owned by that user, so the named volume mounted on it starts
# with the same owner.
RUN groupadd --system --gid 10002 whisper \
  && useradd --system --uid 10002 --gid whisper --no-create-home whisper \
  && mkdir -p /models /app/whisper /app/shared \
  && chown whisper:whisper /models

WORKDIR /app
COPY whisper/fetch-model.ts whisper/entrypoint.sh /app/whisper/
# The same table the API server checks FREEDUET_WHISPER_MODEL against, at the path fetch-model.ts
# imports it from.
COPY shared/whisper-models.ts /app/shared/whisper-models.ts
RUN chmod 755 /app/whisper/entrypoint.sh

USER whisper
ENV WHISPER_MODEL_DIR=/models
VOLUME ["/models"]
EXPOSE 4240
ENTRYPOINT ["/app/whisper/entrypoint.sh"]
