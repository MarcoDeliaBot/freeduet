# freeduet.com

The public website: one static page, built once per language, twelve URLs.

| Language | URL |
|---|---|
| English (and `x-default`) | `https://freeduet.com/` |
| it, es, fr, de, pt, pl, tr, ru, zh, ja, ko | `https://freeduet.com/<code>/` |

- `index.html` and `<code>/index.html` are the built pages. They are what gets served; nothing else is needed at run time. Never edit them by hand.
- `src/` holds the parts: `body.html` (the structure; its text is a placeholder, every page shows its own `lang/*.json`), `style.css`, `app.js` (the demo and the enhancements), `src/lang/*.json` (one file per language), `site.json` (the one list of languages: code, name, locale, weekday letters, plus origin and `lastmod`) and `members.json` (the team).
- Build: `python3 site/tools/build.py`. It writes the twelve pages and `sitemap.xml`. The old form `python3 site/tools/build.py site/src site/index.html` still works. Committed output must equal a fresh build.
- Check: `node site/tools/checklang.js`. It compares every language file with English, then runs `tools/checkpages.py`, which fails on a missing or stale page, a missing reciprocal hreflang or self canonical, a number of H1 other than one, a skipped heading level, an untranslated `data-i` key, a title that is not brand plus H1 words, JSON-LD that does not parse or a FAQ that differs from the visible one, a sitemap that disagrees with the pages, and a language folder that is not in `site.json`. Both read the same `site.json` as the build. Both need only Node and Python 3, no packages.
- To add a language: add `src/lang/<code>.json`, add its entry to `site.json`, build, check.

## One page per language

- Each page has its own `<html lang>`, title, description, Open Graph and Twitter text, `og:locale`, a canonical link to itself, and the full set of `hreflang` alternates (all twelve plus `x-default`, which is English). The set is the same on every page.
- The visible text, the team cards, the side list, the demo chips and first demo state, and the weekday letters are written into the HTML at build time, in the page language. `app.js` only enhances them: it does not rebuild them and it does not translate.
- The JSON-LD (`SoftwareApplication` and `FAQPage`) is in the page language, with `inLanguage`, and the FAQ equals the visible FAQ.
- The language control is a list of real links (`<details>` with `<a hreflang>`), so it works without JavaScript. The page language comes from the path only. A language saved in the browser (`fd-lang`, set when someone picks a language) is a gentle hint: a dot on the control and a marked entry. The page never redirects because of it or because of `navigator.language`, so search engines and people always get the URL they asked for. A `#section` in the address is kept when switching.
- URLs end with a slash. On Cloudflare Pages `folder/index.html` is served at `folder/`, and `/folder` and `/folder/index.html` redirect to it, so the canonical, hreflang and sitemap URLs use the slash form. Assets use root-absolute paths.
- Texts that exist only in English, on every page: the words "API key" in one place of the page text, the two shell comments in the install snippet (`# sign in once with your own Claude plan:` and `# then open http://localhost:3010`), the three navigation `aria-label`s (`Language`, `Sections`, `Links`), the Open Graph and Twitter image alt text (`OG_ALT` in `build.py`), and the Open Graph image itself. Names, commands and URLs are neutral. `checkpages.py` keeps the allow-lists (`ENGLISH_ONLY_TEXT`, `ENGLISH_ONLY_ATTRS`, `NEUTRAL_TEXT`); a new English-only string fails the check until it is listed there.

Hosting: Cloudflare Pages, output directory `site`, no build command.

Every claim on the page must match the README of this repository. What is planned is labelled as planned.

## Motion and spacing

Everything is plain CSS and JavaScript in `src/`; there are no external scripts, icon sets or extra fonts (Schibsted Grotesk now also loads weight 500).

- Spacing is set by tokens at the top of `style.css`: `--sec` (air above and below a section), `--head-gap`, `--gut`, `--wrap` (80rem).
- `class="rv"` on an element reveals it once when it scrolls into view (opacity, translate, blur). `rv-panel` is the larger, slower variant. `data-d="420"` sets a fixed delay in ms; without it, elements that enter together are staggered. New sections should mark their blocks the same way.
- `class="wd"` on a heading reveals it word by word. `app.js` cuts the words (`Intl.Segmenter`, so Chinese and Japanese work) once at load, and again when reduced motion changes. Without `Intl.Segmenter` Chinese and Japanese headings appear whole.
- `data-par="lag:.1"` / `data-par="rise:.12"` give a layer a light parallax. The floating capsule navigation is `.top`.
- Nothing stays hidden if JavaScript or `IntersectionObserver` is missing (the page marks itself `js` in the head, and a 3 s failsafe adds `no-rv`). With `prefers-reduced-motion` there is no drift, parallax, blur or travel, only a 0.4 s fade.

## Search, sharing and icons

Cloudflare Pages publishes the whole `site/` folder, so every file here is served from the root of freeduet.com.

- `build.py` writes the `<head>` of each page. The title and the description are the page language's `title` and `desc` keys; the title is the brand plus the words of the H1. The canonical link, hreflang set, Open Graph, Twitter tags, icons and `theme-color` come from the script and `site.json`.
- Two JSON-LD blocks come from the strings of the page language: `SoftwareApplication` (free, MIT, the operating systems named in the README, `codeRepository`) and `FAQPage` (the eight questions and answers, tags removed, as shown). Do not add a rating, a review or a count: the page shows none.
- `favicon.svg`, `favicon.ico` (16, 32 and 48 px) and `apple-touch-icon.png` (180 px, opaque so iOS shows no black corners) are the two-rings mark of the nav logo (`symbol#logo` in `body.html`). Rebuild them from `favicon.svg` if the mark changes.
- `og-image.png` (1200 × 630, 163 KB) is the hero's look with the logo, the English H1 and the three facts, and the sentence "A free, open-source team of AI assistants. By default they ask before they send, pay, sign, book or delete." One image, in English, serves every language. Its source is `tools/og-image.html`: open it at 1200 × 630, screenshot, and save as an optimised PNG. Keep it under 300 KB (the checker enforces size and dimensions), and redraw it when the H1 or the facts change.
- `robots.txt` allows all crawlers and names `sitemap.xml`. The sitemap lists all twelve URLs, each with `xhtml:link` alternates and a `lastmod` (`site.json`); update `lastmod` when the pages change, then rebuild.
- `llms.txt` gives AI assistants a short description and links to the README, roadmap, team, comparison, security, full access and install. Its links point to files on `main`.
