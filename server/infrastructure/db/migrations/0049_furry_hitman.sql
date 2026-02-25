CREATE TABLE "external_auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_ip" text,
	"created_user_agent" text,
	"consumed_ip" text,
	"consumed_user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_external_auth_tokens_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "landing_leads" ALTER COLUMN "goal_key" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN "request_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_auth_tokens" ADD CONSTRAINT "external_auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_external_auth_tokens_user_expires" ON "external_auth_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_external_auth_tokens_expires" ON "external_auth_tokens" USING btree ("expires_at");