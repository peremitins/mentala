CREATE TABLE "feature_access_policies" (
	"feature_key" text PRIMARY KEY NOT NULL,
	"required_plan" varchar(20) NOT NULL,
	"trial_unlocked" boolean DEFAULT false NOT NULL,
	"lock_icon" varchar(20) NOT NULL,
	"paywall_title" text NOT NULL,
	"paywall_description" text NOT NULL,
	"paywall_cta_text" text NOT NULL,
	"paywall_target_plan" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
