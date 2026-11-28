import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/freeduet/i18n/provider";
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
  // The words the composer shows follow the app language (D181), read at the time each one is shown.
  const t = useT();
  const translate = useRef(t);
  translate.current = t;
  const [session] = useState(
    () =>
      new DictationSession({
        record: (onError) => startRecording(onError, translate.current),
        transcribe: (audio, signal) =>
          transcribeRecording(audio, signal, translate.current),
        onTranscript: (text, intent) => onTranscriptRef.current(text, intent),
        t: (id, params) => translate.current(id, params),
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
