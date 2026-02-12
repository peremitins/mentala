CREATE TABLE "slots_scheduler_cursor" (
	"shard" integer PRIMARY KEY NOT NULL,
	"last_user_id" integer DEFAULT 0 NOT NULL,
	"cycle_id" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots_scheduler_state" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"global_cycle_id" integer DEFAULT 1 NOT NULL,
	"next_shard" integer DEFAULT 0 NOT NULL,
	"completed_shards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_slots_scheduler_cursor_updated_at" ON "slots_scheduler_cursor" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_notification_preferences_enabled_user" ON "notification_preferences" USING btree ("user_id") WHERE "notification_preferences"."enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_notification_slots_active" ON "notification_slots" USING btree ("user_id","kind","entity_key","scheduled_at") WHERE "notification_slots"."status" IN ('planned', 'queued');