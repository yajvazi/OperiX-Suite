import type { ApiSection } from "./types";

export const apiSections: ApiSection[] = [
  { slug: "getting-started", title: "Getting Started", description: "Learn how the OperiX developer documentation is organized.", icon: "book-open", order: 1 },
  { slug: "authentication", title: "Authentication", description: "API keys, OAuth, headers, scopes and security guidance when supported.", icon: "lock", order: 2 },
  { slug: "invoice", title: "OperiX Invoice API", description: "Future reference pages for invoice resources and operations.", icon: "receipt", order: 3 },
  { slug: "hr", title: "OperiX HR API", description: "Future reference pages for people and workforce resources.", icon: "users", order: 4 },
  { slug: "booking", title: "OperiX Booking API", description: "Future reference pages for bookings, services and availability.", icon: "calendar", order: 5 },
  { slug: "desk", title: "OperiX Desk API", description: "Future reference pages for desk reservations and workplace resources.", icon: "building", order: 6 },
  { slug: "webhooks", title: "Webhooks", description: "Webhook creation, signature verification, events, retries and error handling.", icon: "webhook", order: 7 },
  { slug: "errors", title: "Errors", description: "Error formats, status codes and troubleshooting for integrations.", icon: "help-circle", order: 8 },
  { slug: "sdks", title: "SDKs & Examples", description: "Future cURL, JavaScript, TypeScript and Python examples.", icon: "code", order: 9 },
  { slug: "changelog", title: "Changelog", description: "Developer-facing API changes and compatibility notes.", icon: "megaphone", order: 10 },
];

export const apiSectionBySlug = Object.fromEntries(apiSections.map((section) => [section.slug, section]));
