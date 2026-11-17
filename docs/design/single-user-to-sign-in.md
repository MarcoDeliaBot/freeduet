# Moving from no sign-in to sign-in: keeping the person's data

Design, written before the tool it describes. Written 2026-11-14 on origin/main (the base of branch `single-user-to-sign-in`). Section 8, "Built so far", says what exists and what was not verified.

Tags: **[code: path:line]** read in this repository, with paths from `openbot/`. **[proved: test]** shown by a test in this branch, against a real PostgreSQL, through the real `createApp`. **[verify]** unknown; something on the real installation must settle it. **[assumed]** an inference, not checked.

## 1. The problem, verified

With no sign-in, every request is one fixed person. When a sign-in provider is turned on, the first sign-in creates a different person, and everything is looked up by that person's id.

| Fact | Where |
|---|---|
| The fixed person is `dev-local-user`, `dev@openbot.local`, role `admin`. | [code: server/src/auth/dev-actor.ts:29-34] |
| Every request is admitted as that person when the peer is loopback and there is no provider. | [code: server/src/auth/dev-actor.ts:93-126], [code: server/src/auth/peer.ts:35-59] |
| Its row is written at every single-user start, so it exists even on an installation that has only used single-user mode. | [code: server/src/auth/dev-actor.ts:37-60] |
| A provider always wins over the single-user flag. | [code: server/src/auth/dev-actor.ts:72-90] |
| With a provider, the account for a first sign-in is made by the sign-in library with a new id. The "new user" hook fires only for a new row. | [code: server/src/auth/index.ts:388-464] |
| Every later sign-in re-applies the administrator floor and writes the sign-in audit rows. | [code: server/src/auth/index.ts:465-583], [code: server/src/auth/roles.ts:85-116] |
| Every store reads and writes by the signed-in person's id. Nothing looks for `dev-local-user` once a provider is on. | [code: server/src/auth/guards.ts:55-100] |
| The team's conversations are made for a person on their first `GET /api/me`, once, by a mark in `users.preferences`; the daily review no longer is (D79: it is offered by Iris and made only after a yes and a card). | [code: server/src/freeduet/person-team.ts:1-35, 296-302], [code: server/src/app.ts:743-757] |

**What a person sees, measured.** [proved: `server/tests/single-user-to-sign-in-problem.test.ts`, 3 tests, 32 expectations, passing on main because they assert the problem]. The test builds a scratch PostgreSQL, starts the app with no sign-in, lets the person use it, then starts a second app with a provider, signs in through the real callback as an administrator and reads what the app shows.

| Family | With no sign-in | After the first sign-in |
|---|---|---|
| Conversations | 2 | 2, none of the old ids: made new for the new person |
| Standing instructions | "Always answer in two sentences." | empty |
| Routines | 1 (the one the person made; before D79, 2 with the daily review) | 0 (before D79, 1: the daily review, made again) |
| Approval rules | 1 | 0 |
| Questions waiting for the person | 1 | 0 |
| Full access | on for Iris | off for everybody |
| Memories | 1 | 0 |
| Saved logins | 1 | 0 |

All of it is still in the database, attached to `dev-local-user`, a person nobody can sign in as: the test counts the rows. The sign-in is a success and an administrator, and the app looks empty. Nothing is lost, and nothing is reachable.

## 2. What holds a person

### 2.1 How a person is named

- By `users.id`, a text column. For this person it is the literal `dev-local-user`. [code: server/src/auth/dev-actor.ts:30]
- By a foreign key to `users.id` in 55 columns [proved: `server/tests/single-user-adoption-registry.test.ts` reads them from the live schema].
- By a plain text column with no foreign key, such as `composio_connections.user_id` or `learning_thread_bindings.user_id`.
- Inside `jsonb`: the payload of a work item (`actorId`, `ownerUserId`, a nested `question.actorId`) and the member list of a shared-use request.
- In a derived key. Two exist:
  - `credentials.key_id` holds the user id for the kinds `mcp_user_token` and `mcp_user_secret`. [code: server/src/plugins/plugin-store/servers.ts:1105-1108]
  - `credentials.key_id` for a GitHub link is `<user id>:<github id>:<uuid>`. Nothing reads it by key (the link names the token by id), so it is left as a label. [code: server/src/identity/github-callback.ts:118-128]
- **Not** in a thread id. Thread ids are minted from the deployment's name and random bytes, never from a user id. [code: server/src/channels/thread-identity.ts:69-95]
- **Not** in an advisory-lock key or an in-memory cache key (`freeduet:team:<id>`, `openbot:defaults:<id>:<bot>`): those are never stored.

