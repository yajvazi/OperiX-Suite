import { describe, expect, it } from "vitest";
import { extractTicketNumber, formatTicketNumber } from "@invoice-monorepo/support";
import { parseIncomingEmail } from "./parser";

describe("email-to-ticket boundary", () => {
  it("produces normalized threading data and preserves the application ticket key", async () => {
    const parsed = await parseIncomingEmail(Buffer.from([
      "From: Customer <CUSTOMER@example.com>",
      "Message-ID: <reply-1@example.com>",
      "In-Reply-To: <reply-0@example.com>",
      "References: <reply-0@example.com>",
      "Subject: Re: IK-20260806-000123 Activation issue", "", "Please help.", "", "> previous reply",
    ].join("\r\n")));
    expect(parsed.from.address).toBe("customer@example.com");
    expect(parsed.inReplyTo).toBe("reply-0@example.com");
    expect(extractTicketNumber(parsed.subject)).toBe("IK-20260806-000123");
    expect(formatTicketNumber("IK", new Date("2026-08-06T12:00:00.000Z"), 123)).toBe("IK-20260806-000123");
  });
});
