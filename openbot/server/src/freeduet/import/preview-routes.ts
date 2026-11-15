import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppVariables } from "../../auth/guards";
import { parseFreeduetImport } from "./freeduet-json";
import { IMPORT_FILE_MAX_BYTES } from "./model";
import { previewImport } from "./preview";

/** The person's facts as the memory store lists them. Structural, so this folder imports no store. */
export interface HeldFactSource {
  list(ownerUserId: string): Promise<readonly { content: string }[]>;
}

/**
 * The most a request body may weigh. The export inside it is JSON-escaped (a quote or a line break
 * takes two bytes, a control character six), so the envelope allows the worst case of six bytes for
 * each byte of the export; the parser then refuses an export of more than 1 MiB.
 */
export const IMPORT_PREVIEW_BODY_MAX_BYTES = IMPORT_FILE_MAX_BYTES * 6 + 1024;

/**
 * POST /api/freeduet/import/preview (docs/design/import-from-other-tools.md, slice 2). The body is
 * `{ "export": "<the pasted export>" }` as JSON, the way the other routes take their bodies, and the
 * answer is the preview. It saves nothing: no row, no file, no log line with the content. Signed in
 * only, and about the signed-in person's own facts alone: the store is read with `context.var.actor.id`.
 */
export function createImportPreviewRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  memory: HeldFactSource,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.onError((error, context) => {
    // The error's name only: a message here could carry a line of the person's export.
    console.error(
      JSON.stringify({
        type: "import-preview-error",
        error: error.name,
        timestamp: new Date().toISOString(),
      }),
    );
    return context.json(
      { error: "The import could not be previewed. Try again." },
      503,
    );
  });
  routes.post(
    "/preview",
    bodyLimit({
      maxSize: IMPORT_PREVIEW_BODY_MAX_BYTES,
      onError: (context) =>
        context.json({ error: "The request is larger than the limit." }, 413),
    }),
    async (context) => {
      const type = context.req.header("content-type") ?? "";
      if (!/^application\/json(?:\s*;|$)/i.test(type.trim()))
        return context.json(
          { error: 'Send the export as application/json: {"export": "..."}.' },
          415,
        );
      const envelope: unknown = await context.req.json().catch(() => undefined);
      if (
        typeof envelope !== "object" ||
        envelope === null ||
        typeof (envelope as { export?: unknown }).export !== "string"
      )
        return context.json(
          { error: 'Send the export as {"export": "..."}.' },
          400,
        );
      const outcome = parseFreeduetImport(
        (envelope as { export: string }).export,
      );
      if (!outcome.ok) return context.json({ error: outcome.reason }, 422);
      const held = await memory.list(context.var.actor.id);
      context.header("Cache-Control", "no-store");
      return context.json({
        saved: false,
        preview: previewImport(outcome.result, {
          count: held.length,
          texts: held.map((row) => row.content),
        }),
      });
    },
  );
  return routes;
}
