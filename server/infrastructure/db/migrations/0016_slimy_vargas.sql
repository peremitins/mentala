CREATE TABLE "trial_usage_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_normalized" varchar(255) NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"first_trial_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_trial_started_at" timestamp with time zone,
	"total_days_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_usage_tracking_email_hash_unique" UNIQUE("email_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_trial_usage_email_normalized" ON "trial_usage_tracking" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "idx_trial_usage_email_hash" ON "trial_usage_tracking" USING btree ("email_hash");