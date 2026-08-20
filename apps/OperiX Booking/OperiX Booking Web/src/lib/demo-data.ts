import type { BookingCustomer, BookingLocation, BookingRecord, BookingResource, BookingService, BookingStaff } from "@invoice-monorepo/booking";

export const DEMO_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

export const demoServices: BookingService[] = [
  { id: "00000000-0000-4000-8000-000000000101", company_id: DEMO_COMPANY_ID, category_id: null, name: "Business Meeting Room", description: "Bright room with video conferencing.", duration_minutes: 60, price: 45, currency: "EUR", tax_rate: 18, deposit_type: "none", deposit_value: 0, buffer_before_minutes: 10, buffer_after_minutes: 10, min_participants: 1, max_participants: 8, min_notice_minutes: 30, max_advance_days: 365, is_active: true, image_url: null },
  { id: "00000000-0000-4000-8000-000000000102", company_id: DEMO_COMPANY_ID, category_id: null, name: "Deluxe Hotel Room", description: "A comfortable room for an overnight stay.", duration_minutes: 1440, price: 120, currency: "EUR", tax_rate: 10, deposit_type: "percentage", deposit_value: 25, buffer_before_minutes: 0, buffer_after_minutes: 30, min_participants: 1, max_participants: 2, min_notice_minutes: 60, max_advance_days: 365, is_active: true, image_url: null },
  { id: "00000000-0000-4000-8000-000000000103", company_id: DEMO_COMPANY_ID, category_id: null, name: "Dental Consultation", description: "New patient consultation with Dr. Arta.", duration_minutes: 45, price: 60, currency: "EUR", tax_rate: 0, deposit_type: "fixed", deposit_value: 10, buffer_before_minutes: 10, buffer_after_minutes: 10, min_participants: 1, max_participants: 1, min_notice_minutes: 30, max_advance_days: 120, is_active: true, image_url: null },
  { id: "00000000-0000-4000-8000-000000000104", company_id: DEMO_COMPANY_ID, category_id: null, name: "Premium Car", description: "Premium vehicle rental with pickup support.", duration_minutes: 1440, price: 89, currency: "EUR", tax_rate: 18, deposit_type: "fixed", deposit_value: 100, buffer_before_minutes: 15, buffer_after_minutes: 15, min_participants: 1, max_participants: 5, min_notice_minutes: 120, max_advance_days: 90, is_active: true, image_url: null },
];

export const demoCustomers: BookingCustomer[] = [
  { id: "00000000-0000-4000-8000-000000000201", company_id: DEMO_COMPANY_ID, name: "Mila Petrović", email: "mila@example.com", phone: "+383 44 210 441", company: "Northstar Studio" },
  { id: "00000000-0000-4000-8000-000000000202", company_id: DEMO_COMPANY_ID, name: "Arben Krasniqi", email: "arben@example.com", phone: "+383 49 321 104", company: "Krasniqi & Co." },
  { id: "00000000-0000-4000-8000-000000000203", company_id: DEMO_COMPANY_ID, name: "Elena Marku", email: "elena@example.com", phone: "+383 45 400 882", company: null },
];

export const demoLocations: BookingLocation[] = [
  { id: "00000000-0000-4000-8000-000000000301", company_id: DEMO_COMPANY_ID, name: "Prishtina Center", address: "Garibaldi 12, Prishtina", phone: "+383 38 220 120", email: "hello@operix.demo", timezone: "Europe/Belgrade", is_active: true },
  { id: "00000000-0000-4000-8000-000000000302", company_id: DEMO_COMPANY_ID, name: "Ulpiana Studio", address: "Bulevardi Bill Klinton", phone: "+383 38 220 121", email: "studio@operix.demo", timezone: "Europe/Belgrade", is_active: true },
];

export const demoResources: BookingResource[] = [
  { id: "00000000-0000-4000-8000-000000000401", company_id: DEMO_COMPANY_ID, location_id: demoLocations[0].id, name: "Room Atlas", resource_type: "Meeting room", description: "8-person meeting room", capacity: 8, status: "active", price_override: null, is_active: true },
  { id: "00000000-0000-4000-8000-000000000402", company_id: DEMO_COMPANY_ID, location_id: demoLocations[1].id, name: "Room Besa", resource_type: "Treatment room", description: "Private treatment room", capacity: 1, status: "active", price_override: null, is_active: true },
  { id: "00000000-0000-4000-8000-000000000403", company_id: DEMO_COMPANY_ID, location_id: demoLocations[0].id, name: "Audi A4 · 04", resource_type: "Vehicle", description: "Premium vehicle", capacity: 5, status: "active", price_override: null, is_active: true },
];

