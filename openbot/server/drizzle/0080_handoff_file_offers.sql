CREATE TABLE "handoff_file_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"hop_run_id" text NOT NULL,
	"asker_bot_id" text NOT NULL,
	"member_bot_id" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"bytes" bigint NOT NULL,
	"copy_path" text,
	"copy_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handoff_file_offers" ADD CONSTRAINT "handoff_file_offers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handoff_file_offers_thread_idx" ON "handoff_file_offers" USING btree ("owner_user_id","thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "handoff_file_offers_once" ON "handoff_file_offers" USING btree ("owner_user_id","thread_id","hop_run_id","member_bot_id","path");