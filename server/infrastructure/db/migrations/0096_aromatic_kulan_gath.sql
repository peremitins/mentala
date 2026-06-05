CREATE TABLE "user_toolkit_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(16) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"tool_ref" jsonb,
	"item_key" varchar(120),
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"origin" varchar(16) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_user_toolkit_type" CHECK ("user_toolkit_items"."type" IN ('practice', 'phrase', 'ai_chat')),
	CONSTRAINT "chk_user_toolkit_origin" CHECK ("user_toolkit_items"."origin" IN ('roadmap', 'manual'))
);
--> statement-breakpoint
CREATE INDEX "idx_user_toolkit_user_created" ON "user_toolkit_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_user_toolkit_user_item_key" ON "user_toolkit_items" USING btree ("user_id","item_key") WHERE "user_toolkit_items"."item_key" IS NOT NULL;