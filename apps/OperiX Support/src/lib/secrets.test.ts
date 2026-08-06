import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

describe("credential encryption", () => {
  afterEach(() => { delete process.env.SUPPORT_CREDENTIAL_KEY; });
  it("round trips with an application key", () => { process.env.SUPPORT_CREDENTIAL_KEY = "test-key"; expect(decryptSecret(encryptSecret("mail-password"))).toBe("mail-password"); });
  it("fails closed without a key", () => { expect(() => encryptSecret("secret")).toThrow("SUPPORT_CREDENTIAL_KEY"); });
});
