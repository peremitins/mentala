ALTER TABLE "idempotency_keys" ADD COLUMN "response_json" jsonb;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "checkout_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "checkout_currency" varchar(3) DEFAULT 'RUB' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "billing_credit_applied" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "billing_credit_granted" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "yookassa_payment_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "uk_user_subscriptions_yookassa_payment_id" UNIQUE("yookassa_payment_id");