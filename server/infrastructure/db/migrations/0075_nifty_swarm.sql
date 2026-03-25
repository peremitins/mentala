CREATE TABLE IF NOT EXISTS "apple_notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_uuid" varchar(64) NOT NULL,
	"notification_type" varchar(80),
	"notification_subtype" varchar(80),
	"user_id" integer,
	"transaction_id" text,
	"original_transaction_id" text,
	"processing_status" varchar(20) DEFAULT 'received' NOT NULL,
	"signed_payload" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_apple_notification_events_notification_uuid" UNIQUE("notification_uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apple_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"original_transaction_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"product_id" text NOT NULL,
	"environment" varchar(20) NOT NULL,
	"purchase_date" timestamp with time zone,
	"expires_date" timestamp with time zone,
	"revocation_date" timestamp with time zone,
	"storefront" varchar(2),
	"app_account_token" text,
	"signed_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_apple_transactions_transaction_id" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "payment_provider" varchar(20) DEFAULT 'yookassa' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "apple_transaction_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "apple_original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "apple_product_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "apple_environment" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_region_source" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_storefront_country" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_storefront_updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "apple_notification_events" ADD CONSTRAINT "apple_notification_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "apple_transactions" ADD CONSTRAINT "apple_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_apple_notification_events_created" ON "apple_notification_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_apple_transactions_original_env" ON "apple_transactions" USING btree ("original_transaction_id","environment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_apple_transactions_user_created" ON "apple_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_subscriptions" ADD CONSTRAINT "uk_user_subscriptions_apple_transaction_id" UNIQUE("apple_transaction_id");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;