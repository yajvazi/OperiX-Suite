"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { resolveWorkspace } from "@invoice-monorepo/api/workspace";
import { createBooking, getBookingSettings, listBookingNotifications, listBookingPayments, listBookings, listCustomers, listLocations, listResources, listServices, listStaff, saveBookingSettings, subscribeToBookings, transitionBooking } from "@invoice-monorepo/booking/api";
import type { BookingCustomer, BookingLocation, BookingNotificationRecord, BookingPaymentRecord, BookingRecord, BookingResource, BookingService, BookingSettings, BookingStaff } from "@invoice-monorepo/booking";
import { createClient } from "./supabase/client";
import { isBookingDemoMode } from "./supabase/config";
import { DEMO_COMPANY_ID, demoBookings, demoCustomers, demoLocations, demoResources, demoServices, demoStaff } from "./demo-data";

interface BookingDataState {
  user: User | null;
  profile: { first_name?: string; last_name?: string; email?: string; active_company_id?: string | null; company_id?: string | null } | null;
  company: { id: string; company_name?: string; name?: string; logo_url?: string; currency?: string } | null;
  companies: { id: string; company_name?: string; name?: string }[];
  companyId: string | null;
  bookings: BookingRecord[];
  customers: BookingCustomer[];
  services: BookingService[];
  locations: BookingLocation[];
  resources: BookingResource[];
  staff: BookingStaff[];
  payments: BookingPaymentRecord[];
  notifications: BookingNotificationRecord[];
  settings: BookingSettings | null;
  loading: boolean;
  error: string;
  demo: boolean;
  refresh: () => Promise<void>;
  refreshBookings: () => Promise<void>;
  addBooking: (input: Parameters<typeof createBooking>[1]) => Promise<BookingRecord>;
  changeStatus: (id: string, status: string, reason?: string) => Promise<void>;
  saveSettings: (changes: Partial<BookingSettings>) => Promise<void>;
}

const BookingDataContext = createContext<BookingDataState | null>(null);

const isDemo = isBookingDemoMode;

