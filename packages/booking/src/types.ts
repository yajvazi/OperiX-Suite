export const BOOKING_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_PAYMENT_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
  "partially_refunded",
  "failed",
] as const;

export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export type BookingSource = "admin" | "public" | "mobile" | "import" | "api";

export type BookingScopeType = "organization" | "location" | "staff" | "resource";

export interface BookingRecord {
  id: string;
  company_id: string;
  booking_number: string;
  customer_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  service_id: string;
  location_id: string | null;
  resource_id: string | null;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  duration_minutes: number;
  quantity: number;
  participant_count: number;
  price: number;
  discount_amount: number;
  tax_amount: number;
  deposit_amount: number;
  total_amount: number;
  paid_amount: number;
  currency: string;
  payment_status: BookingPaymentStatus;
  status: BookingStatus;
  notes: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  source: BookingSource;
  recurrence_rule: string | null;
  recurrence_series_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  service?: Pick<BookingService, "id" | "name" | "duration_minutes" | "price" | "currency"> | null;
  customer?: Pick<BookingCustomer, "id" | "name" | "email" | "phone"> | null;
  staff?: Pick<BookingStaff, "id" | "display_name" | "role_title"> | null;
  resource?: Pick<BookingResource, "id" | "name" | "resource_type"> | null;
  location?: Pick<BookingLocation, "id" | "name" | "timezone"> | null;
}

export interface BookingCustomer {
  id: string;
  company_id?: string | null;
  user_id?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface BookingServiceCategory {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export type DepositType = "none" | "fixed" | "percentage";

export interface BookingService {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  tax_rate: number;
  deposit_type: DepositType;
  deposit_value: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_participants: number;
  max_participants: number;
  min_notice_minutes: number;
  max_advance_days: number;
  is_active: boolean;
  image_url: string | null;
}

export interface BookingLocation {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
}

export type BookingResourceStatus = "active" | "unavailable" | "maintenance";

export interface BookingResource {
  id: string;
  company_id: string;
  location_id: string | null;
  name: string;
  resource_type: string;
  description: string | null;
  capacity: number;
  status: BookingResourceStatus;
  price_override: number | null;
  is_active: boolean;
}

export interface BookingStaff {
  id: string;
  company_id: string;
  employee_id: string | null;
  user_id: string | null;
  display_name: string;
  role_title: string | null;
  is_active: boolean;
}

export interface BookingSettings {
  company_id: string;
  timezone: string;
  currency: string;
  time_format: "12h" | "24h";
  date_format: string;
  first_day_of_week: number;
  auto_confirm: boolean;
  require_customer_email: boolean;
  require_customer_phone: boolean;
  allow_customer_cancellation: boolean;
  allow_customer_rescheduling: boolean;
  cancellation_cutoff_minutes: number;
  reschedule_cutoff_minutes: number;
  minimum_booking_notice_minutes: number;
  maximum_advance_booking_days: number;
  public_enabled: boolean;
  public_slug: string | null;
  public_description: string | null;
  public_logo_url: string | null;
  public_primary_color: string;
}

export interface BookingActivity {
  id: string;
  booking_id: string;
  action: string;
  actor_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface BookingPaymentRecord {
  id: string;
  company_id: string;
  booking_id: string;
  amount: number;
  currency: string;
  method: "cash" | "card" | "bank_transfer" | "online" | "manual";
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  provider: string | null;
  external_reference: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface BookingNotificationRecord {
  id: string;
  company_id: string;
  booking_id: string | null;
  channel: "in_app" | "email" | "push" | "sms" | "webhook";
  event_type: string;
  recipient: string | null;
  status: "queued" | "sent" | "delivered" | "failed" | "skipped";
  sent_at: string | null;
  created_at: string;
}

export interface BookingFilters {
  from?: string;
  to?: string;
  status?: BookingStatus | "all";
  paymentStatus?: BookingPaymentStatus | "all";
  serviceId?: string;
  locationId?: string;
  staffId?: string;
  resourceId?: string;
  search?: string;
  limit?: number;
}

export interface BookingCreateInput {
  companyId: string;
  customerId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  serviceId: string;
  locationId?: string | null;
  resourceId?: string | null;
  staffId?: string | null;
  startsAt: string;
  endsAt?: string | null;
  quantity?: number;
  participantCount?: number;
  status?: Extract<BookingStatus, "pending" | "confirmed">;
  notes?: string | null;
  internalNotes?: string | null;
  customerNotes?: string | null;
  source?: BookingSource;
  recurrenceRule?: string | null;
  recurrenceSeriesId?: string | null;
}

export interface BookingRescheduleInput {
  bookingId: string;
  companyId: string;
  startsAt: string;
  endsAt?: string | null;
  reason?: string | null;
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  available: boolean;
  resourceId?: string | null;
  staffId?: string | null;
}

export interface AvailabilityQuery {
  companyId: string;
  serviceId: string;
  date: string;
  locationId?: string | null;
  resourceId?: string | null;
  staffId?: string | null;
  participantCount?: number;
  publicSlug?: string | null;
}

export interface DashboardSummary {
  totalBookings: number;
  todayBookings: number;
  upcomingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  revenue: number;
  currency: string;
}
