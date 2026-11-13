CREATE TYPE "public"."stream_kind" AS ENUM('video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."stream_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attachment_category" AS ENUM('image', 'video', 'audio', 'document', 'archive', 'other');--> statement-breakpoint
CREATE TABLE "media_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"kind" "stream_kind" NOT NULL,
	"status" "stream_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"duration" double precision,
	"has_poster" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_streams_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category" "attachment_category" NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"key" text NOT NULL,
	"size" bigint NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_streams_status_created_at_index" ON "media_streams" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "attachments_category_created_at_index" ON "attachments" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "attachments_owner_id_index" ON "attachments" USING btree ("owner_id");