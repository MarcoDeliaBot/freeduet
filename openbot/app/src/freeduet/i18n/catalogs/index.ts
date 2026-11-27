import type { AppLanguageCode } from "../languages";
import type { Catalog } from "../translate";
import { EN } from "./en";
import { it } from "./it";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";
import { pt } from "./pt";
import { pl } from "./pl";
import { tr } from "./tr";
import { ru } from "./ru";
import { zh } from "./zh";
import { ja } from "./ja";
import { ko } from "./ko";

export { EN as SOURCE };
export type { MessageId } from "./en";

/** Every language other than English has a catalogue; English is `SOURCE`. */
export const CATALOGS: Partial<Record<AppLanguageCode, Catalog<typeof EN>>> = {
  it,
  es,
  fr,
  de,
  pt,
  pl,
  tr,
  ru,
  zh,
  ja,
  ko,
};
