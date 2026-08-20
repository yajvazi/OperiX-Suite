import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { AnalyticsBoundary } from "@/components/analytics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "OperiX — One connected platform for your business.",
    template: "%s | OperiX",
  },
  description:
    "Finance, people, bookings, workplaces, and platform administration in one connected OperiX account and organization.",
  applicationName: "OperiX",
  icons: {
    icon: "/asset4.svg",
    shortcut: "/asset4.svg",
    apple: "/asset4.svg",
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: "OperiX — One connected platform for your business.",
    description:
      "One account. One organization. Multiple connected OperiX applications.",
    type: "website",
    siteName: "OperiX Suite",
  },
  twitter: {
    card: "summary_large_image",
    title: "OperiX — One connected platform for your business.",
    description: "Finance, people, bookings, workplaces, and administration in one OperiX platform.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OperiX",
  url: siteUrl,
  logo: `${siteUrl}/brand/operix-suite-icon-blue.svg`,
  description: "One connected business platform for finance, people, bookings, workplaces, and administration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <AnalyticsBoundary />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
