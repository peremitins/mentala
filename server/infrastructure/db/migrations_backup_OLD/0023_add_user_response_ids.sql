-- Migration: Add user_response_ids table for previous_response_id support
-- Created: 2025-01-XX

CREATE TABLE IF NOT EXISTS "user_response_ids" (
	"user_id" text PRIMARY KEY NOT NULL,
	"response_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

-- Index for faster lookups by user_id and expires_at
CREATE INDEX IF NOT EXISTS "user_response_ids_user_id_expires_at_idx" ON "user_response_ids" ("user_id", "expires_at");


