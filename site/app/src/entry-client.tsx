import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import Root from "./Root";
import type { Dict } from "./i18n";

// Every built page carries its own language and dictionary as JSON (script#fd-i18n) and its prerendered markup in
// #root: the page is hydrated, not drawn again. The dev server (npm run dev) has no such page and draws English.
const container = document.getElementById("root")!;
const data = document.getElementById("fd-i18n");

if (data?.textContent) {
  const { lang, dict } = JSON.parse(data.textContent) as { lang: string; dict: Dict };
  hydrateRoot(
    container,
    <StrictMode>
      <Root lang={lang} dict={dict} />
    </StrictMode>,
  );
} else if (import.meta.env.DEV) {
  import("./i18n/en.json").then(({ default: dict }) => {
    createRoot(container).render(
      <StrictMode>
        <Root lang="en" dict={dict as Dict} />
      </StrictMode>,
    );
  });
}
