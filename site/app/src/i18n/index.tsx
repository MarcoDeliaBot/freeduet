import { createContext, Fragment, useContext, useMemo } from "react";
import type { ReactNode } from "react";

// Flat dictionary: one key per visible string. See README.md in this folder for the keys' rules.
export type Dict = Record<string, string>;
export type Vars = Record<string, string | number>;
export type RichWrap = Partial<Record<"strong" | "em" | "accent", (children: ReactNode, key: number) => ReactNode>>;

interface I18nValue {
  lang: string;
  dict: Dict;
  week: string[];
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  lang,
  dict,
  week,
  children,
}: {
  lang: string;
  dict: Dict;
  week: string[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ lang, dict, week }), [lang, dict, week]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Fills {name} placeholders. A missing key or placeholder throws: the build and the browser must never show a hole. */
export function format(dict: Dict, key: string, vars?: Vars): string {
  const raw = dict[key];
  if (raw === undefined) throw new Error(`i18n: missing key "${key}"`);
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => {
    if (!vars || !(name in vars)) throw new Error(`i18n: key "${key}" needs {${name}}`);
    return String(vars[name]);
  });
}

/** The text without the inline marks (**strong**, *emphasis*, ==accent==): for <title>, JSON-LD and aria text. */
export function stripMarks(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/==([^=]+)==/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

const MARKS = /(\*\*[^*]+\*\*|==[^=]+==|\*[^*]+\*)/;

export function richNodes(text: string, wrap: RichWrap = {}): ReactNode[] {
  return text.split(MARKS).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      return wrap.strong ? wrap.strong(inner, i) : <strong key={i}>{inner}</strong>;
    }
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
      const inner = part.slice(2, -2);
      return wrap.accent ? wrap.accent(inner, i) : <span key={i} className="accent-text">{inner}</span>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const inner = part.slice(1, -1);
      return wrap.em ? wrap.em(inner, i) : <em key={i}>{inner}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("i18n: no provider");
  const { dict, lang, week } = ctx;
  return {
    lang,
    week,
    /** Plain text with {placeholders} filled. */
    t: (key: string, vars?: Vars) => format(dict, key, vars),
    /** Text with the inline marks turned into elements. */
    rich: (key: string, vars?: Vars, wrap?: RichWrap) => richNodes(format(dict, key, vars), wrap),
  };
}
