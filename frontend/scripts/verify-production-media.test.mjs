import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { test } from "node:test";
import { publicImageUrl } from "../src/lib/images.ts";

const key = "products/c549089e-32fb-4217-96d7-35dc5a40eb70/2e9b6eb9-497e-486a-9310-d24091637c42.png";
const productionBase = "https://ownline-ecommerce.pages.dev/api/images";

test("production wrapper passes configured media into Next instead of clearing it", async (t) => {
  const original = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  let invocation;
  t.mock.method(childProcess, "spawnSync", (...args) => {
    invocation = args;
    return { status: 0 };
  });
  t.mock.method(process, "exit", () => {});
  syncBuiltinESMExports();
  try {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    await import("./build-cloudflare-production.mjs?default");
    assert.equal(invocation[2].env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL, productionBase);
    assert.equal(invocation[2].env.NODE_ENV, "production");
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://media.example.com/catalog";
    await import("./build-cloudflare-production.mjs?configured");
    assert.equal(invocation[2].env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL, "https://media.example.com/catalog");
    for (const blank of ["", "   "]) {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = blank;
      await assert.rejects(import(`./build-cloudflare-production.mjs?blank=${blank.length}`), /must not be empty/);
    }
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = original;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("media URL resolution retains same-origin paths, encoding and development validation", () => {
  const original = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  try {
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = productionBase;
    assert.equal(publicImageUrl(key), `${productionBase}/${key}`);
    assert.equal(publicImageUrl("products/a/file #?.png"), `${productionBase}/products/a/file%20%23%3F.png`);
    for (const invalid of [null, undefined, "", "/products/a", "products//a", "products/../a", "products/./a"]) {
      assert.equal(publicImageUrl(invalid), null);
    }
    for (const invalidBase of ["", "garbage", "http://media.example.com", "javascript:alert(1)", "ftp://media.example.com"]) {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = invalidBase;
      assert.equal(publicImageUrl(key), null);
    }
    for (const devBase of ["http://localhost:8787/api/images", "http://127.0.0.1:8787/api/images"]) {
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = devBase;
      assert.equal(publicImageUrl(key), `${devBase}/${key}`);
    }
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = original;
  }
});
