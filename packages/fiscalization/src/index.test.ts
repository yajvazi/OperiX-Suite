import assert from "node:assert/strict";
import test from "node:test";
import {
  DisabledKosovoEfsProvider,
  FiscalProviderError,
  MockFiscalProvider,
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
