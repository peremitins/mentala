ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_version" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acceptance_source" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acceptance_ip" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acceptance_user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent_source" varchar(16);