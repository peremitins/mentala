ALTER TABLE "user_program_checkpoint_summaries" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_program_checkpoint_summaries" ADD COLUMN "push_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_checkpoint_summaries_user_pending" ON "user_program_checkpoint_summaries" USING btree ("user_id","viewed_at","generation_status");