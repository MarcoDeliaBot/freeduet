/**
 * What caused a turn, or a row on the audit trail, where `actorUserId` is only whose authority it
 * borrowed. Re-exported from audit.ts, which is where the rest of the server reads it.
 */
export type AuditInitiator =
  | { kind: "person" }
  /**
   * The person's own typed words, but from a browser that is not paired with the computer FreeDuet
   * runs on (docs/design/phone-and-remote.md 3.5.5). Set by the server from the pairing cookie, never by
   * the client. Everything that treats `person` as "somebody at the computer" reads this as
   * someone else: Full access and the typed-recipient shortcuts do not apply, and every write asks.
   */
  | { kind: "remote" }
  | { kind: "deployment" }
  | { kind: "routine"; id: string }
  | { kind: "responsibility"; id: string }
  | { kind: "memory"; id: string }
  | { kind: "handoff"; id: string; origin?: AuditInitiator };
