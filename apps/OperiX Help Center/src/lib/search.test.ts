import { describe, expect, it } from "vitest";
import { searchDocumentation } from "./search";

describe("documentation search", () => {
  it("ranks an exact article title above generic category matches", () => {
    const results = searchDocumentation("Create an Invoice", "en");
    expect(results[0]?.title).toBe("Create an Invoice");
  });

  it("includes FAQs in the same index", () => {
    expect(searchDocumentation("reset password", "en").some((entry) => entry.kind === "faq")).toBe(true);
  });
});
