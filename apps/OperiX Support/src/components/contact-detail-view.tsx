"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, UserRound } from "lucide-react";
import { PageHeader } from "./page-header";

type Contact = { id: string; display_name: string; email: string | null; phone: string | null; organization_name: string | null; contact_kind: string; notes: string | null; linked_entity_type: string | null; linked_entity_id: string | null };
type Ticket = { id: string; ticket_number: string; subject: string; status: string; priority: string };

export function ContactDetailView({ contactId }: { contactId: string }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/contacts/${contactId}`).then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: Contact; tickets: Ticket[] }> }).then((result) => { setContact(result.data); setTickets(result.tickets ?? []); }).catch(() => setError("Unable to load contact.")); }, [contactId]);
  if (error) return <div className="workspace"><Link href="/contacts" className="muted inline-flex items-center gap-2 text-xs"><ArrowLeft size={15} />Back to contacts</Link><p className="mt-5 text-sm text-[#b42318]">{error}</p></div>;
  if (!contact) return <div className="workspace"><div className="skeleton h-8 w-64 rounded" /></div>;
  return <div className="workspace"><Link href="/contacts" className="muted inline-flex items-center gap-2 text-xs hover:text-[var(--blue)]"><ArrowLeft size={15} />Back to contacts</Link><PageHeader title={contact.display_name} description={`${contact.contact_kind.replaceAll("_", " ")} contact`} /><div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]"><section className="card p-5"><div className="grid size-12 place-items-center rounded-2xl bg-[#edf4ff] text-[var(--blue)]"><UserRound size={22} /></div><div className="mt-4 grid gap-3 text-xs">{contact.email ? <a className="flex items-center gap-2 text-[var(--blue)] hover:underline" href={`mailto:${contact.email}`}><Mail size={15} />{contact.email}</a> : null}{contact.phone ? <a className="flex items-center gap-2 text-[var(--blue)] hover:underline" href={`tel:${contact.phone}`}><Phone size={15} />{contact.phone}</a> : null}{contact.organization_name ? <p className="muted">{contact.organization_name}</p> : null}</div>{contact.notes ? <p className="muted mt-5 whitespace-pre-wrap border-t border-[var(--border)] pt-4 text-xs leading-5">{contact.notes}</p> : null}</section><section className="card p-5"><h2 className="text-sm font-semibold">Related tickets</h2>{tickets.length ? <div className="mt-4 grid gap-2">{tickets.map((ticket) => <Link className="rounded-lg border border-[var(--border)] p-3 hover:border-[#bfd3ff]" href={`/tickets/${ticket.id}`} key={ticket.id}><strong className="text-xs text-[var(--blue)]">{ticket.ticket_number}</strong><span className="mt-1 block text-xs">{ticket.subject}</span></Link>)}</div> : <p className="muted mt-4 text-xs">Related tickets will appear here.</p>}</section></div></div>;
}
