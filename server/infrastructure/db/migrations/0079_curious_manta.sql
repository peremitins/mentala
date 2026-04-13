ALTER TABLE "users" ADD COLUMN "ai_consent_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_consent_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_consent_version" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_consent_locale" varchar(8);