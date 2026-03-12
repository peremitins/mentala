CREATE TABLE "gratitude_diary_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"mood" varchar(20),
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"photo_url" text,
	"input_method" varchar(12) DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_gratitude_diary_entries_user_created" ON "gratitude_diary_entries" USING btree ("user_id","created_at");