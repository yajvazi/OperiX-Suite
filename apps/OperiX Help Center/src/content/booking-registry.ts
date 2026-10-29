import registry from "../../../../docs/booking/registry/feature-registry.json";
import glossary from "../../../../docs/booking/glossary/bilingual-glossary.json";

export type BookingFeature = (typeof registry.features)[number];
export type BookingGlossaryEntry = (typeof glossary.terms)[number];

/** Machine-readable Booking inventory used by the health dashboard and Help Center metadata. */
export const bookingRegistryMetadata = registry;
export const bookingFeatureRegistry = registry.features as readonly BookingFeature[];
export const bookingGlossary = glossary.terms as readonly BookingGlossaryEntry[];

export function getBookingFeature(featureId: string) {
  return bookingFeatureRegistry.find((feature) => feature.id === featureId);
}

export function getBookingFeatureArticles(featureId: string) {
  const feature = getBookingFeature(featureId);
  return feature?.documentation ?? null;
}
