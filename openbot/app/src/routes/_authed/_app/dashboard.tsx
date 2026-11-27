import { createFileRoute } from "@tanstack/react-router";
import { FreeDuetDashboard } from "@/freeduet/dashboard";

/** Dashboard (D154, stage 1): what needs the person, today's use, the team and the engines, with Engines one click away. */
export const Route = createFileRoute("/_authed/_app/dashboard")({
  component: FreeDuetDashboard,
});
