import type { ShipmentStatus } from "./shipping-provider";

// Shiprocket's documented status IDs are preferred over free-form courier labels.
const byId: Record<number, ShipmentStatus> = {
  1: "CONFIRMED", 2: "PACKED", 3: "CONFIRMED", 4: "CONFIRMED", 5: "PACKED",
  6: "SHIPPED", 7: "DELIVERED", 8: "CANCELLED", 9: "RTO", 10: "RTO",
  11: "CREATED", 12: "DELIVERY_FAILED", 13: "DELIVERY_FAILED", 14: "RTO",
  15: "CONFIRMED", 16: "CONFIRMED", 17: "OUT_FOR_DELIVERY", 18: "IN_TRANSIT",
  19: "CONFIRMED", 20: "DELIVERY_FAILED", 21: "DELIVERY_FAILED", 22: "IN_TRANSIT",
  23: "IN_TRANSIT", 24: "DELIVERY_FAILED", 25: "DELIVERY_FAILED", 26: "DELIVERED",
  38: "IN_TRANSIT", 39: "IN_TRANSIT", 40: "RTO", 41: "RTO", 42: "PICKED_UP",
  43: "DELIVERED", 44: "RTO", 45: "CANCELLED", 46: "RTO", 47: "DELIVERY_FAILED",
  48: "IN_TRANSIT", 49: "IN_TRANSIT", 50: "IN_TRANSIT", 51: "SHIPPED",
  52: "CONFIRMED", 54: "IN_TRANSIT", 55: "IN_TRANSIT", 56: "IN_TRANSIT",
  57: "IN_TRANSIT", 59: "PACKED",
};

export function normalizeShiprocketStatus(status: string, statusId?: number): ShipmentStatus | null {
  if (statusId !== undefined && byId[statusId]) return byId[statusId];
  const value = status.trim().toUpperCase().replace(/[_-]+/g, " ");
  if (/RTO|RETURN TO ORIGIN/.test(value)) return "RTO";
  if (/CANCELLATION REQUESTED/.test(value)) return "CONFIRMED";
  if (/CANCEL/.test(value)) return "CANCELLED";
  if (/UNDELIVERED|DELIVERY FAILED|PICKUP ERROR|EXCEPTION|LOST|DAMAGED/.test(value)) return "DELIVERY_FAILED";
  if (/OUT FOR DELIVERY/.test(value)) return "OUT_FOR_DELIVERY";
  if (/PARTIAL DELIVERED/.test(value)) return "IN_TRANSIT";
  if (/DELIVERED|FULFILLED/.test(value)) return "DELIVERED";
  if (/PICKED UP/.test(value)) return "PICKED_UP";
  if (/IN TRANSIT|REACHED|MISROUTED|DELAYED/.test(value)) return "IN_TRANSIT";
  if (/SHIPPED|HANDOVER/.test(value)) return "SHIPPED";
  if (/PACK|MANIFEST|LABEL/.test(value)) return "PACKED";
  if (/AWB|PICKUP SCHEDULED|BOOKED|CONFIRMED/.test(value)) return "CONFIRMED";
  if (/PENDING|CREATED/.test(value)) return "CREATED";
  return null;
}

export function parseShiprocketTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const dated = /^\d{2} \d{2} \d{4} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}T${value.slice(11)}+05:30`
    : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}+05:30` : value;
  const parsed = new Date(dated);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
