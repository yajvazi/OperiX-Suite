export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  waiting_on_customer: "Waiting on Customer",
  waiting_on_agent: "Waiting on Agent",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  archived: "Archived",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
  critical: "Critical",
};

export function labelFor(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value.replaceAll("_", " ").replace(/(^| )\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
