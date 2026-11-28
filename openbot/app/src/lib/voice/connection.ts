import { englishT } from "@/freeduet/i18n/provider";
import type { ConnectVoice } from "./types";
import { connectWebRtc } from "./webrtc";
import { connectWebSocket } from "./websocket";

export function voiceSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export const connectVoice: ConnectVoice = async (options) => {
  const t = options.t ?? englishT;
  if (!voiceSupported()) throw new Error(t("voice.connection.unsupported"));
  const response = await fetch("/api/voice/config", {
    credentials: "include",
    signal: options.signal,
  });
  if (!response.ok) throw new Error(t("voice.connection.unavailable"));
  const config: unknown = await response.json();
  if (config && typeof config === "object" && "transport" in config) {
    if (config.transport === "webrtc") return connectWebRtc(options);
    if (config.transport === "websocket") return connectWebSocket(options);
  }
  throw new Error(t("voice.connection.transport"));
};