### 2.2 Every place, and what the tool does with it

Classes:

- **move**: the row is the person's. The column is set from `dev-local-user` to the target.
- **leave**: the row records who did something, or is evidence, or names the person at a vendor. The old id stays, so the record is true.
- **identity**: how somebody signs in. Never moved. The single-user person has none; if it has any, this is not a single-user installation and the tool stops.
- **reviewed**: a column whose name looks like a person and is not one.

Every column below, written as its table and its column joined by a dot, is a literal in the registry (`server/src/freeduet/adopt/registry.ts`), and a test fails when the registry and this table disagree, and when the live schema has a column that is in neither. [proved: `server/tests/single-user-adoption-registry.test.ts`]

**Move: the person's own data**

| Family | Columns | Notes |
|---|---|---|
| The person's row | `users.preferences`, `users.groups`, `users.onboarding_step`, `users.onboarding_completed_at` | `preferences` holds the team mark, the Full access choices and the person's own settings. Special handler, section 6.3. |
| Settings | `user_instructions.user_id`, `update_routing_preferences.owner_user_id`, `default_opt_outs.owner_user_id`, `proactive_settings.owner_user_id`, `push_devices.owner_user_id`, `voice_sessions.user_id`, `programs_helper_salts.user_id` | The programs helper's secret is made from the person's id and this salt, so on the new id the old secret stops verifying and the helper is paired again; the row moves because a cascading key is never left on the old person. |
| Conversations | `channel_memberships.user_id`, `attachments.uploaded_by`, `group_bot_threads.owner_user_id`, `group_messages.owner_user_id`, `learning_thread_bindings.user_id`, `intelligence_channel_mappings.user_id` | The history of a conversation is in the next row. |
| Conversation history, Intelligence off | `freeduet_threads.user_id`, `freeduet_thread_locks.user_id` | Tables made by the FreeDuet thread store, present only on that mode. [code: server/src/freeduet/threads/migrations/0000_freeduet_threads.sql] A thread owned by another user is refused on open, so without this the conversations move and cannot be opened. [code: server/src/freeduet/threads/store.ts] |
| Memories | `personal_memories.owner_user_id`, `memory_sources.owner_user_id` | |
| Routines and standing work | `routines.owner_user_id`, `responsibilities.owner_user_id`, `responsibility_events.owner_user_id`, `mail_rules.user_id`, `responsibility_source_bindings.owner_user_id`, `responsibility_triggers.owner_user_id`, `proactive_suggestions.owner_user_id` | |
| Approvals | `approval_preferences.owner_user_id`, `approval_rules.owner_user_id`, `approval_requests.owner_user_id` | Only finished requests move. A request still waiting stops the tool (section 6.1). Full access lives in `users.preferences`. |
| Saved logins | `saved_logins.owner_user_id`, `sign_in_requests.owner_user_id` | Only finished requests move. |
| Connected apps | `composio_connections.user_id`, `brokered_connections.user_id`, `mcp_user_credentials.user_id`, `pending_authorizations.actor_id`, `pending_authorizations.user_id`, `identity_links.user_id`, `identity_link_challenges.user_id`, `delivery_bindings.owner_user_id`, `delivery_challenges.owner_user_id`, `delivery_inbox.owner_user_id`, `delivery_outbox.owner_user_id` | `brokered_connections.user_id` moves for `holder = 'person'` rows only. A connection still being made stops the tool. Section 2.4 says what the vendor sees. |
| Bots the person made | `agent_profiles.owner_user_id`, `agent_preferences.user_id`, `bot_lifecycle.owner_user_id`, `skills.owner_user_id`, `demonstrations.owner_user_id` | |
| Team Bots | `team_bot_consents.user_id`, `team_bot_consent_defaults.user_id`, `team_bot_assignments.assigned_by`, `team_bot_publications.published_by`, `team_bot_audience.value`, `shared_use_approval_members.value` | The last two move only where `kind = 'user'`. The two `*_by` columns are foreign keys that cascade: left on a user who is later removed, they would take the assignments with them. |
| Authored configuration | `approval_team_rules.created_by`, `approval_team_settings.updated_by`, `sso_providers.user_id`, `app_access_requests.requested_by` | Foreign keys the administrator owns. Moved for the reason above. |
| Approvals, inside the request | `approval_requests.action` | Special handler: every JSON string equal to the id, at any depth. The request is stored whole, and its `actorId` names who it was asked of; the column that owns the row moves, and this keeps the two saying the same person. A request that was started and not finished is moved the same way. [code: server/src/approvals/service.ts, `resume`] |
| Work and Activity | `work_items.payload` | Special handler: every JSON string equal to the id, at any depth. The Activity list, wake-ups and waiting questions all read it by the id. [code: server/src/activity/activity.ts:122, 377, 515], [code: server/src/approvals/questions.ts:74-96] |
| Pages and tasks | `openduet_pages.owner_user_id`, `openduet_tasks.owner_user_id` | |
| Usage | `model_usage.user_id` | The administrator's usage summary counts distinct people; left alone it would count one person twice. |
| Shared use | `shared_use_requests.proposed_members` | Special handler: the `jsonb` list, where an entry names the user. |
| Credentials | `credentials.key_id` | Special handler: only the kinds `mcp_user_token` and `mcp_user_secret`, where the key is the user id. The ciphertext is AES-GCM with no data bound to the key, so it still opens. [code: server/src/credentials.ts:143-195] |

