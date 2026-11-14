/**
 * The person's engine choices: what the Engines page changes, and what each run carries to agent-freeduet
 * (docs/design/engines-dashboard.md, docs/ENGINES_PLAN.md slice 7 and E4).
 *
 * THE ONE PLACE OF TRUTH. `engines.yaml` in agent-freeduet holds the installation's defaults and is never written by
 * the page. What the person chooses is kept here, on the server: one row of `enterprise_settings`, the key
 * {@link ENGINE_CHOICES_KEY}, `{ value: { version: 1, members: { <member id>: { mode } } } }`. The choices are the
 * installation's, not one person's: the engines and their sign-ins belong to the installation. So that is not
 * `users.preferences`, where Full access is kept. No migration: the table is a plain key and a jsonb value, and the
 * reader of its five known keys (admin/settings-store.ts) ignores this one.
 *
 * ONLY THE MODE, SO FAR: `automatic` (when an engine runs out, the next one answers and the person is told) or
 * `ask-first` (the person is asked first). Both stay inside the chain the file allowed, so a choice here can never
 * make a run spend more than the file lets it. Nothing secret is kept here or sent, ever: a run input may be stored,
 * and the vocabulary is a version number and one of two words. Keys, when they come (the design's slice 7d), take
 * another road.
 *
 * HOW A RUN GETS IT. {@link withEngineChoices}, called where `runWith` builds `forwardedProps` (copilot.ts), adds
 * `openbotEngineChoices: { version: 1, mode }` for the Bot the run is for, when the person chose one, from the
 * in-memory copy below. It first removes whatever the caller put under that name: a browser must not be able to set
 * its own choices. agent-freeduet reads it tolerantly (engine_choices.py) and lays it over the file's `switching:`.
 *
 * THE COPY IN MEMORY. Loaded before the server accepts a request, replaced after every write, and read by `runWith`
 * without a wait. If a reload fails the last good copy stays; if the stored document cannot be read at all (damaged,
 * or of a version this server does not know) the state is `unreadable`: runs carry nothing, so the file's values
 * apply, and the page says so. One server process is assumed, as FreeDuet runs it: with several, each would need the
 * `enterprise_settings_changed` notification (admin/settings-store.ts), which is not built here.
 *
 * CHANGE AND UNDO are the pattern of settings in chat (settings-in-chat/changes.ts): one `configuration.changed`
 * audit event per change holding the member, the value it replaced (null when the person had chosen nothing) and the
 * value it set; Undo finds that event by its change id and writes the old value back only while the current value is
 * still the one the change set. A change whose audit row cannot be written is taken back, so there is no change the
 * person cannot see or undo. The row is changed under a lock, one change at a time in this process, so two changes
 * made together cannot lose one another.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { type AuditReader, type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { enterpriseSettings } from "../db/schema";

export const ENGINE_CHOICES_KEY = "freeduet_engine_choices";
/** The name in `forwardedProps`, and agent-freeduet's `engine_choices.PROP`. */
export const ENGINE_CHOICES_PROP = "openbotEngineChoices";
/** The version of the document and of what a run carries. agent-freeduet's `engine_choices.VERSION` is the same. */
export const ENGINE_CHOICES_VERSION = 1;

export const ENGINE_MODES = ["automatic", "ask-first"] as const;
export type EngineMode = (typeof ENGINE_MODES)[number];

export function isEngineMode(value: unknown): value is EngineMode {
  return (ENGINE_MODES as readonly unknown[]).includes(value);
}

/** A member's id as the team file writes it. Anything else is not a member this page can change. */
export const MEMBER_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** More than the team has by far; the bound is on the document, not a limit anybody meets. */
export const MAX_MEMBERS = 64;

/** A change id as the server makes it (`randomUUID`). The reader treats an empty id as no filter, so it is checked here. */
export const CHANGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_SUCH_CHANGE = "There is no engine change with that id.";

/** The audit target of a change, and of the Undo of one. Free-form strings the reader filters on. */
export const ENGINE_CHANGE_TARGET = "engine_choice";
export const ENGINE_UNDO_TARGET = "engine_choice_undo";

export type MemberChoice = { mode?: EngineMode };

export type ChoicesSnapshot =
  | { state: "ok"; members: ReadonlyMap<string, MemberChoice> }
  | { state: "unreadable" };

export type ModeOutcome =
  | {
      status: "changed";
      changeId: string;
      memberId: string;
      /** What the person had chosen before; null when nothing. */
      previous: EngineMode | null;
      mode: EngineMode;
    }
  | { status: "unchanged"; memberId: string; mode: EngineMode };

export type UndoOutcome = {
  status: "undone";
  changeId: string;
  memberId: string;
  /** The choice that stands now: the one the change replaced, or null when the person had chosen nothing. */
  mode: EngineMode | null;
};

/**
 * A refusal the person can act on. Its message is a sentence the page shows as it is, and `status` is the HTTP answer
 * the route gives for it.
 */
export class EngineChoiceRefusedError extends Error {
  override name = "EngineChoiceRefusedError";
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.status = status;
  }
}

