"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerGate } from "@/components/storefront/customer-gate";
import { PageHeading } from "@/components/storefront/page-heading";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useCustomerSession } from "@/lib/use-customer-session";

function AccountContent() {
  const router = useRouter();
  const { user } = useCustomerSession();
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    const result = await authClient.signOut();
    if (result.error) setError(result.error.message ?? "Sign-out failed");
    else router.push("/");
  }
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_17rem]">
      <div>
        <h2 className="text-xl font-semibold">Profile</h2>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          <div className="grid grid-cols-[8rem_1fr] gap-4 py-4">
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd>{user?.name ?? "—"}</dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-4 py-4">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="break-all">{user?.email ?? "—"}</dd>
          </div>
        </dl>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          className="mt-7"
          onClick={() => void signOut()}
        >
          Sign out
        </Button>
      </div>
      <nav
        aria-label="Account sections"
        className="account-nav flex h-fit flex-col gap-1"
      >
        <Link
          href="/account/addresses"
          className="rounded-md px-3 py-3 hover:bg-secondary"
        >
          Addresses
        </Link>
        <Link
          href="/orders"
          className="rounded-md px-3 py-3 hover:bg-secondary"
        >
          Orders
        </Link>
        <Link
          href="/wishlist"
          className="rounded-md px-3 py-3 hover:bg-secondary"
        >
          Wishlist
        </Link>
        <Link href="/returns" className="px-3 py-3 hover:bg-secondary">Returns & refunds</Link>
      </nav>
    </div>
  );
}
export default function AccountPage() {
  return (
    <div className="site-container section-space">
      <PageHeading title="Your Ownline Dropship" description="Your details, saved pieces and purchases, together in one place." action={{ href: "/search", label: "Explore the collection" }} />
      <CustomerGate>
        <AccountContent />
      </CustomerGate>
    </div>
  );
}
