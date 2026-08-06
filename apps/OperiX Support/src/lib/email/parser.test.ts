import { describe, expect, it } from "vitest";
import { parseIncomingEmail } from "./parser";

describe("incoming email parser", () => {
  it("extracts threading headers, cleans quoted text, and sanitizes html", async () => {
    const parsed = await parseIncomingEmail(Buffer.from([
      "From: Customer <customer@example.com>",
      "Message-ID: <new@example.com>",
      "In-Reply-To: <old@example.com>",
      "References: <old@example.com>",
      "Subject: Re: Support", "", "<p>Hello</p><script>alert(1)</script>", "", "> quoted history",
    ].join("\r\n")));
    expect(parsed.from.address).toBe("customer@example.com");
    expect(parsed.messageId).toBe("new@example.com");
    expect(parsed.inReplyTo).toBe("old@example.com");
    expect(parsed.bodyHtml ?? "").not.toContain("script");
    expect(parsed.bodyText).toBe("Hello");
  });
});
