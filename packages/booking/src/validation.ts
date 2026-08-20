import { z } from "zod";
import { BOOKING_STATUSES, BOOKING_PAYMENT_STATUSES } from "./types";

const nullableText = z.string().trim().max(2000).nullable().optional();

export const bookingCreateSchema = z.object({
  companyId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  guestName: z.string().trim().min(1).max(160).nullable().optional(),
  guestEmail: z.string().trim().email().max(320).nullable().optional(),
  guestPhone: z.string().trim().max(40).nullable().optional(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  resourceId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  participantCount: z.number().int().min(1).max(10000).optional(),
  status: z.enum(["pending", "confirmed"]).optional(),
  notes: nullableText,
  internalNotes: nullableText,
  customerNotes: nullableText,
  source: z.enum(["admin", "public", "mobile", "import", "api"]).optional(),
  recurrenceRule: z.string().trim().max(500).nullable().optional(),
  recurrenceSeriesId: z.string().uuid().nullable().optional(),
}).superRefine((input, context) => {
  const hasCustomer = Boolean(input.customerId || input.guestName?.trim());
  if (!hasCustomer) context.addIssue({ code: "custom", path: ["guestName"], message: "Choose a customer or enter a guest name." });
  if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
  }
});

export const bookingUpdateSchema = z.object({
  bookingId: z.string().uuid(),
  companyId: z.string().uuid(),
  notes: nullableText,
  internalNotes: nullableText,
  customerNotes: nullableText,
  customerId: z.string().uuid().nullable().optional(),
  guestName: z.string().trim().min(1).max(160).nullable().optional(),
  guestEmail: z.string().trim().email().max(320).nullable().optional(),
  guestPhone: z.string().trim().max(40).nullable().optional(),
});

export const customerCreateSchema = z.object({
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  notes: nullableText,
});

export const serviceCreateSchema = z.object({
  companyId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: nullableText,
  durationMinutes: z.number().int().min(5).max(24 * 60),
  price: z.number().finite().min(0).max(100000000),
  currency: z.string().length(3).toUpperCase().default("EUR"),
  taxRate: z.number().finite().min(0).max(100).default(0),
  depositType: z.enum(["none", "fixed", "percentage"]).default("none"),
  depositValue: z.number().finite().min(0).default(0),
  bufferBeforeMinutes: z.number().int().min(0).max(1440).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(1440).default(0),
  minParticipants: z.number().int().min(1).max(10000).default(1),
  maxParticipants: z.number().int().min(1).max(10000).default(1),
}).superRefine((input, context) => {
  if (input.maxParticipants < input.minParticipants) context.addIssue({ code: "custom", path: ["maxParticipants"], message: "Maximum participants must be at least the minimum." });
  if (input.depositType === "percentage" && input.depositValue > 100) context.addIssue({ code: "custom", path: ["depositValue"], message: "Percentage deposits cannot exceed 100%." });
});

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const bookingPaymentStatusSchema = z.enum(BOOKING_PAYMENT_STATUSES);

export type BookingCreateValues = z.infer<typeof bookingCreateSchema>;
export type CustomerCreateValues = z.infer<typeof customerCreateSchema>;
export type ServiceCreateValues = z.infer<typeof serviceCreateSchema>;
