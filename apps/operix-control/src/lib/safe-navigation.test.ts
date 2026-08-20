import { describe, expect, it } from "vitest";
import { safeExternalAppUrl, safeNextPath } from "./safe-navigation";

describe("safe navigation", () => {
  it("keeps authentication redirects on the Control origin", () => {
    expect(safeNextPath("/users?invite=1")).toBe("/users?invite=1");
    expect(safeNextPath("https://attacker.example/phish")).toBe("/dashboard");
    expect(safeNextPath("//attacker.example/phish")).toBe("/dashboard");
  });

  it("only allows OperiX or local development application origins", () => {
    expect(safeExternalAppUrl("https://invoice.operixsuite.com")).toContain("invoice.operixsuite.com");
    expect(safeExternalAppUrl("http://127.0.0.1:3020")).toContain("127.0.0.1");
    expect(safeExternalAppUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalAppUrl("https://attacker.example")).toBeNull();
  });
});
