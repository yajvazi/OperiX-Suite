import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { AnalyticsBoundary } from "@/components/analytics";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy } from "@/content/copy";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operixsuite.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: copy.en.meta.title, template: "%s | OperiX" },
  description: copy.en.meta.description,
  applicationName: "OperiX",
  icons: { icon: "/asset4.svg", shortcut: "/asset4.svg", apple: "/asset4.svg" },
  twitter: { card: "summary_large_image", title: copy.en.meta.title, description: copy.en.meta.description },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OperiX",
  url: siteUrl,
  logo: `${siteUrl}/brand/operix-invoice-logo.svg`,
  description: "OperiX Invoice: invoicing, point of sale, expenses, VAT registers, reports and payroll. OperiX Booking is coming soon.",
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
