CREATE TABLE "subscription_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"plan_id" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(20) NOT NULL,
	"is_annual" boolean DEFAULT false NOT NULL,
	"base_price" numeric(10, 2) NOT NULL,
	"weekly_minutes_limit" integer NOT NULL,
	"avatar_enabled" boolean DEFAULT false NOT NULL,
	"price_per_minute_gpt" numeric(10, 4) DEFAULT '0.66' NOT NULL,
	"price_per_minute_avatar" numeric(10, 4) DEFAULT '0.9' NOT NULL,
	"total_price" numeric(10, 2),
	"is_custom_configurable" boolean DEFAULT false NOT NULL,
	"is_visible_in_ui" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapy_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"is_annual" boolean DEFAULT false NOT NULL,
	"custom_config" jsonb,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"source_platform" varchar(20) DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "has_used_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_credit" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(100);--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapy_sessions" ADD CONSTRAINT "therapy_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_therapy_sessions_user_started" ON "therapy_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_user_status" ON "user_subscriptions" USING btree ("user_id","payment_status");--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_expired" ON "user_subscriptions" USING btree ("payment_status","end_date");