export const demoStaff: BookingStaff[] = [
  { id: "00000000-0000-4000-8000-000000000501", company_id: DEMO_COMPANY_ID, employee_id: null, user_id: null, display_name: "Dr. Arta Berisha", role_title: "Dental provider", is_active: true },
  { id: "00000000-0000-4000-8000-000000000502", company_id: DEMO_COMPANY_ID, employee_id: null, user_id: null, display_name: "Luan Gashi", role_title: "Workspace host", is_active: true },
  { id: "00000000-0000-4000-8000-000000000503", company_id: DEMO_COMPANY_ID, employee_id: null, user_id: null, display_name: "Sara Hoxha", role_title: "Front desk", is_active: true },
];

const demoBooking = (id: string, number: string, customer: BookingCustomer, service: BookingService, startsAt: string, endsAt: string, status: BookingRecord["status"], total: number, staff = demoStaff[1], resource = demoResources[0]): BookingRecord => ({
  id, company_id: DEMO_COMPANY_ID, booking_number: number, customer_id: customer.id, guest_name: null, guest_email: null, guest_phone: null,
  service_id: service.id, location_id: resource.location_id, resource_id: resource.id, staff_id: staff.id, starts_at: startsAt, ends_at: endsAt,
  timezone: "Europe/Belgrade", duration_minutes: Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000), quantity: 1, participant_count: 1,
  price: total, discount_amount: 0, tax_amount: 0, deposit_amount: 0, total_amount: total, paid_amount: status === "completed" ? total : 0, currency: "EUR",
  payment_status: status === "completed" ? "paid" : "unpaid", status, notes: null, internal_notes: null, customer_notes: null, source: "admin", recurrence_rule: null,
  recurrence_series_id: null, created_by: null, created_at: "2026-08-12T08:10:00.000Z", updated_at: "2026-08-12T08:10:00.000Z",
  service: { id: service.id, name: service.name, duration_minutes: service.duration_minutes, price: service.price, currency: service.currency },
  customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
  staff: { id: staff.id, display_name: staff.display_name, role_title: staff.role_title },
  resource: { id: resource.id, name: resource.name, resource_type: resource.resource_type },
  location: { id: resource.location_id || demoLocations[0].id, name: demoLocations.find((location) => location.id === resource.location_id)?.name || "Prishtina Center", timezone: "Europe/Belgrade" },
});

export const demoBookings: BookingRecord[] = [
  demoBooking("00000000-0000-4000-8000-000000000601", "BK-2026-000142", demoCustomers[0], demoServices[0], "2026-08-13T07:00:00.000Z", "2026-08-13T08:00:00.000Z", "confirmed", 45, demoStaff[1], demoResources[0]),
  demoBooking("00000000-0000-4000-8000-000000000602", "BK-2026-000143", demoCustomers[1], demoServices[2], "2026-08-13T08:45:00.000Z", "2026-08-13T09:30:00.000Z", "pending", 60, demoStaff[0], demoResources[1]),
  demoBooking("00000000-0000-4000-8000-000000000603", "BK-2026-000144", demoCustomers[2], demoServices[0], "2026-08-13T10:00:00.000Z", "2026-08-13T11:00:00.000Z", "confirmed", 45, demoStaff[2], demoResources[0]),
  demoBooking("00000000-0000-4000-8000-000000000604", "BK-2026-000145", demoCustomers[0], demoServices[1], "2026-08-14T10:00:00.000Z", "2026-08-15T10:00:00.000Z", "confirmed", 120, demoStaff[1], demoResources[1]),
  demoBooking("00000000-0000-4000-8000-000000000605", "BK-2026-000146", demoCustomers[1], demoServices[3], "2026-08-15T08:00:00.000Z", "2026-08-16T08:00:00.000Z", "confirmed", 89, demoStaff[2], demoResources[2]),
  demoBooking("00000000-0000-4000-8000-000000000606", "BK-2026-000147", demoCustomers[2], demoServices[0], "2026-08-12T11:00:00.000Z", "2026-08-12T12:00:00.000Z", "completed", 45, demoStaff[1], demoResources[0]),
  demoBooking("00000000-0000-4000-8000-000000000607", "BK-2026-000148", demoCustomers[0], demoServices[2], "2026-08-10T08:00:00.000Z", "2026-08-10T08:45:00.000Z", "cancelled", 60, demoStaff[0], demoResources[1]),
  demoBooking("00000000-0000-4000-8000-000000000608", "BK-2026-000149", demoCustomers[1], demoServices[0], "2026-08-11T12:00:00.000Z", "2026-08-11T13:00:00.000Z", "completed", 45, demoStaff[1], demoResources[0]),
];
