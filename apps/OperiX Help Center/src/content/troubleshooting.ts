import type { TroubleshootingCategory } from "./types";

export const troubleshootingCategories: TroubleshootingCategory[] = [
  "Login Problems",
  "Account Problems",
  "Payments",
  "Invoice Issues",
  "HR Issues",
  "Booking Issues",
  "Desk Issues",
  "Sync Problems",
  "Mobile App Problems",
  "Email Problems",
  "Integrations",
].map((name, order) => ({ slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, order }));
