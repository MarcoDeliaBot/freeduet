import { englishT } from "@/freeduet/i18n/provider";
import type { ConnectVoice, VoiceEvent } from "./types";

/** WebRTC owns audio buffering and interruption truncation; the data channel carries controls. */
export const connectWebRtc: ConnectVoice = async ({
  channelId,
  signal,
  onEvent,
  onError,
  onOutput,
  t = englishT,
}) => {
  if (typeof RTCPeerConnection === "undefined")
    throw new Error(t("voice.webrtc.unsupported"));
  signal.throwIfAborted();
  let stream: MediaStream | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let audio: HTMLAudioElement | undefined;
  let closed = false;
  const ready = Promise.withResolvers<void>();
  // Permission and SDP negotiation can fail before the ready promise is awaited.
  void ready.promise.catch(() => undefined);
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", abort);
    ready.reject(new DOMException("Call ended", "AbortError"));
    channel?.close();
    peer?.close();
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
  };
  const fail = (message: string) => {
    if (closed) return;
    ready.reject(new Error(message));
    close();
    onError(new Error(message));
  };
  const abort = () => close();
  signal.addEventListener("abort", abort, { once: true });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    // A permission dialog can resolve after hangup; its newly granted tracks still need releasing.
    if (closed || signal.aborted) {
      for (const track of stream.getTracks()) track.stop();
      throw new DOMException("Call ended", "AbortError");
    }
    peer = new RTCPeerConnection();
    audio = new Audio();
    audio.autoplay = true;
    const player = audio;
    peer.ontrack = ({ track, streams }) => {
      if (closed) return;
      const output = streams[0] ?? new MediaStream([track]);
      player.srcObject = output;
      onOutput(output);
      void player.play().catch(() => fail(t("voice.webrtc.playback")));
    };
    peer.onconnectionstatechange = () => {
      if (
        peer?.connectionState === "failed" ||
        peer?.connectionState === "disconnected"
      ) {
        fail(t("voice.webrtc.lost"));
      }
    };
    for (const track of stream.getAudioTracks()) {
      peer.addTrack(track, stream);
      track.onended = () => fail(t("voice.webrtc.micGone"));
    }
    channel = peer.createDataChannel("oai-events");
    channel.onopen = () => ready.resolve();
    channel.onerror = () => fail(t("voice.webrtc.channelFailed"));
    channel.onclose = () => fail(t("voice.webrtc.ended"));
    channel.onmessage = ({ data }) => {
      if (closed) return;
      try {
        const event: unknown = JSON.parse(data);
        if (
          event &&
          typeof event === "object" &&
          "type" in event &&
          typeof event.type === "string"
        ) {
          onEvent(event as VoiceEvent);
        }
      } catch {
        fail(t("voice.webrtc.unreadable"));
      }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch("/api/voice/calls", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-openbot-voice": "1" },
      body: JSON.stringify({ channelId, sdp: offer.sdp }),
      signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(
        body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
          ? body.error
          : t("voice.webrtc.connectFailed"),
      );
    }
    if (closed) throw new DOMException("Call ended", "AbortError");
    const answer: unknown = await response.json();
    if (
      !answer ||
      typeof answer !== "object" ||
      !("transport" in answer) ||
      answer.transport !== "webrtc" ||
      !("sdp" in answer) ||
      typeof answer.sdp !== "string"
    ) {
      throw new Error(t("voice.webrtc.invalid"));
    }
    await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    await ready.promise;
    signal.throwIfAborted();
    const events = channel;
    const microphone = stream;
    return {
      stream,
      send(event) {
        if (closed || events.readyState !== "open")
          throw new Error(t("voice.webrtc.notConnected"));
        events.send(JSON.stringify(event));
      },
      mute(muted) {
        for (const track of microphone.getAudioTracks()) track.enabled = !muted;
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
};
