/**
 * Which addresses belong to somebody's own network rather than to the internet (FreeDuet D36).
 *
 * A Bot's computer runs a browser and a shell on a machine that sits inside a home or an office. The
 * router's admin page, a NAS, a printer, another computer and the host this container runs on are all
 * at addresses in the ranges below, and none of them is a place a page or a prompt injection should be
 * able to send a Bot. `egress.ts` refuses a connection to any of them unless the person switched that
 * on; this module only answers "is this address one of them?".
 *
 * Pure: no Playwright and no state, so every range has a test that needs no browser and no network.
 * The ranges are matched on bytes, here, rather than through `BlockList`, so that each spelling of an
 * address is read by code that is in this file and tested in this repository.
 *
 * WHAT COUNTS (the maintainer's list for D36, and nothing that is not the same address by another
 * spelling):
 *
 * - IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (private), 100.64.0.0/10 (shared address space:
 *   carrier-grade NAT, and the overlay a VPN such as Tailscale hands out), 169.254.0.0/16 (link-local),
 *   127.0.0.0/8 (loopback), 0.0.0.0/8 (this host), 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved,
 *   which holds the broadcast address 255.255.255.255).
 * - IPv6: `::` and `::1`, `fc00::/7` (unique local), `fe80::/10` (link-local), `ff00::/8` (multicast).
 *   Also `fec0::/10` (site-local, deprecated but a private range wherever it is still configured),
 *   `::/96` (IPv4-compatible, deprecated and routed nowhere) and `64:ff9b:1::/48` (the local-use NAT64
 *   prefix, an operator's own translation range).
 * - Every IPv6 form that CARRIES an IPv4 address is judged by that address: IPv4-mapped
 *   (`::ffff:10.0.0.1`, which a URL parser also writes `::ffff:a00:1`), IPv4-translated
 *   (`::ffff:0:10.0.0.1`), the NAT64 well-known prefix (`64:ff9b::10.0.0.1`) and 6to4
 *   (`2002:0a00:0001::`). A public IPv4 address inside one of them is public.
 * - Every spelling of an IPv4 address that a resolver or a URL parser reads as one: `2130706433`,
 *   `0x7f000001`, `0x7f.1`, `127.1`, `0177.0.0.1`, `0` and a trailing dot. `connect()` reaches
 *   127.0.0.1 when it is given `2130706433`, `127.1`, `0x7f.1` or `0177.0.0.1`, and `net.isIP` calls
 *   none of them an address, so a rule that only knew `127.0.0.1` would be skipped by typing it another
 *   way. A part with a leading zero is read both ways, as octal (what `inet_aton` and the URL standard
 *   do) and as decimal (what some other tools do), and refused if either reading is inside a range.
 * - The names that are loopback by definition, `localhost` and `*.localhost` (RFC 6761).
 *
 * NOT COUNTED, on purpose: documentation and benchmarking ranges (192.0.2.0/24, 198.51.100.0/24,
 * 203.0.113.0/24, 198.18.0.0/15, 2001:db8::/32), which belong to nobody and which tests and examples
 * use as stand-ins for the internet. And a device's GLOBAL IPv6 address on a home network, which
 * cannot be told from any other global address by its range.
 */

/** The range an address is in, as the sentence a refusal gives needs it. */
export type PrivateRange = {
  /** The range, written the way it is looked up: `192.168.0.0/16`. Empty when the address cannot be read. */
  range: string;
  /** What it is, in words that read after "is": `a private network address`. */
  what: string;
};

/** The range as a person reads it: `a private network address (192.168.0.0/16)`. */
export function describePrivateRange(range: PrivateRange): string {
  return range.range ? `${range.what} (${range.range})` : range.what;
}

type V4Range = PrivateRange & { net: number; bits: number };

/** `a.b.c.d` as one unsigned number. */
function v4(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

const V4_RANGES: readonly V4Range[] = [
  {
    net: v4(0, 0, 0, 0),
    bits: 8,
    range: "0.0.0.0/8",
    what: "this computer's own address",
  },
  {
    net: v4(10, 0, 0, 0),
    bits: 8,
    range: "10.0.0.0/8",
    what: "a private network address",
  },
  {
    net: v4(100, 64, 0, 0),
    bits: 10,
    range: "100.64.0.0/10",
    what: "a shared address (carrier-grade NAT, or a VPN overlay such as Tailscale)",
  },
  {
    net: v4(127, 0, 0, 0),
    bits: 8,
    range: "127.0.0.0/8",
    what: "a loopback address",
  },
  {
    net: v4(169, 254, 0, 0),
    bits: 16,
    range: "169.254.0.0/16",
    what: "a link-local address",
  },
  {
    net: v4(172, 16, 0, 0),
    bits: 12,
    range: "172.16.0.0/12",
    what: "a private network address",
  },
  {
    net: v4(192, 168, 0, 0),
    bits: 16,
    range: "192.168.0.0/16",
    what: "a private network address",
  },
  {
    net: v4(224, 0, 0, 0),
    bits: 4,
    range: "224.0.0.0/4",
    what: "a multicast address",
  },
  {
    net: v4(240, 0, 0, 0),
    bits: 4,
    range: "240.0.0.0/4",
    what: "a reserved or broadcast address",
  },
];

function v4RangeOf(value: number): PrivateRange | null {
  for (const entry of V4_RANGES) {
    const shift = 32 - entry.bits;
    if (value >>> shift === entry.net >>> shift) {
      return { range: entry.range, what: entry.what };
    }
  }
  return null;
}

/** An IPv4 address written as four decimal parts, with or without leading zeros. */
function dottedIpv4(text: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return null;
  return v4(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0);
}

/** One part of a loosely written IPv4 address, in the radix its prefix names. Null when it is not a number. */
function ipv4Part(text: string): number | null {
  if (text === "") return null;
  let radix = 10;
  let digits = text;
  if (/^0x/i.test(digits)) {
    radix = 16;
    digits = digits.slice(2);
  } else if (digits.length > 1 && digits.startsWith("0")) {
    radix = 8;
    digits = digits.slice(1);
  }
  // `0x` with nothing after it is zero, the way a URL parser reads it.
  if (digits === "") return 0;
  const allowed =
    radix === 16 ? /^[0-9a-f]+$/i : radix === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!allowed.test(digits)) return null;
  return Number.parseInt(digits, radix);
}

