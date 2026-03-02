CREATE TABLE "billing_charge_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"charge_attempt_key" varchar(255) NOT NULL,
	"billing_plan_id" varchar(50) NOT NULL,
	"billing_period" varchar(10) NOT NULL,
	"scheduled_charge_at" timestamp with time zone NOT NULL,
	"status" varchar(20) NOT NULL,
	"provider_payment_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"auto_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_auto_attempt_at" timestamp with time zone,
	"next_auto_retry_at" timestamp with time zone,
	"lock_at" timestamp with time zone,
	"lock_by" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_billing_charge_attempt_key" UNIQUE("charge_attempt_key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_plan_id" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_period" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "next_charge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_bound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_type" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_binding_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_binding_session_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_binding_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_binding_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_collection_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "grace_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_locked_by" varchar(100);--> statement-breakpoint
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "billing_charge_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charge_attempts" ADD CONSTRAINT "billing_charge_attempts_billing_plan_id_subscription_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_charge_attempts_user_status" ON "billing_charge_attempts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_billing_charge_attempts_next_retry" ON "billing_charge_attempts" USING btree ("next_auto_retry_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_billing_plan_id_subscription_plans_id_fk" FOREIGN KEY ("billing_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;