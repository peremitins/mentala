CREATE TABLE "user_streak_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"event_date" varchar(10) NOT NULL,
	"previous_current" integer DEFAULT 0 NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"repaired_days" integer,
	"missed_days" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_activity_date" varchar(10),
	"paused_since" varchar(10),
	"pause_reason" varchar(16),
	"repair_period" varchar(7) DEFAULT '1970-01' NOT NULL,
	"repair_used" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_streak_events" ADD CONSTRAINT "user_streak_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_streak_events_user_date" ON "user_streak_events" USING btree ("user_id","event_date");--> statement-breakpoint
CREATE INDEX "idx_user_streak_events_user_type" ON "user_streak_events" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_user_streaks_status" ON "user_streaks" USING btree ("status");