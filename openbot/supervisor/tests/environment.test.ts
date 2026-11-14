import { describe, expect, test } from "bun:test";
import { computerTokenFor } from "../src/computer-token";
import { environmentFor } from "../src/environment";
import { NAMESPACE } from "../src/names";

const KEY = "k".repeat(64);
const tokenOfInvoiceCollector = computerTokenFor(
  KEY,
  NAMESPACE,
  "invoice-collector",
);

describe("what the supervisor tells a computer about its browser", () => {
  test("passes the deployment's browser mode to every per-Bot computer", () => {
    expect(
      environmentFor("invoice-collector", {
        SUPERVISOR_TOKEN: KEY,
        COMPUTER_BROWSER_MODE: "headed",
      }),
    ).toEqual([
      "COMPUTER_BOT_ID=invoice-collector",
      `COMPUTER_TOKEN=${tokenOfInvoiceCollector}`,
      "COMPUTER_BROWSER_MODE=headed",
    ]);
  });

  test("does not invent a browser mode when the deployment left it unset", () => {
    expect(
      environmentFor("invoice-collector", { SUPERVISOR_TOKEN: KEY }),
    ).toEqual([
      "COMPUTER_BOT_ID=invoice-collector",
      `COMPUTER_TOKEN=${tokenOfInvoiceCollector}`,
    ]);
  });
});
