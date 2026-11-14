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
