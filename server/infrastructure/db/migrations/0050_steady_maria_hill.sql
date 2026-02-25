ALTER TABLE "users" ADD COLUMN "scheduled_plan_id" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_billing_period" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_from_subscription_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "scheduled_change_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_scheduled_plan_id_subscription_plans_id_fk" FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_scheduled_from_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("scheduled_from_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE set null ON UPDATE no action;