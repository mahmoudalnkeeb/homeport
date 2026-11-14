CREATE TYPE "public"."video_kind" AS ENUM('movie', 'episode');--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"album_artist" text NOT NULL,
	"year" integer,
	"has_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "albums_albumArtist_title_unique" UNIQUE("album_artist","title")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"album_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"track_no" integer,
	"disc_no" integer,
	"duration" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder" text NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"tmdb_id" integer,
	"overview" text,
	"has_poster" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shows_folder_unique" UNIQUE("folder")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"kind" "video_kind" NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"show_id" uuid,
	"season" integer,
	"episode" integer,
	"tmdb_id" integer,
	"overview" text,
	"has_poster" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"position" double precision NOT NULL,
	"duration" double precision NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracks_album_id_disc_no_track_no_index" ON "tracks" USING btree ("album_id","disc_no","track_no");--> statement-breakpoint
CREATE INDEX "tracks_title_index" ON "tracks" USING btree ("title");--> statement-breakpoint
CREATE INDEX "videos_kind_title_index" ON "videos" USING btree ("kind","title");--> statement-breakpoint
CREATE INDEX "videos_show_id_season_episode_index" ON "videos" USING btree ("show_id","season","episode");--> statement-breakpoint
CREATE INDEX "watch_progress_user_id_updated_at_index" ON "watch_progress" USING btree ("user_id","updated_at");