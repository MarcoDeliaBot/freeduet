CREATE TABLE "mail_rule_applied" (
	"rule_id" text NOT NULL,
	"message_id" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_rule_applied_rule_id_message_id_pk" PRIMARY KEY("rule_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "mail_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_id" text NOT NULL,
	"spec" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"watermark_at" timestamp with time zone NOT NULL,
	"backfill_pending" boolean DEFAULT false NOT NULL,
	"leased_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_matched" integer DEFAULT 0 NOT NULL,
	"last_applied" integer DEFAULT 0 NOT NULL,
	"total_applied" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "mail_rule_applied" ADD CONSTRAINT "mail_rule_applied_rule_id_mail_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."mail_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_rules" ADD CONSTRAINT "mail_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_rules" ADD CONSTRAINT "mail_rules_server_id_mcp_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_rules_user_idx" ON "mail_rules" USING btree ("user_id","server_id");