/**
 * The language a person chose for the team (docs/design/settings-in-chat.md, 8.10.3), over the
 * deployment's `FREEDUET_PERSON_LANGUAGE` (D26, `person-language.ts`).
 *
 * ONE LANGUAGE PER PERSON, not per member. It is kept in `users.preferences.freeduetLanguage` as a
 * two-letter code, the way `freeduetFullAccess` and `freeduetTeam` are kept: no table and no
 * migration. The codes are the ones D26 already accepts (`DICTATION_LANGUAGES`), nothing else.
 *
 * WHAT IT CHANGES. The language note agent-freeduet puts in a member's run (person_language.py): its
 * code and English name come from the person's choice when there is one, else from the variable, else
 * there is no note, exactly as before. A person who never chose gets a run byte for byte as on main.
 *
 * WHAT IT DOES NOT CHANGE. The app's own card texts (they exist in English and Italian, and follow
 * `/api/capabilities`, which is the same for everybody) and the few fixed sentences this server writes
 * (Italian when the variable says `it`, English otherwise: `personText`). Both keep following the
 * deployment's variable. A member told "English" while the variable says `it` writes English, and the
 * app's own cards stay as they are today.
 */
import {
  type AbstractAgent,
  type BaseEvent,
  Middleware,
  type RunAgentInput,
} from "@ag-ui/client";
import { eq, sql } from "drizzle-orm";
import { defer, from, type Observable, switchMap } from "rxjs";
import { DICTATION_LANGUAGES } from "../dictation/languages";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import {
  englishName,
  PERSON_LANGUAGE_PROP,
  type PersonLanguage,
} from "./person-language";

/** The key in `users.preferences` that holds the person's chosen language code. */
export const LANGUAGE_PREFERENCE = "freeduetLanguage";

/** The person's chosen language code, from a stored value; anything that is not on the list is no choice. */
export function parseChoice(value: unknown): string | null {
  return typeof value === "string" && DICTATION_LANGUAGES.has(value)
    ? value
    : null;
}

export async function readLanguageChoice(
  database: Pick<Database, "select">,
  userId: string,
): Promise<string | null> {
  const [row] = await database
    .select({
      choice: sql<unknown>`${users.preferences} -> ${LANGUAGE_PREFERENCE}`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseChoice(row?.choice);
}

/** Writes `to` (null: the deployment's language) only while the choice is still `from`. Says whether it did. */
export async function swapLanguageChoice(
  database: Pick<Database, "update">,
  userId: string,
  from: string | null,
  to: string | null,
): Promise<boolean> {
  const key = LANGUAGE_PREFERENCE;
  const current = sql`(${users.preferences} -> ${key})`;
  const rows = await database
    .update(users)
    .set({
      preferences:
        to === null
          ? sql`${users.preferences} - ${key}::text`
          : sql`${users.preferences} || jsonb_build_object(${key}::text, ${to}::text)`,
      updatedAt: new Date(),
    })
    .where(
      sql`${users.id} = ${userId} and ${
        from === null
          ? sql`${current} is null`
          : sql`${current} = to_jsonb(${from}::text)`
      }`,
    )
    .returning({ id: users.id });
  return rows.length === 1;
}

/** What the middleware asks for: the language this person chose, or null when they never did. */
export type LoadPersonLanguage = () => Promise<string | null>;

export function personLanguageReaderFor(
  database: Pick<Database, "select">,
  userId: string,
): LoadPersonLanguage {
  return () => readLanguageChoice(database, userId);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Puts the person's chosen language over the deployment's, in the run's `forwardedProps`. With no
 * choice, or a failed read, the run is left exactly as the deployment's variable made it.
 */
export class PersonLanguageMiddleware extends Middleware {
  constructor(private readonly load: LoadPersonLanguage) {
    super();
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    return defer(() => from(this.load().catch(() => null))).pipe(
      switchMap((code) => {
        if (code === null) return this.runNext(input, next);
        const language: PersonLanguage = { code, name: englishName(code) };
        return this.runNext(
          {
            ...input,
            forwardedProps: {
              ...(isObject(input.forwardedProps) ? input.forwardedProps : {}),
              [PERSON_LANGUAGE_PROP]: language,
            },
          },
          next,
        );
      }),
    );
  }
}
