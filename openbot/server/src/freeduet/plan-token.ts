/**
 * FreeDuet never accepts a Claude plan token.
 *
 * OpenBot lets a deployment store the token `claude setup-token` mints (CLAUDE_CODE_OAUTH_TOKEN) and
 * run built-in Bots on it. Anthropic's terms say an app may not collect, store or intermediate
 * Claude.ai credentials or session tokens, so FreeDuet removes the option (docs/PROVIDERS.md). A
 * person's Claude plan reaches FreeDuet only through the official Claude Code CLI, signed in by the
 * person, which the subscription router starts (openbot/agent-freeduet).
 *
 * Applied once, before anything reads the environment: the token is dropped from `process.env`, so
 * no code path and no child process can see it, and the log says why.
 */
export const CLAUDE_PLAN_TOKEN = "CLAUDE_CODE_OAUTH_TOKEN";

export const PLAN_TOKEN_REFUSED =
  "FreeDuet ignores CLAUDE_CODE_OAUTH_TOKEN: storing a Claude plan token breaks Anthropic's terms. " +
  "Sign in to Claude Code yourself and FreeDuet will use it through its subscription router, or " +
  "add an API key. See docs/PROVIDERS.md.";

/** Removes the token from `environment` and says whether one was there. */
export function dropClaudePlanToken(
  environment: Record<string, string | undefined>,
): boolean {
  const present = Boolean(environment[CLAUDE_PLAN_TOKEN]?.trim());
  delete environment[CLAUDE_PLAN_TOKEN];
  return present;
}

if (dropClaudePlanToken(process.env)) {
  console.warn(
    JSON.stringify({
      type: "freeduet-plan-token-ignored",
      note: PLAN_TOKEN_REFUSED,
    }),
  );
}
