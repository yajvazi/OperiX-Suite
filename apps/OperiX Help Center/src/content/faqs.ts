import type { FaqItem, Locale } from "./types";

export const faqCategories = [
  "General",
  "Account",
  "Billing",
  "Invoice",
  "HR",
  "Booking",
  "Desk",
  "Control",
  "Security",
  "Mobile Apps",
  "Troubleshooting",
];

export const faqs: FaqItem[] = [
  { id: "reset-password", locale: "en", category: "Account", question: "How do I reset my password?", answer: "Password reset guidance will be published here once the final OperiX account recovery flow is documented.", order: 1 },
  { id: "switch-apps", locale: "en", category: "General", question: "How do I switch between OperiX applications?", answer: "The Help Center will explain application switching and the shared OperiX account model in the Getting Started section.", order: 2 },
  { id: "plan-features", locale: "en", category: "Billing", question: "Do all OperiX plans include the same features?", answer: "Some features can depend on your OperiX plan. Plan-specific documentation will be added when the commercial feature matrix is ready.", order: 3 },
  { id: "contact-support", locale: "en", category: "General", question: "How do I contact OperiX Support?", answer: "Use the Contact Support link in the Help Center once your organization’s support channel has been configured.", order: 4 },
  { id: "reset-password-sq", locale: "sq", category: "Llogaria", question: "Si ta rivendos fjalëkalimin?", answer: "Udhëzimet për rivendosjen e fjalëkalimit do të publikohen pasi të dokumentohet rrjedha përfundimtare e llogarisë OperiX.", order: 1 },
];

export function getFaqs(locale: Locale) {
  const localized = faqs.filter((faq) => faq.locale === locale);
  return localized.length ? localized : faqs.filter((faq) => faq.locale === "en");
}
