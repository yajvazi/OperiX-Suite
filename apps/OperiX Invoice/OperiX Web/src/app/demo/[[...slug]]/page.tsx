import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/demo-app";
import { DemoProvider } from "@/components/demo/demo-provider";
import { DemoShell } from "@/components/demo/demo-shell";

export const metadata: Metadata = {
  title: "Interactive Demo",
  description: "Explore OperiX Invoice with safe sample data in an interactive browser demo.",
  robots: { index: false, follow: false },
};

export default async function DemoPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return (
    <DemoProvider>
      <DemoShell>
        <DemoApp slug={slug} />
      </DemoShell>
    </DemoProvider>
  );
}
