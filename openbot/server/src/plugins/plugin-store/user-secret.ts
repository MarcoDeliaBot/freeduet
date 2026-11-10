import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "../../audit";
import { encryptSecret } from "../../credentials";
import {
  credentials as credentialRows,
  mcpUserCredentials,
} from "../../db/schema";
import { mailPreset } from "../mail-presets";
import {
  parseSecret,
  readSecretInput,
  SecretRefusedError,
  serializeSecret,
} from "../user-secret";
import type { StoreContext } from "./context";
import { iso, PluginRefusedError } from "./model";

/**
 * What a `user-secret` connection's `scope` column says. The column records what a vendor granted,
 * and nothing was granted here: this names the kind of credential, so a reader of the table can tell
 * an app password from an OAuth scope string at a glance.
 */
const SECRET_SCOPE = "app-password";

/**
 * A person's pasted app password: connecting it, ending it, and saying whether it is there.
 *
 * Beside {@link connectionMethods} and not inside it, because nothing here is an OAuth flow, a
 * brokered one or a rotation, and the methods that are should not grow a branch for a credential
 * the person made themselves. What it shares with them is the vault (a `credentials` row, one live
 * per person and server) and the pointer row `mcp_user_credentials`, so `GET /connections`, the Bot
 * page's state and the offboarding sweeps read these connections without being taught a second table.
 *
 * NOTHING THE PERSON PASTED LEAVES THIS FILE except into the vault, encrypted, as one value. The
 * trail rows say that a connection was made, replaced or ended, and who by; they carry no address,
 * no password and no calendar link. The status answers the address and whether a calendar is
 * attached, and no more.
 */