/** The number that one to four parts make: the last part fills the bytes the others leave. */
function fillIpv4(parts: readonly number[]): number | null {
  const tail = parts[parts.length - 1] ?? 0;
  const leading = parts.slice(0, -1);
  if (leading.some((part) => part > 255)) return null;
  if (tail >= 256 ** (5 - parts.length)) return null;
  let value = tail;
  for (const [index, part] of leading.entries()) {
    value += part * 256 ** (3 - index);
  }
  return value >>> 0;
}

/**
 * The dot-separated parts of a text that is shaped like an IPv4 address, or null when it is a name.
 *
 * Only text whose LAST label is a number is an address at all: that is the URL standard's own test,
 * and it keeps `1e100.net` and `123456.example.com` names. One trailing dot is the root and is
 * dropped, so `127.0.0.1.` is 127.0.0.1.
 */
function ipv4Labels(host: string): string[] | null {
  let labels = host.split(".");
  if (labels.length > 1 && labels[labels.length - 1] === "") {
    labels = labels.slice(0, -1);
  }
  const last = labels[labels.length - 1] ?? "";
  if (!/^(\d+|0x[0-9a-f]*)$/i.test(last)) return null;
  return labels.length <= 4 ? labels : null;
}

/**
 * An IPv4 address in any of the spellings a resolver or a URL parser accepts, as one number, or null
 * when the text is not one.
 *
 * The URL standard's IPv4 parser and `inet_aton`, which `getaddrinfo` (and so `connect()`) uses for a
 * numeric host: one to four parts, each decimal, octal with a leading 0 or hexadecimal with 0x, the
 * last part filling the bytes the others leave.
 */
export function looseIpv4(host: string): number | null {
  const labels = ipv4Labels(host);
  if (!labels) return null;
  const numbers = labels.map(ipv4Part);
  if (numbers.some((part) => part === null)) return null;
  return fillIpv4(numbers as number[]);
}

/** The same text with every part read as plain decimal: for some tools `010` is ten, not eight. */
function decimalIpv4(host: string): number | null {
  const labels = ipv4Labels(host);
  if (!labels?.every((label) => /^\d+$/.test(label))) return null;
  return fillIpv4(labels.map(Number));
}

/** Every IPv4 address a text can mean: the standard reading, and the decimal one when it differs. */
export function ipv4Readings(host: string): number[] {
  const readings = [looseIpv4(host), decimalIpv4(host)].filter(
    (reading): reading is number => reading !== null,
  );
  return [...new Set(readings)];
}

