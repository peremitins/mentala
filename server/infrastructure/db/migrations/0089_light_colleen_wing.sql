CREATE TABLE "user_program_checkpoint_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_program_id" integer NOT NULL,
	"program_slug" varchar(80) NOT NULL,
	"checkpoint_step" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"summary_text" text NOT NULL,
	"structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_used" varchar(40),
	"generation_status" varchar(20) DEFAULT 'ready' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_program_checkpoint_summaries" ADD CONSTRAINT "user_program_checkpoint_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_checkpoint_summaries" ADD CONSTRAINT "user_program_checkpoint_summaries_user_program_id_user_programs_id_fk" FOREIGN KEY ("user_program_id") REFERENCES "public"."user_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_checkpoint_summaries_user_program_step" ON "user_program_checkpoint_summaries" USING btree ("user_program_id","checkpoint_step");--> statement-breakpoint
CREATE INDEX "idx_checkpoint_summaries_user" ON "user_program_checkpoint_summaries" USING btree ("user_id","generated_at");