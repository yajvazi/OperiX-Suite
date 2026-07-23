import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";
import { featureGroups, roadmapFeatures } from "@/content/site";

export const metadata: Metadata = {
  title: "Features",
  description: "Explore financial, people, reporting, security, and cloud capabilities across OperiX Suite.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero title="The tools behind a clearer operation." description="Explore the financial and people workflows available across OperiX Suite, organized around real business work." />
      <section className="section">
        <div className="container">
          {featureGroups.map((group) => (
            <section className="feature-group" key={group.title}>
              <Reveal className="feature-group-head"><h2>{group.title}</h2><p>{group.description}</p></Reveal>
              <div className="feature-cards">
                {group.features.map((feature, index) => {
                  const Icon = feature.icon;
                  return <Reveal key={feature.title} delay={index * .05}><article className="feature-card"><div className="icon-box"><Icon /></div><h3>{feature.title}</h3><p>{feature.description}</p></article></Reveal>;
                })}
              </div>
            </section>
          ))}
          <section className="feature-group">
            <Reveal className="feature-group-head"><h2>What comes next</h2><p>These areas are part of the future OperiX roadmap and are not presented as currently available features.</p></Reveal>
            <div className="feature-cards">
              {roadmapFeatures.map((feature, index) => {
                const Icon = feature.icon;
                return <Reveal key={feature.title} delay={index * .05}><article className="feature-card roadmap-card"><div className="icon-box"><Icon /></div><h3>{feature.title}</h3><p>{feature.description}</p></article></Reveal>;
              })}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
