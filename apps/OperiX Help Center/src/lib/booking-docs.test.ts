import { describe, expect, it } from "vitest";
import { bookingArticleSpecs, bookingArticles } from "../content/booking-docs";
import { bookingFeatureRegistry, bookingGlossary } from "../content/booking-registry";
import { getPublishedArticle } from "../content/articles";
import { searchDocumentation } from "./search";

describe("Booking documentation integrity", () => {
  it("maps every documented registry feature to both locales", () => {
    const specsByFeature = new Map(bookingArticleSpecs.map((spec) => [spec.featureId, spec]));
    const documented = bookingFeatureRegistry.filter((feature) => feature.classification === "documented");

    expect(documented.length).toBeGreaterThan(0);
    for (const feature of documented) {
      const spec = specsByFeature.get(feature.id);
      expect(spec?.en.title, feature.id).toBeTruthy();
      expect(spec?.sq.title, feature.id).toBeTruthy();
      expect(feature.documentation?.en, feature.id).toBe(spec?.id);
      expect(feature.documentation?.sq, feature.id).toBe(spec?.id);
    }
  });

  it("keeps localized IDs and screenshot IDs deterministic", () => {
    const localizedIds = bookingArticles.map((article) => `${article.locale}:${article.id}`);
    expect(new Set(localizedIds).size).toBe(localizedIds.length);

    const screenshotIds = bookingArticles.flatMap((article) => article.screenshotIds ?? []);
    expect(new Set(screenshotIds).size).toBeGreaterThan(0);
    expect(screenshotIds.every((id) => /^booking-(web|mobile)-[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it("keeps platform and locale routes addressable", () => {
    expect(getPublishedArticle("en", "booking", "bookings", "booking-create", "web").article?.platform).toBe("both");
    expect(getPublishedArticle("sq", "booking", "bookings", "booking-create", "mobile").article?.locale).toBe("sq");
    expect(getPublishedArticle("en", "booking", "public-booking-page", "booking-widget", "web").article?.documentationStatus).toBe("REVIEW_REQUIRED");
  });

  it("indexes Albanian glossary aliases for Booking search", () => {
    expect(bookingGlossary.some((entry) => entry.en === "Booking" && entry.sq === "Rezervim")).toBe(true);
    expect(searchDocumentation("rezervim", "sq").some((entry) => entry.product === "booking")).toBe(true);
    expect(searchDocumentation("availability", "en").some((entry) => entry.product === "booking")).toBe(true);
  });
});

