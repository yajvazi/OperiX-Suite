import type { Metadata } from "next";
import { SolutionPage } from "@/components/solution-page";

export const metadata: Metadata = { title: "Small Business Solutions — OperiX", description: "Start with the OperiX applications that solve today’s work and add more as your business grows.", alternates: { canonical: "/solutions/small-business" } };

export default function SmallBusinessSolutionPage() { return <SolutionPage content={{ name: "Small business", headline: "Start with the work in front of you. Grow into the platform.", description: "OperiX gives smaller teams a clear path from one focused application to a connected business platform without forcing every workflow into one screen.", products: ["invoice", "hr", "booking", "desk"], outcomes: ["Start with finance, people, bookings, or workplace work", "Use one account as your organization grows", "Add applications when your team has a real need", "Keep administration and access in OperiX Control"], workflow: ["Choose the first product that solves a current need", "Set up your organization and account", "Invite the people who need access", "Add connected applications when the timing is right"] }} />; }

