import { Suspense } from "react";
import { TicketsView } from "@/components/tickets-view";

export default function TicketsPage() { return <Suspense fallback={<div className="workspace"><div className="skeleton h-10 w-48 rounded" /></div>}><TicketsView /></Suspense>; }
