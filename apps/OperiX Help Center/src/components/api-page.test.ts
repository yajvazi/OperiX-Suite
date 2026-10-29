import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The test runner compiles JSX with the classic transform, which expects a global React.
await vi.hoisted(async () => { (globalThis as { React?: unknown }).React = await import("react"); });

// next/image and next/link need react-dom from the app folder; plain elements are enough to check the markup.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children?: unknown }) => createElement("a", { href, ...rest }, children as never) }));

import { apiSections } from "../content/api-docs";
import { ApiHome, ApiSectionPage } from "./api-page";

const section = (locale: "en" | "sq", slug: string) => renderToStaticMarkup(createElement(ApiSectionPage, { locale, slug }));

describe("API pages render", () => {
  for (const locale of ["en", "sq"] as const) {
    it(`renders the home page and every section in ${locale}`, () => {
      expect(renderToStaticMarkup(createElement(ApiHome, { locale }))).toContain("api-card");
      for (const item of apiSections) expect(section(locale, item.slug), item.slug).toContain("api-main");
    });
  }

  it("shows Booking as coming soon and no Booking endpoints", () => {
    const html = section("en", "booking-services");
    expect(html).toContain("coming soon");
    expect(html).not.toContain("/v1/booking");
    expect(section("en", "invoice-invoices")).toContain("/v1/invoice/invoices/{id}/finalize");
  });
});
