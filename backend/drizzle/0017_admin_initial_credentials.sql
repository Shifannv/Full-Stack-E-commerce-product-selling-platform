CREATE TABLE "admin_credentials" (
	"admin_id" uuid PRIMARY KEY NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"provisioned_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"password_changed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_provider_key_shipping_provider_configs_provider_key_fk";
--> statement-breakpoint
ALTER TABLE "shipping_provider_locations" DROP CONSTRAINT "shipping_provider_locations_provider_key_shipping_provider_configs_provider_key_fk";
--> statement-breakpoint
ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_credentials" ADD CONSTRAINT "admin_credentials_provisioned_by_user_id_users_id_fk" FOREIGN KEY ("provisioned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_provider_key_shipping_provider_configs_provider_key_f" FOREIGN KEY ("provider_key") REFERENCES "public"."shipping_provider_configs"("provider_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_provider_locations" ADD CONSTRAINT "shipping_provider_locations_provider_key_shipping_provider_conf" FOREIGN KEY ("provider_key") REFERENCES "public"."shipping_provider_configs"("provider_key") ON DELETE no action ON UPDATE no action;