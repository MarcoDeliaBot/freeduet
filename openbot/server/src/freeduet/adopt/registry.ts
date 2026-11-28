/**
 * Every place this installation names a person, and what moving the single-user person to a real
 * account does with each (docs/design/single-user-to-sign-in.md, section 2.2).
 *
 * WHY A LIST AND NOT A SCAN ALONE. A scan that moves "every column holding the id" would also move
 * the audit trail, the vendor's name for an account and the text of a conversation, and would stop
 * being true the day somebody quoted the id in a note. A list says, for each column, whether the row
 * is the person's (it moves), a record of who did something (it stays), or how somebody signs in (it
 * never moves). The list is checked three ways, so it cannot quietly go out of date:
 *
 *  - against the live schema, in a test: every foreign key to `users.id`, and every text, array or
 *    jsonb column whose name looks like a person, must be in exactly one class here;
 *  - against the document, in the same test: this file and section 2.2 name the same columns;
 *  - against the data, when the tool runs: it searches every text-like column for the id, and a hit
 *    in a column that is not here stops the move (plan.ts).
 *
 * Nothing here runs. It is read by the tool (scripts/adopt-single-user-data.ts) and by tests, and
 * imported by no part of the server.
 */
import { DEV_ACTOR } from "../../auth/dev-actor";

/** The person the move starts from: the one every request is, with no sign-in. */
export const SOURCE_ID = DEV_ACTOR.id;
export const SOURCE_EMAIL = DEV_ACTOR.email;

/** What the person would call the group of data, for the dry run's report. */
export type Family =
  | "Settings"
  | "Conversations"
  | "Conversation history"
  | "Memories"
  | "Routines and standing work"
  | "Approvals"
  | "Saved logins"
  | "Connected apps"
  | "Bots the person made"
  | "Team Bots"
  | "Authored configuration"
  | "Pages and tasks"
  | "Usage";

/** A column that must equal a value for the row to count, such as `kind = 'user'`. */
export type Condition = { column: string; equals: string };

export type MoveEntry = {
  table: string;
  column: string;
  family: Family;
  /** Said in the dry run, in the person's words. */
  what: string;
  /** Only rows matching this are the person's. */
  where?: readonly Condition[];
  /** The table is made by one mode only (the FreeDuet thread store). Absent is not an error. */
  optional?: boolean;
};

const move = (
  family: Family,
  what: string,
  table: string,
  column: string,
  extra: { where?: readonly Condition[]; optional?: boolean } = {},
): MoveEntry => ({ table, column, family, what, ...extra });

