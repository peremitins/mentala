CREATE TABLE "assessment_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"assessment_slug" varchar(80) NOT NULL,
	"assessment_version" integer NOT NULL,
	"source" varchar(40) NOT NULL,
	"linked_program_slug" varchar(80),
	"linked_program_attempt_id" integer,
	"total_score" smallint NOT NULL,
	"band_id" varchar(80) NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"user_date" varchar(10) NOT NULL,
	"timezone" varchar(100) NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_linked_program_attempt_id_user_program_step_attempts_id_fk" FOREIGN KEY ("linked_program_attempt_id") REFERENCES "public"."user_program_step_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_user_assessment_completed" ON "assessment_attempts" USING btree ("user_id","assessment_slug","completed_at");--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_user_assessment_date" ON "assessment_attempts" USING btree ("user_id","assessment_slug","user_date");--> statement-breakpoint
CREATE INDEX "idx_assessment_attempts_user_program_source" ON "assessment_attempts" USING btree ("user_id","linked_program_slug","source");