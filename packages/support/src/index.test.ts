import { describe, expect, it } from "vitest";
import { collapseQuotedHistory, extractTicketNumber, formatTicketNumber, normalizeMessageId, parseEmailBody } from "./index";

describe("support domain", () => {
  it("formats application-aware ticket numbers", () => {
    expect(formatTicketNumber("ik", new Date("2026-08-06T00:00:00Z"), 123)).toBe("IK-20260806-000123");
  });

  it("extracts fallback ticket numbers from subjects", () => {
    expect(extractTicketNumber("Re: [IK-20260806-000123] Refund question")).toBe("IK-20260806-000123");
  });

  it("normalizes message ids", () => {
    expect(normalizeMessageId(" <Message-ID@example.com> ")).toBe("message-id@example.com");
  });

  it("removes quoted history and signatures", () => {
    expect(parseEmailBody("Hello\n\n--\nAgent\n\n> previous reply")).toBe("Hello");
    expect(collapseQuotedHistory("New\nOn Tue, someone wrote:\nold")).toBe("New");
  });
});
