ALTER TABLE "users" ADD COLUMN "apple_app_account_token" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "uk_users_apple_app_account_token" UNIQUE("apple_app_account_token");