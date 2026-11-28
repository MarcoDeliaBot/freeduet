# Site (`site/`)

Moved out of `CLAUDE.md`. Read it before changing anything under `site/`.

- No CI job covers `site/`. A page is built by one of two builds, chosen per language by the `"_untranslated"` marker in
  `site/app/src/i18n/<code>.json`: languages without the marker (today all twelve) by `cd site/app && npm run build`
  (prerendered React, shared `site/assets/`), a language still marked by `python3 site/tools/build.py` from `site/src` (old design, none today).
  Built output must equal a fresh build, and `node site/tools/checklang.js` checks both the old language files and the
  i18n files (same keys, placeholders and marks as English), then runs `tools/checkpages.py`. Text-only changes must
  not touch layout, motion or spacing (PR #120 restyled the page on 2026-11-14), and in this sandbox the proxy returns
  403 for Google Fonts, so screenshots need the fonts served locally.
- `npm run build` writes the twelve pages (`site/index.html` and `site/<code>/index.html`) and `site/assets/`; `build.py` writes `site/sitemap.xml` and only the old-design page of a language still marked `_untranslated` (none today). Commit all of them. `node site/tools/checklang.js` also runs `tools/checkpages.py`.
- Old design: each FAQ answer (keys `a1` to `a8`) appears twice in a built page: as visible text (`data-i` in
  `site/src/body.html`) and in the FAQPage JSON-LD built from the same key (`site/tools/build.py:269-271`),
  so a change to an answer key changes both. `site/tools/checkpages.py:14-15` checks that they match.
- The three cards that show the `tagRel` badge (`site/src/body.html:241`, `:264`, `:321`) share one key.
  When one card's badge must read differently, add a new key to all twelve `site/src/lang/*.json` files:
  `node site/tools/checklang.js` requires the same keys in every language (`site/tools/checklang.js:12-17`).


## New design in twelve languages (stage 2a)

- All twelve languages have no `"_untranslated": true` marker today, so `cd site/app && npm run build` writes all twelve pages (prerendered React, shared `site/assets/app-<hash>.js|css`). A language that gets the marker again is written by `python3 site/tools/build.py` as its old page instead. Run both and commit `site/index.html`, `site/<code>/index.html`, `site/assets/` and `site/sitemap.xml`. `site.json` no longer has `hand_built`; the split is computed from the marker.
- Text of the new page lives only in `i18n/*.json` (flat keys); a new string is a new key in `en.json` and in every other language file, and a language whose translation is not ready is marked `_untranslated` again and keeps its old page. `node site/tools/checklang.js` enforces parity. Translator guide: `site/app/src/i18n/README.md`.
- The FAQ keys `faq.q1..q6` / `faq.a1..a6` feed both the visible FAQ and the FAQPage JSON-LD.
- Brand images: `python3 site/app/scripts/render-brand.py` (source `site/app/brand/og-image.html`, `site/favicon.svg`).
- `site/_redirects` sends `/app/*` to `/` with a 301: `site/app/index.html` is the dev template and would show a blank page at `/app/` if Pages publishes `site/`, and it works only if the Cloudflare Pages output directory is `site/` (to be confirmed in the Cloudflare dashboard).
- In this sandbox Google Fonts is blocked: for screenshots route the font CSS to local `@fontsource` files (see `render-brand.py --fonts`).
