import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password — Ownline Dropship Admin",
  description: "Set a new password for your Ownline Dropship seller account.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export { ResetPasswordPage as default } from "@/components/admin/reset-password-form";
