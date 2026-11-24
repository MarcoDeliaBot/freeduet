import App from "./App";
import { I18nProvider } from "./i18n";
import type { Dict } from "./i18n";
import SITE from "../../src/site.json";

/** The page of one language: the dictionary and the weekday letters of site.json, around the same App. */
export default function Root({ lang, dict }: { lang: string; dict: Dict }) {
  const entry = SITE.languages.find((l) => l.code === lang);
  if (!entry) throw new Error(`language ${lang} is not in site/src/site.json`);
  return (
    <I18nProvider lang={lang} dict={dict} week={entry.week}>
      <App />
    </I18nProvider>
  );
}