**Leave: records, and vendor ids**

| Columns | Why they stay |
|---|---|
| `audit_events.actor_user_id`, `audit_events.initiator_id`, `audit_events.target_id`, `audit_events.payload`, `action_records.actor_user_id` | Evidence. It says who did a thing at the time and must keep saying it. One new event records the move (section 6.3). |
| `action_policy.updated_by`, `capability_settings.updated_by`, `enterprise_settings.updated_by`, `network_policies.updated_by`, `components.updated_by`, `component_exclusions.withheld_by`, `component_functions.granted_by`, `plugin_grants.granted_by`, `mcp_servers.added_by`, `skills.installed_by`, `skill_tools.declared_by`, `sandboxed_components.authored_by`, `revoked_access.revoked_by`, `shared_use_approvals.approved_by`, `shared_use_requests.decided_by`, `shared_use_requests.requested_by`, `app_access_requests.resolved_by`, `identity_links.verified_by`, `brokered_connections.connected_by`, `personal_memories.formed_by` | "Who did it" ledger columns with no foreign key. |
| `brokered_connections.vendor_user_id`, `pending_authorizations.vendor_user_id`, `mcp_servers.shared_vendor_user_id` | The name the vendor files the account under. Section 2.4. |
| `freeduet_thread_runs.events`, `freeduet_thread_runs.input` | What was said in a conversation. Not rewritten. |
| `work_items.claimed_by`, `credentials.metadata`, `credentials.provider` | A worker's name, a label, and the app's name. |

**Identity: the single-user person has none, and the tool stops if it does**

`accounts.user_id`, `sessions.user_id`, `user_roles.user_id`, `scim_users.user_id`, `scim_subjects.user_id`, `scim_projection_grants.user_id`, `scim_identity_tombstones.user_id`, `browser_pairings.user_id` (a browser paired with the computer, D49: only a deployment with sign-in has any).

**Reviewed: looks like a person, is not**

`sessions.user_agent` (a browser's name), `saved_logins.username` (the person's name at a website), `scim_users.user_name`, `scim_users.user_name_key`, `scim_users.connection_user_key`, `scim_group_members.membership_key`, `scim_group_members.scim_user_id`, `scim_projection_grants.scim_user_id`, `scim_connection_bindings.decommission_cursor_user_id`, `identity_links.subject` (the other service's id), `routine_sweeps.owner` (a replica's name), `components.published_description`, `sandboxed_components.published_css`, `sandboxed_components.published_description`, `sandboxed_components.published_html`, `sandboxed_components.published_js_functions`, `sandboxed_components.published_argument_schema`, `brokered_connections.holder`, `pending_authorizations.holder` (the words `person` and `deployment`), `audit_events.initiator_kind`.

### 2.3 What the tool does not trust the list for

The list is from reading the schema today. Two checks do not depend on it:

- **At plan time**, the tool searches every `text`, `varchar`, `text[]` and `jsonb` column of every table for a value equal to `dev-local-user`. A hit in a column that is not in the list above stops the tool and names the column and the row count. A new feature that stores the id somewhere unlisted therefore stops the move instead of being skipped. The `leave` and `reviewed` columns above are excluded by name.
- **In the test suite**, the live schema is read: every foreign key to `users.id`, and every text, array or `jsonb` column whose name looks like a person, must be in the registry. A new column that is not fails the build. [proved: `server/tests/single-user-adoption-registry.test.ts`]

### 2.4 Connected apps and the vendor

For a person, the id the vendor files an account under is the local user id, on purpose. [code: server/src/plugins/shared-accounts.ts:19-51] A call reads the answer one of two ways:

