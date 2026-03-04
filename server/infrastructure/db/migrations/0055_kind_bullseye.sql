CREATE TABLE "chat_response_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"therapy_session_id" integer NOT NULL,
	"session_id" text,
	"assistant_message_client_id" varchar(64) NOT NULL,
	"rating" smallint NOT NULL,
	"topic_code" varchar(40),
	"comment" text,
	"platform" varchar(20) DEFAULT 'web' NOT NULL,
	"timezone" varchar(100),
	"locale" varchar(8),
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_chat_response_feedback_user_therapy_message" UNIQUE("user_id","therapy_session_id","assistant_message_client_id"),
	CONSTRAINT "chk_chat_response_feedback_rating" CHECK ("chat_response_feedback"."rating" in (-1, 1)),
	CONSTRAINT "chk_chat_response_feedback_comment_length" CHECK ("chat_response_feedback"."comment" is null or length("chat_response_feedback"."comment") <= 1000),
	CONSTRAINT "chk_chat_response_feedback_topic_by_rating" CHECK (("chat_response_feedback"."rating" = 1 and "chat_response_feedback"."topic_code" is null) or ("chat_response_feedback"."rating" = -1 and "chat_response_feedback"."topic_code" is not null))
);
--> statement-breakpoint
ALTER TABLE "chat_response_feedback" ADD CONSTRAINT "chat_response_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_response_feedback" ADD CONSTRAINT "chat_response_feedback_therapy_session_id_therapy_sessions_id_fk" FOREIGN KEY ("therapy_session_id") REFERENCES "public"."therapy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_response_feedback_session_created" ON "chat_response_feedback" USING btree ("therapy_session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_response_feedback_rating_created" ON "chat_response_feedback" USING btree ("rating","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_response_feedback_topic_created" ON "chat_response_feedback" USING btree ("topic_code","created_at");