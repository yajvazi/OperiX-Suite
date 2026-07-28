import type { Metadata } from "next";
import { CalendarCheck, Bell, CalendarDays, Link2, Users, Zap } from "lucide-react";
import { ProductPage } from "@/components/product-page";

export const metadata: Metadata = {
  title: "OperiX Booking",
  description: "Appointments and reservations for the connected OperiX Suite.",
  alternates: { canonical: "/products/booking" },
};

export default function BookingPage() {
  return <ProductPage
    product="OperiX Booking"
    headline="Appointments that keep moving."
    description="Bring availability, reservations, confirmations, and customer scheduling into one clear workspace."
    variant="booking"
    overviewTitle="Make every appointment easier to manage"
    overviewText="OperiX Booking gives your team one reliable place to plan the day, manage availability, and keep customers informed."
    overviewPoints={["Manage appointments and reservations", "Share availability with customers", "Automate confirmations and reminders", "Connect customer activity across the suite"]}
    featureTitle="A calmer way to schedule"
    features={[
      { title: "Appointment calendar", description: "See the day, week, and upcoming schedule at a glance.", icon: CalendarDays },
      { title: "Availability rules", description: "Set hours, buffers, and booking windows that fit your operation.", icon: CalendarCheck },
      { title: "Customer booking", description: "Give customers a simple way to request time with your team.", icon: Users },
      { title: "Reminders", description: "Keep people informed with timely confirmations and notifications.", icon: Bell },
      { title: "Connected records", description: "Use shared customer and location data across OperiX.", icon: Link2 },
      { title: "Automated workflows", description: "Reduce repetitive scheduling work with focused automation.", icon: Zap },
    ]}
  />;
}
