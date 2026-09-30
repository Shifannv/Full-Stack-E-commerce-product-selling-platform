CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ALTER COLUMN "admin_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD COLUMN "entity_type" text DEFAULT 'ADMIN' NOT NULL;--> statement-breakpoint
-- Historical entries describe an Admin; retain every action/field/reason and
-- explicitly attach that existing Admin identity before requiring new IDs.
ALTER TABLE "admin_audit_events" ADD COLUMN "entity_id" text;--> statement-breakpoint
UPDATE "admin_audit_events" SET "entity_id" = "admin_id"::text;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "api_rate_limits_expiry_idx" ON "api_rate_limits" USING btree ("expires_at");
