import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { encryptSsoConfig } from "../../src/auth/encrypt-sso-config";
import { encryptSecret } from "../../src/credentials";
import type { Database } from "../../src/db/client";
import {
  credentials,
  savedLogins,
  ssoProviders,
  users,
} from "../../src/db/schema";

/** Thirty-two zero bytes: the key `.env.example` used to publish. Made here, not spelled. */
export const EXAMPLE_KEY = Buffer.alloc(32).toString("base64");

/**
 * The plaintexts of the saved secrets a test seeds. None of them may ever appear in anything the
 * command prints or in any file it leaves beside `.env` other than the backup.
 */
export const CANARY = {
  connection: "CANARY-connection-token-7c1f9a3e55d2",
  revoked: "CANARY-revoked-token-0b8e44d1a6f7",
  loginOne: "CANARY-login-password-one-93ad1c70e2b4",
  loginTwo: "CANARY-login-password-two-5e60b2f8c1d9",
  oidc: "CANARY-oidc-client-secret-a417d3e90b62",
  saml: "CANARY-saml-signing-key-2f95c8a1d703",
  samlOther: "CANARY-saml-other-key-61d0e7b39c48",
  legacy: "CANARY-legacy-plain-secret-8d24f6a0c715",
} as const;

export type Seeded = {
  credentialIds: string[];
  loginIds: string[];
  ssoIds: string[];
  /** One credential per line: what its id holds, in the clear. */
  plaintext: Record<string, string>;
};

/**
 * What the server writes into an identity provider's two columns, made by the server's own wrapper
 * (`auth/encrypt-sso-config.ts`) and not by a copy of what it does.
 */
async function sealedLikeTheServer(
  key: string,
  fields: { oidcConfig?: string; samlConfig?: string },
): Promise<{ oidcConfig?: string; samlConfig?: string }> {
  let stored: Record<string, unknown> = {};
  const adapter = encryptSsoConfig(
    () => ({
      create: async (data: Record<string, unknown>) => {
        stored = data.data as Record<string, unknown>;
        return data.data;
      },
      update: async () => undefined,
      findOne: async () => undefined,
      findMany: async () => [],
    }),
    key,
  )({});
  await adapter.create({ model: "ssoProvider", data: fields } as never);
  return stored as { oidcConfig?: string; samlConfig?: string };
}

/**
 * A vault with something in every place the key seals, and in the places beside them that it does not:
 *
 *   credentials    a live connection and a revoked one
 *   saved_logins   two saved logins of one person
 *   sso_providers  one with both columns sealed, one whose OIDC column is still plain text from before
 *                  the server sealed it and whose SAML column is empty, one whose OIDC column is an
 *                  empty string and whose SAML column is sealed
 *
 * That is 2 + 2 + 3 sealed values in 7 rows, and one value stored as plain text. The three tables are
 * emptied first. `key` seals everything, which is what a test starts from.
 */
export async function seedVault(
  database: Database,
  key: string = EXAMPLE_KEY,
): Promise<Seeded> {
  await database.execute(
    sql`truncate table credentials, saved_logins, sso_providers restart identity cascade`,
  );
  await database.execute(sql`delete from users`);
  const plaintext: Record<string, string> = {};

  const credentialIds: string[] = [];
  for (const [name, secret, revoked] of [
    ["connection", CANARY.connection, false],
    ["revoked", CANARY.revoked, true],
  ] as const) {
    const [row] = await database
      .insert(credentials)
      .values({
        kind: "connector",
        provider: `fixture-${name}-${randomUUID()}`,
        keyId: `fixture-${name}`,
        metadata: { note: "metadata is not sealed" },
        encryptedValue: await encryptSecret(key, secret),
        revokedAt: revoked ? new Date("2026-01-01T00:00:00Z") : null,
      })
      .returning({ id: credentials.id });
    if (!row) throw new Error("the credential was not stored");
    credentialIds.push(row.id);
    plaintext[row.id] = secret;
  }

  await database.insert(users).values({
    id: "fixture-user",
    email: "fixture-user@example.test",
  });
  const loginIds: string[] = [];
  for (const [id, secret] of [
    ["fixture-login-one", CANARY.loginOne],
    ["fixture-login-two", CANARY.loginTwo],
  ] as const) {
    await database.insert(savedLogins).values({
      id,
      ownerUserId: "fixture-user",
      origin: `https://${id}.example.test`,
      username: "someone",
      encryptedPassword: await encryptSecret(key, secret),
    });
    loginIds.push(id);
    plaintext[id] = secret;
  }

  const both = await sealedLikeTheServer(key, {
    oidcConfig: JSON.stringify({ clientSecret: CANARY.oidc }),
    samlConfig: JSON.stringify({ signingKey: CANARY.saml }),
  });
  const samlOnly = await sealedLikeTheServer(key, {
    samlConfig: JSON.stringify({ signingKey: CANARY.samlOther }),
  });
  const ssoIds = ["fixture-sso-both", "fixture-sso-legacy", "fixture-sso-saml"];
  await database.insert(ssoProviders).values([
    {
      id: ssoIds[0] ?? "",
      issuer: "https://both.example.test",
      providerId: "fixture-both",
      domain: "both.example.test",
      oidcConfig: both.oidcConfig ?? null,
      samlConfig: both.samlConfig ?? null,
    },
    {
      id: ssoIds[1] ?? "",
      issuer: "https://legacy.example.test",
      providerId: "fixture-legacy",
      domain: "legacy.example.test",
      oidcConfig: JSON.stringify({ clientSecret: CANARY.legacy }),
      samlConfig: null,
    },
    {
      id: ssoIds[2] ?? "",
      issuer: "https://saml.example.test",
      providerId: "fixture-saml",
      domain: "saml.example.test",
      oidcConfig: "",
      samlConfig: samlOnly.samlConfig ?? null,
    },
  ]);
  plaintext["fixture-sso-both/oidc_config"] = JSON.stringify({
    clientSecret: CANARY.oidc,
  });
  plaintext["fixture-sso-both/saml_config"] = JSON.stringify({
    signingKey: CANARY.saml,
  });
  plaintext["fixture-sso-saml/saml_config"] = JSON.stringify({
    signingKey: CANARY.samlOther,
  });

  return { credentialIds, loginIds, ssoIds, plaintext };
}

/** Every row of the three tables, as text, in a fixed order: two snapshots are equal when nothing changed. */
export async function snapshot(database: Database): Promise<string> {
  const parts: string[] = [];
  for (const table of ["credentials", "saved_logins", "sso_providers"]) {
    const rows = await database.execute(
      sql.raw(
        `select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)::text as rows from public.${table} t`,
      ),
    );
    parts.push(`${table}: ${String(rows[0]?.rows)}`);
  }
  return parts.join("\n");
}
