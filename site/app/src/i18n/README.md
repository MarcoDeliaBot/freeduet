# Translating the new page

One file per language, `<code>.json` (`it`, `es`, `fr`, `de`, `pt`, `pl`, `tr`, `ru`, `zh`, `ja`, `ko`), with exactly the keys of `en.json`
(flat keys, `section.name`). The page is built from them; nothing else on the page has text.

## How to work

1. Open `<code>.json`. It starts as a copy of English with `"_untranslated": true` on the first line.
2. Translate every value. Keep every key. Do not add, rename or remove keys (change `en.json` first, then every language).
3. Delete the `"_untranslated": true` line when the whole file is translated. Until then the language keeps its old page at its URL:
   English text is never published under another language's address.
4. `node site/tools/checklang.js` checks key parity, placeholders, inline marks, and that a file without the marker is really translated.
5. `cd site/app && npm ci && npm run build` writes the page of every translated language; `python3 site/tools/build.py` writes the old pages of the others.
   Commit both outputs (`site/index.html`, `site/<code>/index.html`, `site/assets/`).

## Placeholders and marks (must match English exactly)

| In a value | Means | Rule |
|---|---|---|
| `{name}`, `{role}`, `{label}`, `{action}`, `{sample}`, `{num}`, `{n}`, `{count}`, `{text}` | filled by the page | keep the word inside the braces, move it where your grammar needs it |
| `**text**` | bold | keep the pair around the translated word |
| `*text*` | emphasis | same |
| `==text==` | accent colour (in `hero.h1`, the underlined words) | same |

No HTML in values. Straight or typographic quotes are yours to choose (`“ ”` are part of some values, e.g. `reel.bubble`, `team.quote`).
Plurals: `bento.routines.one` and `bento.routines.other` are the singular and plural of "{count} morning(s) a week"; word it so both work.
`meta.title` starts with `FreeDuet`; `meta.desc` and `meta.ogdesc` are the search and share texts, `meta.ogalt` describes the share image
(which shows the English headline).

## Glossary rules

- Member names are never translated: Iris, Otto, Portia, Penny, Jules, Wren, Mark, Cam, Rex, Ada, Kai, Lumi, Gus, Basil, Vera, Leo. Translate their roles (`member.<id>.role`).
- `FreeDuet` is never translated. Neither are `Claude`, `Claude Code`, `GitHub`, `Docker`, `Bash`, `Bun`, `WSL2`, `MIT`, `API`, command lines and file names.
- Keep the honest status wording: "not run live", "built", "not released", "planned" and every date, version number, count and caveat
  must say the same as English (`status.*`, `bento.*`, `faq.*`, `team.lead`). Do not soften, shorten or strengthen a claim.
- The five actions (Send, Pay, Sign, Book, Delete: `act.*`) are one word each and are reused on buttons; use the same word everywhere.
- Weekday letters in the demo come from `site/src/site.json`, not from here.
