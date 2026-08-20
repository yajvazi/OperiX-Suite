import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomePage from "@/app/page";
import AboutPage from "@/app/about/page";
import BookDemoPage from "@/app/book-demo/page";
import DemoSuccessPage from "@/app/book-demo/success/page";
import ContactPage from "@/app/contact/page";
import DemoPage from "@/app/demo/page";
import EnterprisePage from "@/app/enterprise/page";
import FeaturesPage from "@/app/features/page";
import PricingPage from "@/app/pricing/page";
import PrivacyPage from "@/app/privacy/page";
import BookingPage from "@/app/products/booking/page";
import ControlPage from "@/app/products/control/page";
import DeskPage from "@/app/products/desk/page";
import HRPage from "@/app/products/hr/page";
import InvoicePage from "@/app/products/invoice/page";
import SuitePage from "@/app/products/suite/page";
import ResourcesPage from "@/app/resources/page";
import BookingsSolutionPage from "@/app/solutions/bookings/page";
import FinanceSolutionPage from "@/app/solutions/finance/page";
import PeopleSolutionPage from "@/app/solutions/people/page";
import SmallBusinessSolutionPage from "@/app/solutions/small-business/page";
import WorkplaceSolutionPage from "@/app/solutions/workplace/page";
import TermsPage from "@/app/terms/page";
import { LocaleExperience } from "@/components/locale-experience";
import { isLocale, type Locale } from "@/content/locales";

const pages = {
  "": HomePage,
  about: AboutPage,
  "book-demo": BookDemoPage,
  "book-demo/success": DemoSuccessPage,
  contact: ContactPage,
  demo: DemoPage,
  enterprise: EnterprisePage,
  features: FeaturesPage,
  pricing: PricingPage,
  privacy: PrivacyPage,
  "products/booking": BookingPage,
  "products/control": ControlPage,
  "products/desk": DeskPage,
  "products/hr": HRPage,
  "products/invoice": InvoicePage,
  "products/suite": SuitePage,
  resources: ResourcesPage,
  "solutions/bookings": BookingsSolutionPage,
  "solutions/finance": FinanceSolutionPage,
  "solutions/people": PeopleSolutionPage,
  "solutions/small-business": SmallBusinessSolutionPage,
  "solutions/workplace": WorkplaceSolutionPage,
  terms: TermsPage,
} as const;

const pageTitles: Record<keyof typeof pages, string> = {
  "": "OperiX Suite",
  about: "About",
  "book-demo": "Book a Demo",
  "book-demo/success": "Demo Request",
  contact: "Contact",
  demo: "Explore Demo",
  enterprise: "OperiX for Enterprise",
  features: "Features",
  pricing: "Pricing",
  privacy: "Privacy",
  "products/booking": "OperiX Booking",
  "products/control": "OperiX Control",
  "products/desk": "OperiX Desk",
  "products/hr": "OperiX HR Office",
  "products/invoice": "OperiX Invoice",
  "products/suite": "OperiX Suite",
  resources: "Resources",
  "solutions/bookings": "Bookings Solutions",
  "solutions/finance": "Finance Solutions",
  "solutions/people": "People Solutions",
  "solutions/small-business": "Small Business Solutions",
  "solutions/workplace": "Workplace Solutions",
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