export function BookingDataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BookingDataState["profile"]>(null);
  const [company, setCompany] = useState<BookingDataState["company"]>(null);
  const [companies, setCompanies] = useState<BookingDataState["companies"]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [customers, setCustomers] = useState<BookingCustomer[]>([]);
  const [services, setServices] = useState<BookingService[]>([]);
  const [locations, setLocations] = useState<BookingLocation[]>([]);
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [staff, setStaff] = useState<BookingStaff[]>([]);
  const [payments, setPayments] = useState<BookingPaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<BookingNotificationRecord[]>([]);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshBookings = useCallback(async () => {
    if (isDemo) { setBookings(demoBookings); return; }
    const client = createClient();
    if (!client || !companyId) return;
    try {
      const result = await listBookings(client, companyId, { limit: 500 });
      setBookings(result);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Bookings could not be loaded.");
    }
  }, [companyId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    if (isDemo) {
      setUser(null);
      setProfile({ first_name: "John", last_name: "Berisha", email: "john@operix.demo", active_company_id: DEMO_COMPANY_ID });
      setCompany({ id: DEMO_COMPANY_ID, company_name: "OperiX Demo Workspace", name: "OperiX Demo Workspace", currency: "EUR" });
      setCompanies([{ id: DEMO_COMPANY_ID, company_name: "OperiX Demo Workspace", name: "OperiX Demo Workspace" }]);
      setCompanyId(DEMO_COMPANY_ID);
      setBookings(demoBookings); setCustomers(demoCustomers); setServices(demoServices); setLocations(demoLocations); setResources(demoResources); setStaff(demoStaff); setPayments([]); setNotifications([]); setSettings(null);
      setLoading(false);
      return;
    }
    const client = createClient();
    if (!client) { setError("Supabase is not configured. Add the OperiX project URL and publishable key."); setLoading(false); return; }
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) { setError(authError?.message || "Your OperiX session has expired."); setLoading(false); return; }
    try {
      setUser(authData.user);
      const workspace = await resolveWorkspace(client, authData.user.id, { includeSensitiveFields: false });
      const activeCompanyId = workspace.companyId;
      setProfile(workspace.profile);
      setCompany(workspace.company);
      setCompanies(workspace.companies);
      setCompanyId(activeCompanyId);
      const [bookingRows, customerRows, serviceRows, locationRows, resourceRows, staffRows, paymentRows, notificationRows, bookingSettings] = await Promise.all([
        listBookings(client, activeCompanyId, { limit: 500 }),
        listCustomers(client, activeCompanyId),
        listServices(client, activeCompanyId),
        listLocations(client, activeCompanyId),
        listResources(client, activeCompanyId),
        listStaff(client, activeCompanyId),
        listBookingPayments(client, activeCompanyId),
        listBookingNotifications(client, activeCompanyId),
        getBookingSettings(client, activeCompanyId),
      ]);
      setBookings(bookingRows); setCustomers(customerRows); setServices(serviceRows); setLocations(locationRows); setResources(resourceRows); setStaff(staffRows); setPayments(paymentRows); setNotifications(notificationRows); setSettings(bookingSettings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The Booking workspace could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (isDemo || !companyId) return;
    const client = createClient();
    if (!client) return;
    return subscribeToBookings(client, companyId, () => void refreshBookings());
  }, [companyId, refreshBookings]);

  const addBooking = useCallback(async (input: Parameters<typeof createBooking>[1]) => {
    if (isDemo) {
      const selected = demoServices.find((service) => service.id === input.serviceId);
      const guest = input.guestName || "New customer";
      const now = new Date(input.startsAt);
      const ends = input.endsAt || new Date(now.getTime() + (selected?.duration_minutes || 60) * 60000).toISOString();
      const created = { ...demoBookings[0], id: `00000000-0000-4000-8000-${String(demoBookings.length + 700).padStart(12, "0")}`, booking_number: `BK-2026-${String(demoBookings.length + 150).padStart(6, "0")}`, guest_name: guest, customer_id: null, service_id: input.serviceId, starts_at: input.startsAt, ends_at: ends, status: input.status || "confirmed", total_amount: selected?.price || 0, price: selected?.price || 0, service: selected ? { id: selected.id, name: selected.name, duration_minutes: selected.duration_minutes, price: selected.price, currency: selected.currency } : null } as BookingRecord;
      setBookings((current) => [created, ...current]);
      return created;
    }
    const client = createClient();
    if (!client) throw new Error("Supabase is not configured.");
    const created = await createBooking(client, input);
    setBookings((current) => [created, ...current.filter((booking) => booking.id !== created.id)]);
    return created;
  }, []);

  const changeStatus = useCallback(async (id: string, status: string, reason?: string) => {
    if (isDemo) { setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, status: status as BookingRecord["status"] } : booking)); return; }
    const client = createClient();
    if (!client || !companyId) throw new Error("Booking workspace is not ready.");
    const updated = await transitionBooking(client, companyId, id, status, reason);
    setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, ...updated } : booking));
  }, [companyId]);

  const saveSettings = useCallback(async (changes: Partial<BookingSettings>) => {
    if (isDemo) {
      setSettings((current) => ({ ...(current || {}), ...changes, company_id: companyId || DEMO_COMPANY_ID } as BookingSettings));
      return;
    }
    const client = createClient();
    if (!client || !companyId) throw new Error("Booking workspace is not ready.");
    const updated = await saveBookingSettings(client, { ...(settings || {}), ...changes, company_id: companyId });
    setSettings(updated);
  }, [companyId, settings]);

  const value = useMemo(() => ({ user, profile, company, companies, companyId, bookings, customers, services, locations, resources, staff, payments, notifications, settings, loading, error, demo: isDemo, refresh, refreshBookings, addBooking, changeStatus, saveSettings }), [user, profile, company, companies, companyId, bookings, customers, services, locations, resources, staff, payments, notifications, settings, loading, error, refresh, refreshBookings, addBooking, changeStatus, saveSettings]);
  return <BookingDataContext.Provider value={value}>{children}</BookingDataContext.Provider>;
}

export function useBookingData() {
  const context = useContext(BookingDataContext);
  if (!context) throw new Error("useBookingData must be used inside BookingDataProvider");
  return context;
}
