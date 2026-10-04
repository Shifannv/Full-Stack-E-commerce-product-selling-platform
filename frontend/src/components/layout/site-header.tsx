"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/search", label: "Shop" },
  { href: "/clothing", label: "Clothing" },
  { href: "/search?sort=newest", label: "New arrivals" },
  { href: "/wishlist", label: "Saved" },
  { href: "/account", label: "Account" },
  { href: "/orders", label: "Orders" },
];

export function SiteHeader() {
  const home = usePathname() === "/";
  return (
    <header className={`store-header border-b ${home ? "store-header-home border-white/20 text-white" : "border-border bg-background"}`}>
      <div className="site-container flex h-17 items-center justify-between gap-3 md:h-21">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-background text-foreground" data-lenis-prevent>
              <SheetHeader>
                <SheetTitle className="font-semibold tracking-tight">
                  Ownline Dropship
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Mobile navigation"
                className="flex flex-col gap-1 px-4 pt-6"
              >
                {links.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-md px-3 py-3 text-base hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <Link
            href="/"
            className="store-wordmark text-xl font-semibold tracking-[-0.035em] sm:text-2xl"
            aria-label="Ownline Dropship home"
          >
            OWNLINE<span className="ml-1.5 align-top text-[9px] font-medium tracking-[0.11em] sm:text-[10px]">DROPSHIP</span>
          </Link>
        </div>
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-9 text-xs font-medium uppercase tracking-[0.13em] lg:flex"
        >
          {links.slice(0, 4).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-primary focus-visible:rounded-sm"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label="Search products"
          >
            <Link href="/search">
              <Search aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Wishlist" className="hidden sm:inline-flex">
            <Link href="/wishlist">
              <Heart aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Account" className="hidden sm:inline-flex">
            <Link href="/account">
              <UserRound aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label="Cart">
            <Link href="/cart">
              <ShoppingBag aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
