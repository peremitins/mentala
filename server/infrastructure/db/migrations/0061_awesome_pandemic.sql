CREATE TABLE "gratitude_diary_worksheet_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uk_gratitude_diary_worksheet_templates_user" ON "gratitude_diary_worksheet_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_gratitude_diary_worksheet_templates_user" ON "gratitude_diary_worksheet_templates" USING btree ("user_id","updated_at");