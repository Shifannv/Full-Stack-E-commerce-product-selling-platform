CREATE TABLE "cashfree_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_order_id" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"order_id" uuid,
	"result" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashfree_webhook_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
ALTER TABLE "cashfree_webhook_events" ADD CONSTRAINT "cashfree_webhook_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashfree_webhook_events_order_idx" ON "cashfree_webhook_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cashfree_webhook_events_provider_order_idx" ON "cashfree_webhook_events" USING btree ("provider_order_id");