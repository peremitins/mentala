CREATE TABLE "chat_session_memories" (
	"therapy_session_id" integer PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"previous_response_id" text,
	"previous_response_expires_at" timestamp with time zone,
	"runtime_compact_schema_version" integer,
	"runtime_compact_iv" text,
	"runtime_compact_ct" text,
	"runtime_compact_cursor_message_id" integer,
	"chain_turn_count" integer DEFAULT 0 NOT NULL,
	"pending_soft_compaction" boolean DEFAULT false NOT NULL,
	"last_observed_input_tokens" integer,
	"last_observed_output_tokens" integer,
	"last_observed_total_tokens" integer,
	"last_observed_at" timestamp with time zone,
	"last_compacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapy_session_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"therapy_session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"turn_index" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content_iv" text NOT NULL,
	"content_ct" text NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "therapy_session_id" integer;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "summary_kind" varchar(32) DEFAULT 'handoff' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_session_memories" ADD CONSTRAINT "chat_session_memories_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_session_memories" ADD CONSTRAINT "chat_session_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapy_session_messages" ADD CONSTRAINT "therapy_session_messages_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapy_session_messages" ADD CONSTRAINT "therapy_session_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_session_memories_user_updated_at" ON "chat_session_memories" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_therapy_session_messages_session_turn" ON "therapy_session_messages" USING btree ("therapy_session_id","turn_index","id");--> statement-breakpoint
CREATE INDEX "idx_therapy_session_messages_user_created_at" ON "therapy_session_messages" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_session_summaries_therapy_session_id" ON "session_summaries" USING btree ("therapy_session_id");--> statement-breakpoint
CREATE INDEX "idx_session_summaries_user_created_at" ON "session_summaries" USING btree ("user_id","created_at");