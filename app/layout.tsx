import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://harborhavenhomewatch.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Harbor Haven Home Watch — Sarasota Home Watch, Permits & Projects",
    template: "%s · Harbor Haven Home Watch",
  },
  description:
    "Home watch for seasonal Sarasota residents — scheduled visits with time-stamped photo reports. Permits pulled under a licensed general contractor and projects managed start to finish.",
  openGraph: {
    title: "Harbor Haven Home Watch",
    description:
      "Your eyes on your Sarasota home — and your hands on the project. Home watch, permits, and project management.",
    url: SITE_URL,
    siteName: "Harbor Haven Home Watch",
    locale: "en_US",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
