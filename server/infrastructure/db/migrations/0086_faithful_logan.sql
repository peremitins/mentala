CREATE TABLE "daily_thoughts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"entry_date" varchar(10) NOT NULL,
	"text" text NOT NULL,
	"source" varchar(24) DEFAULT 'fallback' NOT NULL,
	"program_slug" varchar(80),
	"step" integer,
	"saved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"source" varchar(40) NOT NULL,
	"source_id" varchar(120),
	"event_date" varchar(10) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mood_checkins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mood" varchar(24) NOT NULL,
	"score" smallint NOT NULL,
	"entry_date" varchar(10) NOT NULL,
	"source" varchar(40) DEFAULT 'home' NOT NULL,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_step_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"step" integer NOT NULL,
	"chapter" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"subtitle" text,
	"next_hint" text,
	"duration_min" integer DEFAULT 3 NOT NULL,
	"energy_reward" integer DEFAULT 5 NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" varchar(120) NOT NULL,
	"subtitle" text,
	"total_steps" integer DEFAULT 30 NOT NULL,
	"themes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"required_plan" varchar(20),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_program_step_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_program_id" integer NOT NULL,
	"step_template_id" integer NOT NULL,
	"progress_id" integer,
	"step" integer NOT NULL,
	"status" varchar(20) DEFAULT 'started' NOT NULL,
	"replay" boolean DEFAULT false NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_program_step_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_program_id" integer NOT NULL,
	"step_template_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'locked' NOT NULL,
	"current_action_index" integer DEFAULT 0 NOT NULL,
	"best_attempt_id" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"program_id" integer NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_thoughts" ADD CONSTRAINT "daily_thoughts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_events" ADD CONSTRAINT "energy_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_checkins" ADD CONSTRAINT "mood_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_step_templates" ADD CONSTRAINT "program_step_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_attempts" ADD CONSTRAINT "user_program_step_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_attempts" ADD CONSTRAINT "user_program_step_attempts_user_program_id_user_programs_id_fk" FOREIGN KEY ("user_program_id") REFERENCES "public"."user_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_attempts" ADD CONSTRAINT "user_program_step_attempts_step_template_id_program_step_templates_id_fk" FOREIGN KEY ("step_template_id") REFERENCES "public"."program_step_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_attempts" ADD CONSTRAINT "user_program_step_attempts_progress_id_user_program_step_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."user_program_step_progress"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_progress" ADD CONSTRAINT "user_program_step_progress_user_program_id_user_programs_id_fk" FOREIGN KEY ("user_program_id") REFERENCES "public"."user_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_step_progress" ADD CONSTRAINT "user_program_step_progress_step_template_id_program_step_templates_id_fk" FOREIGN KEY ("step_template_id") REFERENCES "public"."program_step_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_programs" ADD CONSTRAINT "user_programs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_daily_thoughts_user_date" ON "daily_thoughts" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_daily_thoughts_user_created" ON "daily_thoughts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_energy_events_user_date" ON "energy_events" USING btree ("user_id","event_date");--> statement-breakpoint
CREATE INDEX "idx_energy_events_source" ON "energy_events" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "idx_mood_checkins_user_date" ON "mood_checkins" USING btree ("user_id","entry_date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_program_step_templates_step" ON "program_step_templates" USING btree ("program_id","step");--> statement-breakpoint
CREATE INDEX "idx_program_step_templates_chapter" ON "program_step_templates" USING btree ("program_id","chapter","step");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_programs_slug" ON "programs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_user_program_step_attempts_step" ON "user_program_step_attempts" USING btree ("user_program_id","step","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_program_step_attempts_user_created" ON "user_program_step_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_user_program_step_progress_step" ON "user_program_step_progress" USING btree ("user_program_id","step_template_id");--> statement-breakpoint
CREATE INDEX "idx_user_program_step_progress_status" ON "user_program_step_progress" USING btree ("user_program_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_user_programs_user_program" ON "user_programs" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "idx_user_programs_user_status" ON "user_programs" USING btree ("user_id","status");