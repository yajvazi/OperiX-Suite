import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX HR — HR & Workforce Management",
  description: "Manage employees, attendance, leave, payroll, recruitment, documents, and workforce workflows with OperiX HR.",
  alternates: { canonical: "/products/hr" },
  openGraph: { title: "OperiX HR — HR & Workforce Management", description: "Bring people operations from onboarding to payroll into one connected workspace." },
};

export default function HRPage() {
  return <ProductPage content={{
    product: "hr",
    headline: "Everything your team needs, from onboarding to payroll.",
    description: "Manage your workforce from one connected HR platform.",
    overview: "Give your people team one dependable place for employee operations.",
    workflow: ["Keep employee profiles, departments, and documents organized", "Track attendance and leave requests in one workflow", "Support recruitment, onboarding, offboarding, and performance", "Prepare payroll records and review workforce reports"],
    useCases: ["Employee directory and records", "Attendance and leave management", "Recruitment and onboarding", "Payroll and workforce reporting"],
    mobileCopy: "Use HR on the web and through the HR mobile application where enabled. Employee data and account context stay connected to the same OperiX organization.",
  }} />;
}
