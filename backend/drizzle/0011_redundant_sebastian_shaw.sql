ALTER TABLE "refunds" ALTER COLUMN "return_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_id_order_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_id_order_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_order_fk" FOREIGN KEY ("payment_id","order_id") REFERENCES "public"."payments"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_order_fk" FOREIGN KEY ("return_id","order_id") REFERENCES "public"."returns"("id","order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_late_payment_unique" ON "refunds" USING btree ("payment_id") WHERE "refunds"."reason" = 'LATE_PAYMENT';--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_origin_check" CHECK (("refunds"."return_id" is not null and "refunds"."reason" <> 'LATE_PAYMENT') or ("refunds"."return_id" is null and "refunds"."reason" = 'LATE_PAYMENT'));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_internal_record_check" CHECK ("refunds"."status" <> 'INTERNAL_RECORDED' or ("refunds"."reason" = 'LATE_PAYMENT' and "refunds"."provider_reference" is null));
