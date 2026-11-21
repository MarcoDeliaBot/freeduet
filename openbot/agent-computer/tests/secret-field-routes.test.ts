import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every place the computer writes into a page's field, listed (D76).
 *
 * A model's `/type` and `/key` go through `fillUnlessSecret` and `pressKeyUnlessSecret`; the person's
 * own paths (`/human/secret`, the takeover's `/human/type` and `/human/key`, the viewer's input, the
 * private sign-in form) write directly, because a secret is meant to land there. This pins that split:
 * a new call that puts text in a page and is not named here fails, so it is read before it is merged.
 * Source-level on purpose, since the dispatcher cannot reach a local page (loopback is never allowed).
 */
const SRC = join(import.meta.dir, "..", "src");
const WRITES =
  /\.fill\(|\.press\(|keyboard\.(press|insertText|type)|insertText|pressSequentially|setInputFiles|selectOption|\.type\(/;

function code(file: string): string[] {
  return readFileSync(join(SRC, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && WRITES.test(line));
}

describe("writes into a page", () => {
  test("the model's routes reach a field only through the guarded helpers", () => {
    const index = readFileSync(join(SRC, "index.ts"), "utf8");
    const action = index.slice(index.indexOf("async function performAction"));
    const body = action.slice(0, action.indexOf("function describe("));
    expect(body).toContain("fillUnlessSecret(");
    expect(body).toContain("pressKeyUnlessSecret(");
    // The only raw key press left in the model's route is the one handed to the guard as a callback.
    expect(body.match(/keyboard\.press\(|\.fill\(/g)?.length).toBe(1);
    expect(body).toContain("target.keyboard.press(pressed)");
    // And the refusal is a 403 with the sentence, not a 502.
    expect(index).toContain("error instanceof SecretFieldError");
    expect(index).toContain("secretField: true }, 403");
  });

  test("the model's menu and date entry checks the field before it writes", () => {
    const field = readFileSync(join(SRC, "select-field.ts"), "utf8");
    const choose = field.slice(
      field.indexOf("export async function chooseOnField"),
    );
    // The refusal comes before the first write, and nothing in the entry can lift it.
    expect(choose.indexOf("throw new SecretFieldError()")).toBeGreaterThan(-1);
    expect(choose.indexOf("throw new SecretFieldError()")).toBeLessThan(
      choose.indexOf("field.fill("),
    );
    expect(choose.indexOf("throw new SecretFieldError()")).toBeLessThan(
      choose.indexOf("field.selectOption("),
    );
    expect(choose).not.toMatch(/approv|full.?access|override|force|bypass/i);
    const index = readFileSync(join(SRC, "index.ts"), "utf8");
    const route = index.slice(index.indexOf("async function performAction"));
    expect(
      route.slice(
        route.indexOf('action === "/select"'),
        route.indexOf('action === "/key"'),
      ),
    ).toContain("chooseOnField(");
  });

  test("the person's secret entry still fills directly", () => {
    const index = readFileSync(join(SRC, "index.ts"), "utf8");
    const entry = index.slice(index.indexOf('"/human/secret"'));
    expect(entry.slice(0, entry.indexOf('"/sign-in/fill"'))).toContain(
      "field.fill(body.text",
    );
  });

  test("nothing in the refusal reads an approval, Full access or a rule", () => {
    // The refusal is made on the computer and cannot be lifted from above: neither the helpers nor
    // the model's route take an option that could skip it.
    const masking = readFileSync(join(SRC, "secret-masking.ts"), "utf8");
    const start = masking.indexOf("A model never types into a field");
    const guarded = masking
      .slice(start)
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(guarded).not.toMatch(
      /approv|full.?access|allow|override|force|bypass/i,
    );
    const index = readFileSync(join(SRC, "index.ts"), "utf8");
    const route = index.slice(index.indexOf("async function performAction"));
    const typed = route.slice(
      route.indexOf('action === "/type"'),
      route.indexOf('action === "/key"'),
    );
    expect(typed).not.toMatch(/approv|full.?access|override|force|bypass/i);
  });

  test("no other file writes into a page", () => {
    const found: Record<string, number> = {};
    for (const file of readdirSync(SRC).filter((name) =>
      name.endsWith(".ts"),
    )) {
      const lines = code(file).filter(
        (line) => !/Array|list\.check|\.check\(|"0"\)/.test(line),
      );
      if (lines.length) found[file] = lines.length;
    }
    expect(found).toEqual({
      "index.ts": 5,
      "screencast.ts": 1,
      "secret-masking.ts": 2,
      // The model's menu and date entry (D123): refuses a sensitive field before it writes.
      "select-field.ts": 2,
      "sign-in.ts": 3,
    });
  });
});
