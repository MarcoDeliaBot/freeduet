# freeduet.com

The public website: one static page, twelve languages.

- `index.html` is the built page. It is what gets served; nothing else is needed at run time.
- `src/` holds the parts: `body.html` (structure and the English text), `style.css`, `app.js`
  (the demo, the team grid, the language switch) and `src/lang/*.json` (one file per language).
- Build: `python3 site/tools/build.py site/src site/index.html`
- Check that every language has the same keys and tags as English: `node site/tools/checklang.js`

Hosting: Cloudflare Pages, output directory `site`, no build command.

Every claim on the page must match the README of this repository. What is planned is labelled as planned.

## Motion and spacing

Everything is plain CSS and JavaScript in `src/`; there are no external scripts, icon sets or extra fonts (Schibsted Grotesk now also loads weight 500).

- Spacing is set by tokens at the top of `style.css`: `--sec` (air above and below a section), `--head-gap`, `--gut`, `--wrap` (80rem).
- `class="rv"` on an element reveals it once when it scrolls into view (opacity, translate, blur). `rv-panel` is the larger, slower variant. `data-d="420"` sets a fixed delay in ms; without it, elements that enter together are staggered. New sections should mark their blocks the same way.
- `class="wd"` on a heading reveals it word by word. `app.js` cuts the words (`Intl.Segmenter`, so Chinese and Japanese work) and cuts them again whenever the language changes. Without `Intl.Segmenter` Chinese and Japanese headings appear whole.
- `data-par="lag:.1"` / `data-par="rise:.12"` give a layer a light parallax. The floating capsule navigation is `.top`.
- Nothing stays hidden if JavaScript or `IntersectionObserver` is missing (the page marks itself `js` in the head, and a 3 s failsafe adds `no-rv`). With `prefers-reduced-motion` there is no drift, parallax, blur or travel, only a 0.4 s fade.

## Search, sharing and icons

Cloudflare Pages publishes the whole `site/` folder, so every file here is served from the root of freeduet.com.

- `build.py` writes the `<head>`. The title and the description are the English `title` and `desc` keys of `src/lang/en.json`; `app.js` switches them, and `<html lang>`, with the language. The canonical link, Open Graph, Twitter tags, icons and `theme-color` are fixed in the script.
- Two JSON-LD blocks come from the English strings of the page: `SoftwareApplication` (free, MIT, the operating systems named in the README, `codeRepository`) and `FAQPage` (the eight questions and answers, tags removed, as shown). Do not add a rating, a review or a count: the page shows none.
- `favicon.svg`, `favicon.ico` (16, 32 and 48 px) and `apple-touch-icon.png` (180 px, opaque so iOS shows no black corners) are the two-rings mark of the nav logo (`symbol#logo` in `body.html`). Rebuild them from `favicon.svg` if the mark changes.
- `og-image.png` (1200 × 630, 161 KB) is the hero's look with the logo, the English H1 and the three facts. Keep it under 300 KB, and redraw it when the H1 or the facts change.
- `robots.txt` allows all crawlers and names `sitemap.xml`, which lists the one URL. Update its `lastmod` when the page changes.
- `llms.txt` gives AI assistants a short description and links to the README, roadmap, team, comparison, security, full access and install. Its links point to files on `main`.
- The page has one URL. Its other languages are switched in the browser and have no URL of their own, so search engines index the English text only.