export function userSecretMethods(context: StoreContext) {
  const {
    database,
    auditStore,
    credentials,
    encryptionKey,
    requireServer,
    secretFor,
    verifyUserSecret,
  } = context;

  /** The server's entry, refusing every server that is not connected by pasting a secret. */
  async function secretEntryOf(serverId: string) {
    const { entry } = await requireServer(serverId);
    if (entry?.auth.kind !== "user-secret") {
      throw new PluginRefusedError("That app doesn't connect this way.", null);
    }
    return { entry, auth: entry.auth };
  }

  return {
    /**
     * Check what a person pasted, and keep it only if it works.
     *
     * ORDER: read the input, check it with the provider, and only then write. A password the
     * provider refuses is never stored, so there is no connection that "exists" and refuses every
     * call, and a failed attempt leaves a person's earlier working connection exactly as it was.
     *
     * The vault write and the pointer are one transaction, as {@link swapUserCredential}'s are, and
     * for its reason: a failure between them must not leave a pointer at a secret already retired.
     * A reconnection replaces the earlier secret, which is revoked in the same breath.
     *
     * `userId` is the signed-in person and nothing in the body is looked at for who it is.
     */
    async connectUserSecret(input: {
      serverId: string;
      userId: string;
      body: unknown;
    }): Promise<{
      address: string;
      calendar: boolean;
      reconnected: boolean;
    }> {
      if (!input.userId) {
        throw new PluginRefusedError("Sign in to connect an account.", null);
      }
      const { auth } = await secretEntryOf(input.serverId);
      const preset = mailPreset(auth.preset);

      const read = readSecretInput(input.body, preset);
      if (!read.ok) throw new SecretRefusedError(read.message, 400);
      const { secret } = read;

      const checked = await verifyUserSecret(preset, secret);
      if (!checked.ok)
        throw new SecretRefusedError(checked.message, checked.status);

      const key = {
        kind: "mcp_user_secret" as const,
        provider: input.serverId,
        keyId: input.userId,
      };
      const value = {
        ...key,
        // The existence of the connection and which server it is for, and nothing the person typed.
        metadata: { server: input.serverId },
        encryptedValue: await encryptSecret(
          encryptionKey,
          serializeSecret(secret),
        ),
      };

      const { replaced } = await database.transaction(async (transaction) => {
        const live = await credentials.findLiveByKey(key, transaction);
        const stored = live
          ? await credentials.rotate(
              { ...value, previousCredentialId: live.id },
              transaction,
            )
          : await credentials.create(value, transaction);

        await transaction
          .insert(mcpUserCredentials)
          .values({
            serverId: input.serverId,
            userId: input.userId,
            credentialId: stored.id,
            scope: SECRET_SCOPE,
          })
          .onConflictDoUpdate({
            target: [mcpUserCredentials.serverId, mcpUserCredentials.userId],
            set: {
              credentialId: stored.id,
              scope: SECRET_SCOPE,
              updatedAt: new Date(),
            },
          });
        return { replaced: live !== null };
      });

      await recordAuditEvent(auditStore, {
        eventType: "mcp.account_connected",
        targetType: "mcp_server",
        targetId: input.serverId,
        payload: {
          actor: input.userId,
          server: input.serverId,
          scope: SECRET_SCOPE,
          reconnected: replaced,
        },
      });

      return {
        address: secret.address,
        calendar: Boolean(secret.calendarUrl),
        reconnected: replaced,
      };
    },

    /**
     * End one person's pasted connection: the secret is revoked here and the pointer goes.
     *
     * Nothing can be withdrawn at Google from this side. An app password is revoked by the person on
     * their own Google account page, so the answer says so, and the trail says the vendor was not
     * asked (`vendorRevocationRequested: false`) rather than leaving a reader to assume it was.
     *
     * ONLY THE ASKER'S OWN ROW, by `(serverId, userId)` from the session. A person with none gets
     * `disconnected: false` and nothing is touched.
     */
    async disconnectUserSecret(input: {
      serverId: string;
      userId: string;
      by: string;
    }): Promise<{ disconnected: boolean }> {
      if (!input.userId) return { disconnected: false };
      await secretEntryOf(input.serverId);
      const owned = and(
        eq(mcpUserCredentials.serverId, input.serverId),
        eq(mcpUserCredentials.userId, input.userId),
      );

      const ended = await database.transaction(async (transaction) => {
        const [row] = await transaction
          .select({ credentialId: mcpUserCredentials.credentialId })
          .from(mcpUserCredentials)
          .where(owned)
          .for("update");
        if (!row) return false;
        const [credential] = await transaction
          .select({ revokedAt: credentialRows.revokedAt })
          .from(credentialRows)
          .where(eq(credentialRows.id, row.credentialId))
          .for("update");
        if (credential && credential.revokedAt === null) {
          await credentials.revoke(row.credentialId, transaction);
        }
        await transaction.delete(mcpUserCredentials).where(owned);
        return true;
      });
      if (!ended) return { disconnected: false };

      await recordAuditEvent(auditStore, {
        eventType: "mcp.account_disconnected",
        targetType: "mcp_server",
        targetId: input.serverId,
        payload: {
          actor: input.by,
          server: input.serverId,
          owner: input.userId,
          reason: "self",
          vendorRevocationRequested: false,
        },
      });
      return { disconnected: true };
    },

    /**
     * Whether this person has a working pasted connection, and the address it is for.
     *
     * The address is read out of the encrypted value, since that is the only place it is kept, and
     * it is the ONLY part of the secret that is ever returned: a person is shown which mailbox
     * their Bots read. The password and the calendar link stay where they are; whether a calendar
     * is attached is a yes or a no.
     */
    async userSecretStatus(input: {
      serverId: string;
      userId: string;
    }): Promise<
      | { connected: false }
      | {
          connected: true;
          address: string;
          calendar: boolean;
          connectedAt: string;
        }
    > {
      if (!input.userId) return { connected: false };
      await secretEntryOf(input.serverId);
      const [held] = await database
        .select({
          credentialId: mcpUserCredentials.credentialId,
          connectedAt: mcpUserCredentials.connectedAt,
          revokedAt: credentialRows.revokedAt,
        })
        .from(mcpUserCredentials)
        .innerJoin(
          credentialRows,
          eq(credentialRows.id, mcpUserCredentials.credentialId),
        )
        .where(
          and(
            eq(mcpUserCredentials.serverId, input.serverId),
            eq(mcpUserCredentials.userId, input.userId),
          ),
        )
        .limit(1);
      if (!held || held.revokedAt !== null) return { connected: false };

      let stored: string;
      try {
        stored = await secretFor(held.credentialId, "withdrawn");
      } catch (error) {
        if (error instanceof PluginRefusedError) return { connected: false };
        throw error;
      }
      const secret = parseSecret(stored);
      if (!secret) return { connected: false };
      return {
        connected: true,
        address: secret.address,
        calendar: Boolean(secret.calendarUrl),
        connectedAt: iso(held.connectedAt) ?? "",
      };
    },
  };
}
