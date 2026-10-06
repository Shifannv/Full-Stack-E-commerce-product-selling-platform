import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot password — Ownline Dropship Admin",
  description: "Reset your Ownline Dropship seller account password.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export { ForgotPasswordPage as default } from "@/components/admin/forgot-password-form";
