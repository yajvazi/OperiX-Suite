import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Suite — Connected Business Workspace",
  description: "Access the OperiX ecosystem through one account, one organization context, and one application launcher.",
  alternates: { canonical: "/products/suite" },
  openGraph: { title: "OperiX Suite — Connected Business Workspace", description: "Your central OperiX workspace for accessing the applications your organization uses." },
};

export default function SuitePage() {
  return <ProductPage content={{
    product: "suite",
    headline: "Your business. One connected workspace.",
    description: "Access every OperiX application your organization uses through a single account and workspace.",
    overview: "Suite is the starting point for the OperiX ecosystem, not another operational business tool.",
    workflow: ["Sign in with one unified OperiX account", "Keep your organization context consistent", "Open the applications your organization has access to", "Switch between products through the App Launcher"],
    useCases: ["Starting from one central workspace", "Finding the right OperiX application", "Keeping account and organization context consistent", "Moving between operational products and Control"],
    mobileCopy: "Suite is a web workspace. Invoice, HR, Booking, and Desk provide the mobile experiences for their own operational workflows.",
  }} />;
}

