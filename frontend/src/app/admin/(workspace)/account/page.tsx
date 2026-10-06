import type { Metadata } from "next";
import { AdminAccountPage } from "@/components/admin/account-page";

export const metadata: Metadata = {
  title: "Account — Ownline Dropship Admin",
  description: "Manage your seller account profile, onboarding status and security settings.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AdminAccountPage />;
}
