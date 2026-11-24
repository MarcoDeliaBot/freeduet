import { renderToString } from "react-dom/server";
import Root from "./Root";
import { format, stripMarks } from "./i18n";
import type { Dict } from "./i18n";
import { FAQ_COUNT } from "./data/freeduetData";

/** The markup of one language page (what #root holds before hydration). Used by scripts/build.mjs only. */
export function renderPage(lang: string, dict: Dict): string {
  return renderToString(<Root lang={lang} dict={dict} />);
}

/** What the head of the page needs, in the page language. */
export function pageMeta(dict: Dict) {
  return {
    title: stripMarks(format(dict, "meta.title")),
    desc: stripMarks(format(dict, "meta.desc")),
    ogDesc: stripMarks(format(dict, "meta.ogdesc")),
    ogAlt: stripMarks(format(dict, "meta.ogalt")),
    faq: Array.from({ length: FAQ_COUNT }, (_, i) => ({
      q: stripMarks(format(dict, `faq.q${i + 1}`)),
      a: stripMarks(format(dict, `faq.a${i + 1}`)),
    })),
  };
}
