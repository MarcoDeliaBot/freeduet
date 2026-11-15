import { z } from "zod";
import type { AgentProfile } from "./queries";

/**
 * "What it does", at most `limit` characters. The create form uses the app's 1,000; the edit form
 * uses the limit the server reports for the coworker being edited.
 */
export function roleDescriptionSchema(limit: number) {
  return z
    .string()
    .trim()
    .min(1, "A description of what it does is required.")
    .max(limit, `What it does must be ${limit} characters or fewer.`);
}

/**
 * Browser-side coworker form contract. Limits match the server parser so validation errors can be
 * shown next to fields before submit.
 */
export const agentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name must be 80 characters or fewer."),
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(120, "Title must be 120 characters or fewer."),
  roleDescription: roleDescriptionSchema(1000),
  visibility: z.enum(["public", "private"]),
  /**
   * The AG-UI endpoint this coworker runs on. Empty means the Bot in the box.
   *
   * Only URL shape is checked here; deployment allow/deny rules are server-side.
   */
  endpoint: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/.test(value),
      "Enter a web address starting with http:// or https://.",
    ),
  /**
   * A key the agent sits behind. WRITE-ONLY: it is never sent back from the server, so this field is
   * always empty when editing, and leaving it empty keeps whatever key is already set.
   */
  authValue: z.string(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export const emptyAgentForm: AgentFormValues = {
  name: "",
  title: "",
  roleDescription: "",
  visibility: "private",
  endpoint: "",
  authValue: "",
};

/** Convert form values to API input; omit an empty key so editing preserves the current credential. */
export function agentInputFrom(values: AgentFormValues) {
  return {
    name: values.name,
    title: values.title,
    roleDescription: values.roleDescription,
    visibility: values.visibility,
    endpoint: values.endpoint,
    ...(values.authValue.trim()
      ? { auth: { header: "Authorization", value: values.authValue.trim() } }
      : {}),
  };
}

/**
 * The full update body for changing one or two fields of a Bot.
 *
 * The update endpoint takes the whole profile, so unchanged fields ride along as stored. Not a
 * built-in Bot's endpoint: that is the managed Bot's own address, which nobody typed, and the route
 * checks any endpoint it is sent as one somebody did — on a deployment whose Bot is on localhost it
 * refused every edit. Empty leaves the stored one where it is, and the empty key keeps the current
 * one.
 */
export function profileUpdateInput(
  profile: AgentProfile,
  patch: Partial<AgentFormValues>,
) {
  return agentInputFrom({
    name: profile.name,
    title: profile.title,
    roleDescription: profile.roleDescription,
    visibility: profile.visibility,
    endpoint: profile.builtIn ? "" : (profile.endpoint ?? ""),
    authValue: "",
    ...patch,
  });
}
