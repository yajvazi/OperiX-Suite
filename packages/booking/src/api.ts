import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingCreateSchema, customerCreateSchema, serviceCreateSchema } from "./validation";
import type {
  AvailabilityQuery,
  AvailabilitySlot,
  BookingCreateInput,
  BookingFilters,
  BookingRecord,
  BookingRescheduleInput,
  BookingService,
  BookingCustomer,
  BookingLocation,
  BookingResource,
  BookingStaff,
  BookingPaymentRecord,
  BookingNotificationRecord,
  BookingSettings,
} from "./types";

export type BookingSupabaseClient = SupabaseClient<any, "public", any>;

async function unwrap<T>(request: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const bookingSelect = `
  *,
  service:booking_services(id,name,duration_minutes,price,currency),
  staff:booking_staff(id,display_name,role_title),
  resource:booking_resources(id,name,resource_type),
  location:booking_locations(id,name,timezone)
`;

async function hydrateBookingCustomers(client: BookingSupabaseClient, companyId: string, bookings: BookingRecord[]) {
  const customerIds = [...new Set(bookings.map((booking) => booking.customer_id).filter((id): id is string => Boolean(id)))];
  if (!customerIds.length) return bookings;
  const rows = await unwrap(client.rpc("booking_list_customers", {
    p_company_id: companyId,
    p_search: null,
    p_limit: 1000,
    p_customer_ids: customerIds,
  })) as Array<BookingCustomer & { company_name?: string | null }>;
  const byId = new Map((rows || []).map((row) => [row.id, { ...row, company: row.company || row.company_name || null }]));
  return bookings.map((booking) => ({ ...booking, customer: booking.customer_id ? byId.get(booking.customer_id) || null : null }));
}

export async function listBookings(client: BookingSupabaseClient, companyId: string, filters: BookingFilters = {}): Promise<BookingRecord[]> {
  let query = client.from("bookings").select(bookingSelect).eq("company_id", companyId).order("starts_at", { ascending: true }).limit(filters.limit || 200);
  if (filters.from) query = query.gte("starts_at", filters.from);
  if (filters.to) query = query.lt("starts_at", filters.to);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.paymentStatus && filters.paymentStatus !== "all") query = query.eq("payment_status", filters.paymentStatus);
  if (filters.serviceId) query = query.eq("service_id", filters.serviceId);
  if (filters.locationId) query = query.eq("location_id", filters.locationId);
  if (filters.staffId) query = query.eq("staff_id", filters.staffId);
  if (filters.resourceId) query = query.eq("resource_id", filters.resourceId);
  if (filters.search?.trim()) {
    const escaped = filters.search.trim().replace(/[%(),]/g, " ");
    query = query.or(`booking_number.ilike.%${escaped}%,guest_name.ilike.%${escaped}%,guest_email.ilike.%${escaped}%`);
  }
  const rows = await unwrap(query) as BookingRecord[];
  return hydrateBookingCustomers(client, companyId, rows);
}

export async function getBooking(client: BookingSupabaseClient, companyId: string, id: string): Promise<BookingRecord> {
  const row = await unwrap(client.from("bookings").select(`${bookingSelect},activity:booking_audit_log(id,action,actor_user_id,details,created_at)`).eq("company_id", companyId).eq("id", id).single()) as BookingRecord;
  return (await hydrateBookingCustomers(client, companyId, [row]))[0];
}

export async function createBooking(client: BookingSupabaseClient, input: BookingCreateInput): Promise<BookingRecord> {
  const parsed = bookingCreateSchema.parse(input);
  return unwrap(client.rpc("booking_create", {
    p_company_id: parsed.companyId,
    p_customer_id: parsed.customerId || null,
    p_guest_name: parsed.guestName || null,
    p_guest_email: parsed.guestEmail || null,
    p_guest_phone: parsed.guestPhone || null,
    p_service_id: parsed.serviceId,
    p_location_id: parsed.locationId || null,
    p_resource_id: parsed.resourceId || null,
    p_staff_id: parsed.staffId || null,
    p_starts_at: parsed.startsAt,
    p_ends_at: parsed.endsAt || null,
    p_quantity: parsed.quantity || 1,
    p_participant_count: parsed.participantCount || 1,
    p_requested_status: parsed.status || "confirmed",
    p_notes: parsed.notes || null,
    p_internal_notes: parsed.internalNotes || null,
    p_customer_notes: parsed.customerNotes || null,
    p_source: parsed.source || "admin",
    p_recurrence_rule: parsed.recurrenceRule || null,
    p_recurrence_series_id: parsed.recurrenceSeriesId || null,
  })) as Promise<BookingRecord>;
}

export async function transitionBooking(client: BookingSupabaseClient, companyId: string, bookingId: string, status: string, reason?: string | null): Promise<BookingRecord> {
  return unwrap(client.rpc("booking_transition", { p_company_id: companyId, p_booking_id: bookingId, p_next_status: status, p_reason: reason || null })) as Promise<BookingRecord>;
}

export async function rescheduleBooking(client: BookingSupabaseClient, input: BookingRescheduleInput): Promise<BookingRecord> {
  return unwrap(client.rpc("booking_reschedule", {
    p_company_id: input.companyId,
    p_booking_id: input.bookingId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt || null,
    p_reason: input.reason || null,
  })) as Promise<BookingRecord>;
}

