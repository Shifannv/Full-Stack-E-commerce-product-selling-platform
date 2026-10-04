import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PageHeading } from "@/components/storefront/page-heading";
import { ReturnLookup } from "@/components/storefront/return-lookup";
import { LoadingState } from "@/components/states/loading-state";

export const metadata: Metadata = { title: "Returns & refunds", robots: { index: false, follow: false } };
export default function ReturnsPage() {
  return <div className="site-container section-space"><PageHeading title="Returns & refunds" description="Check an existing request, from approval through inspection and refund." action={{ href: "/orders", label: "Your orders" }} /><CustomerGate><Suspense fallback={<LoadingState label="Loading return lookup" />}><ReturnLookup /></Suspense></CustomerGate></div>;
}
