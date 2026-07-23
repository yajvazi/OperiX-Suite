import type { Metadata } from "next";
import { BarChart3, BriefcaseBusiness, CalendarDays, Clock3, FileLock2, ShieldCheck, UserRoundPlus, Users } from "lucide-react";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX HR",
  description: "Organize employees, attendance, leave, schedules, and payroll workflows with OperiX HR.",
  alternates: { canonical: "/products/hr" },
};

export default function HRPage() {
  return <ProductPage
    product="OperiX HR"
    headline="People operations that stay organized."
    description="Manage employee records, attendance, leave, schedules, payroll, and compliance from one dependable workspace."
    variant="hr"
    overviewTitle="One reliable place for your team"
    overviewText="OperiX HR gives growing businesses a structured view of their people operations, replacing scattered records with clear, connected workflows."
    overviewPoints={["Maintain a complete employee directory", "Track attendance, schedules, and leave", "Prepare payroll records and follow payout status", "Keep sensitive employee documents organized"]}
    featureTitle="Built around the employee lifecycle"
    features={[
      { title: "Employee directory", description: "Keep profiles and employment information in one place.", icon: Users },
      { title: "Employee onboarding", description: "Guide new people into the right company workspace.", icon: UserRoundPlus },
      { title: "Attendance", description: "Review individual and team time activity.", icon: Clock3 },
      { title: "Leave management", description: "Request, review, and follow time away.", icon: CalendarDays },
      { title: "Payroll", description: "Prepare payroll periods and track payout records.", icon: BriefcaseBusiness },
      { title: "Employee vault", description: "Organize sensitive employee documentation.", icon: FileLock2 },
      { title: "Compliance", description: "Track records and operational alerts.", icon: ShieldCheck },
      { title: "Analytics", description: "Understand workforce patterns in context.", icon: BarChart3 },
    ]}
  />;
}
