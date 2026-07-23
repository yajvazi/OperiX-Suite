import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { ResourceDirectory } from "@/components/resource-search";

export const metadata: Metadata = {
  title: "Resources",
  description: "Find OperiX product documentation, guides, help, downloads, and API resources.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <>
      <PageHero title="Resources for every stage." description="Find the material you need to evaluate, adopt, and get more from OperiX products." />
      <section className="section"><div className="container"><ResourceDirectory /></div></section>
    </>
  );
}
