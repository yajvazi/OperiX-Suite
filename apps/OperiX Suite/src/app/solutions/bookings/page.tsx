import type { Metadata } from "next";
import { SolutionPage } from "@/components/solution-page";

export const metadata: Metadata = { title: "Booking Solutions — OperiX", description: "Manage reservations, availability, customers, services, payments, and reminders with OperiX Booking.", alternates: { canonical: "/solutions/bookings" } };

export default function BookingsSolutionPage() { return <SolutionPage content={{ name: "Bookings", headline: "Make reservations easier for your team and customers.", description: "OperiX Booking brings bookings, appointments, calendars, customers, services, staff, resources, locations, payments, reminders, and reports into one connected workspace.", products: ["booking"], outcomes: ["See upcoming and completed bookings in one calendar", "Keep customers, services, staff, and resources connected", "Set availability for the way your business operates", "Follow payments, reminders, and reporting"], workflow: ["Set up services, staff, locations, and resources", "Define availability and booking rules", "Create, reschedule, or cancel reservations", "Use calendar and reports to keep the day moving"] }} />; }

