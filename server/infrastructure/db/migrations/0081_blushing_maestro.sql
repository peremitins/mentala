CREATE TABLE "session_summaries_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_session_id" varchar(120),
	"therapy_session_id" integer,
	"model" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"session_started_at" timestamp with time zone,
	"session_ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"user_messages_count" integer DEFAULT 0 NOT NULL,
	"qualifying_user_messages_count" integer DEFAULT 0 NOT NULL,
	"summary_iv" text,
	"summary_ct" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"viewed_at" timestamp with time zone,
	"trigger" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_summaries_user" ADD CONSTRAINT "session_summaries_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries_user" ADD CONSTRAINT "session_summaries_user_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_session_summaries_user_therapy_session_id" ON "session_summaries_user" USING btree ("therapy_session_id");--> statement-breakpoint
CREATE INDEX "idx_session_summaries_user_user_created_at" ON "session_summaries_user" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_session_summaries_user_user_viewed" ON "session_summaries_user" USING btree ("user_id","viewed_at");