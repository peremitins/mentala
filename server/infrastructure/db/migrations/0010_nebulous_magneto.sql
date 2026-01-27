CREATE TABLE "content_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(20) NOT NULL,
	"format" varchar(50) NOT NULL,
	"topic" text NOT NULL,
	"goal" varchar(50),
	"tone_level" integer NOT NULL,
	"addressing" varchar(10) NOT NULL,
	"length" varchar(20) NOT NULL,
	"cta_type" varchar(50) NOT NULL,
	"cta_text" text,
	"cta_payload" text,
	"content" text NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safety_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_platform" varchar(20),
	"published_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cp_platform_status_created_at" ON "content_posts" USING btree ("platform","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_cp_topic_created_at" ON "content_posts" USING btree ("topic","created_at");