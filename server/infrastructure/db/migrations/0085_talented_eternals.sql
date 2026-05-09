CREATE TABLE "user_engagement_state" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_backgrounded_at" timestamp with time zone,
	"timezone" varchar(100),
	"reengagement_stage" integer DEFAULT 0 NOT NULL,
	"last_reengagement_push_sent_at" timestamp with time zone,
	"reengagement_suppressed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_summaries_user" ADD COLUMN "ready_push_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_summaries_user" ADD COLUMN "ready_push_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_engagement_state" ADD CONSTRAINT "user_engagement_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_engagement_state_last_seen" ON "user_engagement_state" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_user_engagement_state_reengagement_suppressed" ON "user_engagement_state" USING btree ("reengagement_suppressed_until");