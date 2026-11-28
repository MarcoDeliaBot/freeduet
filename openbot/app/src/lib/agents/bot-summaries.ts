/**
 * The current answer each "Settings for this Bot" row states, computed from its query on every
 * render so it updates itself when the page behind it changes something. Each summary takes the
 * translator of the app's words (D181 stage 2e), English when none is given.
 */

import { englishT, type T } from "@/freeduet/i18n/provider";
import { appConfig } from "@/lib/generated/application-config";

export function countLabel(
  count: number,
  one: string,
  many: string,
  none: string,
): string {
  if (count === 0) return none;
  return `${count} ${count === 1 ? one : many}`;
}

export function accessSummary(
  skills: number,
  apps: number,
  t: T = englishT,
): string {
  const parts = [
    skills ? t("summary.skills", { count: skills }) : "",
    apps ? t("summary.apps", { count: apps }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : t("summary.nothingGranted");
}

/**
 * Who else can use it. Publishing and visibility are separate records: a public Bot nobody published
 * is still open to everyone in the deployment.
 */
export function sharingSummary(
  published: { audience: "team" | "people" } | undefined,
  visibility: "public" | "private",
  t: T = englishT,
): string {
  if (!published) {
    return visibility === "public"
      ? t("summary.everyonePublic")
      : t("summary.notShared");
  }
  return published.audience === "team"
    ? t("bot.sharing.wholeTeam")
    : t("summary.specificPeople");
}

export function setupSummary(
  agent: {
    builtIn: boolean;
    endpoint: string | null;
  },
  t: T = englishT,
): string {
  if (agent.builtIn || !agent.endpoint) return t("bot.setup.builtIn");
  try {
    return new URL(agent.endpoint).host;
  } catch {
    return agent.endpoint;
  }
}

const TRANSPORT_LABEL: Record<string, string> = {
  slack: "Slack",
  teams: "Microsoft Teams",
  sms: "SMS",
};

/** Where this Bot's conversations continue outside OpenBot, each place once. */
export function reachSummary(
  transports: readonly string[],
  t: T = englishT,
): string {
  const places = [...new Set(transports)]
    .map((transport) => TRANSPORT_LABEL[transport] ?? transport)
    .sort((a, b) => a.localeCompare(b));
  return places.length
    ? places.join(", ")
    : t("summary.onlyIn", { product: appConfig.brand.productName });
}

/** The apps feeding this Bot facts, and whether it researches in the background. */
export function memorySummary(
  sources: number,
  research: boolean,
  t: T = englishT,
): string {
  const parts = [
    sources ? t("summary.sources", { count: sources }) : "",
    research
      ? sources
        ? t("summary.researchOnAfter")
        : t("summary.researchOn")
      : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : t("summary.nothingConnected");
}
