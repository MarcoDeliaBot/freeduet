CREATE TABLE "browser_pairings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"secret_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "browser_pairings_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "browser_pairings" ADD CONSTRAINT "browser_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_pairings_user_idx" ON "browser_pairings" USING btree ("user_id");