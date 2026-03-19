CREATE TABLE "realtime_voice_session_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"event_id" varchar(120) NOT NULL,
	"type" varchar(40) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_voice_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"therapy_session_id" integer NOT NULL,
	"chat_session_id" varchar(120),
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"end_reason" varchar(40),
	"provider" varchar(40) DEFAULT 'openai' NOT NULL,
	"provider_model" varchar(120) NOT NULL,
	"provider_voice" varchar(80) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"user_turns_count" integer DEFAULT 0 NOT NULL,
	"assistant_turns_count" integer DEFAULT 0 NOT NULL,
	"interrupt_count" integer DEFAULT 0 NOT NULL,
	"input_audio_seconds" integer DEFAULT 0 NOT NULL,
	"output_audio_seconds" integer DEFAULT 0 NOT NULL,
	"input_audio_tokens" integer DEFAULT 0 NOT NULL,
	"output_audio_tokens" integer DEFAULT 0 NOT NULL,
	"quota_period_key" varchar(80) NOT NULL,
	"error_code" varchar(80),
	"error_message" text,
	"client_platform" varchar(20) DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "realtime_voice_session_events" ADD CONSTRAINT "realtime_voice_session_events_session_id_realtime_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."realtime_voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_voice_sessions" ADD CONSTRAINT "realtime_voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_voice_sessions" ADD CONSTRAINT "realtime_voice_sessions_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_realtime_voice_session_events_unique" ON "realtime_voice_session_events" USING btree ("session_id","event_id");--> statement-breakpoint
CREATE INDEX "idx_realtime_voice_session_events_occurred" ON "realtime_voice_session_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_realtime_voice_sessions_user_started" ON "realtime_voice_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_realtime_voice_sessions_user_status" ON "realtime_voice_sessions" USING btree ("user_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_realtime_voice_sessions_therapy_session" ON "realtime_voice_sessions" USING btree ("therapy_session_id");--> statement-breakpoint
CREATE INDEX "idx_realtime_voice_sessions_quota_period" ON "realtime_voice_sessions" USING btree ("user_id","quota_period_key");