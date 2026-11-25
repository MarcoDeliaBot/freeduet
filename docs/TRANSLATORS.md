# Translators wanted

FreeDuet's website is written in English and translated into twelve languages: English (en), Italian (it), Spanish (es), French (fr), German (de), Portuguese (pt), Polish (pl), Turkish (tr), Russian (ru), Chinese (zh), Japanese (ja) and Korean (ko).

**No translation has been read by a native speaker yet.** We would like volunteers who are native speakers to read them and suggest better wording. Every reviewer is credited by name or GitHub handle, if you agree.

## Where the text is

Each language has one file: `site/app/src/i18n/<code>.json`, for example `site/app/src/i18n/fr.json`. The keys are the same in every file. The rules for placeholders, bold and emphasis marks, and the words that are never translated (member names, `FreeDuet`, `Claude`, command lines) are in [site/app/src/i18n/README.md](../site/app/src/i18n/README.md). Please read that first.

## Two ways to help

1. **Open a review issue.** Choose "Translation review" on the [new issue page](https://github.com/MarcoDeliaBot/freeduet/issues/new/choose). The form asks for the language, the key, the current text and your proposed text.
2. **Send a pull request.** Edit only the language file you are reviewing, then open a pull request. The maintainers rebuild the pages after it is merged.

Small fixes are welcome. If you are not sure about a word, say so in the issue and the maintainers will decide with you.

## How credit works

If you agree, your name or GitHub handle is listed in the "Translators" section of the [README](../README.md). Listing in the site's footer is planned, and will follow in a later change. You can ask to stay unnamed, and we will not list you.
