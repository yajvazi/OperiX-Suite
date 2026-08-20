import { describe, expect, it, vi } from "vitest";
import { createEmailTransport, createNotificationSinkTransport, NotificationDispatcher, NotificationError, normalizeRecipients } from "./index";

describe("notifications", () => {
  it("normalizes and de-duplicates recipients", () => {
    expect(normalizeRecipients([" Agent@Example.com ", "agent@example.com"])).toEqual(["agent@example.com"]);
  });

  it("rejects header injection", () => {
    expect(() => normalizeRecipients(["a@example.com\r\nBcc:evil@example.com"])).toThrow(NotificationError);
  });

  it("dispatches through a registered future-proof transport", async () => {
    const sender = vi.fn(async () => ({ providerMessageId: "msg-1" }));
    const dispatcher = new NotificationDispatcher([createEmailTransport(sender)]);
    const delivery = await dispatcher.send({ channel: "email", tenantId: "tenant-1", to: ["a@example.com"], subject: "Hello", text: "Body" });
    expect(sender).toHaveBeenCalledOnce();
    expect(delivery.providerMessageId).toBe("msg-1");
  });

  it("supports shared in-app notification sinks", async () => {
    const sink = vi.fn(async () => ({ providerMessageId: "notification-1" }));
    const dispatcher = new NotificationDispatcher([createNotificationSinkTransport("in_app", sink)]);
    const delivery = await dispatcher.send({ channel: "in_app", tenantId: "tenant-1", to: ["agent-1"], subject: "Assigned", text: "Ticket assigned" });
    expect(sink).toHaveBeenCalledOnce();
    expect(delivery.providerMessageId).toBe("notification-1");
  });
});
