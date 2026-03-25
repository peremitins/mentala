ALTER TABLE "user_subscriptions" ADD COLUMN "payment_provider" varchar(20) DEFAULT 'yookassa' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "apple_transaction_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "apple_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "apple_product_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "apple_environment" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_region_source" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_storefront_country" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_storefront_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "uk_user_subscriptions_apple_transaction_id" UNIQUE("apple_transaction_id");