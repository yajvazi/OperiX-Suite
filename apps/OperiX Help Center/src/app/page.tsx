import type { Metadata } from "next";
import { DocsFooter } from "../components/site-footer";
import { DocsHeader } from "../components/site-header";
import { HomePage } from "../components/home-page";
import { absoluteUrl } from "../lib/paths";

export const metadata: Metadata = {
  title: "How can we help?",
  description: "Search official OperiX Invoice and OperiX Booking guides, documentation and answers.",
  alternates: { canonical: absoluteUrl("/en") },
};

export default function RootPage() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><DocsHeader locale="en" /><HomePage locale="en" /><DocsFooter locale="en" /></>;
}
