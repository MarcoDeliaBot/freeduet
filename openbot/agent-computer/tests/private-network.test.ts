import { describe, expect, test } from "bun:test";
import { BlockList, isIP } from "node:net";
import {
  describePrivateRange,
  embeddedIpv4,
  ipv4Readings,
  ipv4Text,
  ipv6Bytes,
  looseIpv4,
  privateRangeOf,
} from "../src/private-network";

/**
 * Which addresses are somebody's own network (D36), with no browser and no network: every range at
 * both its edges, every IPv6 form that carries an IPv4 address, every way of writing an IPv4 address
 * that a resolver reads, and the names that are loopback by definition.
 *
 * The two differential tests at the end ask other implementations the same questions (`BlockList` for
 * the ranges, the URL parser for what an address means), so a mistake in this file's own arithmetic
 * is not a mistake its own tests agree with.
 */

const range = (host: string): string | null =>
  privateRangeOf(host)?.range ?? null;

/** Deterministic, so a failure is reproducible: mulberry32. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("IPv4 ranges", () => {
  // [range, first, last, one below the range, one above it]
  const ranges: [string, string, string, string | null, string | null][] = [
    ["0.0.0.0/8", "0.0.0.0", "0.255.255.255", null, "1.0.0.0"],
    ["10.0.0.0/8", "10.0.0.0", "10.255.255.255", "9.255.255.255", "11.0.0.0"],
    [
      "100.64.0.0/10",
      "100.64.0.0",
      "100.127.255.255",
      "100.63.255.255",
      "100.128.0.0",
    ],
    [
      "127.0.0.0/8",
      "127.0.0.0",
      "127.255.255.255",
      "126.255.255.255",
      "128.0.0.0",
    ],
    [
      "169.254.0.0/16",
      "169.254.0.0",
      "169.254.255.255",
      "169.253.255.255",
      "169.255.0.0",
    ],
    [
      "172.16.0.0/12",
      "172.16.0.0",
      "172.31.255.255",
      "172.15.255.255",
      "172.32.0.0",
    ],
    [
      "192.168.0.0/16",
      "192.168.0.0",
      "192.168.255.255",
      "192.167.255.255",
      "192.169.0.0",
    ],
    [
      "224.0.0.0/4",
      "224.0.0.0",
      "239.255.255.255",
      "223.255.255.255",
      "240.0.0.0",
    ],
    ["240.0.0.0/4", "240.0.0.0", "255.255.255.255", "239.255.255.255", null],
  ];

  for (const [name, first, last, below, above] of ranges) {
    test(`${name}: both edges are inside, the addresses beside it are not in it`, () => {
      expect(range(first)).toBe(name);
      expect(range(last)).toBe(name);
      if (below !== null) expect(range(below)).not.toBe(name);
      if (above !== null) expect(range(above)).not.toBe(name);
    });
  }

  test("the broadcast address is in a range, and so is every multicast address", () => {
    expect(range("255.255.255.255")).toBe("240.0.0.0/4");
    expect(range("224.0.0.251")).toBe("224.0.0.0/4");
  });

  test("the internet is not: public addresses and the documentation ranges are left alone", () => {
    for (const host of [
      "1.1.1.1",
      "8.8.8.8",
      "93.184.216.34",
      "172.15.0.1",
      "172.32.0.1",
      "100.63.0.1",
      "100.128.0.1",
      "192.167.0.1",
      "192.169.0.1",
      // Documentation and benchmarking ranges belong to nobody; tests use them for the internet.
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "198.18.0.1",
    ]) {
      expect({ host, range: range(host) }).toEqual({ host, range: null });
    }
  });

  test("says what an address is, in words a person reads", () => {
    expect(describePrivateRange(privateRangeOf("192.168.1.1")!)).toBe(
      "a private network address (192.168.0.0/16)",
    );
    expect(describePrivateRange(privateRangeOf("100.64.0.1")!)).toContain(
      "Tailscale",
    );
    expect(describePrivateRange(privateRangeOf("127.0.0.1")!)).toBe(
      "a loopback address (127.0.0.0/8)",
    );
  });
});

describe("IPv6 ranges", () => {
  test("the unspecified address and loopback", () => {
    expect(range("::")).toBe("::/128");
    expect(range("::1")).toBe("::1/128");
    expect(range("0:0:0:0:0:0:0:1")).toBe("::1/128");
    expect(range("[::1]")).toBe("::1/128");
  });

  test("unique local fc00::/7, both halves, and its edges", () => {
    expect(range("fc00::")).toBe("fc00::/7");
    expect(range("fd00::1")).toBe("fc00::/7");
    expect(range("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe("fc00::/7");
    expect(range("FD12:3456::1")).toBe("fc00::/7");
    expect(range("fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBeNull();
    expect(range("fe00::")).toBeNull();
  });

  test("link-local fe80::/10, with and without a zone id", () => {
    expect(range("fe80::1")).toBe("fe80::/10");
    expect(range("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBe("fe80::/10");
    expect(range("fe80::1%eth0")).toBe("fe80::/10");
    expect(range("[fe80::1%25eth0]")).toBe("fe80::/10");
    expect(range("fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).toBeNull();
  });

  test("site-local fec0::/10 and multicast ff00::/8", () => {
    expect(range("fec0::1")).toBe("fec0::/10");
    expect(range("feff::1")).toBe("fec0::/10");
    expect(range("ff02::1")).toBe("ff00::/8");
    expect(range("ff00::")).toBe("ff00::/8");
  });

  test("the deprecated IPv4-compatible range, and the local-use NAT64 prefix", () => {
    expect(range("::2")).toBe("::/96");
    expect(range("::10.0.0.1")).toBe("::/96");
    expect(range("::8.8.8.8")).toBe("::/96");
    expect(range("64:ff9b:1::1")).toBe("64:ff9b:1::/48");
    expect(range("64:ff9b:1:ffff::1")).toBe("64:ff9b:1::/48");
  });

  test("global addresses are the internet", () => {
    for (const host of [
      "2001:db8::1",
      "2606:4700:4700::1111",
      "2a00:1450:4001:81b::200e",
      "[2001:db8::1]",
      "1:2:3:4:5:6:7:8",
    ]) {
      expect({ host, range: range(host) }).toEqual({ host, range: null });
    }
  });
});

describe("IPv6 forms that carry an IPv4 address are judged by that address", () => {
  test("IPv4-mapped, written four ways", () => {
    for (const host of [
      "::ffff:10.0.0.1",
      "::ffff:a00:1",
      "::FFFF:A00:1",
      "0:0:0:0:0:ffff:a00:1",
      "0000:0000:0000:0000:0000:ffff:0a00:0001",
      "[::ffff:10.0.0.1]",
    ]) {
      expect({ host, range: range(host) }).toEqual({
        host,
        range: "10.0.0.0/8",
      });
    }
  });

  test("a mapped loopback, link-local and private address", () => {
    expect(range("::ffff:127.0.0.1")).toBe("127.0.0.0/8");
    expect(range("::ffff:7f00:1")).toBe("127.0.0.0/8");
    expect(range("::ffff:169.254.169.254")).toBe("169.254.0.0/16");
    expect(range("::ffff:c0a8:101")).toBe("192.168.0.0/16");
  });

  test("a public IPv4 address inside one is public", () => {
    expect(range("::ffff:8.8.8.8")).toBeNull();
    expect(range("::ffff:808:808")).toBeNull();
    expect(range("64:ff9b::808:808")).toBeNull();
    expect(range("2002:0808:0808::")).toBeNull();
  });

  test("IPv4-translated, the NAT64 well-known prefix and 6to4", () => {
    expect(range("::ffff:0:10.0.0.1")).toBe("10.0.0.0/8");
    expect(range("64:ff9b::10.0.0.1")).toBe("10.0.0.0/8");
    expect(range("64:ff9b::a00:1")).toBe("10.0.0.0/8");
    expect(range("64:ff9b::a9fe:a9fe")).toBe("169.254.0.0/16");
    expect(range("2002:0a00:0001::")).toBe("10.0.0.0/8");
    expect(range("2002:c0a8:101::1")).toBe("192.168.0.0/16");
  });

  test("a leading zero in the dotted tail is read as decimal, so it cannot hide a private address", () => {
    expect(range("::ffff:010.0.0.1")).toBe("10.0.0.0/8");
  });
});

describe("every way of writing an IPv4 address that a resolver reads", () => {
  // What `connect()` reaches for each: 127.0.0.1, 192.168.1.1 or 10.0.0.1.
  const loopback = [
    "2130706433",
    "0x7f000001",
    "0X7F000001",
    "0x7f.1",
    "0x7f.0.1",
    "127.1",
    "127.0.1",
    "0177.0.0.1",
    "017700000001",
    "127.0.0.1.",
    "127.000.000.001",
  ];
  for (const host of loopback) {
    test(`${host} is 127.0.0.1`, () => {
      expect(range(host)).toBe("127.0.0.0/8");
    });
  }

  test("zero and its spellings are this computer", () => {
    for (const host of ["0", "0.0", "0.0.0", "0x0", "0x", "00", "0.0.0.0."]) {
      expect({ host, range: range(host) }).toEqual({
        host,
        range: "0.0.0.0/8",
      });
    }
  });

  test("a private address as a number, in hex, short, or with a mixed radix", () => {
    for (const [host, expected] of [
      ["3232235777", "192.168.0.0/16"],
      ["0xc0a80101", "192.168.0.0/16"],
      ["192.168.257", "192.168.0.0/16"],
      ["192.11010305", "192.168.0.0/16"],
      ["10.1", "10.0.0.0/8"],
      ["0xa.1.1", "10.0.0.0/8"],
      ["10.0.0.0x1", "10.0.0.0/8"],
      ["2852039166", "169.254.0.0/16"],
      ["0xa9fea9fe", "169.254.0.0/16"],
      ["0251.0376.0251.0376", "169.254.0.0/16"],
      ["169.254.43518", "169.254.0.0/16"],
    ] as const) {
      expect({ host, range: range(host) }).toEqual({ host, range: expected });
    }
  });

  test("a part with a leading zero is read both ways, and refused if either is private", () => {
    // Octal, which is what the URL standard and inet_aton do: 8.0.0.1. Decimal, which some tools do: 10.0.0.1.
    expect(looseIpv4("010.0.0.1")).toBe(0x08000001);
    expect(ipv4Readings("010.0.0.1").map(ipv4Text)).toEqual([
      "8.0.0.1",
      "10.0.0.1",
    ]);
    expect(range("010.0.0.1")).toBe("10.0.0.0/8");
    expect(range("0169.0254.0169.0254")).toBe("169.254.0.0/16");
    // Nothing to read two ways in a part with no leading zero.
    expect(ipv4Readings("1.2.3.4")).toEqual([0x01020304]);
  });

  test("text that is not an address is not read as one", () => {
    for (const host of [
      "4294967296",
      "256.1.1.1",
      "1.2.3.4.5",
      "08.0.0.1.x",
      "1e100.net",
      "123456.example.com",
      "0x.example.com",
      "example.com",
      "a.1",
      "1.a",
    ]) {
      expect({ host, range: range(host) }).toEqual({ host, range: null });
    }
  });

  test("agrees with the URL parser, which is the other thing that reads these", () => {
    for (const host of [
      ...loopback,
      "0",
      "0.0",
      "3232235777",
      "0xc0a80101",
      "192.168.257",
      "10.1",
      "0xa.1.1",
      "10.0.0.0x1",
      "2852039166",
      "0251.0376.0251.0376",
      "169.254.43518",
      "010.0.0.1",
      "1.2.3.4",
      "8.8.8.8",
      "4294967295",
    ]) {
      const canonical = new URL(`http://${host}/`).hostname;
      expect({ host, read: ipv4Text(looseIpv4(host) ?? -1) }).toEqual({
        host,
        read: canonical,
      });
    }
  });
});

describe("names", () => {
  test("localhost and every subdomain of it are loopback by definition", () => {
    for (const host of [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "foo.localhost",
      "a.b.localhost.",
    ]) {
      expect({ host, range: range(host) }).toEqual({
        host,
        range: "127.0.0.0/8",
      });
    }
  });

  test("any other name is a question for a resolver, not for this file", () => {
    for (const host of [
      "example.com",
      "localhost.example.com",
      "notlocalhost",
      "nas.local",
      "router.lan",
      "host.docker.internal",
      "agent-computer",
      "server",
      "metadata.google.internal",
    ]) {
      expect({ host, range: range(host) }).toEqual({ host, range: null });
    }
  });
});

describe("a host as it arrives", () => {
  test("with a port, which URL.host keeps after a non-default one", () => {
    expect(range("192.168.1.1:8080")).toBe("192.168.0.0/16");
    expect(range("[::1]:3000")).toBe("::1/128");
    expect(range("[fe80::1]:443")).toBe("fe80::/10");
    expect(range("2130706433:80")).toBe("127.0.0.0/8");
    expect(range("example.com:8080")).toBeNull();
    expect(range("8.8.8.8:53")).toBeNull();
    expect(range("[2001:db8::1]:443")).toBeNull();
  });

  test("with surrounding space, mixed case and a trailing dot", () => {
    expect(range("  10.0.0.1  ")).toBe("10.0.0.0/8");
    expect(range("FE80::1")).toBe("fe80::/10");
    expect(range("192.168.1.1.")).toBe("192.168.0.0/16");
  });

  test("nothing at all is not a range", () => {
    expect(range("")).toBeNull();
    expect(range("   ")).toBeNull();
    expect(range(".")).toBeNull();
  });

  test("text with colons that cannot be an IPv6 address is refused, not let through", () => {
    for (const host of ["1:2:3", "gggg::1", "::1::2", "1:2:3:4:5:6:7:8:9"]) {
      const found = privateRangeOf(host);
      expect({ host, refused: found !== null }).toEqual({
        host,
        refused: true,
      });
      expect(found?.what).toBe("an IPv6 address that cannot be read");
      expect(describePrivateRange(found!)).toBe(
        "an IPv6 address that cannot be read",
      );
    }
  });

  test("never throws, whatever it is given", () => {
    const next = random(7);
    const alphabet = "0123456789abcdefxX.:[]%/ \n-_gG@";
    for (let index = 0; index < 5000; index += 1) {
      const length = Math.floor(next() * 24);
      let text = "";
      for (let at = 0; at < length; at += 1) {
        text += alphabet[Math.floor(next() * alphabet.length)];
      }
      expect(() => privateRangeOf(text)).not.toThrow();
    }
  });
});

describe("checked against other implementations", () => {
  test("every IPv4 address is judged as BlockList judges it", () => {
    const list = new BlockList();
    for (const [net, prefix] of [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.168.0.0", 16],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ] as const) {
      list.addSubnet(net, prefix, "ipv4");
    }
    const next = random(42);
    const checked: string[] = [];
    // Biased toward the ranges and their edges, where a mistake would be.
    const interesting = [
      0, 10, 100, 126, 127, 128, 169, 172, 192, 223, 224, 239, 240, 255,
    ];
    for (let index = 0; index < 20_000; index += 1) {
      const pick = (): number =>
        next() < 0.5
          ? (interesting[Math.floor(next() * interesting.length)] ?? 0)
          : Math.floor(next() * 256);
      const address = [
        pick(),
        Math.floor(next() * 4) === 0 ? pick() : Math.floor(next() * 256),
        Math.floor(next() * 256),
        Math.floor(next() * 256),
      ].join(".");
      checked.push(address);
    }
    // And every edge of every range, written out.
    for (const base of [0, 10, 100, 127, 169, 172, 192, 224, 240]) {
      for (const second of [
        0, 15, 16, 31, 32, 63, 64, 127, 128, 167, 168, 169, 253, 254, 255,
      ]) {
        for (const tail of ["0.0", "255.255", "0.1"]) {
          checked.push(`${base}.${second}.${tail}`);
        }
      }
    }
    for (const address of checked) {
      expect({ address, inside: range(address) !== null }).toEqual({
        address,
        inside: list.check(address, "ipv4"),
      });
    }
  });

  test("every IPv6 address is judged as BlockList judges it", () => {
    const list = new BlockList();
    for (const [net, prefix] of [
      ["fc00::", 7],
      ["fe80::", 10],
      ["fec0::", 10],
      ["ff00::", 8],
      ["::", 96],
      ["64:ff9b:1::", 48],
    ] as const) {
      list.addSubnet(net, prefix, "ipv6");
    }
    const next = random(1234);
    const groups = (): string[] =>
      Array.from({ length: 8 }, () => Math.floor(next() * 65536).toString(16));
    const prefixes = [
      "fc",
      "fd",
      "fe",
      "ff",
      "fb",
      "00",
      "20",
      "26",
      "2a",
      "64",
    ];
    let inside = 0;
    let outside = 0;
    for (let index = 0; index < 20_000; index += 1) {
      const parts = groups();
      const lead = prefixes[Math.floor(next() * prefixes.length)] ?? "00";
      parts[0] = `${lead}${Math.floor(next() * 256)
        .toString(16)
        .padStart(2, "0")}`;
      if (next() < 0.1) for (let at = 1; at < 6; at += 1) parts[at] = "0";
      const address = parts.join(":");
      if (isIP(address) !== 6) continue;
      // An address that carries an IPv4 one is judged by that one: those are the tests above.
      const bytes = ipv6Bytes(address);
      if (bytes && embeddedIpv4(bytes) !== null) continue;
      const found = privateRangeOf(address) !== null;
      expect({ address, inside: found }).toEqual({
        address,
        inside: list.check(address, "ipv6"),
      });
      if (found) inside += 1;
      else outside += 1;
    }
    // Both sides were really exercised, not just the one the generator drifts to.
    expect(inside).toBeGreaterThan(1000);
    expect(outside).toBeGreaterThan(1000);
  });

  test("an IPv6 address means what the URL parser says it means", () => {
    const next = random(99);
    const expand = (canonical: string): number[] => {
      const [head = "", tail] = canonical.replace(/^\[|\]$/g, "").split("::");
      const first = head ? head.split(":") : [];
      const last = tail ? tail.split(":") : [];
      const all =
        tail === undefined
          ? first
          : [
              ...first,
              ...Array<string>(8 - first.length - last.length).fill("0"),
              ...last,
            ];
      return all.flatMap((group) => {
        const value = Number.parseInt(group, 16);
        return [value >> 8, value & 255];
      });
    };
    let compared = 0;
    for (let index = 0; index < 4000; index += 1) {
      const groups = Array.from({ length: 8 }, () =>
        next() < 0.35 ? 0 : Math.floor(next() * 65536),
      );
      let text: string;
      const shape = Math.floor(next() * 4);
      const hex = (value: number) => {
        const digits = value.toString(16);
        return next() < 0.3 ? digits.padStart(4, "0") : digits;
      };
      if (shape === 0) {
        text = groups.map(hex).join(":");
      } else if (shape === 1) {
        // Compress the longest run of zeros.
        let best = { at: -1, length: 0 };
        for (let at = 0; at < 8; at += 1) {
          let length = 0;
          while (at + length < 8 && groups[at + length] === 0) length += 1;
          if (length > best.length) best = { at, length };
        }
        text =
          best.length < 1
            ? groups.map(hex).join(":")
            : `${groups.slice(0, best.at).map(hex).join(":")}::${groups
                .slice(best.at + best.length)
                .map(hex)
                .join(":")}`;
      } else if (shape === 2) {
        // A dotted tail.
        const high = groups[6] ?? 0;
        const low = groups[7] ?? 0;
        text = `${groups.slice(0, 6).map(hex).join(":")}:${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      } else {
        text = `::${groups
          .slice(0, 1 + Math.floor(next() * 7))
          .map(hex)
          .join(":")}`;
      }
      if (next() < 0.3) text = text.toUpperCase();
      if (isIP(text) !== 6) continue;
      const bytes = ipv6Bytes(text);
      const canonical = new URL(`http://[${text}]/`).hostname;
      expect({ text, bytes: bytes ? [...bytes] : null }).toEqual({
        text,
        bytes: expand(canonical),
      });
      compared += 1;
    }
    expect(compared).toBeGreaterThan(1500);
  });
});
