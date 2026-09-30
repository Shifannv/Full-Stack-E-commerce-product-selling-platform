CREATE TABLE "admin_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"deletion_request_id" uuid NOT NULL,
	"category_manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	"restored_by_user_id" text,
	CONSTRAINT "admin_archives_deletion_request_id_unique" UNIQUE("deletion_request_id")
);
--> statement-breakpoint
CREATE TABLE "admin_account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"reason" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "admin_deletion_status_check" CHECK ("admin_account_deletion_requests"."status" in ('REQUESTED','PENDING','APPROVED','REJECTED')),
	CONSTRAINT "admin_deletion_verified_check" CHECK ("admin_account_deletion_requests"."status" not in ('PENDING','APPROVED') or "admin_account_deletion_requests"."verified_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archive_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reason" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	CONSTRAINT "admin_recovery_status_check" CHECK ("admin_recovery_requests"."status" in ('PENDING','APPROVED','REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "admin_archives" ADD CONSTRAINT "admin_archives_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_archives" ADD CONSTRAINT "admin_archives_deletion_request_id_admin_account_deletion_requests_id_fk" FOREIGN KEY ("deletion_request_id") REFERENCES "public"."admin_account_deletion_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_archives" ADD CONSTRAINT "admin_archives_restored_by_user_id_users_id_fk" FOREIGN KEY ("restored_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_account_deletion_requests" ADD CONSTRAINT "admin_account_deletion_requests_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_account_deletion_requests" ADD CONSTRAINT "admin_account_deletion_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_requests" ADD CONSTRAINT "admin_recovery_requests_archive_id_admin_archives_id_fk" FOREIGN KEY ("archive_id") REFERENCES "public"."admin_archives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_requests" ADD CONSTRAINT "admin_recovery_requests_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_requests" ADD CONSTRAINT "admin_recovery_requests_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_archive_open_unique" ON "admin_archives" USING btree ("admin_id") WHERE "admin_archives"."restored_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_deletion_open_unique" ON "admin_account_deletion_requests" USING btree ("admin_id") WHERE "admin_account_deletion_requests"."status" in ('REQUESTED','PENDING');--> statement-breakpoint
CREATE UNIQUE INDEX "admin_recovery_open_unique" ON "admin_recovery_requests" USING btree ("admin_id") WHERE "admin_recovery_requests"."status" = 'PENDING';