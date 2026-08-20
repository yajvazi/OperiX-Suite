import assert from "node:assert/strict";
import test from "node:test";
import {
  CertificationQrContentCodec,
  DevelopmentTestKeyProvider,
  DisabledKosovoEfsProvider,
  MockTakServer,
  OPERIX_EFS_STATUS_LABEL,
  FiscalProviderError,
  MockFiscalProvider,
  assertEfsStateTransition,
  assertFiscalTotalsReconcile,
  assertProductionFiscalizationAllowed,
  evaluateEfsReadiness,
  fiscalPayloadFingerprint,
  stableFiscalSerialization,
  type CanonicalFiscalTransaction,
} from "./index.ts";

const transaction: CanonicalFiscalTransaction = {
  schemaVersion: 1,
  idempotencyKey: "31e4acbc-b663-4ad3-8a1c-7efcb54bde13",
  localTransactionId: "c90f1956-8b78-46f2-bbb9-23433cc31b93",
  companyId: "company",
  branchId: "branch",
  terminalId: "terminal",
  cashierId: "cashier",
  orderId: "order",
  orderNumber: "POS-2026-000001",
  occurredAt: "2026-07-28T12:00:00.000Z",
  lines: [{
    lineId: "line",
    description: "Test item",
    quantity: "1.0000",
    unit: "pcs",
    unitPrice: { amount: "10.00", currency: "EUR" },
    discountAmount: { amount: "0.00", currency: "EUR" },
    netAmount: { amount: "8.47", currency: "EUR" },
    vatRate: "18.0000",
    vatAmount: { amount: "1.53", currency: "EUR" },
    grossAmount: { amount: "10.00", currency: "EUR" },
  }],
  subtotal: { amount: "8.47", currency: "EUR" },
  discountTotal: { amount: "0.00", currency: "EUR" },
  vatTotal: { amount: "1.53", currency: "EUR" },
  grandTotal: { amount: "10.00", currency: "EUR" },
  paymentTotal: { amount: "10.00", currency: "EUR" },
  transactionKind: "sale",
};

test("mock provider fiscalizes deterministically", async () => {
  const result = await new MockFiscalProvider("success").submit(transaction);
  assert.equal(result.status, "fiscalized");
  assert.equal(result.identifiers?.fiscalReceiptNumber, "POS-2026-000001");
});

test("mock provider distinguishes retryable network failures", async () => {
  await assert.rejects(
    new MockFiscalProvider("network_timeout").submit(transaction),
    (error: unknown) => error instanceof FiscalProviderError && error.retryable,
  );
});

test("mock provider exposes reconciliation mismatch", async () => {
  const result = await new MockFiscalProvider("reconciliation_mismatch").reconcile(transaction);
  assert.equal(result.status, "reconciliation_required");
});

test("Kosovo EFS adapter remains disabled without official specification", async () => {
  const provider = new DisabledKosovoEfsProvider();
  assert.equal(provider.enabled, false);
  await assert.rejects(provider.submit(transaction), /official current specifications/);
});

test("production guard remains closed by default", () => {
  const readiness = evaluateEfsReadiness({
    softwareCertified: false,
    organizationFiscalized: false,
    installationActive: false,
    certificateValid: false,
    keyAvailable: false,
    productionEnabled: false,
  });
  assert.equal(readiness.productionReady, false);
  assert.ok(readiness.blockers.length >= 5);
  assert.throws(
    () => assertProductionFiscalizationAllowed({
      softwareCertified: false,
      organizationFiscalized: false,
      installationActive: false,
      certificateValid: false,
      keyAvailable: false,
      productionEnabled: false,
    }),
    (error: unknown) => error instanceof FiscalProviderError
      && error.category === "PRODUCTION_DISABLED"
      && error.message.includes(OPERIX_EFS_STATUS_LABEL),
  );
});

test("EFS state machine allows immutable acceptance flow and rejects skipping signing", () => {
  assert.doesNotThrow(() => assertEfsStateTransition("ready", "signing"));
  assert.doesNotThrow(() => assertEfsStateTransition("submitted", "accepted"));
  assert.throws(
    () => assertEfsStateTransition("draft", "accepted"),
    (error: unknown) => error instanceof FiscalProviderError && error.category === "INVALID_FISCAL_TRANSACTION",
  );
});

test("stable fiscal fingerprints are independent of object key order", () => {
  const left = stableFiscalSerialization({ amount: "10.00", vat: { rate: "18" }, lines: [1] });
  const right = stableFiscalSerialization({ lines: [1], vat: { rate: "18" }, amount: "10.00" });
  assert.equal(left, right);
  assert.equal(fiscalPayloadFingerprint({ a: 1, b: 2 }), fiscalPayloadFingerprint({ b: 2, a: 1 }));
});

test("fiscal totals reconcile without recalculating VAT", () => {
  assert.doesNotThrow(() => assertFiscalTotalsReconcile(transaction));
  const altered = structuredClone(transaction);
  altered.grandTotal = { amount: "11.00", currency: "EUR" };
  assert.throws(
    () => assertFiscalTotalsReconcile(altered),
    (error: unknown) => error instanceof FiscalProviderError && error.category === "INVALID_FISCAL_TRANSACTION",
  );
});

test("certification QR content is round-trippable and explicitly non-TAK", () => {
  const codec = new CertificationQrContentCodec();
  const qr = codec.encode({ payload: "fixture-payload", signature: "fixture-signature" });
  assert.match(qr, /^operix-efs-certification:\/\//);
  assert.deepEqual(codec.decode(qr), { payload: "fixture-payload", signature: "fixture-signature" });
  assert.notEqual(codec.code, "TAK");
});

test("development key provider never reports production-safe material", async () => {
  const provider = new DevelopmentTestKeyProvider();
  const status = await provider.getStatus("fixture-key");
  assert.equal(status.provider, "test");
  assert.equal(status.productionSafe, false);
  const signature = await provider.sign({
    keyReference: "fixture-key",
    algorithm: "fixture-algorithm",
    digest: "fixture-digest",
    payload: new TextEncoder().encode("payload"),
  });
  assert.match(signature, /^test-signature:/);
});

test("mock TAK server covers accepted and retryable certification scenarios", () => {
  const request = { idempotencyKey: transaction.idempotencyKey, payloadFingerprint: "abc123" };
  const success = new MockTakServer("success").handle(request);
  assert.equal(success.status, "accepted");
  assert.equal(success.fiscalIdentifier, "CERT-abc123");
  const timeout = new MockTakServer("timeout").handle(request);
  assert.equal(timeout.status, "retry_required");
  assert.equal(timeout.responseCode, "MOCK_UNAVAILABLE");
});