export type EngineChoices = {
  /** Reads the stored choices into memory. Never throws: a failure keeps the last good copy, or is `unreadable`. */
  load(): Promise<void>;
  /** The copy in memory, without a wait. */
  current(): ChoicesSnapshot;
  setMode(input: {
    memberId: string;
    mode: EngineMode;
    actorUserId: string;
  }): Promise<ModeOutcome>;
  undo(input: { changeId: string; actorUserId: string }): Promise<UndoOutcome>;
};

type StoredMembers = Record<string, MemberChoice>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The members of a stored row's value (`{ value: { version, members } }`), or null when it is not a document this server
 * can read: not an object, another version, no members. An entry that is not a member id with one of the two modes is
 * left out, and the rest is kept.
 */
export function readDocument(stored: unknown): StoredMembers | null {
  if (!isObject(stored)) return null;
  const document = stored.value;
  if (
    !isObject(document) ||
    document.version !== ENGINE_CHOICES_VERSION ||
    !isObject(document.members)
  )
    return null;
  const members: StoredMembers = {};
  for (const [id, entry] of Object.entries(document.members).slice(
    0,
    MAX_MEMBERS,
  )) {
    if (!MEMBER_ID.test(id) || !isObject(entry) || !isEngineMode(entry.mode))
      continue;
    members[id] = { mode: entry.mode };
  }
  return members;
}

function documentOf(members: StoredMembers) {
  return { value: { version: ENGINE_CHOICES_VERSION, members } };
}

const UNREADABLE_SENTENCE =
  "The engine choices saved on this computer cannot be read, so nothing was changed.";

/** The fields a recorded change holds, read back from its audit event. Anything else is refused, never guessed. */
function recordOf(payload: Record<string, unknown>) {
  const { memberId, previousValue, newValue } = payload;
  if (
    typeof memberId !== "string" ||
    !MEMBER_ID.test(memberId) ||
    !(previousValue === null || isEngineMode(previousValue)) ||
    !isEngineMode(newValue)
  )
    throw new EngineChoiceRefusedError(
      "That change cannot be read back, so nothing was undone.",
      409,
    );
  return { memberId, previousValue, newValue };
}

/** A member's saved mode, or null. Only the member's own entry counts: `constructor` is a member id too. */
function modeOf(members: StoredMembers, memberId: string): EngineMode | null {
  return Object.hasOwn(members, memberId)
    ? (members[memberId]?.mode ?? null)
    : null;
}

