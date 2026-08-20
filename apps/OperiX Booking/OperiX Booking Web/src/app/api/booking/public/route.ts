import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";

const publicBookingSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  guestName: z.string().trim().min(1).max(160),
  guestEmail: z.string().trim().email().max(320).nullable().optional(),
  guestPhone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("Public booking is temporarily unavailable.", 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("The booking request is invalid.", 400);
  }

  const parsed = publicBookingSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse("Check the booking details and try again.", 400);
  }

  // Nginx overwrites X-Real-IP from the socket address. Behind Cloudflare it
  // is the client address after the configured Cloudflare real-IP ranges are
  // trusted; arbitrary browser-supplied forwarding headers are not used.
  const clientAddress = request.headers.get("x-real-ip")?.trim() || "unknown";
  const rateKey = createHash("sha256").update(clientAddress).digest("hex");
  const serverSupabaseUrl = process.env.SUPABASE_INTERNAL_URL?.trim() || supabaseUrl;
  const adminClient = createClient(serverSupabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { "x-operix-booking-rate-key": rateKey } },
  });

  const { data, error } = await adminClient.rpc("booking_public_create", {
    p_slug: parsed.data.slug,
    p_service_id: parsed.data.serviceId,
    p_location_id: parsed.data.locationId || null,
    p_staff_id: parsed.data.staffId || null,
    p_starts_at: parsed.data.startsAt,
    p_guest_name: parsed.data.guestName,
    p_guest_email: parsed.data.guestEmail || null,
    p_guest_phone: parsed.data.guestPhone || null,
    p_notes: parsed.data.notes || null,
  });

  if (error) {
    if (error.code === "42900") return errorResponse("Too many booking attempts. Please try again later.", 429);
    if (error.code === "23P01") return errorResponse("This time slot is no longer available. Choose another time.", 409);
    if (error.code === "42501") return errorResponse(error.message || "Public booking is not available.", 403);
    return errorResponse("The booking could not be created. Please check the details and try again.", 422);
  }

  const booking = data as { id?: string; booking_number?: string; status?: string } | null;
  return NextResponse.json({
    id: booking?.id || null,
    bookingNumber: booking?.booking_number || null,
    status: booking?.status || "pending",
  }, { status: 201 });
}