export async function getAvailableSlots(client: BookingSupabaseClient, input: AvailabilityQuery): Promise<AvailabilitySlot[]> {
  const rows = await unwrap(client.rpc("booking_get_available_slots", {
    p_company_id: input.companyId,
    p_service_id: input.serviceId,
    p_date: input.date,
    p_location_id: input.locationId || null,
    p_resource_id: input.resourceId || null,
    p_staff_id: input.staffId || null,
    p_participant_count: input.participantCount || 1,
    p_public_slug: input.publicSlug || null,
  })) as Array<{ starts_at: string; ends_at: string; available: boolean; capacity_remaining?: number | null }>;
  return (rows || []).map((row) => ({
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    available: row.available,
    resourceId: input.resourceId || null,
    staffId: input.staffId || null,
  }));
}

export async function listCustomers(client: BookingSupabaseClient, companyId: string, search = ""): Promise<BookingCustomer[]> {
  const rows = await unwrap(client.rpc("booking_list_customers", {
    p_company_id: companyId,
    p_search: search.trim() || null,
    p_limit: 100,
  })) as Array<BookingCustomer & { company_name?: string | null }>;
  return (rows || []).map((row) => ({ ...row, company: row.company || row.company_name || null }));
}

export async function createCustomer(client: BookingSupabaseClient, input: { companyId: string; userId: string; name: string; email?: string | null; phone?: string | null; company?: string | null; notes?: string | null }): Promise<BookingCustomer> {
  const parsed = customerCreateSchema.parse(input);
  return unwrap(client.rpc("booking_create_customer", {
    p_company_id: parsed.companyId,
    p_name: parsed.name,
    p_email: parsed.email || null,
    p_phone: parsed.phone || null,
    p_company: parsed.company || null,
    p_notes: parsed.notes || null,
  })) as Promise<BookingCustomer>;
}

export async function listServices(client: BookingSupabaseClient, companyId: string): Promise<BookingService[]> {
  return unwrap(client.from("booking_services").select("*").eq("company_id", companyId).eq("is_active", true).order("name")) as Promise<BookingService[]>;
}

export async function createService(client: BookingSupabaseClient, input: Record<string, unknown>): Promise<BookingService> {
  const parsed = serviceCreateSchema.parse(input);
  return unwrap(client.from("booking_services").insert({
    company_id: parsed.companyId,
    category_id: parsed.categoryId || null,
    name: parsed.name,
    description: parsed.description || null,
    duration_minutes: parsed.durationMinutes,
    price: parsed.price,
    currency: parsed.currency,
    tax_rate: parsed.taxRate,
    deposit_type: parsed.depositType,
    deposit_value: parsed.depositValue,
    buffer_before_minutes: parsed.bufferBeforeMinutes,
    buffer_after_minutes: parsed.bufferAfterMinutes,
    min_participants: parsed.minParticipants,
    max_participants: parsed.maxParticipants,
  }).select("*").single()) as Promise<BookingService>;
}

export async function listLocations(client: BookingSupabaseClient, companyId: string): Promise<BookingLocation[]> {
  return unwrap(client.from("booking_locations").select("*").eq("company_id", companyId).eq("is_active", true).order("name")) as Promise<BookingLocation[]>;
}

export async function listResources(client: BookingSupabaseClient, companyId: string): Promise<BookingResource[]> {
  return unwrap(client.from("booking_resources").select("*").eq("company_id", companyId).eq("is_active", true).order("name")) as Promise<BookingResource[]>;
}

export async function listStaff(client: BookingSupabaseClient, companyId: string): Promise<BookingStaff[]> {
  return unwrap(client.from("booking_staff").select("*").eq("company_id", companyId).eq("is_active", true).order("display_name")) as Promise<BookingStaff[]>;
}

export async function listBookingPayments(client: BookingSupabaseClient, companyId: string): Promise<BookingPaymentRecord[]> {
  return unwrap(client.from("booking_payments").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500)) as Promise<BookingPaymentRecord[]>;
}

export async function listBookingNotifications(client: BookingSupabaseClient, companyId: string): Promise<BookingNotificationRecord[]> {
  return unwrap(client.from("booking_notification_log").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200)) as Promise<BookingNotificationRecord[]>;
}

export async function getBookingSettings(client: BookingSupabaseClient, companyId: string): Promise<BookingSettings | null> {
  const result = await client.from("booking_settings").select("*").eq("company_id", companyId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as BookingSettings | null;
}

export async function saveBookingSettings(client: BookingSupabaseClient, settings: Partial<BookingSettings> & { company_id: string }): Promise<BookingSettings> {
  return unwrap(client.from("booking_settings").upsert(settings, { onConflict: "company_id" }).select("*").single()) as Promise<BookingSettings>;
}

export function subscribeToBookings(client: BookingSupabaseClient, companyId: string, onChange: () => void) {
  const channel = client.channel(`booking-sync:${companyId}`).on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `company_id=eq.${companyId}` }, onChange).subscribe();
  return () => { void client.removeChannel(channel); };
}

export async function getPublicBookingCatalog(client: BookingSupabaseClient, slug: string) {
  return unwrap(client.rpc("booking_get_public_catalog", { p_slug: slug }));
}

export async function createPublicBooking(client: BookingSupabaseClient, input: { slug: string; serviceId: string; locationId?: string | null; staffId?: string | null; startsAt: string; guestName: string; guestEmail?: string | null; guestPhone?: string | null; notes?: string | null }) {
  return unwrap(client.rpc("booking_public_create", {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_location_id: input.locationId || null,
    p_staff_id: input.staffId || null,
    p_starts_at: input.startsAt,
    p_guest_name: input.guestName,
    p_guest_email: input.guestEmail || null,
    p_guest_phone: input.guestPhone || null,
    p_notes: input.notes || null,
  }));
}