/** The rows that are the person's, one entry per column. Order is the order of the report. */
export const MOVE: readonly MoveEntry[] = [
  move("Settings", "standing instructions", "user_instructions", "user_id"),
  move(
    "Settings",
    "update routing preferences",
    "update_routing_preferences",
    "owner_user_id",
  ),
  move("Settings", "default opt-outs", "default_opt_outs", "owner_user_id"),
  move("Settings", "check-in settings", "proactive_settings", "owner_user_id"),
  move("Settings", "phones and devices", "push_devices", "owner_user_id"),
  move("Settings", "voice sessions", "voice_sessions", "user_id"),
  // The secret is derived from the person's id AND this salt, so on the new id the old secret no longer
  // verifies: the helper is paired again, and the row cannot cascade away with the old person.
  move(
    "Settings",
    "the salt of the programs helper's secret",
    "programs_helper_salts",
    "user_id",
  ),

  move(
    "Conversations",
    "conversations the person is in",
    "channel_memberships",
    "user_id",
  ),
  move("Conversations", "uploaded files", "attachments", "uploaded_by"),
  move(
    "Conversations",
    "group conversations with a Bot",
    "group_bot_threads",
    "owner_user_id",
  ),
  move("Conversations", "group messages", "group_messages", "owner_user_id"),
  move(
    "Conversations",
    "learning bindings",
    "learning_thread_bindings",
    "user_id",
  ),
  move(
    "Conversations",
    "channel mappings",
    "intelligence_channel_mappings",
    "user_id",
  ),
  move(
    "Conversation history",
    "conversation threads",
    "freeduet_threads",
    "user_id",
    { optional: true },
  ),
  move(
    "Conversation history",
    "conversation locks",
    "freeduet_thread_locks",
    "user_id",
    { optional: true },
  ),

  move("Memories", "memories", "personal_memories", "owner_user_id"),
  move("Memories", "memory sources", "memory_sources", "owner_user_id"),

  move("Routines and standing work", "routines", "routines", "owner_user_id"),
  move(
    "Routines and standing work",
    "responsibilities",
    "responsibilities",
    "owner_user_id",
  ),
  move(
    "Routines and standing work",
    "responsibility events",
    "responsibility_events",
    "owner_user_id",
  ),
  move("Routines and standing work", "mail rules", "mail_rules", "user_id"),
  move(
    "Routines and standing work",
    "responsibility sources",
    "responsibility_source_bindings",
    "owner_user_id",
  ),
  move(
    "Routines and standing work",
    "responsibility triggers",
    "responsibility_triggers",
    "owner_user_id",
  ),
  move(
    "Routines and standing work",
    "check-in suggestions",
    "proactive_suggestions",
    "owner_user_id",
  ),

  move(
    "Approvals",
    "approval settings",
    "approval_preferences",
    "owner_user_id",
  ),
  move(
    "Approvals",
    "always-allow and never rules",
    "approval_rules",
    "owner_user_id",
  ),
  move("Approvals", "approval history", "approval_requests", "owner_user_id"),

  move("Saved logins", "saved logins", "saved_logins", "owner_user_id"),
  move("Saved logins", "sign-in requests", "sign_in_requests", "owner_user_id"),

  move(
    "Connected apps",
    "connected apps (brokered)",
    "composio_connections",
    "user_id",
  ),
  move(
    "Connected apps",
    "connected apps (accounts)",
    "brokered_connections",
    "user_id",
    { where: [{ column: "holder", equals: "person" }] },
  ),
  move(
    "Connected apps",
    "connected servers",
    "mcp_user_credentials",
    "user_id",
  ),
  move(
    "Connected apps",
    "finished connection attempts",
    "pending_authorizations",
    "actor_id",
  ),
  move(
    "Connected apps",
    "finished connection attempts (user)",
    "pending_authorizations",
    "user_id",
  ),
  move("Connected apps", "linked identities", "identity_links", "user_id"),
  move(
    "Connected apps",
    "identity link challenges",
    "identity_link_challenges",
    "user_id",
  ),
  move(
    "Connected apps",
    "messaging bindings",
    "delivery_bindings",
    "owner_user_id",
  ),
  move(
    "Connected apps",
    "messaging challenges",
    "delivery_challenges",
    "owner_user_id",
  ),
  move("Connected apps", "messaging inbox", "delivery_inbox", "owner_user_id"),
  move(
    "Connected apps",
    "messaging outbox",
    "delivery_outbox",
    "owner_user_id",
  ),

  move(
    "Bots the person made",
    "Bots the person made",
    "agent_profiles",
    "owner_user_id",
  ),
  move(
    "Bots the person made",
    "per-Bot preferences",
    "agent_preferences",
    "user_id",
  ),
  move(
    "Bots the person made",
    "pause and reset state",
    "bot_lifecycle",
    "owner_user_id",
  ),
  move("Bots the person made", "skills", "skills", "owner_user_id"),
  move(
    "Bots the person made",
    "demonstrations",
    "demonstrations",
    "owner_user_id",
  ),

  move("Team Bots", "team Bot consents", "team_bot_consents", "user_id"),
  move(
    "Team Bots",
    "team Bot consent defaults",
    "team_bot_consent_defaults",
    "user_id",
  ),
  move(
    "Team Bots",
    "team Bot assignments",
    "team_bot_assignments",
    "assigned_by",
  ),
  move(
    "Team Bots",
    "team Bot publications",
    "team_bot_publications",
    "published_by",
  ),
  move("Team Bots", "team Bot audience", "team_bot_audience", "value", {
    where: [{ column: "kind", equals: "user" }],
  }),
  move(
    "Team Bots",
    "shared-use members",
    "shared_use_approval_members",
    "value",
    { where: [{ column: "kind", equals: "user" }] },
  ),

  move(
    "Authored configuration",
    "team approval rules",
    "approval_team_rules",
    "created_by",
  ),
  move(
    "Authored configuration",
    "team approval settings",
    "approval_team_settings",
    "updated_by",
  ),
  move(
    "Authored configuration",
    "sign-in providers registered",
    "sso_providers",
    "user_id",
  ),
  move(
    "Authored configuration",
    "access requests",
    "app_access_requests",
    "requested_by",
  ),

  move("Pages and tasks", "pages", "openduet_pages", "owner_user_id"),
  move("Pages and tasks", "tasks", "openduet_tasks", "owner_user_id"),
  move(
    "Conversations",
    "files a colleague offered in a hand-off",
    "handoff_file_offers",
    "owner_user_id",
  ),

  move("Usage", "model usage", "model_usage", "user_id"),
];

