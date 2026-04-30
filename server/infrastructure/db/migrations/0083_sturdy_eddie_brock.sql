CREATE TABLE "user_marketing_attributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"touchpoint" varchar(64) NOT NULL,
	"auth_provider" varchar(32),
	"utm_source" varchar(120),
	"utm_medium" varchar(120),
	"utm_campaign" varchar(120),
	"utm_content" varchar(120),
	"utm_term" varchar(120),
	"gclid" varchar(255),
	"yclid" varchar(255),
	"fbclid" varchar(255),
	"ttclid" varchar(255),
	"landing_url" text,
	"referrer" text,
	"raw_params" jsonb DEFAULT '{}'::jsonb,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "utm_content" varchar(120);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "utm_term" varchar(120);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "gclid" varchar(255);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "yclid" varchar(255);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "fbclid" varchar(255);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "ttclid" varchar(255);--> statement-breakpoint
ALTER TABLE "landing_leads" ADD COLUMN "raw_attribution" jsonb;--> statement-breakpoint
ALTER TABLE "user_marketing_attributions" ADD CONSTRAINT "user_marketing_attributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_marketing_attr_user_created" ON "user_marketing_attributions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_marketing_attr_campaign" ON "user_marketing_attributions" USING btree ("utm_campaign");--> statement-breakpoint
CREATE INDEX "idx_user_marketing_attr_source_medium" ON "user_marketing_attributions" USING btree ("utm_source","utm_medium");