CREATE TABLE "deleted_user_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone NOT NULL,
	"days_alive" integer,
	"country" varchar(100),
	"locale" varchar(8),
	"gender" varchar(10),
	"age_range" varchar(20),
	"platform" varchar(20),
	"acquisition_channel" varchar(120),
	"utm_source" varchar(120),
	"utm_medium" varchar(120),
	"utm_campaign" varchar(120),
	"had_trial" boolean DEFAULT false NOT NULL,
	"trial_started_at" timestamp with time zone,
	"had_paid_subscription" boolean DEFAULT false NOT NULL,
	"last_plan_id" varchar(50),
	"subscription_count" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_days_active" integer DEFAULT 0 NOT NULL,
	"total_ai_sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_original" varchar(255);