/**
 * Columns with a handler of their own, because the value is not simply equal to the id.
 *
 * `users` is the person's row itself, made or filled in for the target. `credentials.key_id` is the
 * user id only for two kinds. The others are JSON, where the id is a string somewhere inside: the
 * request an approval card was shown for names who it was asked of (`actorId`), and a request that
 * was never answered is not moved at all (plan.ts, `openBlockers`).
 */
export type SpecialEntry = {
  table: string;
  column: string;
  family: Family | "The person's row";
  what: string;
};

export const SPECIAL: readonly SpecialEntry[] = [
  {
    table: "users",
    column: "preferences",
    family: "The person's row",
    what: "preferences, including the team mark and Full access",
  },
  {
    table: "users",
    column: "groups",
    family: "The person's row",
    what: "groups",
  },
  {
    table: "users",
    column: "onboarding_step",
    family: "The person's row",
    what: "where the first-run wizard stopped",
  },
  {
    table: "users",
    column: "onboarding_completed_at",
    family: "The person's row",
    what: "whether the first-run wizard was finished",
  },
  {
    table: "credentials",
    column: "key_id",
    family: "Connected apps",
    what: "connected-server tokens and pasted secrets",
  },
  {
    table: "approval_requests",
    column: "action",
    family: "Approvals",
    what: "who each approval request was asked of, kept inside the request",
  },
  {
    table: "work_items",
    column: "payload",
    family: "Routines and standing work",
    what: "queued work, follow-ups, waiting questions and Activity",
  },
  {
    table: "shared_use_requests",
    column: "proposed_members",
    family: "Team Bots",
    what: "people named in a shared-use request",
  },
];

/** The credential kinds whose `key_id` is the user id. [code: plugins/plugin-store/servers.ts:1105] */
export const USER_KEYED_CREDENTIAL_KINDS = [
  "mcp_user_token",
  "mcp_user_secret",
] as const;

export type NoteEntry = { table: string; column: string; reason: string };

const note = (table: string, column: string, reason: string): NoteEntry => ({
  table,
  column,
  reason,
});

/** Records of who did what, and the vendor's names for accounts. The old id stays, so they stay true. */
export const LEAVE: readonly NoteEntry[] = [
  note("audit_events", "actor_user_id", "the audit trail says who did it then"),
  note("audit_events", "initiator_id", "the audit trail"),
  note("audit_events", "target_id", "the audit trail"),
  note("audit_events", "payload", "the audit trail"),
  note("action_records", "actor_user_id", "the record of computer actions"),
  note("action_policy", "updated_by", "who last changed a rule"),
  note("capability_settings", "updated_by", "who last changed a setting"),
  note("enterprise_settings", "updated_by", "who last changed a setting"),
  note("network_policies", "updated_by", "who last changed a setting"),
  note("components", "updated_by", "who last changed a component"),
  note("component_exclusions", "withheld_by", "who withheld a component"),
  note("component_functions", "granted_by", "who granted a function"),
  note("plugin_grants", "granted_by", "who granted a tool to a Bot"),
  note("mcp_servers", "added_by", "who added a server"),
  note("skills", "installed_by", "who installed a skill"),
  note("skill_tools", "declared_by", "who declared a tool"),
  note("sandboxed_components", "authored_by", "who wrote a component"),
  note("revoked_access", "revoked_by", "who removed a person"),
  note("shared_use_approvals", "approved_by", "who approved a shared use"),
  note("shared_use_requests", "decided_by", "who decided a request"),
  note("shared_use_requests", "requested_by", "who asked"),
  note("app_access_requests", "resolved_by", "who resolved a request"),
  note("identity_links", "verified_by", "how a link was verified"),
  note("brokered_connections", "connected_by", "who connected a shared app"),
  note("personal_memories", "formed_by", "who formed a memory"),
  note(
    "brokered_connections",
    "vendor_user_id",
    "the name the vendor files the account under",
  ),
  note(
    "pending_authorizations",
    "vendor_user_id",
    "the name the vendor files the account under",
  ),
  note(
    "mcp_servers",
    "shared_vendor_user_id",
    "the name the vendor files a shared account under",
  ),
  note(
    "freeduet_thread_runs",
    "events",
    "what was said in a conversation; never rewritten",
  ),
  note(
    "freeduet_thread_runs",
    "input",
    "what was asked in a conversation; never rewritten",
  ),
  note("work_items", "claimed_by", "the name of a worker"),
  note("credentials", "metadata", "a label"),
  note("credentials", "provider", "the app's name"),
];

