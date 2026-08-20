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
      <section className="section"><div className="container"><ResourceDirectory /><div className="resource-notes"><article id="demo-safety"><h2>Demo safety</h2><p>The public Invoice demo uses fictional data and browser-local changes. It is separate from production organizations. External payments, refunds, email, SMS, webhooks, secrets, and live integrations are not delivered or changed from the public demo.</p></article><article id="developer-documentation"><h2>Developer Documentation</h2><p>Public API documentation is being prepared. It will be linked here once the reference and availability are confirmed.</p></article><article id="whats-new"><h2>What’s new</h2><p>Product updates and rollout notes will be published here as the wider OperiX platform expands.</p></article><article id="system-status"><h2>System status</h2><p>No public status endpoint is published yet. Use the Help Center for current product support guidance.</p></article></div></div></section>
    </>
  );
}
