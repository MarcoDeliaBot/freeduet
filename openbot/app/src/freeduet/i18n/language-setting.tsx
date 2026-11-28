import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LANGUAGES, isAppLanguageChoice } from "./languages";
import { useAppLanguage } from "./provider";

/**
 * Settings → Preferences → Language (D181): the language of the app's own words. "Automatic" follows
 * the browser; each language is named in its own language so a person who cannot read the current one
 * still finds theirs. A choice applies at once, with no reload.
 */
export function AppLanguageSetting() {
  const { t, choice, setChoice } = useAppLanguage();
  const items: Record<string, string> = {
    auto: t("language.auto"),
    ...Object.fromEntries(APP_LANGUAGES.map((l) => [l.code, l.name])),
  };
  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{t("language.title")}</ItemTitle>
        <ItemDescription>{t("language.description")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Select
          items={items}
          onValueChange={(value) => {
            if (isAppLanguageChoice(value)) setChoice(value);
          }}
          value={choice}
        >
          <SelectTrigger aria-label={t("language.title")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{items.auto}</SelectItem>
            {APP_LANGUAGES.map((language) => (
              <SelectItem key={language.code} value={language.code}>
                {language.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ItemActions>
    </Item>
  );
}
