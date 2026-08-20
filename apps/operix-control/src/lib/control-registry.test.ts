import { describe, expect, it } from "vitest";
import { canView, displayName, navigation, registryFallback, roleLabel } from "./control-registry";

describe("OperiX Control registry", () => {
  it("keeps the navigation views unique and permission-scoped", () => {
    const views = navigation.map((item) => item.view);
    expect(new Set(views).size).toBe(views.length);
    expect(canView(navigation.find((item) => item.view === "users")!, new Set(["users.read"]))).toBe(true);
    expect(canView(navigation.find((item) => item.view === "security")!, new Set(["users.read"]))).toBe(false);
    expect(canView(navigation[0], new Set())).toBe(true);
  });

  it("contains the shared product registry fallback", () => {
    expect(registryFallback.map((app) => app.app_key)).toEqual(["invoice", "hr", "booking", "desk", "support", "crm"]);
    expect(registryFallback.every((app) => app.display_name.startsWith("OperiX "))).toBe(true);
  });

  it("formats shared identity labels without inventing names", () => {
    expect(roleLabel("organization_admin")).toBe("Organization Admin");
    expect(roleLabel(null)).toBe("Read only");
    expect(displayName("Mira", "Dervishi", "mira@example.com")).toBe("Mira Dervishi");
    expect(displayName(null, null, "mira@example.com")).toBe("mira@example.com");
  });
});
