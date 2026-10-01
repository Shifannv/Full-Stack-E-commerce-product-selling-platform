import type { AddressSnapshot } from "../../db/schema/orders";

export const shipmentStatuses = [
  "CREATED",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RTO",
  "CANCELLED",
] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];

export type ShipmentItem = {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  discount: string;
};
export type CreateShipmentInput = {
  externalOrderId: string;
  orderDate: Date;
  pickupLocation: string;
  destination: AddressSnapshot;
  customerEmail: string;
  items: ShipmentItem[];
  subtotal: string;
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};
export type ProviderShipment = {
  providerOrderId: string;
  providerShipmentId: string;
};
export type ProviderAwb = { awbNumber: string; carrierName?: string };
export type ProviderServiceability = {
  available: boolean;
  courierCount: number;
};

// Use only for explicit provider rejection evidence, never transport failures.
export class ShippingProviderRejection extends Error {}

export interface ShippingProvider {
  readonly key: string;
  createShipment(input: CreateShipmentInput): Promise<ProviderShipment>;
  assignAwb(providerShipmentId: string): Promise<ProviderAwb>;
  requestPickup(providerShipmentId: string): Promise<void>;
  getTracking(awbNumber: string): Promise<unknown>;
  getServiceability(
    pickupPostcode: string,
    deliveryPostcode: string,
    weightKg: number,
  ): Promise<ProviderServiceability>;
  listPickupLocations(): Promise<
    Array<{
      reference: string;
      name: string;
      postalCode: string;
      status: string;
    }>
  >;
}
