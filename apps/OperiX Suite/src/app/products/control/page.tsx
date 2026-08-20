import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Control — Administration & Platform Security",
  description: "Manage OperiX organizations, users, roles, permissions, application access, security, integrations, and audit logs from one web console.",
  alternates: { canonical: "/products/control" },
  openGraph: { title: "OperiX Control — Administration & Platform Security", description: "The web-only administration and system management layer for the OperiX platform." },
};

export default function ControlPage() {
  return <ProductPage content={{
    product: "control",
    headline: "Manage your entire OperiX environment.",
    description: "Control organizations, users, permissions, security, and app access from one place.",
    overview: "A central administration layer for the account, organization, and applications around your business.",
    workflow: ["Manage organizations, users, roles, and permissions", "Set application access and review security settings", "Monitor integrations, audit activity, and system configuration", "Use the App Launcher to switch between Suite, Invoice, HR, Booking, Desk, and Control"],
    useCases: ["Organization administration", "Role and permission management", "Application access reviews", "Security and audit visibility"],
    mobileCopy: "OperiX Control is web-only. It is designed for administrators working from the browser and does not have a native iOS or Android application.",
  }} />;
}
