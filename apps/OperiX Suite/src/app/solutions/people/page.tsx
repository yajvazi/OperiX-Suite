import type { Metadata } from "next";
import { SolutionPage } from "@/components/solution-page";

export const metadata: Metadata = { title: "People Solutions — OperiX", description: "Connect employee operations with organization access management through OperiX HR and OperiX Control.", alternates: { canonical: "/solutions/people" } };

export default function PeopleSolutionPage() { return <SolutionPage content={{ name: "People", headline: "Give your people team one reliable operating context.", description: "Use OperiX HR for employee operations and OperiX Control for the organization, roles, permissions, and application access around them.", products: ["hr", "control"], outcomes: ["Keep employee records, attendance, leave, and payroll workflows together", "Support recruitment, onboarding, offboarding, and documents", "Set the right access for each team and role", "Review security and audit activity from Control"], workflow: ["Organize employee and team records in HR", "Define roles and access in Control", "Run attendance, leave, and payroll workflows", "Review reports and governance activity"] }} />; }