- A broker that keeps its grants here (Composio) reads the stored row and sends the row's own `vendor_user_id`. [code: server/src/plugins/plugin-store/context.ts:663-699] The tool moves `user_id` and leaves `vendor_user_id`, so the call still lands in the account the person connected. **[verify]** on the real installation, one app.
- A broker that checks at the vendor on every call (Arcade) sends the id minted from the signed-in person. [code: server/src/plugins/plugin-store/context.ts:318-335, 661-662] The vendor has never heard of the new id, so the person connects the app again. This is a loss of convenience, not of data. The dry run lists the connected apps, so nobody is surprised.

### 2.5 The agent service

`agent-freeduet` keeps files in its data volume: lessons per member, the team log, the engine state and ledger, and hand-off checkpoints per member, thread and run. [code: agent-freeduet/freeduet/lessons.py:8], [code: agent-freeduet/freeduet/team_log.py:3], [code: agent-freeduet/freeduet/checkpoints.py:29] None of them holds a person id (no `actor`, `person` or `owner` field in any of them), and thread ids do not change. Nothing there moves and nothing there is lost.

### 2.6 Intelligence on

With Intelligence on, conversations and memories live in the vendor's service, keyed by the user id, and the tool cannot re-point them. The tool refuses that mode, in the open. FreeDuet's mode is Intelligence off. [code: server/src/freeduet/intelligence-switch.ts:44-56]

## 3. What moves, what stays

1. **Everything the person owns moves, and nothing is copied.** After the move `dev-local-user` owns nothing in the move list, and the target owns exactly what it owned. The tool counts both, inside the transaction, and commits only if they agree.
2. **Records stay as they were.** The audit trail keeps the old id. One new audit event says what moved, from whom, to whom, and how many rows per table.
3. **The old row stays.** `dev-local-user` is left in `users` with nothing. It is written again at every single-user start, so it can come back; and a foreign key that cascades is not left pointing at a row somebody might remove. It shows in the People list as `dev@openbot.local`.
4. **Moving is not merging.** A target that already owns anything in the move list is refused. Mixing two people's data into one is a design of its own (section 9, D2).
5. **The tool never writes a role.** The first sign-in grants the administrator role, and writes the audit row for it, because the address is in `INITIAL_ADMIN_EMAILS`. [code: server/src/auth/index.ts:541-575]

## 4. The target's row, and why its shape matters

If the person has not signed in yet, the target has no row, and the tool makes one. A first sign-in then finds it by address and links to it, so the person lands on the id that now owns the data. If the row is made wrongly, the sign-in makes a second user and the data is stranded again, quietly.

The row the tool makes:

| Column | Value | Why |
|---|---|---|
| `id` | a new UUID | any text does; the sign-in reuses it as it is |
| `email` | the address, lower-cased and trimmed | the sign-in looks an address up in lower case |
| `email_verified` | `true` | **[proved: `server/tests/single-user-adoption-signin.test.ts`]** a row that is not verified is refused by the sign-in (`account_not_linked`): no session, and the person is locked out of their own data. The test shows both, and a row with the address in capitals, which the sign-in does not find and so makes a second user. |
| `name` | the address | the same as the single-user row; the provider's name is not known yet |
| `preferences`, `groups`, `onboarding_*` | the single-user person's | they are the person's own |

The sign-in's own checks apply to the address before the row is made: the domain list, the exact address list `SIGNIN_ALLOWED_EMAILS`, and the removed-people list. A row the sign-in would refuse is never made. [code: server/src/auth/index.ts:398-445]

**Which providers can link.** [proved: the same test, with the stand-in provider configured as Okta] Better Auth joins a provider sign-in to an existing account only when the provider says the address is verified AND the account's own `email_verified` is true; this deployment sets no `accountLinking` or `trustedProviders`. [read: `better-auth/dist/oauth2/link-account.mjs`, `handleOAuthUserInfo`]

| Provider | Where `emailVerified` comes from | First sign-in lands on the prepared row |
|---|---|---|
| Google | the ID token's `email_verified` | yes |
| Okta | the userinfo or ID token's `email_verified` (Okta sends it for a verified address) | yes |
| Microsoft | `false` unless the app registration adds the optional claim `email_verified` (or lists the address in `verified_primary_email`); `mapEntraProfile` adds only the address. [read: `@better-auth/core` `microsoft-entra-id.ts`, `getUserInfo`] | **no**: the sign-in is refused (`account_not_linked`) and the person is locked out of the moved data |
| A provider an administrator registered (SSO) | the provider's claim | as the provider says; only an administrator can register one (`ADMIN_ONLY_AUTH_ROUTES`, `app.ts`) |

