CREATE TABLE "reconciliation_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_key" text NOT NULL,
  "domain" text NOT NULL,
  "type" text NOT NULL,
  "entity_id" text NOT NULL,
  "provider_reference" text,
  "state" text DEFAULT 'PENDING' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamp with time zone,
  "last_attempted_at" timestamp with time zone,
  "last_error" text,
  "evidence" jsonb,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" text,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reconciliation_items_item_key_unique" UNIQUE("item_key"),
  CONSTRAINT "reconciliation_items_domain_check" CHECK ("reconciliation_items"."domain" in ('PAYMENT','REFUND','FINANCE')),
  CONSTRAINT "reconciliation_items_state_check" CHECK ("reconciliation_items"."state" in ('PENDING','RETRYABLE','REVIEW','RESOLVED')),
  CONSTRAINT "reconciliation_items_retry_check" CHECK ("reconciliation_items"."retry_count" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "reconciliation_items" ADD CONSTRAINT "reconciliation_items_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "reconciliation_items_due_idx" ON "reconciliation_items" ("next_retry_at","id") WHERE "state" in ('PENDING','RETRYABLE');
--> statement-breakpoint
CREATE INDEX "reconciliation_items_entity_idx" ON "reconciliation_items" ("domain","entity_id");
--> statement-breakpoint
CREATE INDEX "reconciliation_items_unresolved_idx" ON "reconciliation_items" ("domain","state") WHERE "state" <> 'RESOLVED';
