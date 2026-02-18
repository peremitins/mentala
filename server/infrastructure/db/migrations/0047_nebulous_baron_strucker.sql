CREATE TABLE "landing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_released" boolean DEFAULT false NOT NULL,
	"cta_url" varchar(255) DEFAULT 'https://my.mentala.app/auth' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_normalized" varchar(255) NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"goal_key" varchar(50),
	"utm_source" varchar(120),
	"utm_medium" varchar(120),
	"utm_campaign" varchar(120),
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uk_landing_leads_email_hash" ON "landing_leads" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "idx_landing_leads_created_at" ON "landing_leads" USING btree ("created_at");