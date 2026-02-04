CREATE TABLE "notification_image_rotation" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"entity_key" varchar(255) NOT NULL,
	"image_tag" varchar(50) NOT NULL,
	"last_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_image_rotation_user_kind_entity_tag_unique" UNIQUE("user_id","kind","entity_key","image_tag")
);
