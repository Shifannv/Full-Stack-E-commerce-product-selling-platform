import { cn } from "cn";

export function PriceDisplay({ amount, currency = "INR", className }: { amount: string | number; currency?: string; className?: string }) {
  const value = Number(amount);
  const formatted = Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
    : "Price unavailable";
  return <span className={cn("type-price", className)}>{formatted}</span>;
}
