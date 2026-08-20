import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useAuth } from '@invoice-monorepo/hooks';
import { resolveWorkspace } from '@invoice-monorepo/api/workspace';
import { supabase } from '@invoice-monorepo/api';
import { createBooking, listBookings, listCustomers, listLocations, listResources, listServices, listStaff, subscribeToBookings } from '@invoice-monorepo/booking/api';
import type { BookingCustomer, BookingLocation, BookingRecord, BookingResource, BookingService, BookingStaff } from '@invoice-monorepo/booking';
import type { BookingCreateInput } from '@invoice-monorepo/booking/types';

type BookingMobileState = {
  user: User | null;
  companyId: string | null;
  companyName: string;
  bookings: BookingRecord[];
  customers: BookingCustomer[];
  services: BookingService[];
  locations: BookingLocation[];
  resources: BookingResource[];
  staff: BookingStaff[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  addBooking: (input: BookingCreateInput) => Promise<BookingRecord>;
};

const BookingMobileContext = createContext<BookingMobileState | null>(null);

export function BookingMobileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('OperiX Booking');
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [customers, setCustomers] = useState<BookingCustomer[]>([]);
  const [services, setServices] = useState<BookingService[]>([]);
  const [locations, setLocations] = useState<BookingLocation[]>([]);
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [staff, setStaff] = useState<BookingStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setLoading(false); setCompanyId(null); return; }
    setLoading(true); setError('');
    try {
      const workspace = await resolveWorkspace(supabase, user.id, { includeSensitiveFields: false });
      setCompanyId(workspace.companyId);
      setCompanyName(workspace.company?.company_name || workspace.company?.name || 'OperiX Booking');
      const [bookingRows, customerRows, serviceRows, locationRows, resourceRows, staffRows] = await Promise.all([
        listBookings(supabase, workspace.companyId, { limit: 500 }),
        listCustomers(supabase, workspace.companyId),
        listServices(supabase, workspace.companyId),
        listLocations(supabase, workspace.companyId),
        listResources(supabase, workspace.companyId),
        listStaff(supabase, workspace.companyId),
      ]);
      setBookings(bookingRows); setCustomers(customerRows); setServices(serviceRows); setLocations(locationRows); setResources(resourceRows); setStaff(staffRows);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Booking data could not be loaded.'); }
    finally { setLoading(false); }
  }, [authLoading, user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const activeCompanyId = companyId;
    if (!activeCompanyId || !user) return;
    return subscribeToBookings(supabase, activeCompanyId, () => void refresh());
  }, [companyId, refresh, user]);

  const addBooking = useCallback(async (input: BookingCreateInput) => {
    const created = await createBooking(supabase, input);
    setBookings((current) => [created, ...current]);
    return created;
  }, []);

  const value = useMemo(() => ({ user, companyId, companyName, bookings, customers, services, locations, resources, staff, loading, error, refresh, addBooking }), [user, companyId, companyName, bookings, customers, services, locations, resources, staff, loading, error, refresh, addBooking]);
  return <BookingMobileContext.Provider value={value}>{children}</BookingMobileContext.Provider>;
}

export function useBookingMobile() {
  const context = useContext(BookingMobileContext);
  if (!context) throw new Error('useBookingMobile must be used inside BookingMobileProvider');
  return context;
}
