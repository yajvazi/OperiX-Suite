import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://operix.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "OperiX Suite — One Suite. Complete Control.",
    template: "%s | OperiX",
  },
  description:
    "Bring invoicing, people operations, reporting, and everyday business management into one connected workspace.",
  applicationName: "OperiX Suite",
  alternates: { canonical: "/" },
  openGraph: {
    title: "OperiX Suite — One Suite. Complete Control.",
    description:
      "A connected suite for invoicing, people operations, reporting, and business management.",
    type: "website",
    siteName: "OperiX Suite",
  },
  twitter: {
    card: "summary_large_image",
    title: "OperiX Suite — One Suite. Complete Control.",
    description: "A connected suite for clearer financial and people operations.",
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
  logo: `${siteUrl}/brand/operix-icon-blue.svg`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={poppins.variable} data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteHeader />
        <main id="main-content">{children}</main>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
