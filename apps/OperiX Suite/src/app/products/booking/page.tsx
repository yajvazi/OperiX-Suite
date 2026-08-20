import type { Metadata } from "next";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Booking — Booking & Reservation Management",
  description: "Manage bookings, appointments, customers, services, staff, resources, availability, payments, and reports with OperiX Booking.",
  alternates: { canonical: "/products/booking" },
  openGraph: { title: "OperiX Booking — Booking & Reservation Management", description: "Make bookings and reservations easier to manage from one connected platform." },
};

export default function BookingPage() {
  return <ProductPage content={{
    product: "booking",
    headline: "Bookings made simple.",
    description: "Manage reservations, customers, services, and availability from one connected platform.",
    overview: "Give your team a clear view of the time, people, and resources behind every reservation.",
    workflow: ["Create and manage bookings, appointments, and reservations", "Organize customers, services, staff, resources, and locations", "Set availability and follow payments and reminders", "Review calendar activity and operational reports"],
    useCases: ["Appointments", "Professional services", "Meeting rooms", "Resource reservations", "Classes and workspaces"],
    mobileCopy: "Use Booking on the web or in the Booking mobile application where enabled. Customers, services, availability, and reservations remain tied to the same organization context.",
  }} />;
}
