import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";
import {
  ADDRESS_REFUSAL_MESSAGE,
  emailAddressAllowed,
  normalizeAddress,
  signInAllowedEmails,
} from "../src/freeduet/signin-allowlist";
import { testEnvironment } from "./support/environment";

/*
 * What SIGNIN_ALLOWED_EMAILS is for, and what it cannot do, is in
 * `server/src/freeduet/signin-allowlist.ts`. This file is the rule itself and the start-up
 * refusals, which need no database. That the live sign-in hooks enforce it is in
 * `freeduet-signin-allowlist.integration.test.ts`.
 */

const CONTEXT = {
  initialAdminEmails: ["admin@openbot.test"],
  allowedEmailDomains: [],
};

const MICROSOFT = {
  MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client-id",
  MICROSOFT_OAUTH_CLIENT_SECRET: "a-long-enough-microsoft-client-secret",
};

const DIRECTORY_GUID = "9188040d-6c67-4c5b-b112-36a304b66dad";

/** The message a call is refused with. Fails the test, rather than passing it, when nothing is refused. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the call to be refused, and it was not");
}

describe("a deployment that has not set SIGNIN_ALLOWED_EMAILS", () => {
  // Guards of unchanged behaviour: these hold on a deployment as it is today, and the day one of
  // them fails, an upgrade has started refusing people nobody told it to refuse.
  test("admits everybody, an address nobody can read included, as it always did", () => {
    for (const none of [undefined, []]) {
      expect(emailAddressAllowed("anyone@anywhere.test", none)).toBe(true);
      expect(emailAddressAllowed("not an address", none)).toBe(true);
      expect(emailAddressAllowed(null, none)).toBe(true);
      expect(emailAddressAllowed(undefined, none)).toBe(true);
    }
  });

  test("reads no list from an unset or a blank variable", () => {
    for (const raw of [undefined, "", "   ", "\n"]) {
      expect(signInAllowedEmails(raw, CONTEXT)).toBeUndefined();
    }
  });

  test("leaves the authentication settings the shape they always had", () => {
    for (const blank of [undefined, "", "   "]) {
      const config = loadConfig(
        testEnvironment({ SIGNIN_ALLOWED_EMAILS: blank }),
      );
      expect(config.auth).toBeDefined();
      expect(Object.keys(config.auth ?? {})).not.toContain("allowedEmails");
    }
  });

  test("changes nothing without a sign-in provider, where nobody signs in at all", () => {
    const config = loadConfig(
      testEnvironment({
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        BETTER_AUTH_SECRET: undefined,
        BETTER_AUTH_URL: undefined,
        INITIAL_ADMIN_EMAILS: undefined,
        OPENBOT_SINGLE_USER: "true",
        SIGNIN_ALLOWED_EMAILS: "somebody@openbot.test",
      }),
    );

    expect(config.auth).toBeUndefined();
  });
});

describe("the one spelling an address is reduced to", () => {
  test("lower-cases it, trims it and drops a root dot", () => {
    expect(normalizeAddress("Alice@Example.COM.")).toBe("alice@example.com");
    expect(normalizeAddress("  alice@example.com  ")).toBe("alice@example.com");
    expect(normalizeAddress("alice@EXAMPLE.com..")).toBe("alice@example.com");
  });

  test("an IDN is the same address whichever way it is spelled", () => {
    expect(normalizeAddress("a@exämple.com")).toBe("a@xn--exmple-cua.com");
    expect(normalizeAddress("a@xn--exmple-cua.com")).toBe(
      "a@xn--exmple-cua.com",
    );
  });

  test("keeps dots and tags in the local part, which are the account's own", () => {
    expect(normalizeAddress("a.b@x.test")).toBe("a.b@x.test");
    expect(normalizeAddress("a+tag@x.test")).toBe("a+tag@x.test");
    expect(normalizeAddress("a.b@x.test")).not.toBe(
      normalizeAddress("ab@x.test"),
    );
    expect(normalizeAddress("a+tag@x.test")).not.toBe(
      normalizeAddress("a@x.test"),
    );
  });

  // Each of these has to come out as no address at all, because the alternative is reading it as
  // somebody else: the part before the LAST @ is the local part, and a domain that is cut at a
  // `/`, `?` or `#` is a different domain.
  test.each([
    ["nothing", ""],
    ["blanks", "   "],
    ["no @", "person"],
    ["no domain", "person@"],
    ["no local part", "@x.test"],
    ["two @ with nothing between", "a@@x.test"],
    ["a space in the local part", "a b@x.test"],
    ["a space in the domain", "a@ x.test"],
    ["a display name", "Alice <a@x.test>"],
    ["a quoted local part", '"a b"@x.test'],
    ["a quoted local part that carries an @", '"a@b"@x.test'],
    ["a wildcard for everybody", "*@x.test"],
    ["a wildcard inside a name", "a*@x.test"],
    ["a single-character wildcard", "a?@x.test"],
    ["a wildcard in the domain", "a@*.x.test"],
    ["two addresses with a comma and a space", "a@x.test, b@x.test"],
    ["two addresses with a comma", "a@x.test,b@x.test"],
    ["two addresses with a semicolon", "a@x.test;b@x.test"],
    ["a zero-width character", "a​@x.test"],
    ["a control character", "a\u0000@x.test"],
    ["a line break inside", "a@x.test\nb@x.test"],
    ["a path on the domain", "a@x.test/path"],
    ["a query on the domain", "a@x.test?q=1"],
    ["a fragment on the domain", "a@x.test#frag"],
    ["a port on the domain", "a@x.test:8080"],
    ["an address literal", "a@[127.0.0.1]"],
    ["credentials in front of the host", "a@user:pw@x.test"],
    ["an ideographic full stop", "a@example。com"],
    ["a second address after the first", "attacker@evil.test@example.com"],
    ["more characters than an address can have", `${"a".repeat(250)}@x.test`],
  ])("is not an address: %s", (_why, value) => {
    expect(normalizeAddress(value)).toBeUndefined();
  });
});

describe("who the list admits", () => {
  const LIST = ["alice@example.com", "bob@example.com"];

  test("admits a named address and refuses a colleague at the same domain", () => {
    expect(emailAddressAllowed("alice@example.com", LIST)).toBe(true);
    expect(emailAddressAllowed("bob@example.com", LIST)).toBe(true);
    expect(emailAddressAllowed("carol@example.com", LIST)).toBe(false);
  });

  test("reduces both sides to one spelling before it compares them", () => {
    expect(
      emailAddressAllowed("ALICE@Example.COM", ["alice@example.com"]),
    ).toBe(true);
    expect(
      emailAddressAllowed("alice@example.com", [" Alice@EXAMPLE.com. "]),
    ).toBe(true);
    expect(emailAddressAllowed("a@exämple.com", ["a@xn--exmple-cua.com"])).toBe(
      true,
    );
    expect(emailAddressAllowed("a@xn--exmple-cua.com", ["a@exämple.com"])).toBe(
      true,
    );
  });

  test("does not read a dot or a tag as the same person", () => {
    expect(
      emailAddressAllowed("alice.b@example.com", ["aliceb@example.com"]),
    ).toBe(false);
    expect(
      emailAddressAllowed("alice+x@example.com", ["alice@example.com"]),
    ).toBe(false);
    expect(
      emailAddressAllowed("alice@example.com", ["alice+x@example.com"]),
    ).toBe(false);
  });

  // Every address below contains the listed one, or ends with it, or starts with it, and none of
  // them is it. A substring or suffix rule admits most of these, which is the usual way a rule
  // like this fails.
  test("does not admit a lookalike", () => {
    for (const email of [
      "alice@example.com.attacker.test",
      "alice@evil-example.com",
      "malice@example.com",
      "xalice@example.com",
      "alice@sub.example.com",
      "alice@example.org",
      "alice@example.com@evil.test",
      "evil.test@alice@example.com",
      "alice@example.com/evil",
      "alice@example.com?x=1",
      "alice@example.com:443",
      "alice@example.com, bob@example.com",
    ]) {
      expect(emailAddressAllowed(email, ["alice@example.com"])).toBe(false);
    }
  });

  test("refuses an address it cannot read, once a list exists", () => {
    for (const value of [
      null,
      undefined,
      "",
      "person",
      "person@",
      "@example.com",
      "Alice <alice@example.com>",
    ]) {
      expect(emailAddressAllowed(value, LIST)).toBe(false);
    }
  });

  test("an entry that names no address matches nothing, not even an address that cannot be read", () => {
    // signInAllowedEmails refuses such an entry at start-up rather than shipping it; belt and braces.
    expect(emailAddressAllowed("alice@example.com", [""])).toBe(false);
    expect(emailAddressAllowed("", [""])).toBe(false);
    expect(emailAddressAllowed("person", ["person"])).toBe(false);
  });
});

describe("what the variable may say", () => {
  test("is read the way somebody writes it, and each address is named once", () => {
    expect(
      signInAllowedEmails(
        " Admin@OpenBot.test , , bob@openbot.test , ADMIN@openbot.test.,",
        CONTEXT,
      ),
    ).toEqual(["admin@openbot.test", "bob@openbot.test"]);
  });

  // `SIGNIN_ALLOWED_EMAILS=,` is SET, so it is not "no list" and cannot admit everybody. It is a
  // list that names nobody, which refuses every sign-in, and that is said at start-up.
  test.each([",", ",,", " , ,\n,"])(
    "a variable that is set and names no address stops the start: %p",
    (raw) => {
      expect(refusal(() => signInAllowedEmails(raw, CONTEXT))).toContain(
        "names no address",
      );
    },
  );

  test.each([
    "example.com",
    "@example.com",
    "*@example.com",
    "bob",
    "bob@",
    "Bob <bob@openbot.test>",
    "bob@openbot.test bob2@openbot.test",
    "bob@openbot.test;bob2@openbot.test",
    "bob@openbot.test/x",
  ])(
    "an entry that is not an address stops the start, and is named: %p",
    (entry) => {
      const message = refusal(() =>
        signInAllowedEmails(`admin@openbot.test,${entry}`, CONTEXT),
      );

      expect(message).toContain("not an email address");
      expect(message).toContain(JSON.stringify(entry));
    },
  );

  test("an entry is quoted clipped, and a line break in it cannot add a line to a log", () => {
    const long = refusal(() =>
      signInAllowedEmails(`admin@openbot.test,${"x".repeat(300)}`, CONTEXT),
    );
    expect(long).toContain("not an email address");
    expect(long).not.toContain("x".repeat(100));

    const broken = refusal(() =>
      signInAllowedEmails(
        "admin@openbot.test,bob@openbot.test\nFORGED LOG LINE",
        CONTEXT,
      ),
    );
    expect(broken).toContain("not an email address");
    expect(broken).not.toContain("\n");
  });

  test("refuses a Microsoft audience that names no directory, where the address is the tenant's own word", () => {
    for (const audience of ["common", "organizations", "consumers"]) {
      expect(
        refusal(() =>
          signInAllowedEmails("admin@openbot.test", {
            ...CONTEXT,
            multiTenantAudience: audience,
          }),
        ),
      ).toContain("names no directory");
    }
  });

  test("an administrator the list does not name could never sign in, so it stops the start", () => {
    const message = refusal(() =>
      signInAllowedEmails("bob@openbot.test", CONTEXT),
    );

    expect(message).toContain("INITIAL_ADMIN_EMAILS names");
    expect(message).toContain(JSON.stringify("admin@openbot.test"));
  });

  test("an administrator is matched however either side writes the address", () => {
    expect(
      signInAllowedEmails("ADMIN@OpenBot.test", {
        ...CONTEXT,
        initialAdminEmails: ["  Admin@openbot.TEST "],
      }),
    ).toEqual(["admin@openbot.test"]);
  });

  test("an address the domain list does not admit could never sign in, so it stops the start", () => {
    const context = { ...CONTEXT, allowedEmailDomains: ["openbot.test"] };

    expect(
      signInAllowedEmails("admin@openbot.test,bob@openbot.test", context),
    ).toEqual(["admin@openbot.test", "bob@openbot.test"]);
    expect(
      refusal(() =>
        signInAllowedEmails("admin@openbot.test,bob@other.test", context),
      ),
    ).toContain("does not admit its domain");
  });
});

describe("what a deployment is refused at start-up", () => {
  test("reads the list into the authentication settings, one address once", () => {
    const config = loadConfig(
      testEnvironment({
        SIGNIN_ALLOWED_EMAILS: " Admin@OpenBot.test , bob@openbot.test ,",
      }),
    );

    expect(config.auth?.allowedEmails).toEqual([
      "admin@openbot.test",
      "bob@openbot.test",
    ]);
  });

  test("refuses a variable that is set and names no address", () => {
    expect(() =>
      loadConfig(testEnvironment({ SIGNIN_ALLOWED_EMAILS: " , , " })),
    ).toThrow("names no address");
  });

  test("refuses an entry that is a domain, and points to the variable for domains", () => {
    const message = refusal(() =>
      loadConfig(
        testEnvironment({
          SIGNIN_ALLOWED_EMAILS: "admin@openbot.test, openbot.test",
        }),
      ),
    );

    expect(message).toContain("not an email address");
    expect(message).toContain("SIGNIN_ALLOWED_EMAIL_DOMAINS");
  });

  test.each(["common", "organizations", "consumers", "  COMMON  "])(
    "refuses the list against the audience %p, which names no directory",
    (tenantId) => {
      expect(
        refusal(() =>
          loadConfig(
            testEnvironment({
              ...MICROSOFT,
              MICROSOFT_OAUTH_TENANT_ID: tenantId,
              SIGNIN_ALLOWED_EMAILS: "admin@openbot.test",
            }),
          ),
        ),
      ).toContain("SIGNIN_ALLOWED_EMAILS names addresses");
    },
  );

  test("refuses the list against Microsoft's default audience, the one nobody chose", () => {
    expect(() =>
      loadConfig(
        testEnvironment({
          ...MICROSOFT,
          SIGNIN_ALLOWED_EMAILS: "admin@openbot.test",
        }),
      ),
    ).toThrow("names no directory");
  });

  test("accepts the same list against a directory named by its GUID", () => {
    const config = loadConfig(
      testEnvironment({
        ...MICROSOFT,
        MICROSOFT_OAUTH_TENANT_ID: DIRECTORY_GUID,
        SIGNIN_ALLOWED_EMAILS: "admin@openbot.test,bob@openbot.test",
      }),
    );

    expect(config.auth?.allowedEmails).toEqual([
      "admin@openbot.test",
      "bob@openbot.test",
    ]);
  });

  test("refuses an administrator the list does not name, and accepts one it names in any case", () => {
    const environment = {
      INITIAL_ADMIN_EMAILS: "admin@openbot.test, Owner@openbot.test",
    };

    expect(
      refusal(() =>
        loadConfig(
          testEnvironment({
            ...environment,
            SIGNIN_ALLOWED_EMAILS: "admin@openbot.test",
          }),
        ),
      ),
    ).toContain(JSON.stringify("Owner@openbot.test"));

    const config = loadConfig(
      testEnvironment({
        ...environment,
        SIGNIN_ALLOWED_EMAILS: "ADMIN@openbot.test, owner@OPENBOT.test",
      }),
    );
    expect(config.auth?.allowedEmails).toEqual([
      "admin@openbot.test",
      "owner@openbot.test",
    ]);
  });

  test("an address has to pass both lists: one at a domain the domain list shuts out stops the start", () => {
    const config = loadConfig(
      testEnvironment({
        SIGNIN_ALLOWED_EMAIL_DOMAINS: "openbot.test",
        SIGNIN_ALLOWED_EMAILS: "admin@openbot.test,bob@openbot.test",
      }),
    );
    expect(config.auth?.allowedEmailDomains).toEqual(["openbot.test"]);
    expect(config.auth?.allowedEmails).toEqual([
      "admin@openbot.test",
      "bob@openbot.test",
    ]);

    expect(
      refusal(() =>
        loadConfig(
          testEnvironment({
            SIGNIN_ALLOWED_EMAIL_DOMAINS: "openbot.test",
            SIGNIN_ALLOWED_EMAILS: "admin@openbot.test,bob@other.test",
          }),
        ),
      ),
    ).toContain("does not admit its domain");
  });
});

describe("what a refused person is told", () => {
  test("says nothing about who is on the list, or what is on it", () => {
    expect(ADDRESS_REFUSAL_MESSAGE).not.toContain("@");
    expect(ADDRESS_REFUSAL_MESSAGE).not.toContain("SIGNIN_ALLOWED_EMAILS");
  });
});