A deployment whose only provider is Microsoft is refused, with the reason. With Google and Microsoft both configured the move runs, and the person signs in with Google; a Microsoft sign-in is refused. The maintainer is turning on Google.

**What the verified row grants.** Nothing is granted to a person: no session, no role, no password. It makes one thing possible, which is that a provider that vouches for exactly this address (compared in lower case) can join itself to the row and so becomes the owner of everything on it. Who that can be is decided by the providers, not by the tool: Google and Okta vouch only for an address they have verified; Microsoft does not vouch, so it cannot; an administrator-registered provider says what its administrator made it say. Requiring the address to be in `INITIAL_ADMIN_EMAILS` (and `SIGNIN_ALLOWED_EMAILS` when it is set) decides which address may be given the data, and it keeps the data from going to an address the settings do not already trust with the administrator role. It does not prove that the person who types `--to` owns the address: that is the operator's word, backed by the dry run's echo of the address and `--apply --yes`. The first sign-in with that address wins, so a wrong address that is somebody else's real one hands the data to them.

**An account for the address that is not verified.** An account that exists already for the address and is not marked verified is refused, not filled in. [proved: `server/tests/single-user-adoption-review.test.ts`] Two ways one exists. Nobody signed in to it (made by hand or by SCIM): the sign-in would refuse the person, so moving data into it locks them out. Or a sign-in made it that could not prove the address (a Microsoft tenant writes the address of its own users): then it may be somebody else's, made by typing the person's address before they ever signed in, and filling it in would give them the data and the standing permissions. The refusal names the account, says which provider it is linked to, and, when the account owns nothing, gives the one statement that removes it.

**A person who signed in first.** The first request after sign-in makes the team's conversations for the new person, so the target already owns data and the tool refuses it. The runbook says: run the tool before the first sign-in. If it is too late, section 6.6 says what to do.

## 5. Threats

| # | Threat | What stops it |
|---|---|---|
| T1 | **A wrong `--to` hands everything to someone else**, including Full access, always-allow approval rules and connected apps. The move is an account-takeover primitive if it runs for the wrong person. | The tool refuses unless the address is in `INITIAL_ADMIN_EMAILS` (the single-user person is an administrator, so its data belongs to one), passes the sign-in's domain and exact-address checks, and is not on the removed list. It runs only from a terminal, by the person, on a stopped server. It does nothing without `--apply --yes`, and the default run prints who will own what, including the standing permissions, and writes nothing. |
| T2 | **A way in from the network** (a route, a job, a startup hook) would let anybody who reaches the server run it. | There is none, and a test fails if the server's own source ever imports the tool. [proved: `server/tests/single-user-adoption-unreachable.test.ts`] |
| T3 | **The server is running**, or something restarts it, while the move happens. | Four checks: no answer from the server's own port; no other connection to the database; table locks held for the whole move; both checks again just before the commit, and the move rolls back if anything appeared. |
| T4 | **A failure half way** leaves two half-people. | One transaction. Any error, a signal or a refusal rolls it all back. [proved: `server/tests/single-user-adoption-apply.test.ts`, a failure injected at every step] |
| T5 | **The backup is a copy of every secret.** | Mode `0600` from the moment the file exists (it is opened with `O_EXCL`), in an ignored folder, its path printed, and the tool stops if it cannot make it. |
| T6 | **A second run** repeats or damages. | The second run finds nothing left to move, says so, and writes nothing. It also reads the audit event. |
| T7 | **An installation that is not single-user** (people already signed in). | The source having a sign-in account, session, role or SCIM row stops the tool. |
| T8 | **A new feature stores the person's id somewhere new**, and the tool silently skips it. | Section 2.3: the plan-time search and the schema test. |
| T9 | **An imported or untrusted value is read as an instruction.** | The tool reads the database and the environment and nothing else. Nothing in a row is executed or followed. |
| T10 | **An account for the address that nobody verified** is filled in: it locks the person out, or belongs to whoever made it. | Refused (section 4). |
| T11 | **The tool works on another database than the server's**: a `DATABASE_URL` exported in the shell, or a run from another folder, beats the `.env` the server reads, and Bun adds the `.env` of the current folder without saying so. | Every answer the tool gives, the dry run, the move and "nothing to move", says which database it is about (`In    the database <name> on <host>:<port> (as <user>)`, never the password), so the person can compare it with the settings file they mean. |

## 6. The tool

`bun scripts/adopt-single-user-data.ts --to <address>`, from `openbot/`, by the person, with the same environment file the server uses.

