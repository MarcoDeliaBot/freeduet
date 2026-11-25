import { createFileRoute } from "@tanstack/react-router";
import { FreeDuetEngines } from "@/freeduet/engines-section";

/** Admin → Engines: the engines and their state. The page reads them, lets the administrator change the providers and each member's engine order, and shows usage (docs/ENGINES_PLAN.md slice 6). */
export const Route = createFileRoute("/_authed/admin/engines")({
  component: FreeDuetEngines,
});
