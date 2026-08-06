import { ContactDetailView } from "@/components/contact-detail-view";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) { return <ContactDetailView contactId={(await params).id} />; }
