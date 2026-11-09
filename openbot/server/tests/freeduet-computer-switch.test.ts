import { describe, expect, test } from "bun:test";
import {
  type CapabilityRow,
  resolveAllCapabilities,
} from "../src/admin/capabilities";
import { decideFromSnapshot } from "../src/admin/controls";
import { DEFAULT_ENTERPRISE_SETTINGS } from "../src/admin/settings-store";
import type { ComputerGateway } from "../src/computer/gateway";
import {
  type CapabilitiesLookup,
  computerToolsOffered,
} from "../src/computer/offered";
import type { PolicyContext } from "../src/computer/policy";
import { relayComputerTools } from "../src/freeduet/relay-computer";

/**
 * M1 (docs/M1_PLAN.md, D22): when the person switches the computer or the browser off, no server-run
 * turn is offered it, as the app already filters its own offer. `relayComputerTools` is the one
 * builder of the computer tools of a relay, a routine, a wake-up and a group turn (index.ts,
 * `serverRunComputerTools`); the gateway's refusal stays as the second line of defence.
 */

const row = (capability: string, allowed: boolean): CapabilityRow => ({
  scopeKind: "organization",
  scopeId: "",
  capability,
  allowed,
});
const member = { role: "user" as const, groups: [] };
/** The switches as the server resolves them for the person: `capabilitiesFor` in admin/controls.ts. */
const switches =
  (...rows: CapabilityRow[]): CapabilitiesLookup =>
  async () =>
    resolveAllCapabilities(rows, member);

const profile = {
  id: "jules",
  name: "Jules",
  visibility: "private",
  ownerUserId: "owner",
  systemOwned: false,
} as never;

function builder(capabilitiesOf?: CapabilitiesLookup) {
  return relayComputerTools({
    computerGateway: {} as ComputerGateway,
    agentProfileStore: { get: async () => profile },
    actorFor: (async (id: string) => ({
      id,
      email: `${id}@example.test`,
      role: "user",
    })) as never,
    auditStore: { insert: async () => undefined } as never,
    ...(capabilitiesOf ? { capabilitiesOf } : {}),
  });
}
const offeredNames = async (capabilitiesOf?: CapabilitiesLookup) =>
  (
    await builder(capabilitiesOf)({
      ownerUserId: "owner",
      agentId: "jules",
      initiator: { kind: "person" },
    })
  ).map((tool) => tool.definition.name);

const BROWSER = [
  "computer_read",
  "computer_snapshot",
  "computer_screenshot",
  "computer_click",
  "computer_type",
  "computer_key",
  "computer_scroll",
  "computer_request_help",
  "computer_request_secret",
];
const FILES = [
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
];

describe("a switched-off computer is not offered in a server-run turn", () => {
  test("switched on, or not resolved, the member's computer is offered as before", async () => {
    const all = await offeredNames(switches());
    expect(all).toEqual(
      expect.arrayContaining([
        "computer_navigate",
        ...BROWSER,
        ...FILES,
        "report_refusal",
      ]),
    );
    expect(await offeredNames()).toEqual(all);
    expect(await offeredNames(async () => undefined)).toEqual(all);
  });

  test("browser and computer both off: no computer tool at all", async () => {
    const names = await offeredNames(
      switches(row("cloudBrowser", false), row("cloudComputer", false)),
    );
    expect(names.filter((name) => name.startsWith("computer_"))).toEqual([]);
    // Audit bookkeeping, not a computer action: the app keeps it too.
    expect(names).toEqual(["report_refusal"]);
  });

  test("each switch hides exactly its part, as the app's offer does", async () => {
    const noBrowser = await offeredNames(switches(row("cloudBrowser", false)));
    expect(noBrowser).toEqual(expect.arrayContaining(FILES));
    for (const name of ["computer_navigate", ...BROWSER])
      expect(noBrowser).not.toContain(name);

    const noNetwork = await offeredNames(switches(row("cloudNetwork", false)));
    expect(noNetwork).not.toContain("computer_navigate");
    expect(noNetwork).toEqual(expect.arrayContaining([...BROWSER, ...FILES]));

    const noComputer = await offeredNames(
      switches(row("cloudComputer", false)),
    );
    for (const name of FILES) expect(noComputer).not.toContain(name);
    expect(noComputer).toEqual(
      expect.arrayContaining(["computer_navigate", ...BROWSER]),
    );
  });

  test("the rule is the app's computerToolsOffered", () => {
    expect(computerToolsOffered(undefined)).toEqual({
      browser: true,
      navigate: true,
      computer: true,
    });
    expect(computerToolsOffered({ cloudBrowser: false })).toEqual({
      browser: false,
      navigate: false,
      computer: true,
    });
    expect(computerToolsOffered({ cloudNetwork: false })).toEqual({
      browser: true,
      navigate: false,
      computer: true,
    });
  });

  test("the gateway still refuses a call that arrives anyway", () => {
    const snapshot = {
      rows: [row("cloudBrowser", false), row("cloudComputer", false)],
      admins: new Set<string>(),
      groupsByUser: new Map<string, string[]>(),
      settings: DEFAULT_ENTERPRISE_SETTINGS,
      network: [],
      loadedAt: new Date(),
    };
    const call = (name: string, intent: string) =>
      ({
        tool: { name },
        bot: { id: "jules" },
        actor: { id: "owner" },
        page: { url: "https://example.com/", host: "example.com" },
        intent,
        key: "",
        element: { ref: "", role: "", name: "", type: "" },
        file: { path: "", name: "", extension: "" },
        command: "ls",
        mcp: { server: "", tool: "", effect: "" },
        initiator: { kind: "person", id: "" },
      }) as unknown as PolicyContext;
    expect(
      decideFromSnapshot(snapshot, call("computer_click", "click"))?.matched,
    ).toBe("capability:cloudBrowser");
    expect(
      decideFromSnapshot(snapshot, call("computer_run_command", "run_command"))
        ?.matched,
    ).toBe("capability:cloudComputer");
  });
});
