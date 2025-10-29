ALTER TABLE "user_prompts" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "user_prompts" ADD COLUMN "description" text;