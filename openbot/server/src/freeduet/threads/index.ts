/**
 * Conversations without CopilotKit Intelligence: what the wiring imports (#42).
 *
 * The three names `ThreadsModule` in `./contract.ts` fixes, checked against it below so a drift
 * fails `tsc` here rather than at the wiring. The error classes are exported beside them because
 * the wiring has to recognise a refusal to answer it with the right status.
 */
import type { ThreadsModule } from "./contract";
import { applyFreeDuetThreadMigrations } from "./migrate";
import {
  createPgAgentRunner,
  ThreadLockDeniedError,
  UnknownThreadError,
} from "./pg-runner";
import { createLocalThreadStore, ThreadOwnershipError } from "./store";

export {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
  ThreadLockDeniedError,
  ThreadOwnershipError,
  UnknownThreadError,
};

const conformsToContract: ThreadsModule = {
  applyFreeDuetThreadMigrations,
  createLocalThreadStore,
  createPgAgentRunner,
};
void conformsToContract;
