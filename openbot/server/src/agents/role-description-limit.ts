/**
 * How many characters a coworker's "What it does" text, its standing instruction, may hold.
 *
 * 1,000 for every coworker made in the app: by a person, by Leo, or through the API. 8,000 for a
 * coworker the importer created from a team file, and only that: the stored fact that says so is
 * written by `createImportedMember` and by nothing else. Counted in UTF-16 code units
 * (`String.length`), as the team-file reader counts them (docs/design/team-file.md, decisions 2, C
 * and E). The reader's own constants are pinned to these in `tests/imported-member.integration.test.ts`.
 */
export const ROLE_DESCRIPTION_LIMIT = 1000;
export const IMPORTED_ROLE_DESCRIPTION_LIMIT = 8000;

/** The most characters this coworker's text may hold, decided by its stored fact. */
export function roleDescriptionLimitOf(coworker: {
  importedMember?: boolean;
}): number {
  return coworker.importedMember === true
    ? IMPORTED_ROLE_DESCRIPTION_LIMIT
    : ROLE_DESCRIPTION_LIMIT;
}
