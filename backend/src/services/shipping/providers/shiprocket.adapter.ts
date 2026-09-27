import type { CreateShipmentInput, ProviderAwb, ProviderShipment, ShippingProvider } from "../shipping-provider";

const BASE = "https://apiv2.shiprocket.in/v1/external";
type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function reference(value: unknown): string | undefined { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }

export class ShiprocketAdapter implements ShippingProvider {
  readonly key = "shiprocket";
  private token?: string;
  private tokenPromise?: Promise<string>;

  constructor(private readonly email: string, private readonly password: string, private readonly fetcher: typeof fetch = fetch) {
    if (!email || !password) throw new Error("Shiprocket API user credentials are required");
  }

  private async authenticate(): Promise<string> {
    if (this.token) return this.token;
    if (!this.tokenPromise) this.tokenPromise = (async () => {
      const response = await this.fetcher(`${BASE}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.email, password: this.password }),
      });
      if (!response.ok) throw new Error(`Shiprocket authentication failed (${response.status})`);
      const token = object(await response.json()).token;
      if (typeof token !== "string" || !token) throw new Error("Shiprocket authentication response is invalid");
      this.token = token;
      return token;
    })().finally(() => { this.tokenPromise = undefined; });
    return this.tokenPromise;
  }

  private async request(path: string, method = "GET", body?: Json): Promise<Json> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.authenticate();
      const response = await this.fetcher(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 && attempt === 0) { this.token = undefined; continue; }
      if (!response.ok) throw new Error(`Shiprocket API request failed (${response.status})`);
      return object(await response.json());
    }
    throw new Error("Shiprocket API authorization failed");
  }

  async createShipment(input: CreateShipmentInput): Promise<ProviderShipment> {
    const address = input.destination;
    const response = await this.request("/orders/create/adhoc", "POST", {
      order_id: input.externalOrderId,
      order_date: input.orderDate.toISOString().slice(0, 16).replace("T", " "),
      pickup_location: input.pickupLocation,
      billing_customer_name: address.contactName,
      billing_address: address.line1,
      billing_address_2: address.line2 ?? "",
      billing_city: address.city,
      billing_pincode: address.postalCode,
      billing_state: address.state,
      billing_country: address.country,
      billing_email: input.customerEmail,
      billing_phone: address.phone,
      shipping_is_billing: true,
      order_items: input.items.map((item) => ({ name: item.name, sku: item.sku, units: item.quantity, selling_price: item.unitPrice, discount: item.discount })),
      payment_method: "Prepaid",
      sub_total: input.subtotal,
      weight: input.weightKg,
      length: input.lengthCm,
      breadth: input.breadthCm,
      height: input.heightCm,
    });
    const providerOrderId = reference(response.order_id);
    const providerShipmentId = reference(response.shipment_id);
    if (!providerOrderId || !providerShipmentId) throw new Error("Shiprocket order response is missing references");
    return { providerOrderId, providerShipmentId };
  }

  async assignAwb(providerShipmentId: string): Promise<ProviderAwb> {
    const response = await this.request("/courier/assign/awb", "POST", { shipment_id: Number(providerShipmentId) });
    const data = object(response.response);
    const awb = object(data.data);
    const awbNumber = reference(awb.awb_code ?? data.awb_code ?? response.awb_code);
    if (!awbNumber) throw new Error("Shiprocket did not return an AWB");
    return { awbNumber, carrierName: reference(awb.courier_name ?? data.courier_name) };
  }

  async requestPickup(providerShipmentId: string): Promise<void> {
    await this.request("/courier/generate/pickup", "POST", { shipment_id: [Number(providerShipmentId)] });
  }

  async getTracking(awbNumber: string): Promise<unknown> {
    return this.request(`/courier/track/awb/${encodeURIComponent(awbNumber)}`);
  }

  async getServiceability(pickupPostcode: string, deliveryPostcode: string, weightKg: number): Promise<unknown> {
    const query = new URLSearchParams({ pickup_postcode: pickupPostcode, delivery_postcode: deliveryPostcode, cod: "0", weight: String(weightKg) });
    return this.request(`/courier/serviceability/?${query}`);
  }

  async listPickupLocations(): Promise<Array<{ reference: string; name: string; postalCode: string; status: string }>> {
    const response = await this.request("/settings/company/pickup");
    const locations = object(response.data).shipping_address;
    if (!Array.isArray(locations)) throw new Error("Shiprocket pickup response is invalid");
    return locations.map((location) => {
      const item = object(location);
      const referenceValue = reference(item.id);
      const name = reference(item.pickup_location);
      if (!referenceValue || !name) throw new Error("Shiprocket pickup entry is invalid");
      return { reference: referenceValue, name, postalCode: reference(item.pin_code) ?? "", status: reference(item.status) ?? "" };
    });
  }
}
