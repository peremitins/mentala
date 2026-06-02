CREATE TABLE "user_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"badge_id" varchar(100) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_milestones" ADD CONSTRAINT "user_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_user_milestones_user_badge" ON "user_milestones" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE INDEX "idx_user_milestones_user" ON "user_milestones" USING btree ("user_id");