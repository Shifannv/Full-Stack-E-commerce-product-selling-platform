DROP INDEX "payments_order_idx";--> statement-breakpoint
ALTER TABLE "product_variants" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventories" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_key" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_request_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_state" text DEFAULT 'RESERVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "resolution_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_checkout_key_unique" ON "orders" USING btree ("customer_id","checkout_key") WHERE "orders"."checkout_key" is not null;--> statement-breakpoint
CREATE INDEX "orders_unpaid_expiry_idx" ON "orders" USING btree ("payment_expires_at") WHERE "orders"."status" = 'CREATED' and "orders"."payment_status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_order_unique" ON "payments" USING btree ("provider","provider_order_id") WHERE "payments"."provider_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_unique" UNIQUE("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stock_state_check" CHECK ("orders"."stock_state" in ('RESERVED','CONSUMED','RELEASED'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_resolution_status_check" CHECK ("payments"."resolution_status" in ('NONE','REFUND_REQUIRED'));