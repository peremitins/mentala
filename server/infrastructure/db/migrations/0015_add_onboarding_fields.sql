ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age_range" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL;

