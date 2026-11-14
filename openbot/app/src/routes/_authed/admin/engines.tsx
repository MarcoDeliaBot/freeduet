import { createFileRoute } from "@tanstack/react-router";
import { FreeDuetEngines } from "@/freeduet/engines-section";

/** Admin → Engines: the engines and their state, read-only (docs/ENGINES_PLAN.md slice 6). */
export const Route = createFileRoute("/_authed/admin/engines")({
  component: FreeDuetEngines,
});
