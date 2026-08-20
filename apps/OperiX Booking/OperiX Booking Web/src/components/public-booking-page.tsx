"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { getAvailableSlots, getPublicBookingCatalog } from "@invoice-monorepo/booking/api";
import { createClient } from "@/lib/supabase/client";
import { BookingLogo } from "./product-logo";
import { isBookingDemoMode } from "@/lib/supabase/config";

type Catalog = { available: boolean; companyId?: string; businessName?: string; description?: string | null; primaryColor?: string; timezone?: string; currency?: string; services?: { id: string; name: string; description?: string; durationMinutes: number; price: number; currency: string; maxParticipants: number }[]; locations?: { id: string; name: string; address?: string; timezone?: string }[]; staff?: { id: string; displayName: string; roleTitle?: string }[] };

const demoCatalog: Catalog = { available: true, companyId: "00000000-0000-4000-8000-000000000001", businessName: "OperiX Demo Workspace", description: "Choose a time that works for you. We’ll take care of the rest.", primaryColor: "#004FFE", currency: "EUR", timezone: "Europe/Belgrade", services: [{ id: "00000000-0000-4000-8000-000000000101", name: "Business Meeting Room", description: "Bright room with video conferencing.", durationMinutes: 60, price: 45, currency: "EUR", maxParticipants: 8 }, { id: "00000000-0000-4000-8000-000000000103", name: "Dental Consultation", description: "New patient consultation with Dr. Arta.", durationMinutes: 45, price: 60, currency: "EUR", maxParticipants: 1 }], locations: [{ id: "00000000-0000-4000-8000-000000000301", name: "Prishtina Center", address: "Garibaldi 12, Prishtina", timezone: "Europe/Belgrade" }], staff: [{ id: "00000000-0000-4000-8000-000000000501", displayName: "Dr. Arta Berisha", roleTitle: "Dental provider" }] };
const publicDate = () => { const date = new Date(); date.setDate(date.getDate() + 1); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const publicTime = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

export function PublicBookingPage({ slug }: { slug: string }) {
  const demo = isBookingDemoMode;
  const [catalog, setCatalog] = useState<Catalog | null>(demo ? demoCatalog : null);
  const [serviceId, setServiceId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(publicDate());
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ startsAt: string; endsAt: string; available: boolean }[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState(1);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const selectedService = catalog?.services?.find((service) => service.id === serviceId);

  useEffect(() => { if (!demo) { const client = createClient(); if (client) void getPublicBookingCatalog(client, slug).then((value) => setCatalog(value as Catalog)).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "This booking page is unavailable.")); } }, [demo, slug]);
  useEffect(() => { if (!catalog?.services?.length) return; if (!serviceId) setServiceId(catalog.services[0].id); if (!locationId && catalog.locations?.length) setLocationId(catalog.locations[0].id); }, [catalog, locationId, serviceId]);
  useEffect(() => {
    if (!catalog?.companyId || !serviceId || !date) return;
    if (demo) { setSlots(["09:00", "09:30", "10:30", "11:30", "13:00", "14:30"].map((value) => ({ startsAt: publicTime(date, value), endsAt: publicTime(date, value), available: true }))); return; }
    const client = createClient(); if (!client) return;
    void getAvailableSlots(client, { companyId: catalog.companyId, serviceId, date, locationId: locationId || null, staffId: staffId || null, publicSlug: slug }).then(setSlots).catch(() => setSlots([]));
  }, [catalog?.companyId, date, demo, locationId, serviceId, staffId, slug]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!catalog?.companyId || !serviceId || !time || !name.trim()) {
      setError("Choose a time and add your name to continue.");
      return;
    }
    try {
      if (!demo) {
        const response = await fetch("/api/booking/public", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug,
            serviceId,
            locationId: locationId || null,
            staffId: staffId || null,
            startsAt: time,
            guestName: name,
            guestEmail: email || null,
            guestPhone: phone || null,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "This time slot is no longer available.");
      }
      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "This time slot is no longer available.");
    }
  }
  if (success) return <main className="public-page" style={{ "--public-blue": catalog?.primaryColor || "#004FFE" } as React.CSSProperties}><div className="public-success"><span className="public-success-icon"><Check size={28} /></span><span className="eyebrow">Booking request received</span><h1>You’re all set.</h1><p>{catalog?.businessName} will confirm the reservation and send details to {email || "your contact details"}.</p><div className="public-confirmation"><div><span>Service</span><strong>{selectedService?.name}</strong></div><div><span>Date</span><strong>{date}</strong></div><div><span>Time</span><strong>{new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong></div></div><button className="public-button" onClick={() => { setSuccess(false); setStep(1); }}>Book another time</button></div></main>;
  if (!catalog?.available && !demo) return <main className="public-page"><div className="public-error"><Sparkles size={24} /><h1>This booking page is unavailable.</h1><p>The business may have paused online booking or the link may be out of date.</p></div></main>;
  return <main className="public-page" style={{ "--public-blue": catalog?.primaryColor || "#004FFE" } as React.CSSProperties}><div className="public-shell"><header className="public-header"><div className="public-brand"><BookingLogo /><span className="public-brand-context"><strong>{catalog?.businessName || "OperiX Booking"}</strong><small>Online booking</small></span></div><span className="public-secure"><ShieldCheck size={15} /> Secure booking</span></header><div className="public-hero"><span className="eyebrow">Book your time</span><h1>{catalog?.businessName || "Choose a time that works for you."}</h1><p>{catalog?.description || "Choose a service, find an available time, and we’ll keep you posted."}</p></div><div className="public-flow"><div className="public-steps">{["Service", "Time", "Details"].map((label, index) => <span key={label} className={step > index + 1 ? "done" : step === index + 1 ? "current" : ""}><i>{step > index + 1 ? <Check size={12} /> : index + 1}</i>{label}</span>)}</div>{step === 1 && <div className="public-step-content"><h2>What would you like to book?</h2><div className="public-service-grid">{catalog?.services?.map((service) => <button key={service.id} className={`public-service ${service.id === serviceId ? "selected" : ""}`} onClick={() => setServiceId(service.id)}><span><Sparkles size={17} /></span><div><strong>{service.name}</strong><small>{service.durationMinutes} min · {money(service.price, service.currency)}</small></div><ChevronRight size={16} /></button>)}</div><button className="public-button public-next" onClick={() => setStep(2)}>Choose a time <ChevronRight size={16} /></button></div>}{step === 2 && <div className="public-step-content"><button className="public-back" onClick={() => setStep(1)}><ChevronLeft size={15} /> Services</button><h2>Find an available time</h2><div className="public-form-row"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{(catalog?.locations?.length || 0) > 1 && <label>Location<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{catalog?.locations?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}</div><div className="public-slots">{slots.filter((slot) => slot.available).map((slot) => { const label = new Date(slot.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); return <button key={slot.startsAt} className={label === time ? "selected" : ""} onClick={() => setTime(slot.startsAt)}><Clock3 size={14} />{label}</button>; })}</div>{!slots.length && <p className="public-muted">No availability for this day. Try another date.</p>}<button className="public-button public-next" onClick={() => time && setStep(3)}>Continue <ChevronRight size={16} /></button></div>}{step === 3 && <form className="public-step-content" onSubmit={submit}><button type="button" className="public-back" onClick={() => setStep(2)}><ChevronLeft size={15} /> Time</button><h2>Your details</h2><p className="public-muted">We’ll use this to send your confirmation and any changes.</p><div className="public-form-row"><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" /></label></div><label className="public-full-label">Phone <span>optional</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+383…" /></label>{error && <p className="public-form-error" role="alert">{error}</p>}<button className="public-button public-next" type="submit">Request booking <Check size={16} /></button></form>}</div><footer className="public-footer"><span>Powered by <strong>OperiX Booking</strong></span><span><MapPin size={13} />{catalog?.timezone || "Your local time"}</span></footer></div></main>;
}

function money(amount: number, currency: string) { return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
