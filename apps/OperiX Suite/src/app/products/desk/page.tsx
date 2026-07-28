import type { Metadata } from "next";
import { Armchair, BarChart3, CalendarDays, MapPinned, Users, Zap } from "lucide-react";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Desk",
  description: "Desk and room reservations for flexible workspaces.",
  alternates: { canonical: "/products/desk" },
};

export default function DeskPage() {
  return <ProductPage
    product="OperiX Desk"
    headline="A better way to use your workspace."
    description="Reserve desks, rooms, and shared spaces with a clear view of availability and utilization."
    variant="desk"
    overviewTitle="Turn workspace demand into a clear plan"
    overviewText="OperiX Desk connects people, places, and reservations so every team can find the right space at the right time."
    overviewPoints={["Manage desks, rooms, and shared resources", "See availability on a visual floor plan", "Support hybrid work and recurring reservations", "Understand utilization across locations"]}
    featureTitle="Workspace clarity, every day"
    features={[
      { title: "Desk reservations", description: "Make it easy to find and reserve the right desk.", icon: Armchair },
      { title: "Room booking", description: "Keep meeting spaces visible and easy to coordinate.", icon: CalendarDays },
      { title: "Floor plans", description: "Give teams a visual map of resources and availability.", icon: MapPinned },
      { title: "Team schedules", description: "See where people plan to work across the week.", icon: Users },
      { title: "Utilization reports", description: "Understand how space is being used over time.", icon: BarChart3 },
      { title: "Flexible workflows", description: "Automate recurring reservations and everyday workspace tasks.", icon: Zap },
    ]}
  />;
}
