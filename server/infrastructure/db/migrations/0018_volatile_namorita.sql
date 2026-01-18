CREATE TABLE "meditation_favorites" (
	"user_id" integer NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_meditation_favorites_user_track" UNIQUE("user_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "meditation_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"topic_key" varchar(40) NOT NULL,
	"audio_path" text NOT NULL,
	"cover_path" text,
	"is_loop" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "meditation_timer_minutes" integer;--> statement-breakpoint
CREATE INDEX "idx_meditation_favorites_user" ON "meditation_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_meditation_favorites_track" ON "meditation_favorites" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "idx_meditation_tracks_topic_key" ON "meditation_tracks" USING btree ("topic_key");