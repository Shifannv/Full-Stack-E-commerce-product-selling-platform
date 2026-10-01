import assert from "node:assert/strict";
import { config } from "dotenv";

config({ path: ".env.phase11b2.local", quiet: true });
const suffix = process.env.PHASE11B2_FIXTURE_SUFFIX;
if (!suffix) throw new Error("PHASE11B2_FIXTURE_SUFFIX is required");
const base = process.env.PHASE11B2_API_URL ?? "http://127.0.0.1:8787";
const categorySlug = `phase11b2-accessories-${suffix}`;
const productSlug = `phase11b2-cotton-tote-${suffix}`;

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${base}${path}`);
  assert.equal(
    response.status,
    200,
    `${path} returned HTTP ${response.status}`,
  );
  return response.json();
}

async function main() {
  const categories = (await get("/api/categories")) as {
    categories: { slug: string; subcategories: { slug: string }[] }[];
  };
  const category = categories.categories.find(
    (row) => row.slug === categorySlug,
  );
  assert.ok(category);
  assert.ok(category.subcategories.some((row) => row.slug === "cotton-bags"));

  const queries = [
    "",
    "?featured=true",
    "?sort=newest",
    "?sort=price-asc",
    "?sort=price-desc",
    "?inStock=true",
  ];
  let productId: string | undefined;
  for (const query of queries) {
    const result = (await get(`/api/products${query}`)) as {
      products: {
        id: string;
        slug: string;
        featured: boolean;
        available: boolean;
        image: unknown;
        rating: number | null;
        reviewCount: number;
      }[];
    };
    const product = result.products.find((row) => row.slug === productSlug);
    assert.ok(product, `Fixture missing from ${query || "default list"}`);
    assert.equal(product.featured, true);
    assert.equal(product.available, true);
    assert.equal(product.reviewCount, 0);
    assert.equal(product.rating, null);
    assert.equal(product.image, null);
    productId = product.id;
  }
  const detail = (await get(`/api/products/${productSlug}`)) as {
    id: string;
    slug: string;
    available: boolean;
    images: unknown[];
    rating: number | null;
    reviewCount: number;
  };
  assert.doesNotMatch(
    JSON.stringify({ categories, detail }),
    /"(?:password|privateObjectKey|resendApiKey|googleClientSecret|databaseUrl)"/i,
  );
  assert.equal(detail.id, productId);
  assert.equal(detail.slug, productSlug);
  assert.equal(detail.available, true);
  assert.deepEqual(detail.images, []);
  assert.equal(detail.rating, null);
  assert.equal(detail.reviewCount, 0);
  const reviews = (await get(`/api/products/${detail.id}/reviews`)) as {
    reviews: unknown[];
  };
  assert.deepEqual(reviews.reviews, []);
  const unknown = await fetch(`${base}/api/products/phase11b2-unknown-slug`);
  assert.equal(unknown.status, 404);
  console.log(
    "Public categories, six product list variants, detail, empty published reviews, and unknown slug: PASS",
  );
}

main().catch((error: unknown) => {
  console.error("Public fixture verification failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
