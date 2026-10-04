import { ProductCard, type ProductCardData } from "./product-card";

export function ProductGrid({ products, eagerCount = 0, threeColumns = false }: { products: ProductCardData[]; eagerCount?: number; threeColumns?: boolean }) {
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 md:grid-cols-3 ${threeColumns ? "lg:grid-cols-3" : "lg:grid-cols-4"} lg:gap-x-6 xl:gap-x-8`}>
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} eager={index < eagerCount} />
      ))}
    </div>
  );
}
