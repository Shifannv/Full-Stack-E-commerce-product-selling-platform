import type { PublicCategory } from "./public-catalog";

export const clothingCategory = (category: Pick<PublicCategory, "name" | "slug">) =>
  /\b(dress(?:es)?|clothing|apparel|fashion|menswear|womenswear|wear|shirts?|pants?|trousers?|tees?|tshirts?|t-shirts?|men|mens|women|womens|gents|ladies)\b/i.test(`${category.name} ${category.slug.replaceAll("-", " ")}`);

export type ClothingItem = { name: string; category?: string; categorySlug?: string; subcategory?: string; subcategorySlug?: string };
export function matchesClothing(item: ClothingItem, audience: string, kind: string) {
  const text = `${item.name} ${item.category ?? ""} ${item.categorySlug ?? ""} ${item.subcategory ?? ""} ${item.subcategorySlug ?? ""}`.toLowerCase().replaceAll("-", " ");
  const unisex = /\bunisex\b/.test(text);
  if (audience === "gents" && !unisex && !/\b(men|mens|men's|gents|male)\b/.test(text)) return false;
  if (audience === "ladies" && !unisex && !/\b(women|womens|women's|ladies|female)\b/.test(text)) return false;
  if (kind === "t-shirt") return /\b(t\s?shirts?|tees?)\b/.test(text);
  if (kind === "shirt") return /\bshirts?\b/.test(text) && !/\bt\s?shirts?\b/.test(text);
  if (kind === "pant") return /\b(pants?|trousers?|jeans)\b/.test(text);
  return true;
}
