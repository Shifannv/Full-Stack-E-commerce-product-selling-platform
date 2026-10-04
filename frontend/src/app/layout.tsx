import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});
const displayFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: "Ownline Dropship", template: "%s | Ownline Dropship" },
  description: "Discover the Ownline Dropship collection.",
  openGraph: {
    siteName: "Ownline Dropship",
    type: "website",
    title: "Ownline Dropship",
    description: "Discover the Ownline Dropship collection.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f6f2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