export function createEngineChoices(deps: {
  database: Database;
  audit: AuditStore;
  reader: AuditReader;
}): EngineChoices {
  const { database, audit, reader } = deps;

  let snapshot: ChoicesSnapshot = { state: "unreadable" };
  let loadedOnce = false;

  /** One operation on the choices at a time in this process, so the copy in memory follows the order of the writes. */
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  }

  function adopt(members: StoredMembers) {
    snapshot = {
      state: "ok",
      members: new Map(Object.entries(members)),
    };
    loadedOnce = true;
  }

  async function reload() {
    try {
      const [row] = await database
        .select({ value: enterpriseSettings.value })
        .from(enterpriseSettings)
        .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY))
        .limit(1);
      if (!row) return adopt({});
      const members = readDocument(row.value);
      if (members === null) {
        snapshot = { state: "unreadable" };
        loadedOnce = true;
        return;
      }
      adopt(members);
    } catch {
      // The store did not answer. What was last read stays; with nothing read yet, nothing is known.
      if (!loadedOnce) snapshot = { state: "unreadable" };
    }
  }

  /**
   * The stored members, changed by `work` under a row lock, and the copy in memory replaced by the result. `work`
   * returns the members to write, or null to write nothing, and what it found.
   */
  async function edit<T>(
    by: string,
    work: (members: StoredMembers) => {
      write: StoredMembers | null;
      result: T;
    },
  ): Promise<T> {
    const done = await database.transaction(async (transaction) => {
      // The row exists from the first change on; a lock needs a row to hold.
      await transaction
        .insert(enterpriseSettings)
        .values({
          key: ENGINE_CHOICES_KEY,
          value: documentOf({}),
          updatedBy: by,
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: enterpriseSettings.key });
      const [row] = await transaction
        .select({ value: enterpriseSettings.value })
        .from(enterpriseSettings)
        .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY))
        .for("update");
      const members = readDocument(row?.value);
      if (members === null)
        throw new EngineChoiceRefusedError(UNREADABLE_SENTENCE, 409);
      const { write, result } = work(members);
      if (write !== null)
        await transaction
          .update(enterpriseSettings)
          .set({
            value: documentOf(write),
            updatedBy: by,
            updatedAt: new Date(),
          })
          .where(eq(enterpriseSettings.key, ENGINE_CHOICES_KEY));
      return { members: write ?? members, result };
    });
    adopt(done.members);
    return done.result;
  }

  /** Puts `to` back as the member's mode, only while it is still `from`. Says whether it did. */
  function swap(
    by: string,
    memberId: string,
    from: EngineMode | null,
    to: EngineMode | null,
  ): Promise<boolean> {
    return edit(by, (members) => {
      if (modeOf(members, memberId) !== from)
        return { write: null, result: false };
      const next = { ...members };
      if (to === null) delete next[memberId];
      else next[memberId] = { mode: to };
      return { write: next, result: true };
    });
  }

  return {
    load: () => serial(reload),

    current: () => snapshot,

    async setMode(input) {
      const { memberId, mode, actorUserId } = input;
      if (!MEMBER_ID.test(memberId))
        throw new EngineChoiceRefusedError(
          "That is not a team member this page can change.",
          400,
        );
      if (!isEngineMode(mode))
        throw new EngineChoiceRefusedError(
          "Choose either automatic or ask first.",
          400,
        );
      return serial(async (): Promise<ModeOutcome> => {
        const previous = await edit(actorUserId, (members) => {
          const before = modeOf(members, memberId);
          if (before === mode) return { write: null, result: before };
          if (before === null && Object.keys(members).length >= MAX_MEMBERS)
            throw new EngineChoiceRefusedError(
              "Too many members have saved choices, so nothing was changed.",
              409,
            );
          return {
            write: { ...members, [memberId]: { mode } },
            result: before,
          };
        });
        if (previous === mode) return { status: "unchanged", memberId, mode };

        const changeId = randomUUID();
        try {
          await recordAuditEvent(audit, {
            eventType: "configuration.changed",
            targetType: ENGINE_CHANGE_TARGET,
            targetId: changeId,
            actorUserId,
            payload: {
              change: "engine_mode_changed",
              changeId,
              memberId,
              previousValue: previous,
              newValue: mode,
            },
          });
        } catch (error) {
          // A change with no record is not a change the person can undo, so it is taken back first.
          await swap(actorUserId, memberId, mode, previous);
          throw error;
        }
        return { status: "changed", changeId, memberId, previous, mode };
      });
    },

    async undo(input) {
      const { changeId, actorUserId } = input;
      if (!CHANGE_ID.test(changeId))
        throw new EngineChoiceRefusedError(NO_SUCH_CHANGE, 404);
      return serial(async (): Promise<UndoOutcome> => {
        const [change] = (
          await reader.list({
            eventType: "configuration.changed",
            targetType: ENGINE_CHANGE_TARGET,
            targetId: changeId,
            limit: 1,
          })
        ).events;
        if (!change) throw new EngineChoiceRefusedError(NO_SUCH_CHANGE, 404);
        const [undone] = (
          await reader.list({
            eventType: "configuration.changed",
            targetType: ENGINE_UNDO_TARGET,
            targetId: changeId,
            limit: 1,
          })
        ).events;
        if (undone)
          throw new EngineChoiceRefusedError(
            "That change has already been undone.",
            409,
          );

        const recorded = recordOf(change.payload);
        const swapped = await swap(
          actorUserId,
          recorded.memberId,
          recorded.newValue,
          recorded.previousValue,
        );
        if (!swapped)
          throw new EngineChoiceRefusedError(
            "That choice has changed since, so nothing was undone.",
            409,
          );
        try {
          await recordAuditEvent(audit, {
            eventType: "configuration.changed",
            targetType: ENGINE_UNDO_TARGET,
            targetId: changeId,
            actorUserId,
            payload: {
              change: "engine_mode_change_undone",
              changeId,
              memberId: recorded.memberId,
              previousValue: recorded.newValue,
              newValue: recorded.previousValue,
            },
          });
        } catch (error) {
          await swap(
            actorUserId,
            recorded.memberId,
            recorded.previousValue,
            recorded.newValue,
          );
          throw error;
        }
        return {
          status: "undone",
          changeId,
          memberId: recorded.memberId,
          mode: recorded.previousValue,
        };
      });
    },
  };
}

/** What a run asks for the person's choices: only the copy in memory. */
type ChoicesSource = Pick<EngineChoices, "current">;

let installed: ChoicesSource | null = null;

/**
 * Installed once at start (index.ts), the way the routine and settings tools are, because the code that builds a run
 * is built before there is a database to hand it. Without it no run carries a choice, which is what a deployment that
 * never wired it means.
 */
export function useEngineChoices(choices: ChoicesSource | null): void {
  installed = choices;
}

/**
 * `forwardedProps` for the run of one Bot, with the person's engine choices for it laid in. Whatever the caller sent
 * under {@link ENGINE_CHOICES_PROP} is removed first: only this server says what the person chose. Nothing is added
 * when the person chose nothing for this Bot, or when the stored choices cannot be read (the file's values then
 * apply, and the page says so).
 */
export function withEngineChoices(
  props: Record<string, unknown>,
  botId: string,
  from: ChoicesSource | null = installed,
): Record<string, unknown> {
  const { [ENGINE_CHOICES_PROP]: _fromTheCaller, ...rest } = props;
  const now = from?.current();
  const mode = now?.state === "ok" ? now.members.get(botId)?.mode : undefined;
  return mode
    ? {
        ...rest,
        [ENGINE_CHOICES_PROP]: { version: ENGINE_CHOICES_VERSION, mode },
      }
    : rest;
}
