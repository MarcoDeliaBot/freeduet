# freeduet.com

The public website: one static page, twelve languages.

- `index.html` is the built page. It is what gets served; nothing else is needed at run time.
- `src/` holds the parts: `body.html` (structure and the English text), `style.css`, `app.js`
  (the demo, the team grid, the language switch) and `src/lang/*.json` (one file per language).
- Build: `python3 site/tools/build.py site/src site/index.html`
- Check that every language has the same keys and tags as English: `node site/tools/checklang.js`

Hosting: Cloudflare Pages, output directory `site`, no build command.

Every claim on the page must match the README of this repository. What is planned is labelled as planned.
