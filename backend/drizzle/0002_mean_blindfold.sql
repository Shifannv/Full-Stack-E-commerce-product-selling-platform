ALTER TABLE "products" ADD COLUMN "weight_kg" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_cm" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "breadth_cm" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_cm" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "weight_kg_snapshot" numeric(8, 3);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "length_cm_snapshot" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "breadth_cm_snapshot" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "height_cm_snapshot" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_package_check" CHECK (("products"."weight_kg" is null or "products"."weight_kg" > 0) and ("products"."length_cm" is null or "products"."length_cm" > 0) and ("products"."breadth_cm" is null or "products"."breadth_cm" > 0) and ("products"."height_cm" is null or "products"."height_cm" > 0));