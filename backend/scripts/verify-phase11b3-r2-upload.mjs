// MUTATING: signs in and may upload/attach a fixture image to the existing R2 bucket.
// Run only for an authorized upload task; retained fixture data is not deleted.
import assert from "node:assert/strict";
import { config } from "dotenv";

config({ path: ".env.phase11b2.local", quiet: true });
config({ path: "../frontend/.env.local", quiet: true });

const base = process.env.PHASE11B2_API_URL ?? "http://127.0.0.1:8787";
const origin = process.env.PHASE11B2_FRONTEND_ORIGIN ?? "http://127.0.0.1:3000";
const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
const { PHASE11B2_ADMIN_EMAIL: email, PHASE11B2_ADMIN_PASSWORD: password } =
  process.env;

if (!email || !password || !publicBase)
  throw new Error(
    "Private fixture credentials or R2 public base URL are incomplete",
  );

async function request(path, init = {}, cookie) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
}

async function main() {
  const login = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "Admin sign-in failed");
  const cookie = login.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");

  const productsResponse = await request("/api/admin/products", {}, cookie);
  assert.equal(productsResponse.status, 200, "Admin product list failed");
  const productPayload = await productsResponse.json();
  const products = Array.isArray(productPayload)
    ? productPayload
    : productPayload.products;
  assert.ok(
    Array.isArray(products),
    "Admin product list has an unexpected response shape",
  );
  const product = products.find(
    (item) => item.slug === "phase11b2-cotton-tote-730d72e64790",
  );
  assert.ok(product, "Fixture product is unavailable");

  const detailResponse = await request(
    `/api/products/${encodeURIComponent(product.slug)}`,
  );
  assert.equal(
    detailResponse.status,
    200,
    "Public fixture product is unavailable",
  );
  const detail = await detailResponse.json();
  let image = detail.images.find(
    (item) => item.altText === "Phase 11b-3 R2 verification image",
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JtZkAAAAASUVORK5CYII=",
    "base64",
  );
  if (!image) {
    const form = new FormData();
    form.set(
      "file",
      new Blob([png], { type: "image/png" }),
      "phase11b3-r2-check.png",
    );
    form.set("altText", "Phase 11b-3 R2 verification image");
    form.set("sortOrder", "0");
    const upload = await request(
      `/api/admin/products/${product.id}/images/upload`,
      { method: "POST", body: form },
      cookie,
    );
    if (upload.status !== 201)
      throw new Error(`Image upload failed: ${await upload.text()}`);
    image = await upload.json();
  }
  assert.match(
    image.objectKey,
    new RegExp(`^products/${product.id}/[0-9a-f-]+\\.png$`, "i"),
  );

  const publicUrl = new URL(
    image.objectKey.split("/").map(encodeURIComponent).join("/"),
    `${publicBase.replace(/\/$/, "")}/`,
  ).toString();
  let publicResponse;
  try {
    publicResponse = await fetch(publicUrl);
  } catch (error) {
    throw new Error(
      `Public R2 URL request failed for ${publicUrl}: ${error instanceof Error && error.cause ? String(error.cause) : "network error"}`,
    );
  }
  assert.equal(publicResponse.status, 200, "Public R2 URL did not resolve");
  assert.equal(
    publicResponse.headers.get("content-type"),
    "image/png",
    "Public object content type is incorrect",
  );
  assert.equal(
    (await publicResponse.arrayBuffer()).byteLength,
    png.byteLength,
    "Public object bytes do not match upload",
  );
  console.log(
    JSON.stringify({
      productId: product.id,
      objectKey: image.objectKey,
      publicUrl,
      status: publicResponse.status,
      contentType: "image/png",
      bytes: png.byteLength,
    }),
  );
}

main().catch((error) => {
  console.error("R2 upload verification failed", error.message);
  process.exitCode = 1;
});
