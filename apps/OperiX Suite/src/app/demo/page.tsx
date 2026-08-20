import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoCenter } from "@/components/demo-center";

export const metadata: Metadata = {
  title: "Explore OperiX — Interactive Demo Center",
  description: "Explore the OperiX ecosystem with safe fictional sample data. Launch the public Invoice demo or review demo availability for every product.",
  alternates: { canonical: "/demo" },
  openGraph: { title: "Explore OperiX — Interactive Demo Center", description: "Try OperiX with safe fictional sample data and no payment details required." },
};

export default function DemoPage() {
  return <Suspense fallback={<section className="section demo-center"><div className="container"><p>Loading the demo center…</p></div></section>}><DemoCenter /></Suspense>;
}
