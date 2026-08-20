import type { BookingStatus } from "./types";

export type BookingLocale = "en" | "sq";
export type BookingTranslationKey = keyof typeof bookingTranslations.en;

export const bookingTranslations = {
  en: {
    draft: "Draft",
    pending: "Pending",
    confirmed: "Confirmed",
    checked_in: "Checked in",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No show",
    rescheduled: "Rescheduled",
    dashboard: "Dashboard",
    bookings: "Bookings",
    calendar: "Calendar",
    customers: "Customers",
    services: "Services",
    resources: "Resources",
    staff: "Staff",
    payments: "Payments",
    notifications: "Notifications",
    reports: "Reports",
    settings: "Settings",
    newBooking: "New booking",
    today: "Today",
    upcoming: "Upcoming",
    completedBookings: "Completed bookings",
    revenue: "Revenue",
    createBooking: "Create booking",
    noBookings: "No bookings yet",
    noAvailability: "No availability for this day.",
  },
  sq: {
    draft: "Skicë",
    pending: "Në pritje",
    confirmed: "Konfirmuar",
    checked_in: "I regjistruar",
    in_progress: "Në proces",
    completed: "Përfunduar",
    cancelled: "Anuluar",
    no_show: "Nuk u paraqit",
    rescheduled: "Riplanifikuar",
    dashboard: "Paneli",
    bookings: "Rezervimet",
    calendar: "Kalendari",
    customers: "Klientët",
    services: "Shërbimet",
    resources: "Burimet",
    staff: "Stafi",
    payments: "Pagesat",
    notifications: "Njoftimet",
    reports: "Raportet",
    settings: "Cilësimet",
    newBooking: "Rezervim i ri",
    today: "Sot",
    upcoming: "Të ardhshme",
    completedBookings: "Rezervime të përfunduara",
    revenue: "Të ardhurat",
    createBooking: "Krijo rezervim",
    noBookings: "Ende nuk ka rezervime",
    noAvailability: "Nuk ka orare të lira për këtë ditë.",
  },
} as const;

export function bookingText(key: BookingTranslationKey, locale: BookingLocale = "en") {
  return bookingTranslations[locale][key] || bookingTranslations.en[key];
}

export function localizedBookingStatus(status: BookingStatus, locale: BookingLocale = "en") {
  return bookingText(status, locale);
}
