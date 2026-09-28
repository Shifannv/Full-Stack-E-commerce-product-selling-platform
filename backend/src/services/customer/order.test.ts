import assert from "node:assert/strict";
import test from "node:test";
import { fromPaise, quoteCart, toPaise } from "./order.service";

test("order money conversion preserves exact two-decimal price snapshots", () => {
  assert.equal(toPaise("1299.95"), 129995);
  assert.equal(fromPaise(129995), "1299.95");
  assert.equal(fromPaise(toPaise("10") * 3), "30.00");
  assert.throws(() => toPaise("10.999"), /Invalid money/);
});

test("checkout quote uses current server price and stock without creating an order", async () => {
  const responses = [
    [{ id: "address" }], [{ id: "cart" }],
    [{ productId: "product", variantId: null, quantity: 2 }],
    [{ id: "product", name: "Test product", status: "PUBLISHED", price: "129.95", sku: "SKU", weightKg: "1", lengthCm: "10", breadthCm: "10", heightCm: "10" }],
    [{ availableQuantity: 2 }],
  ];
  const next = () => { const value = responses.shift(); assert.ok(value, "unexpected database read"); return value; };
  const fakeDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => next(), then: (resolve: (rows: unknown[]) => void) => Promise.resolve(next()).then(resolve) }) }) }),
    insert: () => { throw new Error("quote attempted insert"); },
    update: () => { throw new Error("quote attempted update"); },
    delete: () => { throw new Error("quote attempted delete"); },
  };
  const quote = await quoteCart(fakeDb as never, "customer", "address");
  assert.equal(quote.valid, true);
  assert.equal(quote.totalAmount, "259.90");
  assert.equal(quote.items[0].unitPrice, "129.95");
  assert.equal(responses.length, 0);
});
