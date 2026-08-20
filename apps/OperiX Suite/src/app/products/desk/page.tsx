import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Desk — Desk & Workplace Booking",
  description: "Reserve desks and workplace resources, manage floors and floor plans, and understand workspace use with OperiX Desk.",
  alternates: { canonical: "/products/desk" },
  openGraph: { title: "OperiX Desk — Desk & Workplace Booking", description: "Give employees a simple way to reserve desks, find teammates, and plan office days." },
};

export default function DeskPage() {
  return <ProductPage content={{
    product: "desk",
    headline: "A smarter workplace starts here.",
    description: "Give employees a simple way to reserve desks, find teammates, and plan office days.",
    overview: "Connect the people, places, and reservations that make a flexible workplace work.",
    workflow: ["Reserve desks, rooms, offices, and shared workplace resources", "Explore interactive floor plans and floor management", "See team presence and who is in the office today", "Review reservations and workplace utilization"],
    useCases: ["Desk reservations", "Interactive floor plans", "Hybrid workplace planning", "Team presence and office days", "Workspace utilization"],
    mobileCopy: "Use Desk on the web or in the Desk mobile application where enabled. Employees can reserve space and see workplace context without creating a separate account.",
  }} />;
}
