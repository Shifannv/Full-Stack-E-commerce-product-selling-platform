import type { Metadata } from "next";

// Applies to every /admin/* route; gated workspace routes and the unauthenticated auth routes
// each add their own layout in their route group below.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Ownline Dropship Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
