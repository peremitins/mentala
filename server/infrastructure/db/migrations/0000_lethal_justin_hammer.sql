CREATE TABLE "ai_generated_notification_texts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"entity_key" varchar(255) NOT NULL,
	"entity_display_name" varchar(255),
	"preference_id" text NOT NULL,
	"text_source" varchar(20) NOT NULL,
	"texts" jsonb NOT NULL,
	"generation_config_hash" text NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100),
	"tokens_used" integer,
	"cost_usd" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_notification_text_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"ai_text_id" integer NOT NULL,
	"slot_id" text NOT NULL,
	"text_index" integer NOT NULL,
	"text_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text
);
--> statement-breakpoint
CREATE TABLE "chat_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"theme" varchar(10) DEFAULT 'dark' NOT NULL,
	"mode" varchar(20) DEFAULT 'therapy' NOT NULL,
	"voice" boolean DEFAULT true NOT NULL,
	"avatar" boolean DEFAULT true NOT NULL,
	"enable_previous_response_id" boolean DEFAULT true NOT NULL,
	"enable_summary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_adherence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" varchar(10) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"asked" integer DEFAULT 0 NOT NULL,
	"yes" integer DEFAULT 0 NOT NULL,
	"no" integer DEFAULT 0 NOT NULL,
	"later" integer DEFAULT 0 NOT NULL,
	"dismissed" integer DEFAULT 0 NOT NULL,
	"unanswered" integer DEFAULT 0 NOT NULL,
	"completion_rate" varchar(10) DEFAULT '0.0' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"intent" varchar(10) NOT NULL,
	"habit_key" varchar(50),
	"emoji" varchar(8),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"action_at" timestamp with time zone DEFAULT now(),
	"meta" jsonb,
	"kind" varchar(20) NOT NULL,
	"type" varchar(50),
	"metric" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"entity_key" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"times_per_day" integer NOT NULL,
	"directness" varchar(20) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"subtype" varchar(20) DEFAULT 'mixed',
	"active_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb NOT NULL,
	"custom_slot_times" jsonb,
	"time_range_start" integer DEFAULT 540 NOT NULL,
	"time_range_end" integer DEFAULT 1350 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"entity_key" varchar(255),
	"entity_display_name" varchar(255),
	"scheduled_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"template_id" varchar(255),
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_text_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"entity_key" text NOT NULL,
	"intent" text,
	"subtype" text,
	"directness" text NOT NULL,
	"addressing" text NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_texts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"entity_key" text NOT NULL,
	"user_id" integer,
	"source" text NOT NULL,
	"intent" text,
	"subtype" text,
	"directness" text NOT NULL,
	"addressing" text NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" integer NOT NULL,
	"save_history" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"model" text NOT NULL,
	"summary_iv" text NOT NULL,
	"summary_ct" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"telegram_id" integer NOT NULL,
	"username" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapy_topics_custom" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"emoji" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_devices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"addressing" varchar(20) DEFAULT 'informal' NOT NULL,
	"tone" varchar(20) DEFAULT 'neutral' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"lang" varchar(8) DEFAULT 'ru' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_response_ids" (
	"user_id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120),
	"email" varchar(255),
	"email_verified_at" timestamp,
	"password_hash" text,
	"avatar_url" text,
	"country" varchar(100),
	"locale" varchar(8),
	"last_login_at" timestamp,
	"last_login_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "welcome_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mode" varchar(16) NOT NULL,
	"is_first_session" boolean DEFAULT true NOT NULL,
	"content" text NOT NULL,
	"lang" varchar(8) DEFAULT 'ru' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_notification_text_usage" ADD CONSTRAINT "ai_notification_text_usage_ai_text_id_ai_generated_notification_texts_id_fk" FOREIGN KEY ("ai_text_id") REFERENCES "public"."ai_generated_notification_texts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_notification_text_usage" ADD CONSTRAINT "ai_notification_text_usage_slot_id_notification_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."notification_slots"("id") ON DELETE cascade ON UPDATE no action;