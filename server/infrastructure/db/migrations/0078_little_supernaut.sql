CREATE TABLE "billing_access_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_campaign_id" integer,
	"source_redemption_id" integer,
	"plan_id" varchar(50) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_credit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"entry_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'posted' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"available_at" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"source_referral_redemption_id" integer,
	"source_subscription_id" integer,
	"source_payment_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_discount_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(20) DEFAULT 'yookassa' NOT NULL,
	"grant_kind" varchar(30) NOT NULL,
	"source_campaign_id" integer,
	"source_redemption_id" integer,
	"source_referral_redemption_id" integer,
	"binding_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"target_plan_scope" varchar(20) DEFAULT 'any_paid' NOT NULL,
	"target_period_scope" varchar(10) DEFAULT 'any' NOT NULL,
	"percent" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"reservation_key" varchar(255),
	"reserved_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_payment_id" text,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_schedule_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"days" integer NOT NULL,
	"reason" varchar(50) NOT NULL,
	"source_campaign_id" integer,
	"source_redemption_id" integer,
	"source_access_grant_id" integer,
	"active_subscription_id" integer,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"campaign_type" varchar(50) NOT NULL,
	"binding_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"target_user_id" integer,
	"target_email" varchar(255),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"benefit_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"admin_comment" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_promo_campaigns_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'succeeded' NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"campaign_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_promo_code_redemptions_campaign" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "referral_program_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"invitee_percent" integer DEFAULT 20 NOT NULL,
	"referrer_percent" integer DEFAULT 20 NOT NULL,
	"invitee_reward_validity_days" integer DEFAULT 30 NOT NULL,
	"credit_hold_days" integer DEFAULT 14 NOT NULL,
	"invitee_target_plan_scope" varchar(20) DEFAULT 'any_paid' NOT NULL,
	"invitee_target_period_scope" varchar(10) DEFAULT 'any' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_user_id" integer NOT NULL,
	"invitee_user_id" integer NOT NULL,
	"referral_code" varchar(64) NOT NULL,
	"status" varchar(30) DEFAULT 'pending_conversion' NOT NULL,
	"invitee_reward_grant_id" integer,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"converted_at" timestamp with time zone,
	"reward_issued_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_referral_redemptions_invitee" UNIQUE("invitee_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_referral_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"successful_invites_count" integer DEFAULT 0 NOT NULL,
	"pending_rewards_count" integer DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"last_reward_issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_user_referral_profiles_code" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "billing_access_grants" ADD CONSTRAINT "billing_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_access_grants" ADD CONSTRAINT "billing_access_grants_source_campaign_id_promo_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."promo_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_access_grants" ADD CONSTRAINT "billing_access_grants_source_redemption_id_promo_code_redemptions_id_fk" FOREIGN KEY ("source_redemption_id") REFERENCES "public"."promo_code_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_access_grants" ADD CONSTRAINT "billing_access_grants_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit_entries" ADD CONSTRAINT "billing_credit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit_entries" ADD CONSTRAINT "billing_credit_entries_source_referral_redemption_id_referral_redemptions_id_fk" FOREIGN KEY ("source_referral_redemption_id") REFERENCES "public"."referral_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit_entries" ADD CONSTRAINT "billing_credit_entries_source_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("source_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_discount_grants" ADD CONSTRAINT "billing_discount_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_discount_grants" ADD CONSTRAINT "billing_discount_grants_source_campaign_id_promo_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."promo_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_discount_grants" ADD CONSTRAINT "billing_discount_grants_source_redemption_id_promo_code_redemptions_id_fk" FOREIGN KEY ("source_redemption_id") REFERENCES "public"."promo_code_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_discount_grants" ADD CONSTRAINT "billing_discount_grants_source_referral_redemption_id_referral_redemptions_id_fk" FOREIGN KEY ("source_referral_redemption_id") REFERENCES "public"."referral_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_schedule_adjustments" ADD CONSTRAINT "billing_schedule_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_schedule_adjustments" ADD CONSTRAINT "billing_schedule_adjustments_source_campaign_id_promo_campaigns_id_fk" FOREIGN KEY ("source_campaign_id") REFERENCES "public"."promo_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_schedule_adjustments" ADD CONSTRAINT "billing_schedule_adjustments_source_redemption_id_promo_code_redemptions_id_fk" FOREIGN KEY ("source_redemption_id") REFERENCES "public"."promo_code_redemptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_schedule_adjustments" ADD CONSTRAINT "billing_schedule_adjustments_source_access_grant_id_billing_access_grants_id_fk" FOREIGN KEY ("source_access_grant_id") REFERENCES "public"."billing_access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_schedule_adjustments" ADD CONSTRAINT "billing_schedule_adjustments_active_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("active_subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_campaigns" ADD CONSTRAINT "promo_campaigns_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_campaigns" ADD CONSTRAINT "promo_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_campaigns" ADD CONSTRAINT "promo_campaigns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_campaign_id_promo_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promo_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referral_profiles" ADD CONSTRAINT "user_referral_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_access_grants_user_status_ends" ON "billing_access_grants" USING btree ("user_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "idx_billing_credit_entries_user_status_available" ON "billing_credit_entries" USING btree ("user_id","status","available_at");--> statement-breakpoint
CREATE INDEX "idx_billing_credit_entries_referral" ON "billing_credit_entries" USING btree ("source_referral_redemption_id");--> statement-breakpoint
CREATE INDEX "idx_billing_credit_entries_subscription" ON "billing_credit_entries" USING btree ("source_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_billing_discount_grants_user_status_expires" ON "billing_discount_grants" USING btree ("user_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_billing_discount_grants_reservation" ON "billing_discount_grants" USING btree ("reservation_key");--> statement-breakpoint
CREATE INDEX "idx_billing_schedule_adjustments_user_applied" ON "billing_schedule_adjustments" USING btree ("user_id","applied_at");--> statement-breakpoint
CREATE INDEX "idx_promo_campaigns_status" ON "promo_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_promo_campaigns_dates" ON "promo_campaigns" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "idx_promo_code_redemptions_user" ON "promo_code_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_referral_redemptions_referrer" ON "referral_redemptions" USING btree ("referrer_user_id","redeemed_at");