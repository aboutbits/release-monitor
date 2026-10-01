ALTER TABLE "main"."notifications" DROP CONSTRAINT "notifications_release_id_channel_id_unique";--> statement-breakpoint
ALTER TABLE "main"."releases" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "main"."notifications" ADD CONSTRAINT "notifications_release_id_channel_id_kind_unique" UNIQUE("release_id","channel_id","kind");