### 6.1 It refuses unless

Each refusal names what is wrong and what to do, and exits with a non-zero code. Nothing is written before all of them pass.

| Check | Refused when |
|---|---|
| Configuration | The environment does not load (`loadConfig`), or no sign-in provider is configured, or the deployment is Intelligence-on, or the only provider is Microsoft. |
| The address | `--to` is missing, is `dev@openbot.local`, is not in `INITIAL_ADMIN_EMAILS`, is outside `SIGNIN_ALLOWED_EMAIL_DOMAINS` when that is set, is not in `SIGNIN_ALLOWED_EMAILS` when that is set, or is in the removed-people list. |
| The server | Something answers as the OpenBot server on its port (127.0.0.1 and ::1), or another connection to the database exists (the worker, a console, a restarted stack). |
| The source | It has an identity row (section 2.2), a request still waiting for the person (approval, sign-in form), or a connection being made. Or the residue search found the id in an unlisted column. |
| The target | It owns anything in the move list, or its row has a preferences value, a group or onboarding progress, or its address is not marked verified, or a differently-cased row for the address exists. |
| Nothing to do | The source owns nothing: it says so, and exits 0. |

### 6.2 The default run is a dry run

It prints, writes nothing, and says it wrote nothing: which database it is about, who will own the data, how many rows per table, the standing permissions (Full access members, always-allow rules), the connected apps that may need connecting again, and the exact command to apply. Everything it can refuse for, it refuses for here too, so a clean dry run is a real forecast.

### 6.3 `--apply --yes`

