import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createDeviceQueueKey,
  decryptOfflineEnvelope,
  encryptOfflineEnvelope,
  type OfflinePosEnvelope,
} from "./index";

const envelope: OfflinePosEnvelope<{ total: string; customer: string }> = {
  schemaVersion: 1,
  clientItemId: "a7f0c8e2-5d9a-4b8c-941f-6ad0aa4c7652",
  idempotencyKey: "b8f0c8e2-5d9a-4b8c-941f-6ad0aa4c7653",
  queueSequence: 7,
  configurationVersion: 3,
  occurredAt: "2026-07-28T12:00:00.000Z",
  payload: { total: "12.40", customer: "C-100" },
};

describe("offline POS encryption", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } }))
      .toBe('{"a":{"b":3,"y":2},"z":1}');
  });

  it("round-trips an envelope with a non-extractable device key", async () => {
    const key = await createDeviceQueueKey();
    expect(key.extractable).toBe(false);
    const encrypted = await encryptOfflineEnvelope(envelope, key, 4);
    expect(encrypted.ciphertext).not.toContain("C-100");
    await expect(decryptOfflineEnvelope(encrypted, key)).resolves.toEqual(envelope);
  });

  it("rejects ciphertext tampering", async () => {
    const key = await createDeviceQueueKey();
    const encrypted = await encryptOfflineEnvelope(envelope, key);
    const tampered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA`,
    };
    await expect(decryptOfflineEnvelope(tampered, key))
      .rejects.toThrow("authenticated decryption");
  });
});
