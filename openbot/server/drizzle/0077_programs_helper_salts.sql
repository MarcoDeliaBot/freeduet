CREATE TABLE "programs_helper_salts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs_helper_salts" ADD CONSTRAINT "programs_helper_salts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;