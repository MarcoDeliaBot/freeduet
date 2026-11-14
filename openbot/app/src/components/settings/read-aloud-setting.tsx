import { useState } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  installedVoices,
  pickVoice,
  setReadAloudEnabled,
  useReadAloudEnabled,
} from "@/lib/voice/speech";

/**
 * The read-aloud switch in Settings (docs/design/voice.md, S1). It is kept in this browser and is
 * off until it is turned on. It does not turn on without a local Italian voice to read with: then it
 * says so and stays off.
 */
export function ReadAloudSetting() {
  const enabled = useReadAloudEnabled();
  const [note, setNote] = useState<string | null>(null);
  return (
    <Item>
      <ItemContent>
        <ItemTitle>Read replies aloud</ItemTitle>
        <ItemDescription>
          {note ??
            "Adds a Read aloud button under each Bot reply. It uses a voice on this computer only, and nothing is sent elsewhere."}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label="Read replies aloud"
          checked={enabled}
          onCheckedChange={(on) => {
            if (on && !pickVoice(installedVoices())) {
              setNote(
                "No local Italian voice on this computer, so replies cannot be read aloud here.",
              );
              return;
            }
            setNote(null);
            setReadAloudEnabled(on);
          }}
        />
      </ItemActions>
    </Item>
  );
}
