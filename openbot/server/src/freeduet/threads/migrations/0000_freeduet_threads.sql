-- FreeDuet's own conversations, kept in Postgres instead of CopilotKit Intelligence (#42).
--
-- These tables belong to FreeDuet, not to OpenBot, so they live in their own folder with their own
-- journal and their own bookkeeping table (`freeduet_thread_migrations`). Upstream's numbering
-- (drizzle/0000-0067) and its `drizzle.__drizzle_migrations` never see them, and merging upstream
-- never renumbers them.
--
-- A thread is the runs that happened on it, each run the AG-UI events it produced (the model of
-- CopilotKit's SqliteAgentRunner). Messages are read from those events, so there is no messages
-- table to keep in step with them.

CREATE TABLE "freeduet_threads" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- A person's threads, newest first, is the one list anybody asks for.
CREATE INDEX "freeduet_threads_user_recent_idx" ON "freeduet_threads" ("user_id", "updated_at" DESC, "thread_id" DESC);
--> statement-breakpoint

CREATE TABLE "freeduet_thread_runs" (
	-- Insertion order. Two runs started in the same millisecond still have an order, and the chain
	-- of parent runs is read in it.
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL REFERENCES "freeduet_threads" ("thread_id") ON DELETE CASCADE,
	"run_id" text NOT NULL,
	"parent_run_id" text,
	"agent_id" text,
	"status" text NOT NULL,
	-- This run's events, compacted. Written while the run is still going, so a crash keeps them.
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	-- What the run was asked, with only the messages it added rather than the whole history again.
	"input" jsonb,
	-- The runner instance that wrote the row, so a sweep can tell a dead process's runs from its own.
	"runner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "freeduet_thread_runs_run_id_unique" UNIQUE ("run_id"),
	CONSTRAINT "freeduet_thread_runs_status_check" CHECK ("status" IN ('running', 'finished', 'stopped', 'failed', 'interrupted'))
);
--> statement-breakpoint

CREATE INDEX "freeduet_thread_runs_thread_idx" ON "freeduet_thread_runs" ("thread_id", "id");
--> statement-breakpoint

-- The boot sweep looks only for runs still marked running, which is a handful at most.
CREATE INDEX "freeduet_thread_runs_running_idx" ON "freeduet_thread_runs" ("status") WHERE "status" = 'running';
--> statement-breakpoint

-- One row per thread while a run holds it. No foreign key: a lock is taken by the thread id the
-- caller names, and an expired row is simply taken over.
CREATE TABLE "freeduet_thread_locks" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
