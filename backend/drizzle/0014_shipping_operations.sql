CREATE TABLE "shipping_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_key" text NOT NULL,
	"shipment_id" uuid,
	"provider_key" text NOT NULL,
	"provider_reference" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'IN_FLIGHT' NOT NULL,
	"actor" text NOT NULL,
	"evidence" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempted_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_operations_operation_key_unique" UNIQUE("operation_key"),
	CONSTRAINT "shipping_operations_kind_check" CHECK ("shipping_operations"."kind" in ('CREATE','AWB','PICKUP','EVENT')),
	CONSTRAINT "shipping_operations_state_check" CHECK ("shipping_operations"."state" in ('IN_FLIGHT','UNKNOWN','SUCCEEDED','FAILED','REVIEW')),
	CONSTRAINT "shipping_operations_retry_check" CHECK ("shipping_operations"."retry_count" between 0 and 5),
	CONSTRAINT "shipping_operations_scope_check" CHECK ("shipping_operations"."kind" = 'EVENT' or "shipping_operations"."shipment_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "shipping_operations" ADD CONSTRAINT "shipping_operations_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_operations_due_idx" ON "shipping_operations" USING btree ("next_retry_at","id") WHERE "shipping_operations"."state" in ('IN_FLIGHT','UNKNOWN');--> statement-breakpoint
CREATE INDEX "shipping_operations_shipment_idx" ON "shipping_operations" USING btree ("shipment_id");
--> statement-breakpoint
-- Historical calls had no durable ownership. Never infer that an absent result
-- means a mutation was not sent. Keep incomplete legacy operations in review.
INSERT INTO shipping_operations (operation_key, shipment_id, provider_key, provider_reference, kind, state, actor, last_error, resolved_at)
SELECT id::text || ':CREATE', id, provider_key, id::text, 'CREATE',
  CASE WHEN provider_order_id IS NOT NULL AND provider_shipment_id IS NOT NULL THEN 'SUCCEEDED' ELSE 'REVIEW' END,
  'migration:0014', CASE WHEN provider_order_id IS NULL OR provider_shipment_id IS NULL THEN 'LEGACY_OUTCOME_UNVERIFIED' END,
  CASE WHEN provider_order_id IS NOT NULL AND provider_shipment_id IS NOT NULL THEN now() END FROM shipments;
--> statement-breakpoint
INSERT INTO shipping_operations (operation_key, shipment_id, provider_key, provider_reference, kind, state, actor, last_error, resolved_at)
SELECT id::text || ':AWB', id, provider_key, provider_shipment_id, 'AWB',
  CASE WHEN awb_number IS NOT NULL THEN 'SUCCEEDED' ELSE 'REVIEW' END, 'migration:0014',
  CASE WHEN awb_number IS NULL THEN 'LEGACY_OUTCOME_UNVERIFIED' END,
  CASE WHEN awb_number IS NOT NULL THEN now() END FROM shipments WHERE provider_shipment_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO shipping_operations (operation_key, shipment_id, provider_key, provider_reference, kind, state, actor, last_error, resolved_at)
SELECT id::text || ':PICKUP', id, provider_key, provider_shipment_id, 'PICKUP',
  CASE WHEN pickup_requested_at IS NOT NULL THEN 'SUCCEEDED' ELSE 'REVIEW' END, 'migration:0014',
  CASE WHEN pickup_requested_at IS NULL THEN 'LEGACY_OUTCOME_UNVERIFIED' END,
  CASE WHEN pickup_requested_at IS NOT NULL THEN now() END FROM shipments WHERE provider_shipment_id IS NOT NULL AND awb_number IS NOT NULL;
