import type { Metadata } from "next";
import { BarChart3, Building2, CalendarDays, CreditCard, Settings, Users, WalletCards, Zap } from "lucide-react";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Control",
  description: "A centralized control panel for the entire OperiX Suite.",
  alternates: { canonical: "/products/control" },
};

export default function ControlPage() {
  return <ProductPage
    product="OperiX Control"
    headline="One control panel for your whole operation."
    description="Bring shared workspace, team, customer, billing, and activity data together across every OperiX product."
    variant="control"
    overviewTitle="See the suite as one connected business"
    overviewText="OperiX Control gives leaders a fast, unified view of the activity flowing through Invoice, HR Office, Booking, and Desk."
    overviewPoints={["Monitor revenue, invoices, appointments, and occupancy", "Manage shared teams, workspaces, and permissions", "Review cross-product activity and alerts", "Keep operational decisions in one clear workspace"]}
    featureTitle="Clarity across every product"
    features={[
      { title: "Unified overview", description: "See the metrics that matter across your OperiX workspace.", icon: BarChart3 },
      { title: "Workspace management", description: "Organize offices, teams, and shared settings in one place.", icon: Building2 },
      { title: "Team permissions", description: "Give every team member the right access across products.", icon: Users },
      { title: "Financial signals", description: "Connect revenue, invoices, payments, and billing activity.", icon: CreditCard },
      { title: "Appointments", description: "Track upcoming booking activity and attention points.", icon: CalendarDays },
      { title: "Automation", description: "Keep recurring operational work moving with fewer handoffs.", icon: Zap },
      { title: "Shared settings", description: "Maintain consistent configuration across the suite.", icon: Settings },
      { title: "Activity history", description: "Understand what changed and when across your workspace.", icon: WalletCards },
    ]}
  />;
}
