import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <>
      <PageHero title="Privacy" description="A clear privacy policy will be published here before the OperiX Suite site launches." />
      <section className="section"><article className="container legal-copy"><p>This page is reserved for approved legal copy. No temporary policy text should be treated as a final privacy commitment.</p><h2>Before launch</h2><p>The final policy should cover information collected through contact and demo forms, product account data, analytics, cookies, processors, retention, security, and user rights in applicable regions.</p><h2>Questions</h2><p>Verified privacy contact information will be added together with the final policy.</p></article></section>
    </>
  );
}
