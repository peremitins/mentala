ALTER TABLE "subscription_plans" DROP COLUMN "price_per_minute_gpt";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "price_per_minute_avatar";--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "is_custom_configurable";--> statement-breakpoint
ALTER TABLE "user_subscriptions" DROP COLUMN "custom_config";
--> statement-breakpoint
UPDATE "user_subscriptions" SET "plan_id" = 'pro' WHERE "plan_id" = 'custom';--> statement-breakpoint
DELETE FROM "subscription_plans" WHERE "id" = 'custom';
