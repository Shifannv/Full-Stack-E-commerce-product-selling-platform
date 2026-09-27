CREATE TABLE "admin_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"address_type" text NOT NULL,
	"business_name" text,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_addresses_id_admin_type_unique" UNIQUE("id","admin_id","address_type"),
	CONSTRAINT "admin_addresses_type_check" CHECK ("admin_addresses"."address_type" in ('SHIPPING_ORIGIN','RETURN'))
);
--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_category_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"assigned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_category_assignments_admin_category_unique" UNIQUE("admin_id","category_id"),
	CONSTRAINT "admin_category_assignments_status_check" CHECK ("admin_category_assignments"."status" in ('REQUESTED','ACTIVE','REVOKED'))
);
--> statement-breakpoint
CREATE TABLE "admin_kyc_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"private_object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_kyc_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"legal_name" text,
	"business_type" text,
	"contact_phone" text,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_kyc_submissions_admin_id_unique" UNIQUE("admin_id"),
	CONSTRAINT "admin_kyc_status_check" CHECK ("admin_kyc_submissions"."status" in ('DRAFT','PENDING_SUPER_ADMIN_APPROVAL','CHANGES_REQUIRED','APPROVED','ACTIVE','SUSPENDED','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_product_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"input_type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_product_fields_category_key_unique" UNIQUE("category_id","key"),
	CONSTRAINT "category_product_fields_type_check" CHECK ("category_product_fields"."input_type" in ('TEXT','NUMBER','SELECT','BOOLEAN'))
);
--> statement-breakpoint
CREATE TABLE "product_admins" (
	"product_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	CONSTRAINT "product_admins_product_id_admin_id_pk" PRIMARY KEY("product_id","admin_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sku" text,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_price_check" CHECK ("products"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"customized_by_admin_id" uuid,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcategories_category_slug_unique" UNIQUE("category_id","slug"),
	CONSTRAINT "subcategories_id_category_unique" UNIQUE("id","category_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"sku_snapshot" text,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_id_order_admin_unique" UNIQUE("id","order_id","admin_id"),
	CONSTRAINT "order_items_amounts_check" CHECK ("order_items"."quantity" > 0 and "order_items"."unit_price" >= 0 and "order_items"."subtotal" >= 0 and "order_items"."discount_amount" >= 0 and "order_items"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"shipping_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"shipping_address_snapshot" jsonb NOT NULL,
	"payment_status" text DEFAULT 'PENDING' NOT NULL,
	"placed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal" >= 0 and "orders"."shipping_amount" >= 0 and "orders"."discount_amount" >= 0 and "orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text DEFAULT 'CASHFREE' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"provider_status" text,
	"normalized_status" text NOT NULL,
	"location" text,
	"description" text,
	"event_time" timestamp with time zone NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_events_shipment_key_unique" UNIQUE("shipment_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	CONSTRAINT "shipment_items_order_item_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"provider_order_id" text,
	"provider_shipment_id" text,
	"awb_number" text,
	"carrier_name" text,
	"tracking_url" text,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"estimated_delivery_date" timestamp with time zone,
	"origin_address_snapshot" jsonb NOT NULL,
	"destination_address_snapshot" jsonb NOT NULL,
	"shipped_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"out_for_delivery_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_id_order_admin_unique" UNIQUE("id","order_id","admin_id"),
	CONSTRAINT "shipments_status_check" CHECK ("shipments"."status" in ('CREATED','CONFIRMED','PACKED','SHIPPED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','RTO','CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "shipping_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_provider_configs_provider_key_unique" UNIQUE("provider_key")
);
--> statement-breakpoint
CREATE TABLE "shipping_provider_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"admin_address_id" uuid NOT NULL,
	"address_type" text DEFAULT 'SHIPPING_ORIGIN' NOT NULL,
	"provider_key" text NOT NULL,
	"provider_location_ref" text NOT NULL,
	"location_name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_locations_provider_address_unique" UNIQUE("provider_key","admin_address_id"),
	CONSTRAINT "shipping_locations_type_check" CHECK ("shipping_provider_locations"."address_type" = 'SHIPPING_ORIGIN'),
	CONSTRAINT "shipping_locations_status_check" CHECK ("shipping_provider_locations"."status" in ('ACTIVE','INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING_PROVIDER' NOT NULL,
	"provider_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_return_id_unique" UNIQUE("return_id"),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "return_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"inspected_by_admin_id" uuid NOT NULL,
	"condition_status" text NOT NULL,
	"packaging_status" text,
	"notes" text,
	"decision" text NOT NULL,
	"inspected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_inspections_return_unique" UNIQUE("return_id"),
	CONSTRAINT "return_inspections_decision_check" CHECK ("return_inspections"."decision" in ('APPROVED','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_items_order_item_unique" UNIQUE("order_item_id"),
	CONSTRAINT "return_items_quantity_check" CHECK ("return_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"reason" text NOT NULL,
	"customer_notes" text,
	"return_address_snapshot" jsonb,
	"approved_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"qc_status" text,
	"qc_notes" text,
	"gross_refund_amount" numeric(12, 2),
	"deduction_amount" numeric(12, 2),
	"net_refund_amount" numeric(12, 2),
	"deduction_breakdown" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returns_id_order_admin_unique" UNIQUE("id","order_id","admin_id"),
	CONSTRAINT "returns_status_check" CHECK ("returns"."status" in ('REQUESTED','APPROVED','RETURN_PENDING','RECEIVED','QC_IN_PROGRESS','QC_APPROVED','QC_REJECTED','REFUND_PROCESSING','REFUNDED','RETURN_ISSUE','REJECTED')),
	CONSTRAINT "returns_amounts_check" CHECK (("returns"."gross_refund_amount" is null or "returns"."gross_refund_amount" >= 0) and ("returns"."deduction_amount" is null or "returns"."deduction_amount" >= 0) and ("returns"."net_refund_amount" is null or "returns"."net_refund_amount" >= 0))
);
--> statement-breakpoint
ALTER TABLE "admin_addresses" ADD CONSTRAINT "admin_addresses_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_category_assignments" ADD CONSTRAINT "admin_category_assignments_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_category_assignments" ADD CONSTRAINT "admin_category_assignments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_category_assignments" ADD CONSTRAINT "admin_category_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kyc_documents" ADD CONSTRAINT "admin_kyc_documents_submission_id_admin_kyc_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."admin_kyc_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kyc_submissions" ADD CONSTRAINT "admin_kyc_submissions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_kyc_submissions" ADD CONSTRAINT "admin_kyc_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_product_fields" ADD CONSTRAINT "category_product_fields_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_admins" ADD CONSTRAINT "product_admins_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_admins" ADD CONSTRAINT "product_admins_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_category_fk" FOREIGN KEY ("subcategory_id","category_id") REFERENCES "public"."subcategories"("id","category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_customized_by_admin_id_admins_id_fk" FOREIGN KEY ("customized_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_scope_fk" FOREIGN KEY ("shipment_id","order_id","admin_id") REFERENCES "public"."shipments"("id","order_id","admin_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_scope_fk" FOREIGN KEY ("order_item_id","order_id","admin_id") REFERENCES "public"."order_items"("id","order_id","admin_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_provider_key_shipping_provider_configs_provider_key_fk" FOREIGN KEY ("provider_key") REFERENCES "public"."shipping_provider_configs"("provider_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_provider_locations" ADD CONSTRAINT "shipping_provider_locations_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_provider_locations" ADD CONSTRAINT "shipping_provider_locations_provider_key_shipping_provider_configs_provider_key_fk" FOREIGN KEY ("provider_key") REFERENCES "public"."shipping_provider_configs"("provider_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_provider_locations" ADD CONSTRAINT "shipping_locations_origin_fk" FOREIGN KEY ("admin_address_id","admin_id","address_type") REFERENCES "public"."admin_addresses"("id","admin_id","address_type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_inspected_by_admin_id_admins_id_fk" FOREIGN KEY ("inspected_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_scope_fk" FOREIGN KEY ("return_id","order_id","admin_id") REFERENCES "public"."returns"("id","order_id","admin_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_scope_fk" FOREIGN KEY ("order_item_id","order_id","admin_id") REFERENCES "public"."order_items"("id","order_id","admin_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_addresses_one_active_type_idx" ON "admin_addresses" USING btree ("admin_id","address_type") WHERE "admin_addresses"."is_active" = true;--> statement-breakpoint
CREATE INDEX "admin_audit_events_admin_created_idx" ON "admin_audit_events" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_category_assignments_category_idx" ON "admin_category_assignments" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "admin_kyc_documents_submission_idx" ON "admin_kyc_documents" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "product_admins_admin_idx" ON "product_admins" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_admin_idx" ON "products" USING btree ("created_by_admin_id");--> statement-breakpoint
CREATE INDEX "order_items_order_admin_idx" ON "order_items" USING btree ("order_id","admin_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_time_idx" ON "shipment_events" USING btree ("shipment_id","event_time");--> statement-breakpoint
CREATE INDEX "shipment_items_shipment_idx" ON "shipment_items" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_order_admin_idx" ON "shipments" USING btree ("order_id","admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_provider_shipment_unique" ON "shipments" USING btree ("provider_key","provider_shipment_id") WHERE "shipments"."provider_shipment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_provider_awb_unique" ON "shipments" USING btree ("provider_key","awb_number") WHERE "shipments"."awb_number" is not null;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "returns_customer_idx" ON "returns" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "returns_admin_idx" ON "returns" USING btree ("admin_id");