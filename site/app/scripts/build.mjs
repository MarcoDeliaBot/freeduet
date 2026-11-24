// Builds the new design for every language that is translated. Run it from site/app:  npm run build
//
//   1. the browser bundle (React 19, framer-motion, Tailwind 4) -> site/assets/app-<hash>.js and app-<hash>.css,
//      one pair shared by every language page, cached across them;
//   2. the server bundle (temporary, site/app/.ssr/) -> renderToString of the page for each language;
//   3. site/index.html (English) and site/<code>/index.html for every language in site/src/site.json whose
//      src/i18n/<code>.json has no "_untranslated" marker. The page holds the prerendered markup, the head of its
//      language (title, description, canonical, hreflang set, Open Graph, Twitter, two JSON-LD blocks) and its
//      dictionary as JSON; the browser bundle hydrates it.
//
// A language that is still marked "_untranslated" is not written here: python3 site/tools/build.py writes its
// page in the old design. A language is in exactly one of the two builds.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.resolve(APP, "..");
const ASSETS = path.join(SITE_DIR, "assets");
const SSR_DIR = path.join(APP, ".ssr");
const I18N = path.join(APP, "src", "i18n");
const SITE = JSON.parse(fs.readFileSync(path.join(SITE_DIR, "src", "site.json"), "utf-8"));
const GITHUB = "https://github.com/MarcoDeliaBot/freeduet";
const alias = { "@": path.join(APP, "src") };

// ---- 1. browser bundle -------------------------------------------------------------------------------------
fs.rmSync(ASSETS, { recursive: true, force: true });
await build({
  root: APP,
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias },
  build: {
    outDir: ASSETS,
    emptyOutDir: true,
    manifest: true,
    target: "es2020",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: path.join(APP, "src", "entry-client.tsx"),
      output: { entryFileNames: "app-[hash].js", chunkFileNames: "app-[hash].js", assetFileNames: "app-[hash][extname]" },
    },
  },
});
const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, ".vite", "manifest.json"), "utf-8"));
const entry = Object.values(manifest).find((m) => m.isEntry);
const JS = "/assets/" + entry.file;
// with cssCodeSplit off the one stylesheet is listed as an asset of its own, not under the entry
const cssFile = entry.css?.[0] ?? Object.values(manifest).find((m) => m.file.endsWith(".css")).file;
const CSS = "/assets/" + cssFile;
fs.rmSync(path.join(ASSETS, ".vite"), { recursive: true, force: true });

// ---- 2. server bundle --------------------------------------------------------------------------------------
fs.rmSync(SSR_DIR, { recursive: true, force: true });
await build({
  root: APP,
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  plugins: [react()],
  resolve: { alias },
  build: { ssr: path.join(APP, "src", "entry-server.tsx"), outDir: SSR_DIR, emptyOutDir: true, target: "node20" },
});
const server = await import(pathToFileURL(path.join(SSR_DIR, "entry-server.js")).href);

// ---- 3. one page per translated language -------------------------------------------------------------------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const ld = (o) => JSON.stringify(o, null, 1).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const pageUrl = (code) => SITE.origin + (code === SITE.default ? "/" : `/${code}/`);
const codes = SITE.languages.map((l) => l.code);
const template = fs.readFileSync(path.join(APP, "index.html"), "utf-8");

function head(code, meta) {
  const url = pageUrl(code);
  const image = SITE.origin + "/og-image.png";
  const locale = SITE.languages.find((l) => l.code === code).locale;
  const alternates =
    codes.map((c) => `<link rel="alternate" hreflang="${c}" href="${pageUrl(c)}">`).join("\n    ") +
    `\n    <link rel="alternate" hreflang="x-default" href="${pageUrl(SITE.default)}">`;
  const locales = SITE.languages
    .filter((l) => l.code !== code)
    .map((l) => `<meta property="og:locale:alternate" content="${l.locale}">`)
    .join("\n    ");
  const app = ld({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FreeDuet",
    description: meta.desc,
    inLanguage: code,
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
    inLanguage: code,
    mainEntity: meta.faq.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  });
  return `<title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.desc)}">
    <link rel="canonical" href="${url}">
    ${alternates}
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <meta property="og:title" content="${esc(meta.title)}">
    <meta property="og:description" content="${esc(meta.ogDesc)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:site_name" content="FreeDuet">
    <meta property="og:locale" content="${locale}">
    ${locales}
    <meta property="og:image" content="${image}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(meta.ogAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(meta.title)}">
    <meta name="twitter:description" content="${esc(meta.ogDesc)}">
    <meta name="twitter:image" content="${image}">
    <meta name="twitter:image:alt" content="${esc(meta.ogAlt)}">
    <script type="application/ld+json">
${app}
    </script>
    <script type="application/ld+json">
${faq}
    </script>
    <link rel="stylesheet" href="${CSS}">
    <noscript><style>[style*="opacity:0"]{opacity:1!important;transform:none!important}</style></noscript>`;
}

const written = [];
for (const lang of SITE.languages) {
  const code = lang.code;
  const dict = JSON.parse(fs.readFileSync(path.join(I18N, `${code}.json`), "utf-8"));
  if (dict._untranslated) continue;
  delete dict._untranslated;
  const meta = server.pageMeta(dict);
  const markup = server.renderPage(code, dict);
  const data = JSON.stringify({ lang: code, dict }).replace(/</g, "\\u003c");
  const html = template
    .replace(/\s*<meta name="robots" content="noindex" data-template \/>/, "")
    .replace('<html lang="en">', `<html lang="${code}" dir="${lang.dir || "ltr"}">`)
    .replace("<!--freeduet-head-->", head(code, meta))
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>\n    <script type="application/json" id="fd-i18n">${data}</script>`)
    .replace('<script type="module" src="/src/entry-client.tsx"></script>', `<script type="module" src="${JS}"></script>`);
  const file = path.join(SITE_DIR, code === SITE.default ? "index.html" : `${code}/index.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  written.push(`${path.relative(SITE_DIR, file).padEnd(16)} ${String(Buffer.byteLength(html)).padStart(8)} bytes`);
}
fs.rmSync(SSR_DIR, { recursive: true, force: true });
console.log(`assets: ${JS} ${CSS}`);
console.log(written.join("\n"));
