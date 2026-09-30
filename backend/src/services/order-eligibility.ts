import { DomainError } from "./admin/admin.service";

type EligibleOrder = { status: string; stockState: string; paymentStatus: string };
type EligiblePayment = { status: string; resolutionStatus: string };

export function requireFulfillmentEligible(order: EligibleOrder | undefined, payment: EligiblePayment | undefined, allowDelivered = false) {
  if (!order || !payment || !(order.status === "CONFIRMED" || (allowDelivered && order.status === "DELIVERED")) || order.stockState !== "CONSUMED" || order.paymentStatus !== "PAID" || payment.status !== "PAID" || payment.resolutionStatus !== "NONE") {
    throw new DomainError(allowDelivered ? "SETTLEMENT_ORDER_INELIGIBLE" : "FULFILLMENT_ORDER_INELIGIBLE", 422);
  }
}
