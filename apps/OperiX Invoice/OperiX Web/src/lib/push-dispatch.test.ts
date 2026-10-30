import { describe, expect, it } from "vitest";
import { buildMessages, chunk, readTickets, type PushOutboxEvent } from "./push-dispatch";

const event: PushOutboxEvent = {
  id: "e1", company_id: "c1", event_type: "invoice_created", category: "invoices",
  title: { en: "New invoice FAT-1", sq: "Faturë e re FAT-1" }, body: { en: "Anna issued an invoice", sq: "Anna lëshoi një faturë" },
  data: { type: "invoice", id: "i1", url: "operix-invoice://open/invoices/i1" },
};
const token = (user: string, value: string, language?: string) => ({ user_id: user, expo_push_token: `ExponentPushToken[${value}]`, language });

describe("push dispatch", () => {
  it("sends only to recipients, once per device, in the device language", () => {
    const messages = buildMessages(event, [token("u1", "a", "sq"), token("u1", "a", "sq"), token("u2", "b", "en"), token("u3", "c")], ["u1", "u2"]);
    expect(messages.map((message) => message.to)).toEqual(["ExponentPushToken[a]", "ExponentPushToken[b]"]);
    expect(messages[0].title).toBe("Faturë e re FAT-1");
    expect(messages[1].title).toBe("New invoice FAT-1");
    expect(messages[0].data).toMatchObject({ url: "operix-invoice://open/invoices/i1", eventType: "invoice_created", companyId: "c1" });
  });

  it("ignores values that are not Expo push tokens", () => {
    expect(buildMessages(event, [{ user_id: "u1", expo_push_token: "not-a-token" }], ["u1"])).toEqual([]);
  });

  it("falls back to English when a language is missing", () => {
    const messages = buildMessages({ ...event, title: { en: "Hello" }, body: { en: "World" } }, [token("u1", "a", "sq")], ["u1"]);
    expect(messages[0]).toMatchObject({ title: "Hello", body: "World" });
  });

  it("reads Expo's answer and finds devices to switch off", () => {
    const messages = buildMessages(event, [token("u1", "a"), token("u2", "b"), token("u3", "c")], ["u1", "u2", "u3"]);
    const result = readTickets(messages, { data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }, { status: "error", message: "Rate limited" }] });
    expect(result).toEqual({ accepted: 1, invalidTokens: ["ExponentPushToken[b]"], errors: ["Rate limited"] });
  });

  it("splits long lists into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
