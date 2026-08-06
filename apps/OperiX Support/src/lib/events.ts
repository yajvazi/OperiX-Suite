import { labelFor, PRIORITY_LABELS, STATUS_LABELS } from "./format";

type TimelineEvent = { event_name: string; payload?: Record<string, unknown>; created_at: string; ticket_number?: string };

export function describeEvent(event: TimelineEvent): string {
  const payload = event.payload ?? {};
  switch (event.event_name) {
    case "ticket_created": return `Ticket ${String(payload.ticket_number ?? event.ticket_number ?? "")} created`;
    case "assignment_changed": return payload.agent_id ? "Ticket assigned to an agent" : "Ticket unassigned";
    case "department_changed": return "Department changed";
    case "status_changed": return `Status changed to ${STATUS_LABELS[String(payload.status)] ?? String(payload.status ?? "unknown")}`;
    case "priority_changed": return `Priority changed to ${PRIORITY_LABELS[String(payload.priority)] ?? String(payload.priority ?? "unknown")}`;
    case "category_changed": return "Category changed";
    case "reply_created": return "Public reply added";
    case "note_created": return "Internal note added";
    case "attachment_uploaded": return `Attachment ${String(payload.filename ?? "uploaded")}`;
    case "ticket_closed": return "Ticket closed";
    case "ticket_reopened": return "Ticket reopened";
    case "email_received": return "Email received";
    case "email_queued": return "Email queued";
    case "email_sent": return "Email sent";
    case "email_retrying": return "Email delivery retrying";
    case "email_delivery_failed": return "Email delivery failed";
    case "email_bounced": return "Email bounced";
    default: return labelFor(event.event_name, {});
  }
}