/** How somebody signs in. The single-user person has none; if it has, the tool stops. */
export const IDENTITY: readonly NoteEntry[] = [
  note("accounts", "user_id", "a sign-in account"),
  note("sessions", "user_id", "a signed-in session"),
  note("user_roles", "user_id", "a role"),
  note("scim_users", "user_id", "a provisioned user"),
  note("scim_subjects", "user_id", "a provisioned subject"),
  note("scim_projection_grants", "user_id", "a provisioned grant"),
  note("scim_identity_tombstones", "user_id", "a provisioned tombstone"),
  // D49: a browser paired with the computer, with sign-in only. The single-user person has none.
  note("browser_pairings", "user_id", "a browser paired with the computer"),
];

/** Names that look like a person and are not one. */
export const REVIEWED: readonly NoteEntry[] = [
  note("sessions", "user_agent", "a browser's name"),
  note(
    "handoff_file_offers",
    "member_bot_id",
    "the id of a team member, a Bot",
  ),
  note("saved_logins", "username", "the person's name at a website"),
  note("scim_users", "user_name", "a directory name"),
  note("scim_users", "user_name_key", "a directory name"),
  note("scim_users", "connection_user_key", "a directory key"),
  note("scim_group_members", "membership_key", "a directory key"),
  note("scim_group_members", "scim_user_id", "a directory id"),
  note("scim_projection_grants", "scim_user_id", "a directory id"),
  note(
    "scim_connection_bindings",
    "decommission_cursor_user_id",
    "a directory cursor",
  ),
  note("identity_links", "subject", "the other service's id for the person"),
  note("routine_sweeps", "owner", "the name of a replica"),
  note("components", "published_description", "text"),
  note("sandboxed_components", "published_css", "text"),
  note("sandboxed_components", "published_description", "text"),
  note("sandboxed_components", "published_html", "text"),
  note("sandboxed_components", "published_js_functions", "text"),
  note("sandboxed_components", "published_argument_schema", "text"),
  note("brokered_connections", "holder", "the word person or deployment"),
  note("pending_authorizations", "holder", "the word person or deployment"),
  note("audit_events", "initiator_kind", "the kind of initiator"),
];

/** `table.column`, the way this document and the tests name a column. */
export const columnKey = (table: string, column: string) =>
  `${table}.${column}`;

/**
 * A column name that suggests a person.
 *
 * Used by the schema test, and only there: a column that matches and is in none of the lists above
 * fails the build, so a person-shaped column added tomorrow is looked at by somebody. The plan-time
 * search (plan.ts) does not depend on it.
 */
export const PERSON_COLUMN_PATTERN =
  /(user|owner|actor|person|member|author|creator|created_by|updated_by|granted_by|assigned|published|requested|approved|decided|resolved|revoked|invited|sender|recipient|subject|principal|holder|initiator|by$)/i;

/** The column types a person's id can be stored in. */
export const PERSON_COLUMN_TYPES = [
  "text",
  "character varying",
  "ARRAY",
  "jsonb",
  "json",
] as const;

export type Classification =
  | "move"
  | "special"
  | "leave"
  | "identity"
  | "reviewed";

/** Every classified column, with its class. A column in two classes is a mistake, and a test says so. */
export function classified(): { key: string; class: Classification }[] {
  return [
    ...MOVE.map((entry) => ({
      key: columnKey(entry.table, entry.column),
      class: "move" as const,
    })),
    ...SPECIAL.map((entry) => ({
      key: columnKey(entry.table, entry.column),
      class: "special" as const,
    })),
    ...LEAVE.map((entry) => ({
      key: columnKey(entry.table, entry.column),
      class: "leave" as const,
    })),
    ...IDENTITY.map((entry) => ({
      key: columnKey(entry.table, entry.column),
      class: "identity" as const,
    })),
    ...REVIEWED.map((entry) => ({
      key: columnKey(entry.table, entry.column),
      class: "reviewed" as const,
    })),
  ];
}
