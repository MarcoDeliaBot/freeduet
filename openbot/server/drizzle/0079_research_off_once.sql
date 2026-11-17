ALTER TABLE "proactive_settings" ADD COLUMN "enabled_by_person" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- D80: once, at this update. Background research made by the old default could not be told from research a person chose, so every existing row is switched off here. Focus, interval and next run stay. The migrator records this file in its journal and never runs it again, and a row made later is not touched.
UPDATE "proactive_settings" SET "enabled" = false WHERE "enabled" = true;
