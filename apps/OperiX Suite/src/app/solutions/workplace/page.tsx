import type { Metadata } from "next";
import { SolutionPage } from "@/components/solution-page";

export const metadata: Metadata = { title: "Workplace Solutions — OperiX", description: "Plan desks, floors, office attendance, team presence, and workplace resources with OperiX Desk and HR.", alternates: { canonical: "/solutions/workplace" } };

export default function WorkplaceSolutionPage() { return <SolutionPage content={{ name: "Workplace", headline: "A simpler way to plan office days.", description: "Use OperiX Desk for desk and workplace reservations, with OperiX HR where people and attendance context belongs together.", products: ["desk", "hr"], outcomes: ["Make desks and workplace resources easy to find", "Use floor plans to see availability in context", "Help employees plan office days and find teammates", "Review reservation and workspace utilization activity"], workflow: ["Set up offices, floors, resources, and floor plans", "Publish the workplace context your team needs", "Reserve space and manage changes", "Review who is in and how space is being used"] }} />; }

