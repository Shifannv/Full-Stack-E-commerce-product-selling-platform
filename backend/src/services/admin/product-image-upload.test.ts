import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PRODUCT_IMAGE_REQUEST_BYTES, productImageExtension, productImageObjectKey, readProductImageForm } from "./product-image-upload";

test("product image upload accepts matching image signatures and rejects disguised files", () => {
  assert.equal(productImageExtension("image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), "png");
  assert.equal(productImageExtension("image/jpeg", new Uint8Array([255, 216, 255])), "jpg");
  assert.equal(productImageExtension("image/webp", new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), "webp");
  assert.throws(() => productImageExtension("image/png", new TextEncoder().encode("<svg>")), /required/);
  assert.throws(() => productImageExtension("image/svg+xml", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), /required/);
});

test("product image object key stays inside the selected product prefix", () => {
  const productId = "7feac135-cab3-4ad8-b01e-331550f2eb37";
  assert.equal(productImageObjectKey(productId, "png", "c9bb7402-ed3e-45a6-9633-7966977ce893"), `products/${productId}/c9bb7402-ed3e-45a6-9633-7966977ce893.png`);
  assert.throws(() => productImageObjectKey("../another-product", "png"), /Invalid product ID/);
});

test("image request rejects declared oversize before reading the body", async () => {
  const request = new Request("http://test/upload", { method: "POST", headers: { "content-length": String(MAX_PRODUCT_IMAGE_REQUEST_BYTES + 1) }, body: "unused" });
  await assert.rejects(readProductImageForm(request), { status: 413 });
  assert.equal(request.bodyUsed, false);
});

test("image request bounds actual bytes without trusting Content-Length", async () => {
  for (const declared of [undefined, "1", "invalid"]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); },
      cancel() { cancelled = true; },
    });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=test" });
    if (declared) headers.set("content-length", declared);
    const request = new Request("http://test/upload", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
    await assert.rejects(readProductImageForm(request), { status: 413 });
    assert.equal(cancelled, true);
  }
});

test("bounded multipart parser accepts a file and rejects malformed bodies", async () => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "test.png");
  const parsed = await readProductImageForm(new Request("http://test/upload", { method: "POST", body: form }));
  const file = parsed.get("file") as File;
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 8);
  for (const type of ["application/json", "multipart/form-data; boundary=test"]) {
    await assert.rejects(readProductImageForm(new Request("http://test/upload", { method: "POST", headers: { "content-type": type }, body: "not multipart" })), { status: 422 });
  }
});
