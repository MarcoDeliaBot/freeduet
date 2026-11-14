/**
 * Who may sign in, by exact address (docs/design/phone-and-remote.md, slice 1).
 *
 * WHY IT EXISTS. `SIGNIN_ALLOWED_EMAIL_DOMAINS` admits everybody at a domain, and at a public domain
 * such as gmail.com that is every account there. A FreeDuet deployment has one Claude login that all
 * its members share (docs/M1_PLAN.md D9), so a stranger who is let in by a sign-in reaches the
 * person's team. With no sign-in the app never leaves this machine; the day a phone reaches it from
 * outside the home network there is a sign-in in front of it, and this is what says WHO. Without it,
 * "a real sign-in" means "anybody the provider accepts".
 *
 * `SIGNIN_ALLOWED_EMAILS` names the addresses, one by one, as `alice@example.com,bob@example.com`.
 * Exact, with no wildcards and no patterns: a whole domain is `SIGNIN_ALLOWED_EMAIL_DOMAINS`.
 *
 * UNSET MEANS UNCHANGED. No variable, no field on the configuration, no extra check: a deployment
 * that has not heard of this admits exactly whom it admitted before. That is also why the answer to
 * "no list" is `true` here and not `false`.
 *
 * BOTH LISTS, WHEN BOTH ARE SET. An address must pass each list that exists, so the exact list can
 * only narrow what the domain list admits, never widen it. An address whose domain the domain list
 * does not admit could therefore never sign in, which is a contradiction in the configuration and
 * stops the boot instead of showing up as one person who is refused for no reason they can see.
 *
 * WHAT IT IS CHECKED AGAINST. The address the identity provider returns, which OpenBot never requires
 * to be a verified one. With Google, with Okta and with one Microsoft directory that address is the
 * account's own. Under Microsoft's multi-tenant audiences it is whatever the signing-in tenant's
 * administrator wrote, so the list is refused there at start-up, for the reason the domain list is
 * (config.ts `namesNoDirectory`). This is not a stronger promise than the provider can keep.
 *
 * WHEN IT IS ASKED. When an account is made and again when a session is made for an account that
 * already exists (auth/index.ts, beside the domain list), so taking an address off the list stops the
 * next sign-in. It does not end a session that already exists: People, Remove access does that now.
 *
 * ONE FUNCTION FOR BOTH SIDES, as email-domain.ts does it: the list somebody writes and the address a
 * provider returns are reduced to one spelling by `normalizeAddress`, so a rule cannot mean one thing
 * when it is written and another when it is matched.
 */
import { emailDomainAllowed, normalizeDomain } from "../auth/email-domain";

export const SIGNIN_ALLOWED_EMAILS_VARIABLE = "SIGNIN_ALLOWED_EMAILS";

/** What a refused account is told. Names no list: who is on it is nobody else's business. */
export const ADDRESS_REFUSAL_MESSAGE =
  "This deployment is not open to that account. Ask the person who runs it to add your address.";

/** The reason on the audit row, beside the domain list's "email domain not admitted by this deployment". */
export const ADDRESS_REFUSAL_REASON =
  "email address not admitted by this deployment";

/** The longest an address can be (RFC 5321). Anything longer is not one, and is not worth reading. */
const LONGEST_ADDRESS = 254;

/**
 * Nothing in an address this list can hold is whitespace or a control, format, private-use or unassigned
 * character. A pasted `Alice <alice@example.com>` has a space in it and is refused, not read as an
 * address whose local part is `alice <alice`.
 */
const NOT_PLAIN = /[\p{C}\s]/u;

/**
 * What cannot be in the part before the last `@`: another `@`, a quote, a comment, a list, a group
 * or an escape. A quoted local part (`"a@b"@example.com`) is legal and almost never real, and reading
 * it is exactly where a second `@` gets mistaken for the separator, so it is refused whole: that
 * fails closed, and the person is told to use another address instead of being admitted as somebody else.
 *
 * And the two characters somebody types to mean "any": `*` and `?`. They are legal in an address and
 * nobody has one, and this list has no patterns, so `*@example.com` read as a literal address would
 * be one that matches nobody, and the deployment would start and turn everybody away without saying
 * why. Refused, it stops the start and says so (the whole domain is `SIGNIN_ALLOWED_EMAIL_DOMAINS`).
 */
