/**
 * What counts as an email address for a message nobody has written to before.
 *
 * Deliberately narrower than RFC 5322. A new message goes to the addresses the person's own request
 * named, so this accepts the plain `local@domain` every provider issues and refuses everything that
 * could carry more than an address: a display name, a comment, a quoted local part, a group, an
 * address literal, a non-ASCII character (which is where look-alike domains live) and any control
 * character. The same test is used by the two Gmail adapters and by the check that matches an address
 * against the person's own words, so what is sent and what was matched are one string.
 */

const LOCAL_MAX = 64;
const ADDRESS_MAX = 254;
const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const ADDRESS = new RegExp(
  `^[A-Za-z0-9][A-Za-z0-9._%+-]*@(?:${LABEL}\\.)+[A-Za-z]{2,24}$`,
);

/** The address as it will be compared (lower case), or null when it is not a plain address. */
export function plainAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  if (address.length > ADDRESS_MAX || !ADDRESS.test(address)) return null;
  const local = address.slice(0, address.lastIndexOf("@"));
  if (local.length > LOCAL_MAX || local.endsWith(".") || local.includes(".."))
    return null;
  return address.toLowerCase();
}
