CREATE TABLE "progress_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pose" text,
	"note" text,
	"session_id" uuid,
	"body_measurement_id" uuid,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"thumb_path" text NOT NULL,
	"original_path" text NOT NULL,
	"uploaded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "progress_photos_pose_valid" CHECK ("progress_photos"."pose" IS NULL OR "progress_photos"."pose" IN ('front', 'side', 'back', 'other'))
);
--> statement-breakpoint
ALTER TABLE "progress_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_body_measurement_id_body_measurements_id_fk" FOREIGN KEY ("body_measurement_id") REFERENCES "public"."body_measurements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_photos_server_seq" ON "progress_photos" USING btree ("server_seq");--> statement-breakpoint
CREATE INDEX "progress_photos_user_seq" ON "progress_photos" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "progress_photos_user_day" ON "progress_photos" USING btree ("user_id","taken_on");--> statement-breakpoint
CREATE POLICY "progress_photos_select_own" ON "progress_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("progress_photos"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "progress_photos_insert_own" ON "progress_photos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("progress_photos"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "progress_photos_update_own" ON "progress_photos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("progress_photos"."user_id" = (select auth.uid())) WITH CHECK ("progress_photos"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "progress_photos_delete_own" ON "progress_photos" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("progress_photos"."user_id" = (select auth.uid()));
--> statement-breakpoint
-- Storage (issue #835): the first Supabase Storage bucket. Private (no public
-- URLs; reads use short-lived signed URLs) and capped to a JPEG of at most
-- 10 MB, which is far above the 2048 px original the phone uploads. Objects
-- live at <user_id>/<photo_id>/{thumb,original}.jpg, so the first path segment
-- is the owner's id and each policy checks it against auth.uid(). There is no
-- UPDATE policy: an object is written once and removed on delete.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('progress-photos', 'progress-photos', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;--> statement-breakpoint
CREATE POLICY "progress_photos_objects_select_own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);--> statement-breakpoint
CREATE POLICY "progress_photos_objects_insert_own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);--> statement-breakpoint
CREATE POLICY "progress_photos_objects_delete_own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (bucket_id = 'progress-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