const NOT_ATOM = /[@"(),:;<>[\]\\*?]/;

/**
 * What the part after the last `@` is made of: letters, digits, marks (an IDN has them), a dot, a
 * hyphen and an underscore. Checked BEFORE `normalizeDomain`, which reads its input the way a URL
 * host is read and stops at the first `/`, `?` or `#`: without this, `a@example.com/x` came out as
 * `a@example.com`, the address of somebody else.
 */
const DOMAIN_CHARACTERS = /^[\p{L}\p{N}\p{M}._-]+$/u;

/**
 * One address in the single spelling both sides of the comparison are reduced to, or undefined when
 * it is not an address this list can hold.
 *
 * Split on the LAST `@`. The local part is lower-cased and nothing else is done to it, so `a.b` and
 * `ab`, and `a+tag` and `a`, stay different addresses: the list is exact, and Gmail's habit of
 * ignoring dots and tags is the provider's, not ours (the provider returns the account's own).
 * The domain goes through `normalizeDomain`, the function the domain list uses: lower case, IDNA, no
 * trailing dot, so an IDN matches whichever way either side spells it.
 */
export function normalizeAddress(raw: string): string | undefined {
  const address = raw.trim();
  if (address.length === 0 || address.length > LONGEST_ADDRESS)
    return undefined;
  if (NOT_PLAIN.test(address)) return undefined;

  const at = address.lastIndexOf("@");
  if (at <= 0) return undefined;

  const local = address.slice(0, at);
  if (NOT_ATOM.test(local)) return undefined;

  const written = address.slice(at + 1);
  if (!DOMAIN_CHARACTERS.test(written)) return undefined;
  const domain = normalizeDomain(written);
  if (!domain) return undefined;

  return `${local.toLowerCase()}@${domain}`;
}

/**
 * May this address sign in?
 *
 * No list is "no opinion" and admits, so a deployment that never set one is unchanged. Once a list
 * exists, an address that cannot be read is refused: admitting something the rule cannot be applied
 * to is the case the rule is for.
 */
export function emailAddressAllowed(
  email: string | null | undefined,
  allowedEmails: readonly string[] | undefined,
): boolean {
  if (allowedEmails === undefined || allowedEmails.length === 0) return true;
  if (typeof email !== "string") return false;

  const address = normalizeAddress(email);
  if (!address) return false;

  return allowedEmails.some((allowed) => normalizeAddress(allowed) === address);
}

/** An entry as it is quoted in a start-up message: clipped, and with nothing a log could mistake for a line. */
function shown(entry: string): string {
  return JSON.stringify(entry.length > 80 ? `${entry.slice(0, 80)}...` : entry);
}

/** What the loader needs to know about the rest of the configuration, to refuse a list that cannot work. */
export type SignInAllowlistContext = {
  /** `INITIAL_ADMIN_EMAILS`: every administrator must be able to sign in. */
  initialAdminEmails: readonly string[];
  /** `SIGNIN_ALLOWED_EMAIL_DOMAINS`, already normalised. Empty is no opinion. */
  allowedEmailDomains: readonly string[];
  /** `MICROSOFT_OAUTH_TENANT_ID`, set only when it names no directory (`common`, `organizations`, `consumers`). */
  multiTenantAudience?: string;
};

/**
 * The list `SIGNIN_ALLOWED_EMAILS` names, normalised and without repeats, or undefined when the
 * variable is unset or blank.
 *
 * `raw` is the whole value, because a value that is SET and yields nothing is not an unset one, and
 * the difference is every sign-in: `SIGNIN_ALLOWED_EMAILS=,` must stop the boot, not read as no list
 * and admit everybody. Every arrangement that cannot work refuses here, at start-up, where somebody
 * is looking, rather than at the first sign-in:
 *
 *  - an entry that is not an address (a domain, `Name <a@b.c>`, two addresses with no comma between);
 *  - a Microsoft audience that names no directory, where the address is the signing-in tenant's own word;
 *  - an administrator in `INITIAL_ADMIN_EMAILS` the list does not name, who could never sign in;
 *  - an address at a domain `SIGNIN_ALLOWED_EMAIL_DOMAINS` does not admit, for the same reason.
 */
export function signInAllowedEmails(
  raw: string | undefined,
  context: SignInAllowlistContext,
): string[] | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    throw new Error(
      `${SIGNIN_ALLOWED_EMAILS_VARIABLE} is set but names no address, so every sign-in would be refused. Write it as alice@example.com,bob@example.com`,
    );
  }

  const addresses: string[] = [];
  for (const entry of entries) {
    const address = normalizeAddress(entry);
    if (!address) {
      throw new Error(
        `${SIGNIN_ALLOWED_EMAILS_VARIABLE} has an entry that is not an email address: ${shown(entry)}. Write each address in full, as alice@example.com, with a comma between them. To admit a whole domain use SIGNIN_ALLOWED_EMAIL_DOMAINS instead.`,
      );
    }
    if (!addresses.includes(address)) addresses.push(address);
  }

  if (context.multiTenantAudience !== undefined) {
    throw new Error(
      `${SIGNIN_ALLOWED_EMAILS_VARIABLE} names addresses, but MICROSOFT_OAUTH_TENANT_ID is \`${context.multiTenantAudience}\`, which names no directory and admits accounts from any of them: the address the list is checked against is one the signing-in tenant writes for itself, so the list cannot hold. Set your directory GUID.`,
    );
  }

  for (const admin of context.initialAdminEmails) {
    if (!addresses.includes(normalizeAddress(admin) ?? admin.trim())) {
      throw new Error(
        `INITIAL_ADMIN_EMAILS names ${shown(admin)}, which ${SIGNIN_ALLOWED_EMAILS_VARIABLE} does not, so that administrator could never sign in. Add the address to ${SIGNIN_ALLOWED_EMAILS_VARIABLE}, or take it out of INITIAL_ADMIN_EMAILS.`,
      );
    }
  }

  for (const address of addresses) {
    if (!emailDomainAllowed(address, context.allowedEmailDomains)) {
      throw new Error(
        `${SIGNIN_ALLOWED_EMAILS_VARIABLE} names ${shown(address)}, but SIGNIN_ALLOWED_EMAIL_DOMAINS does not admit its domain, and an address has to pass both lists, so it could never sign in. Add the domain to SIGNIN_ALLOWED_EMAIL_DOMAINS, or take the address out.`,
      );
    }
  }

  return addresses;
}
