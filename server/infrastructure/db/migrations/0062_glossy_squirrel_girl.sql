CREATE TABLE "gratitude_diary_favorite_prompts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"prompt_type" varchar(10) NOT NULL,
	"catalog_prompt_id" varchar(64),
	"custom_text" varchar(220),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_gratitude_favorite_prompt_type" CHECK ("gratitude_diary_favorite_prompts"."prompt_type" IN ('catalog', 'custom')),
	CONSTRAINT "chk_gratitude_favorite_type_consistency" CHECK (("gratitude_diary_favorite_prompts"."prompt_type" = 'catalog' AND "gratitude_diary_favorite_prompts"."catalog_prompt_id" IS NOT NULL AND "gratitude_diary_favorite_prompts"."custom_text" IS NULL)
          OR
          ("gratitude_diary_favorite_prompts"."prompt_type" = 'custom' AND "gratitude_diary_favorite_prompts"."custom_text" IS NOT NULL AND "gratitude_diary_favorite_prompts"."catalog_prompt_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "idx_gratitude_favorite_user_created" ON "gratitude_diary_favorite_prompts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_gratitude_favorite_user_catalog" ON "gratitude_diary_favorite_prompts" USING btree ("user_id","catalog_prompt_id") WHERE "gratitude_diary_favorite_prompts"."catalog_prompt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_gratitude_favorite_user_custom_text" ON "gratitude_diary_favorite_prompts" USING btree ("user_id","custom_text") WHERE "gratitude_diary_favorite_prompts"."custom_text" IS NOT NULL;