1. **Backup.** `pg_dump -Fc` to a file made with mode `0600`, `openbot/.logs/single-user-backup-<time>.dump` (ignored by git), its path printed. It uses the host's `pg_dump` when its major version is at least the server's, otherwise `docker compose exec -T postgres pg_dump`. It stops if there is no way to make one, or if the file does not start with the dump magic.
2. **One transaction.** Take an advisory lock; set a lock timeout; lock every table in the registry in `SHARE ROW EXCLUSIVE` mode (readers are fine, writers wait or fail); check the preconditions again inside; create or fill the target row; run each registry statement and record how many rows it changed; run the special handlers; count what `dev-local-user` still owns and what the target now owns, and stop if they do not match the plan; write the audit event `person.single_user_data_adopted` (the old id, the new id, rows per table, the backup's file name and nothing of its path); check the server and the connections once more; commit.
3. **After.** It prints what moved, the backup's path, and how to go back.

### 6.4 Interruption, and a second run

- An error, a refusal or a signal before the commit leaves the database as it was. Closing the connection rolls the transaction back, so a killed tool leaves nothing. [proved: `server/tests/single-user-adoption-apply.test.ts` (an error injected at every step) and the same file's killed child process]
- A run after a commit finds nothing to move and says "already moved at <time>".

### 6.5 What it never does

It does not run by itself, listen on a port, read or write a recording, call a provider, or send anything anywhere. It does not delete `dev-local-user`, any audit row, or any conversation text. It does not change the server's configuration; turning sign-in on is the person's own edit, made before it runs.

### 6.6 The way back, and the case of "I signed in first"

- **Back out** after a commit: stop the server, restore the backup the tool printed (`pg_restore --clean --if-exists`), set the environment file back to single-user, start. The backup is of the whole database, so it also brings back anything written after the move; that is the price of the simplest way back.
- **Signed in first**: the tool refuses and says the address already owns data. Nothing is written. The first request after a sign-in makes the team of the new account, so this is what almost every person who signed in and saw an empty FreeDuet will meet. The way out is the backup the person took before turning sign-in on: restore it, then run the tool, then sign in. Without such a backup there is no way out that the tool offers: it will not delete an account that owns data, and merging is not built (D2).
- **A request still waiting** (an approval card, a sign-in form, a connection being made) also stops the tool, because it is bound to who asked. It can only be answered in the app, and with the provider settings in `.env` the app is the sign-in one, so the refusal says to take the provider settings out of `.env` for now (keeping `OPENBOT_SINGLE_USER=true`), answer it, stop the server, put the settings back and run the tool again, and not to sign in with the address in between.
- **After the move, what the person is not shown.** The audit trail keeps the old id (section 3), and two readers find a person's entries by that id: the list of what members did under Full access, and the list and undo of settings changed in chat (seven days). Entries from before the move are not in them; they are in the audit trail. [code: `server/src/freeduet/full-access.ts` `recent`, `server/src/settings-in-chat/changes.ts`] Decision in section 9.

## 7. Tests

All against a real PostgreSQL scratch database, through the real `createApp`; the sign-in is the real callback exchange with a stand-in provider.

| File | Shows |
|---|---|
| `single-user-to-sign-in-problem.test.ts` | Section 1. Passes on main: it asserts the problem. |
| `single-user-adoption-registry.test.ts` | The registry matches the live schema and this document. Fails on main (no registry). |
| `single-user-adoption-plan.test.ts` | The dry run: counts, nothing written, every refusal. Fails on main. |
| `single-user-adoption-apply.test.ts` | Before and after visibility for each family, collisions, interruption, a second run, a wrong target, a running server. Fails on main. |
| `single-user-adoption-signin.test.ts` | After the move, the real sign-in lands on the same user and sees the data; an unverified row would not. Fails on main. |
| `single-user-adoption-unreachable.test.ts` | Nothing in the server imports the tool. |
| `single-user-adoption-review.test.ts` | The defects an independent review found (section 8), each test red on the source the review started from. |
| `single-user-adoption-backup.test.ts` | The real `pg_dump` runs, the file is `0600` and a dump. Skipped where `pg_dump` is missing. |

## 8. Built so far

**Built.** The first slice: `bun scripts/adopt-single-user-data.ts --to <address>` (dry run) and `--apply --yes` (backup, then the move). Run by the person, never by the server, never over HTTP.

| Part | Where |
|---|---|
| Registry of every place that names a person, checked against the live schema | `server/src/freeduet/adopt/registry.ts`, `schema-scan.ts` |
| Dry run and every refusal | `plan.ts`, `preconditions.ts`, `command.ts` |
| Backup: file `0600` from creation, real dump or nothing, no password on a command line | `backup.ts` |
| The move: one transaction, table locks, re-read under the locks, verification, one audit event | `apply.ts` |
| Audit type | `server/src/audit.ts` |

**Tests** (real PostgreSQL scratch database, real app; all of them fail on main because the tool does not exist, except the problem test, which passes on main because it asserts the problem).

| File | Result after |
|---|---|
| `single-user-to-sign-in-problem.test.ts` | pass (also on main) |
| `single-user-adoption-registry.test.ts` | pass |
| `single-user-adoption-plan.test.ts` | 30 pass |
| `single-user-adoption-apply.test.ts` | 23 pass, including an error injected after each of about 75 steps (no change each time), a process killed with SIGKILL mid-move, a writer arriving under the locks |
| `single-user-adoption-signin.test.ts` | 8 pass: the real sign-in lands on the same user and sees every family |
| `single-user-adoption-backup.test.ts` | 18 pass with a real `pg_dump`/`pg_restore`: move, printed way back, every table identical to before |
| `single-user-adoption-unreachable.test.ts` | 5 pass |
| `single-user-adoption-review.test.ts` | 14 pass: the review's findings below, each red on the source the review started from |

All eight files together: 112 pass, 0 fail, 714 `expect()` calls (98 pass, 652 before the review).

Each check was also broken on purpose (mutation) and the tests failed: skipped column, verification off, weaker locks, old row not emptied, no audit event, unverified row, preferences not carried, file mode, dump header, container identity, password on the command line.

**Found on the way.** `pg_stat_activity` is read as a snapshot inside a transaction, so a check for other connections made late in the transaction saw nothing; it now clears the snapshot first. [re-proved by the review: with the reset removed, four tests of "what appears while the move is under way" fail]

**Independent review (2026-11-15).** A reviewer who had not written the code tried to break it, against a real PostgreSQL, with the real store and the real command. Every finding has a test that was red on the source the review started from, in `single-user-adoption-review.test.ts`.

| # | Severity | What it was | State |
|---|---|---|---|
| R1 | High: the tool refused on almost every real installation | `approval_requests.action` is the whole request, including `actorId`. The registry moved the row and had no rule for the JSON inside it, so the plan-time search stopped the move for anybody who had ever answered an approval card. The existing tests inserted a request with an empty `action` by hand, so they never met it. | Fixed: a special handler, like `work_items.payload` (section 2.2). A request that was started and not finished is moved the same way. |
| R2 | High: silent corruption | The JSON that names the person was re-addressed in JavaScript, where every number is a float: `1234567890123456789` came back as `1234567890123456800` and `1.10` as `1.1`, in the very row that was only being re-addressed. The row counts agreed, so nothing said so. It affected `work_items.payload` and `shared_use_requests.proposed_members` as well. | Fixed: the replacement is made on the JSON text and copies every other character as it was (`replaceJsonStrings`). |
| R3 | High: a way to hand the data to someone else, and a way to lock the person out | An existing account for the address that owned nothing was filled in whatever made it, though the sign-in joins a provider only to an account whose address is verified. If nobody had signed in to it, the person was locked out of the moved data. If somebody had, with a provider that cannot vouch for the address (Microsoft), it was theirs. | Fixed: refused, naming the provider, and giving the statement that removes an empty one (section 4). |
| R4 | Medium | The tool never said which database it worked on, and Bun adds the `.env` of the current folder, and a shell's exported `DATABASE_URL` beats it. A run on the wrong database said "Nothing to move" or moved another installation's data. | Fixed: every answer names the database, host, port and user, never the password (T11). |
| R5 | Medium | The advice for a request still waiting ("answer it in the app") can only be followed with the provider settings in `.env`, which makes the app the sign-in one. Following it meant signing in with the address, which makes the account the tool then refuses. | Fixed: the refusal says how to answer it as the app ran before, and what not to do (section 6.6). |
| R6 | Low | The audit trail keeps the old id, and the list of what members did under Full access, and the list and undo of settings changed in chat, find entries by that id. Entries from before the move are not in them. | Not changed: decision in section 9. |

Checked and found sound: the move is atomic (an error injected at every step, a killed process); the late check for other connections works (above); the backup is private from the moment it exists, holds the whole database, and the printed way back restores every table (real `pg_dump` and `pg_restore`); the encrypted credentials still open after their `key_id` moves (no data is bound to the key); nothing the tool prints, or the one audit event it writes, holds a secret (ids, the address, counts and the backup's file name only); a different address cannot land on the prepared row, and neither can an address a provider has not verified (section 4).

**Not verified.** No real installation was moved, so any other column of real data that holds the person's id is unknown until the dry run, which names it and writes nothing (the review found one this way, R1). No real Google sign-in: the provider is a stand-in, which proves what the deployment does with an answer, not what Google sends; that Microsoft does not send a verified address is read from the library, not run. The backup through the stack's postgres container (`docker compose exec`) is tested with a stand-in for `docker`, not a real one, and it is the route a WSL and Docker installation uses unless `pg_dump` 16 or newer is installed there. The real-`pg_dump` tests skip where no `pg_dump` as new as the server exists (the CI runner has 16 against a server 17), so CI does not run them. The refusal for a file system that keeps no permissions is read, not run. The Windows watchdog was not exercised. The JSON rewrite reads every row that names the person into memory at once: nothing measured it on an approval history of many thousands of requests, each of which stores the conversation it was asked in.

## 9. Decisions left to the maintainer

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| Pausing the watchdog during the move | a command to pause it; or stop it by hand | give the maintainer the exact pause command | stopping the server makes it start the stack again within a minute; the tool stops if it sees the server, but the person should not have to race it |
| Someone who signed in and opened the app before running the tool | refuse (built); or merge two people's data | refuse, restore the earlier backup, run the tool, sign in | merging mixes two people's data and cannot be undone cleanly; not built. This is the usual case of a person who already saw the empty app (the first request after a sign-in makes the team), and without a backup from before sign-in was turned on the tool offers no way out. |
| Microsoft as the only provider | refuse (built); or support | refuse | the sign-in is not expected to link to the prepared row; the maintainer is turning on Google |
| Connected apps | leave (built, listed in the dry run); or reconnect automatically | leave | a vendor may ask for the connection again; the tool cannot know |
| The old single-user row | left, empty (built); or deleted | left | audit rows keep its id, and it is the way back's anchor |
| Name on the new row | the address (built); or ask | the address | the provider's name replaces it at sign-in |
| Intelligence on | unsupported (refused by the checks); or supported | unsupported | conversation history lives elsewhere and was not moved |
| Wrong address typed | none: the move cannot be redirected, only undone with the backup | accept | a second move would mix data |
| A killed run | may leave a private partial dump in `.logs` | accept; delete it by hand | it is never deleted automatically because it may be the only way back |
| Entries from before the move in the Full access list and in the settings-changes list and undo | leave (built: they are in the audit trail, not in those lists); or make the two readers also find a person's earlier id through the `person.single_user_data_adopted` event | leave | the lists are views, not records, and the undo window is seven days; the change touches two readers in the approval path for little |
| An account for the address that is not verified | refuse, and say how to remove an empty one (built); or mark it verified and fill it in | refuse | marking it verified is what an impostor's account needs, and what a locked-out account cannot do for itself; an empty account is one statement to remove |
| Roadmap row | add to `docs/ROADMAP.md` | coordinator adds it | this brief did not allow editing it |
