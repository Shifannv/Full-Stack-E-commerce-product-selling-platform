import type { ProductCardData } from "@/components/catalog/product-card";

export type PublicSubcategory = { id: string; name: string; slug: string };
export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subcategories: PublicSubcategory[];
};
export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  currency: string;
  returnEnabled: boolean;
  featured: boolean;
  createdAt: string;
  image: { objectKey: string; altText: string | null } | null;
  available: boolean;
  rating: number | null;
  reviewCount: number;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
};
export type PublicProductDetail = {
  id: string;
  categoryId: string;
  subcategoryId: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  currency: string;
  returnEnabled: boolean;
  createdAt: string;
  available: boolean;
  rating: number | null;
  reviewCount: number;
  attributes: Record<string, unknown>;
  variants: {
    id: string;
    title: string;
    price: string | null;
    attributes: Record<string, unknown>;
    available: boolean;
  }[];
  images: {
    id: string;
    objectKey: string;
    altText: string | null;
    sortOrder: number;
  }[];
};
export type PublicReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
};

const origin =
  process.env.CATALOG_BUILD_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

async function readPublic<T>(path: string): Promise<T> {
  if (!origin)
    throw new Error(
      "Set CATALOG_BUILD_API_URL or NEXT_PUBLIC_API_URL before building public pages",
    );
  const response = await fetch(new URL(path, origin));
  if (!response.ok)
    throw new Error(`Public catalog API failed: ${path} (${response.status})`);
  return response.json() as Promise<T>;
}

export const getPublicCategories = () =>
  readPublic<{ categories: PublicCategory[] }>("/api/categories").then(
    (result) => result.categories,
  );
export const getPublicProducts = (query: URLSearchParams) =>
  readPublic<{ products: PublicProduct[] }>(`/api/products?${query}`).then(
    (result) => result.products,
  );
export const getPublicProduct = (slug: string) =>
  readPublic<PublicProductDetail>(`/api/products/${encodeURIComponent(slug)}`);
export const getPublicReviews = (productId: string) =>
  readPublic<{ reviews: PublicReview[] }>(
    `/api/products/${encodeURIComponent(productId)}/reviews`,
  ).then((result) => result.reviews);

export function catalogQuery(
  input: Record<string, string | number | boolean | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query;
}

export async function getPublishedProductSlugs(): Promise<{ slug: string }[]> {
  const slugs: { slug: string }[] = [];
  for (let offset = 0; offset < 10000; offset += 50) {
    const batch = await getPublicProducts(catalogQuery({ limit: 50, offset }));
    slugs.push(...batch.map(({ slug }) => ({ slug })));
    if (batch.length < 50) return slugs;
  }
  throw new Error(
    "Public catalog exceeds the static export limit of 10,000 products; choose a scalable route strategy",
  );
}

export async function withFirstImage(
  products: PublicProduct[],
): Promise<ProductCardData[]> {
  // List responses already carry primary images. Optional hover media must
  // never add a detail request per product to the critical catalog path.
  return products;
}
