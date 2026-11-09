/**
 * Which computer tools a server-run turn is offered, given the person's capability switches.
 *
 * The same rule the app applies to its own offer (`app/src/lib/copilot/computer-available.ts`,
 * `computerToolsOffered`), from the same switches (`capabilitiesFor` in `admin/controls.ts`, which is
 * also what `/api/admin/enterprise/me` returns): files and commands need `cloudComputer`, the rest of
 * the computer needs `cloudBrowser`, and opening a page needs `cloudNetwork` on top. An unresolved
 * switch reads as allowed, as in the app.
 *
 * Without this a routine, a wake-up, a group turn, an approval resume or a relay offers a Bot a
 * browser the person switched off; the Bot reaches for it, is refused at the gateway (which stays as
 * the second line of defence, `decideFromSnapshot`) and spends the turn on the refusal.
 */
import type { HeadlessTool } from "@openbot/toolkit/headless-tools";
import type { Capability } from "../admin/capabilities";

export type CapabilitySwitches = Partial<Record<Capability, boolean>>;

/** The person's resolved switches; undefined where enterprise controls are not installed. */
export type CapabilitiesLookup = (
  userId: string,
) => Promise<CapabilitySwitches | undefined>;

const NAVIGATE = new Set(["computer_navigate"]);
const COMPUTER = new Set([
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
]);

export function computerToolsOffered(
  capabilities: CapabilitySwitches | undefined,
) {
  const allows = (capability: Capability) =>
    capabilities?.[capability] !== false;
  const browser = allows("cloudBrowser");
  return {
    browser,
    navigate: browser && allows("cloudNetwork"),
    computer: allows("cloudComputer"),
  };
}

/**
 * Keeps the tools the switches allow. `report_refusal` is audit bookkeeping and stays; so does any
 * tool that is not a computer tool.
 */
export function withOfferedComputerTools(
  tools: HeadlessTool[],
  capabilities: CapabilitySwitches | undefined,
): HeadlessTool[] {
  const offered = computerToolsOffered(capabilities);
  return tools.filter(({ definition: { name } }) => {
    if (NAVIGATE.has(name)) return offered.navigate;
    if (COMPUTER.has(name)) return offered.computer;
    if (name.startsWith("computer_")) return offered.browser;
    return true;
  });
}
