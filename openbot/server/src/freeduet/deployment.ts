/**
 * Which kind of FreeDuet this server is (docs/design/first-start.md, decision D6): `FREEDUET_DEPLOYMENT`.
 *
 * Unset, empty or `self-hosted` is a person's own installation, which is every installation today and keeps working as
 * it did. `hosted` is FreeDuet run for other people, which must never offer or accept a sign-in with a Claude plan
 * (docs/ROADMAP.md, docs/PROVIDERS.md): the server enforces it, the app only hides what the server refuses.
 *
 * A value this file does not know (a typo such as `hosting`) counts as hosted. The setting is a safety line, so a
 * mistake closes it rather than opening it; the person who meant a plain install deletes the line or writes
 * `self-hosted`.
 */

export type Deployment = "self-hosted" | "hosted";

export function deploymentOf(
  environment: Record<string, string | undefined>,
): Deployment {
  const value = environment.FREEDUET_DEPLOYMENT?.trim().toLowerCase();
  if (value === undefined || value === "" || value === "self-hosted")
    return "self-hosted";
  return "hosted";
}

export function isHosted(
  environment: Record<string, string | undefined>,
): boolean {
  return deploymentOf(environment) === "hosted";
}
