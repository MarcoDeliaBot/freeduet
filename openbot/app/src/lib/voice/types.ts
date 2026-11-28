/** Normalized realtime controls shared by provider transports. Audio never goes through AG-UI. */
import type { T } from "@/freeduet/i18n/provider";

export type VoiceEvent = Record<string, unknown> & { type: string };

export interface VoiceConnection {
  stream: MediaStream;
  send(event: VoiceEvent): void;
  mute(muted: boolean): void;
  close(): void;
}

export type ConnectVoice = (options: {
  channelId: string;
  signal: AbortSignal;
  onEvent(event: VoiceEvent): void;
  onError(error: Error): void;
  onOutput(stream: MediaStream): void;
  /** The app's translator for what the transport says to the person (D181). English when none is given. */
  t?: T;
}) => Promise<VoiceConnection>;
