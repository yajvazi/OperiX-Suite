import { BookOpen, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function HelpPage() {
  return <div className="workspace">
    <PageHeader title="Help" description="Quick guidance for operating the OperiX Support workspace." />
    <div className="grid gap-5 md:grid-cols-3">
      <section className="card p-5"><BookOpen size={18} className="text-[var(--blue)]" /><h2 className="mt-4 text-sm font-semibold">Ticket workflow</h2><p className="muted mt-2 text-xs leading-5">Use statuses to show who owns the next action. Public replies are sent through the mailbox SMTP queue; internal notes remain visible only to Support users.</p></section>
      <section className="card p-5"><Mail size={18} className="text-[var(--blue)]" /><h2 className="mt-4 text-sm font-semibold">Email operations</h2><p className="muted mt-2 text-xs leading-5">Configure IMAP IDLE, SMTP, mailbox routing, and application ticket prefixes from Settings. The worker handles retries and duplicate protection.</p></section>
      <section className="card p-5"><ShieldCheck size={18} className="text-[var(--blue)]" /><h2 className="mt-4 text-sm font-semibold">Permissions</h2><p className="muted mt-2 text-xs leading-5">Support agents are existing OperiX users. Grant Support permissions through the shared RBAC system; no separate agent records are created.</p></section>
    </div>
  </div>;
}
