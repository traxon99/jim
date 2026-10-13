CREATE TABLE "feedback_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_submissions_user_created" ON "feedback_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "feedback_submissions_select_own" ON "feedback_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("feedback_submissions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "feedback_submissions_insert_own" ON "feedback_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("feedback_submissions"."user_id" = (select auth.uid()));