import type { Metadata } from "next";
import { DocsFooter } from "../components/site-footer";
import { DocsHeader } from "../components/site-header";
import { HomePage } from "../components/home-page";

export const metadata: Metadata = {
  title: "How can we help?",
  description: "Search official OperiX Suite guides, documentation and answers.",
  alternates: { canonical: "https://helpdesk.operixsuite.com/en" },
};

export default function RootPage() {
  return <><DocsHeader locale="en" /><HomePage locale="en" /><DocsFooter locale="en" /></>;
}
