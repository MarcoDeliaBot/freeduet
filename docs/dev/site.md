# Site (`site/`)

Moved out of `CLAUDE.md`. Read it before changing anything under `site/`.

- No CI job covers `site/`: `site/index.html` is the build output and must equal a fresh build
  (`python3 site/tools/build.py site/src site/index.html`), and `node site/tools/checklang.js` checks that
  every language has the same keys and tags as English. Text-only changes must not touch layout, motion
  or spacing (PR #120 restyled the page on 2026-11-14), and in this sandbox the proxy returns 403 for
  Google Fonts, so screenshots need the fonts served locally.
- The build writes twelve pages (`site/index.html` and `site/<code>/index.html`) and `site/sitemap.xml`:
  commit all of them. `node site/tools/checklang.js` also runs `tools/checkpages.py`.
- Each FAQ answer (keys `a1` to `a8`) appears twice in a built page: as visible text (`data-i` in
  `site/src/body.html`) and in the FAQPage JSON-LD built from the same key (`site/tools/build.py:269-271`),
  so a change to an answer key changes both. `site/tools/checkpages.py:14-15` checks that they match.
- The three cards that show the `tagRel` badge (`site/src/body.html:241`, `:264`, `:321`) share one key.
  When one card's badge must read differently, add a new key to all twelve `site/src/lang/*.json` files:
  `node site/tools/checklang.js` requires the same keys in every language (`site/tools/checklang.js:12-17`).