/** An IPv4 number as dotted decimal, for putting back into a comparison or a message. */
export function ipv4Text(value: number): string {
  return [
    value >>> 24,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

/**
 * The sixteen bytes of an IPv6 address, or null when this cannot read it.
 *
 * Read here rather than through a URL parser so that an address's meaning does not depend on how a
 * runtime spells it back. The tests read a few thousand addresses both ways and require the same bytes.
 */
export function ipv6Bytes(address: string): Uint8Array | null {
  let text = address.toLowerCase();
  const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const tail = dottedIpv4(dotted[1] ?? "");
    if (tail === null) return null;
    text = `${text.slice(0, -(dotted[1] ?? "").length)}${(tail >>> 16).toString(16)}:${(tail & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  // Without `::` all eight groups are written; with it, it stands for at least one group of zeros.
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [
    ...head,
    ...(halves.length === 2 ? Array<string>(fill).fill("0") : []),
    ...rest,
  ];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (const [index, group] of groups.entries()) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 255;
  }
  return bytes;
}

/** Whether the first `bits` bits of `bytes` are those of `prefix`. */
function startsWith(
  bytes: Uint8Array,
  prefix: readonly number[],
  bits: number,
): boolean {
  for (let bit = 0; bit < bits; bit += 8) {
    const remaining = Math.min(8, bits - bit);
    const mask = (0xff << (8 - remaining)) & 0xff;
    if (((bytes[bit / 8] ?? 0) & mask) !== ((prefix[bit / 8] ?? 0) & mask)) {
      return false;
    }
  }
  return true;
}

function ipv4InBytes(bytes: Uint8Array, offset: number): number {
  return v4(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

const ZEROS_10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** The IPv4 address an IPv6 address carries (mapped, translated, NAT64 or 6to4), or null when it carries none. */
export function embeddedIpv4(bytes: Uint8Array): number | null {
  // ::ffff:a.b.c.d, IPv4-mapped
  if (startsWith(bytes, [...ZEROS_10, 0xff, 0xff], 96)) {
    return ipv4InBytes(bytes, 12);
  }
  // ::ffff:0:a.b.c.d, IPv4-translated (SIIT)
  if (startsWith(bytes, [0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0], 96)) {
    return ipv4InBytes(bytes, 12);
  }
  // 64:ff9b::a.b.c.d, the NAT64 well-known prefix
  if (startsWith(bytes, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0], 96)) {
    return ipv4InBytes(bytes, 12);
  }
  // 2002:aabb:ccdd::, 6to4: the IPv4 address is the 32 bits after the prefix
  if (startsWith(bytes, [0x20, 0x02], 16)) return ipv4InBytes(bytes, 2);
  return null;
}

const UNREADABLE: PrivateRange = {
  range: "",
  what: "an IPv6 address that cannot be read",
};

function ipv6RangeOf(bytes: Uint8Array): PrivateRange | null {
  const carried = embeddedIpv4(bytes);
  if (carried !== null) return v4RangeOf(carried);
  // ::/96 is the IPv4-compatible range; `::` and `::1` are the two addresses in it that mean something.
  if (startsWith(bytes, [...ZEROS_10, 0, 0], 96)) {
    const tail = ipv4InBytes(bytes, 12);
    if (tail === 0) {
      return {
        range: "::/128",
        what: "this computer's own address",
      };
    }
    if (tail === 1) {
      return { range: "::1/128", what: "a loopback address" };
    }
    return {
      range: "::/96",
      what: "a deprecated IPv4-compatible address",
    };
  }
  if (startsWith(bytes, [0xfc], 7)) {
    return { range: "fc00::/7", what: "a private network address" };
  }
  if (startsWith(bytes, [0xfe, 0x80], 10)) {
    return { range: "fe80::/10", what: "a link-local address" };
  }
  if (startsWith(bytes, [0xfe, 0xc0], 10)) {
    return {
      range: "fec0::/10",
      what: "a private (site-local) network address",
    };
  }
  if (startsWith(bytes, [0xff], 8)) {
    return { range: "ff00::/8", what: "a multicast address" };
  }
  if (startsWith(bytes, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01], 48)) {
    return {
      range: "64:ff9b:1::/48",
      what: "a local-use NAT64 address",
    };
  }
  return null;
}

/** `localhost` and `*.localhost` are the computer's own loopback by definition (RFC 6761). */
function isLocalhostName(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost");
}

/**
 * The host of `destination`, as the text a range is looked up on.
 *
 * `destination` is a host as it arrives: a name, an IPv4 address in any spelling, an IPv6 address
 * with or without its brackets and a zone id, and with or without the `:port` that `URL.host` keeps
 * after a non-default port. Lower-cased, one trailing dot removed.
 */
function hostOf(destination: string): string {
  let host = destination.trim().toLowerCase();
  const bracketed = /^\[([^\]]*)\](?::\d*)?$/.exec(host);
  if (bracketed) host = bracketed[1] ?? "";
  // One colon is `name:port` or `1.2.3.4:port`; two or more is an IPv6 address, which has no port here.
  else if (host.split(":").length === 2)
    host = host.slice(0, host.indexOf(":"));
  // A zone id names an interface, not a destination.
  const zone = host.indexOf("%");
  if (zone !== -1) host = host.slice(0, zone);
  return host.replace(/\.$/, "");
}

/**
 * The private or special range a destination is in, or null when it is none of them.
 *
 * A name that is not `localhost` is null here, because what it points at is a question for a
 * resolver: the caller resolves it and asks again for each address it gets back.
 *
 * Text with two colons or more that cannot be read as an IPv6 address is a range of its own
 * (`an IPv6 address that cannot be read`) rather than null: a host name cannot hold a colon, and an
 * address the filter cannot judge is not one it should let through.
 */
export function privateRangeOf(destination: string): PrivateRange | null {
  const host = hostOf(destination);
  if (host === "") return null;
  if (isLocalhostName(host)) {
    return { range: "127.0.0.0/8", what: "a loopback address" };
  }
  if (host.includes(":")) {
    const bytes = ipv6Bytes(host);
    return bytes ? ipv6RangeOf(bytes) : UNREADABLE;
  }
  // `net.isIP` is not asked: it says no to every spelling above that is not plain dotted decimal.
  for (const reading of ipv4Readings(host)) {
    const range = v4RangeOf(reading);
    if (range) return range;
  }
  return null;
}
