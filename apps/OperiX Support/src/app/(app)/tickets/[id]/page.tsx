import { TicketDetailView } from "@/components/ticket-detail-view";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) { return <TicketDetailView ticketId={(await params).id} />; }
