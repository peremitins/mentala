CREATE TABLE "user_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" varchar(20) DEFAULT 'yookassa' NOT NULL,
	"provider_payment_method_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"payment_method_type" varchar(50),
	"payment_method_title" text,
	"card_brand" varchar(50),
	"card_last4" varchar(4),
	"card_expiry_month" varchar(2),
	"card_expiry_year" varchar(4),
	"archived_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_user_payment_methods_user_provider_method" UNIQUE("user_id","provider_payment_method_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_card_brand" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_card_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_card_expiry_month" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_method_card_expiry_year" varchar(4);--> statement-breakpoint
ALTER TABLE "user_payment_methods" ADD CONSTRAINT "user_payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_payment_methods_user_status" ON "user_payment_methods" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_user_payment_methods_user_default" ON "user_payment_methods" USING btree ("user_id","is_default");