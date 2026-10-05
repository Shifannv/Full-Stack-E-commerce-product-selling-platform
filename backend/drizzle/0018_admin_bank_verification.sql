CREATE TABLE "admin_bank_accounts" (
	"admin_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_details" text NOT NULL,
	"account_last4" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_bank_accounts" ADD CONSTRAINT "admin_bank_accounts_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_bank_accounts" ADD CONSTRAINT "admin_bank_accounts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;