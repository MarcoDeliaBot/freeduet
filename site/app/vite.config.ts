import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { FAQ_ITEMS } from "./src/data/freeduetData";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built page is site/index.html (the English home page). The other eleven language pages are still built by
// site/tools/build.py until stage 2, from site/src. The one list of languages is site/src/site.json.
const SITE = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/site.json"), "utf-8"));
const ORIGIN: string = SITE.origin;
const pageUrl = (code: string) => ORIGIN + (code === SITE.default ? "/" : `/${code}/`);

const TITLE = "FreeDuet — Your own team of AI assistants";
const DESC =
  "FreeDuet is a free, open-source team of AI assistants that runs on your own computer and your own AI subscription. By default they ask before they send, pay, sign, book or delete.";
const OG_DESC =
  "A free, open-source team of AI assistants. By default they ask before they send, pay, sign, book or delete.";
const OG_ALT = "FreeDuet logo with the words: Your own team of AI assistants";
const GITHUB = "https://github.com/MarcoDeliaBot/freeduet";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const ld = (o: unknown) =>
  JSON.stringify(o, null, 1).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

function head(): string {
  const url = pageUrl(SITE.default);
  const image = ORIGIN + "/og-image.png";
  const codes: string[] = SITE.languages.map((l: { code: string }) => l.code);
  const alternates =
    codes.map((c) => `<link rel="alternate" hreflang="${c}" href="${pageUrl(c)}">`).join("\n    ") +
    `\n    <link rel="alternate" hreflang="x-default" href="${url}">`;
  const locale = SITE.languages.find((l: { code: string }) => l.code === SITE.default).locale;
  const locales = SITE.languages
    .filter((l: { code: string }) => l.code !== SITE.default)
    .map((l: { locale: string }) => `<meta property="og:locale:alternate" content="${l.locale}">`)
    .join("\n    ");
  const app = ld({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FreeDuet",
    description: DESC,
    inLanguage: SITE.default,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: "https://opensource.org/license/mit",
    url,
    codeRepository: GITHUB,
  });
  const faq = ld({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: SITE.default,
    mainEntity: FAQ_ITEMS.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  });
  return `<title>${esc(TITLE)}</title>
    <meta name="description" content="${esc(DESC)}">
    <link rel="canonical" href="${url}">
    ${alternates}
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta property="og:title" content="${esc(TITLE)}">
    <meta property="og:description" content="${esc(OG_DESC)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="FreeDuet">
    <meta property="og:locale" content="${locale}">
    ${locales}
    <meta property="og:image" content="${image}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(OG_ALT)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(TITLE)}">
    <meta name="twitter:description" content="${esc(OG_DESC)}">
    <meta name="twitter:image" content="${image}">
    <meta name="twitter:image:alt" content="${esc(OG_ALT)}">
    <script type="application/ld+json">
${app}
    </script>
    <script type="application/ld+json">
${faq}
    </script>`;
}

// What a reader sees with scripts off (and what a crawler that runs none reads): the headline, the lead and the FAQ.
function noscript(): string {
  const faq = FAQ_ITEMS.map((i) => `<h3>${esc(i.q)}</h3><p>${esc(i.a)}</p>`).join("");
  return `<noscript>
      <main style="max-width:44rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;line-height:1.55">
        <h1>FreeDuet: your own team of AI assistants</h1>
        <p>${esc(DESC)}</p>
        <p><a href="${GITHUB}">FreeDuet on GitHub</a> · <a href="${GITHUB}#quick-start">Quick start</a> · <a href="${GITHUB}/blob/main/docs/ROADMAP.md">Roadmap</a></p>
        <h2>Questions people ask first</h2>
        ${faq}
        <p>This page needs JavaScript for its animated demo. The same text is on GitHub.</p>
      </main>
    </noscript>`;
}

function freeduetHead(): Plugin {
  return {
    name: "freeduet-head",
    transformIndexHtml: (html) =>
      html
        // site/app/index.html is also served as /app/ (Pages publishes the whole folder): it says noindex there, and
        // the built page must not.
        .replace(/\s*<meta name="robots" content="noindex" data-template \/>/, "")
        .replace("<!--freeduet-head-->", head())
        .replace("<!--freeduet-noscript-->", noscript()),
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), freeduetHead()],
  // The icons, og-image and the rest of site/ are served from the site root, so nothing is copied from here.
  publicDir: false,
  build: {
    // The English home page is written straight to site/index.html.
    outDir: "..",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
