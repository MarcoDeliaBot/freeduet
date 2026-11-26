/**
 * `GET /api/freeduet/build` (D162): which build is running, read-only. Behind `requireUser`, like the
 * app's other settings reads, so only a signed-in person (or the single-user person) sees it. The answer is
 * the version, the short commit, the time and the label; no path, no host name, no secret.
 */
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import { type BuildInfo, buildInfo } from "./build-info";

export function createBuildInfoRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  read: () => BuildInfo = buildInfo,
) {
  // Read once now, while the server starts, so no request pays for the git calls.
  read();
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.get("/", (context) => {
    context.header("Cache-Control", "private, no-store");
    return context.json({ build: read() });
  });
  return routes;
}
