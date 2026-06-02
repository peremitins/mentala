CREATE TABLE "user_plants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"program_id" integer NOT NULL,
	"program_slug" varchar(80) NOT NULL,
	"plant_set_slug" varchar(40) NOT NULL,
	"state_index" smallint NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_summary" text,
	"saved_thoughts" jsonb DEFAULT '{"ids":[]}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "plant_set_slug" varchar(40);--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "difficulty" varchar(20);--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "summary_text" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "unlock_rule" jsonb DEFAULT '{"kind":"always"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_user_plants_user_program" ON "user_plants" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "idx_user_plants_user_completed" ON "user_plants" USING btree ("user_id","completed_at");