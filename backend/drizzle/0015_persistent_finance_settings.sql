CREATE TABLE "platform_finance_settings" (
  "setting_key" text PRIMARY KEY NOT NULL,
  "basis_points" numeric(5, 0) NOT NULL,
  "updated_by_user_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_finance_settings_key_check" CHECK ("platform_finance_settings"."setting_key" in ('COMMISSION_BPS', 'PAYMENT_GATEWAY_FEE_BPS')),
  CONSTRAINT "platform_finance_settings_bps_check" CHECK ("platform_finance_settings"."basis_points" >= 0 and "platform_finance_settings"."basis_points" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "platform_finance_settings" ADD CONSTRAINT "platform_finance_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Preserve the rates used by the existing settlement integration fixture: 10% Commission and 2% Payment Gateway Fee.
INSERT INTO "platform_finance_settings" ("setting_key", "basis_points") VALUES
  ('COMMISSION_BPS', 1000),
  ('PAYMENT_GATEWAY_FEE_BPS', 200);
