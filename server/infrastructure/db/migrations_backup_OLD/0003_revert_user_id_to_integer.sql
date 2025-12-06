-- Revert user_id type from varchar back to integer
ALTER TABLE "user_prompts" ALTER COLUMN "user_id" TYPE integer USING "user_id"::integer;

-- Recreate the unique index for active prompts
DROP INDEX IF EXISTS "user_prompts_active_unique";
CREATE UNIQUE INDEX "user_prompts_active_unique"
  ON "user_prompts" ("user_id","type") WHERE (is_active = true);
