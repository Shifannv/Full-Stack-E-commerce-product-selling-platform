import { ProductCard, type ProductCardData } from "./product-card";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-8">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
}
