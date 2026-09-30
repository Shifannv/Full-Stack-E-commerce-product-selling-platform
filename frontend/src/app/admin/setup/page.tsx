import type { Metadata } from "next";
import { InvitationSetup } from "@/components/auth/invitation-setup";

export const metadata: Metadata = {
  title: "Set up your seller account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SetupPage() {
  return <div className="max-w-lg"><h1 className="type-page">Set up your seller account</h1><InvitationSetup /></div>;
}
