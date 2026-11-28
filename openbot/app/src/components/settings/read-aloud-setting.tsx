import { useState } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage } from "@/freeduet/i18n/provider";
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
  const { t } = useAppLanguage();
  const [note, setNote] = useState<MessageId | null>(null);
  return (
    <Item>
      <ItemContent>
        <ItemTitle>{t("settings.readAloudTitle")}</ItemTitle>
        <ItemDescription>
          {t(note ?? "settings.readAloudDescription")}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={t("settings.readAloudTitle")}
          checked={enabled}
          onCheckedChange={(on) => {
            if (on && !pickVoice(installedVoices())) {
              setNote("settings.noItalianVoice");
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
