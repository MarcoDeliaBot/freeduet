// server/tests/support/app-by-name.ts
//
// `createApp` by the NAMES of its parameters, for a test that builds the real app with a handful of
// real stores.
//
// `createApp` has thirty-eight positional parameters and a comment on each saying that a new one is
// appended and never inserted. A test that fills them with a row of `undefined` is correct only as
// long as nobody counts differently, and an off-by-one hands a store to the wrong parameter without a
// word. This keeps the order in one place and checks it against the function: `createApp.length`
// is the number of parameters it declares, so a parameter added to the end makes this file fail
// loudly instead of making every caller one short.
import { createApp } from "../../src/app";

/** The parameters of `createApp`, in their order. Appended to, never inserted into. */
const ORDER = [
  "config",
  "auth",
  "roleRepository",
  "auditReader",
  "credentialService",
  "packageStatusReader",
  "copilotHandler",
  "computerGateway",
  "computerPolicy",
  "agentProfileStore",
  "channelStore",
  "channelEvents",
  "auditStore",
  "componentStore",
  "pluginStore",
  "sandboxedStore",
  "threadIdentity",
  "peopleStore",
  "identityProviders",
  "intentRouter",
  "pageFrames",
  "routineRunner",
  "routineStore",
  "onboardingStore",
  "userInstructions",
  "attachmentDatabase",
  "hostAccessBroker",
  "desktopHostToken",
  "deploymentToolCaller",
  "composio",
  "modelProviderProxy",
  "userPreferences",
  "voiceSessions",
  "learning",
  "coworker",
  "selfHostBanner",
  "identity",
  "identityGithubCallback",
] as const;

export type AppParts = Partial<Record<(typeof ORDER)[number], unknown>> & {
  config: unknown;
};

export function appByName(parts: AppParts) {
  if (createApp.length !== ORDER.length) {
    throw new Error(
      `createApp declares ${createApp.length} parameters and tests/support/app-by-name.ts knows ${ORDER.length}. Add the new one to the end of ORDER.`,
    );
  }
  const unknown = Object.keys(parts).filter(
    (key) => !(ORDER as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(`createApp has no parameter named ${unknown.join(", ")}.`);
  }
  const positional = ORDER.map((name) => parts[name]);
  return (
    createApp as (...arguments_: unknown[]) => ReturnType<typeof createApp>
  )(...positional);
}
