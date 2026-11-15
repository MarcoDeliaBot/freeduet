import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import {
  recordingSupported,
  startRecording,
  transcribeRecording,
} from "@/lib/dictation/recording";
import {
  type DictationIntent,
  DictationSession,
} from "@/lib/dictation/session";
import { queryClient } from "@/query-client";

export function useDictation(
  onTranscript: (text: string, intent: DictationIntent) => void,
  disabled: boolean,
) {
  const { data } = useQuery(
    { ...deploymentCapabilitiesQueryOptions(), enabled: !disabled },
    queryClient,
  );
  // A remote session is refused the transcription (server/src/auth/remote-limits.ts), so it is not offered the microphone.
  const { data: user } = useCurrentUser();
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const [session] = useState(
    () =>
      new DictationSession({
        record: startRecording,
        transcribe: transcribeRecording,
        onTranscript: (text, intent) => onTranscriptRef.current(text, intent),
      }),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const available = data?.transcription === true && user?.remote !== true;
  useEffect(() => {
    if (disabled || !available) session.cancel();
    return () => session.cancel();
  }, [disabled, available, session]);
  return {
    session,
    state,
    available,
    supported: recordingSupported(),
    busy: state.phase !== "idle",
  };
}
