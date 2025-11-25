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
	"category" varchar(50) NOT NULL,
	"emoji" varchar(8),
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
	"habit_id" varchar(255),
	"enabled" boolean DEFAULT true NOT NULL,
	"times_per_day" integer NOT NULL,
	"directness" varchar(20) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"habit_id" varchar(255),
	"scheduled_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"template_id" varchar(255),
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
