import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomePage from "@/app/page";
import AboutPage from "@/app/about/page";
import BookDemoPage from "@/app/book-demo/page";
import DemoSuccessPage from "@/app/book-demo/success/page";
import ContactPage from "@/app/contact/page";
import FeaturesPage from "@/app/features/page";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import HRPage from "@/app/products/hr/page";
import InvoicePage from "@/app/products/invoice/page";
import PreviewPage from "@/app/preview/page";
import ResourcesPage from "@/app/resources/page";
import TermsPage from "@/app/terms/page";
import { LocaleExperience } from "@/components/locale-experience";
import { isLocale, type Locale } from "@/content/locales";

const pages = {
  "": HomePage,
  about: AboutPage,
  "book-demo": BookDemoPage,
  "book-demo/success": DemoSuccessPage,
  contact: ContactPage,
  features: FeaturesPage,
  pricing: PricingPage,
  privacy: PrivacyPage,
  "products/hr": HRPage,
  "products/invoice": InvoicePage,
  preview: PreviewPage,
  resources: ResourcesPage,
  terms: TermsPage,
} as const;

const pageTitles: Record<keyof typeof pages, string> = {
  "": "OperiX Suite",
  about: "About",
  "book-demo": "Book a Demo",
  "book-demo/success": "Demo Request",
  contact: "Contact",
  features: "Features",
  pricing: "Pricing",
  privacy: "Privacy",
  "products/hr": "OperiX HR Office",
  "products/invoice": "OperiX Invoice",
  preview: "Private Preview",
  resources: "Resources",
  terms: "Terms",
};

type LocalizedPageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

function resolvePage(locale: string, slug: string[] = []) {
  if (!isLocale(locale)) notFound();
  const path = slug.join("/") as keyof typeof pages;
  const Page = pages[path];
  if (!Page) notFound();
  return { locale: locale as Locale, path, Page };
}

export async function generateMetadata({ params }: LocalizedPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const resolved = resolvePage(locale, slug);
  const suffix = resolved.path ? `/${resolved.path}` : "";

  return {
    title: pageTitles[resolved.path],
    alternates: {
      canonical: `/${resolved.locale}${suffix}`,
      languages: {
        en: `/en${suffix}`,
        sq: `/al${suffix}`,
      },
    },
  };
}

export default async function LocalizedPage({ params }: LocalizedPageProps) {
  const { locale, slug } = await params;
  const resolved = resolvePage(locale, slug);
  const { Page } = resolved;

  return (
    <LocaleExperience locale={resolved.locale}>
      <Page />
    </LocaleExperience>
  );
}
