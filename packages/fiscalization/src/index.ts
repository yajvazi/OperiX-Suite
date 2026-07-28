export type FiscalTransactionStatus =
  | "draft"
  | "pending_validation"
  | "validated"
  | "offline_pending"
  | "submission_pending"
  | "submitted"
  | "fiscalized"
  | "rejected"
  | "retry_scheduled"
  | "reconciliation_required"
  | "reconciled"
  | "cancel_pending"
  | "cancelled"
  | "correction_pending"
  | "corrected"
  | "refund_pending"
  | "refunded"
  | "permanently_failed";

export interface FiscalMoney {
  amount: string;
  currency: string;
}

export interface FiscalReceiptLine {
  lineId: string;
  productId?: string;
  sku?: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: FiscalMoney;
  discountAmount: FiscalMoney;
  netAmount: FiscalMoney;
  vatRate: string;
  vatAmount: FiscalMoney;
  grossAmount: FiscalMoney;
}

export interface CanonicalFiscalTransaction {
  schemaVersion: 1;
  idempotencyKey: string;
  localTransactionId: string;
  companyId: string;
  branchId: string;
  fiscalLocationId?: string;
  terminalId: string;
  cashierId: string;
  orderId: string;
  orderNumber: string;
  occurredAt: string;
  customerId?: string;
  lines: FiscalReceiptLine[];
  subtotal: FiscalMoney;
  discountTotal: FiscalMoney;
  vatTotal: FiscalMoney;
  grandTotal: FiscalMoney;
  paymentTotal: FiscalMoney;
  originalTransactionId?: string;
  transactionKind: "sale" | "return" | "refund" | "correction" | "cancellation";
}

export interface FiscalProviderIdentifiers {
  providerTransactionId?: string;
  fiscalReceiptNumber?: string;
  verificationCode?: string;
}

export interface FiscalProviderResult {
  status:
    | "fiscalized"
    | "rejected"
    | "retry_scheduled"
    | "reconciliation_required"
    | "reconciled"
    | "cancelled"
    | "corrected"
    | "refunded";
  retryable: boolean;
  responseCode: string;
  message?: string;
  identifiers?: FiscalProviderIdentifiers;
  qrData?: string;
  correlationId: string;
}

export interface FiscalProvider {
  readonly code: string;
  readonly enabled: boolean;
  validateTransaction(transaction: CanonicalFiscalTransaction): Promise<void>;
  createPayload(transaction: CanonicalFiscalTransaction): Promise<unknown>;
  assignLocalTransactionId(transaction: CanonicalFiscalTransaction): Promise<string>;
  submit(transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult>;
  retry(transaction: CanonicalFiscalTransaction, attempt: number): Promise<FiscalProviderResult>;
  reconcile(transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult>;
  cancel(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult>;
  correct(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult>;
  refund(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}

export type MockFiscalScenario =
  | "success"
  | "validation_failure"
  | "network_timeout"
  | "provider_rejection"
  | "duplicate_transaction"
  | "delayed_response"
  | "retry_success"
  | "retry_failure"
  | "reconciliation_success"
  | "reconciliation_mismatch";

function correlation(transaction: CanonicalFiscalTransaction, suffix: string) {
  return `mock:${transaction.localTransactionId}:${suffix}`;
}

export class MockFiscalProvider implements FiscalProvider {
  readonly code = "mock";
  readonly enabled = true;
  private readonly scenario: MockFiscalScenario;

  constructor(scenario: MockFiscalScenario = "success") {
    this.scenario = scenario;
  }

  async validateTransaction(transaction: CanonicalFiscalTransaction) {
    if (
      this.scenario === "validation_failure" ||
      !transaction.lines.length ||
      transaction.grandTotal.amount === "0.00"
    ) {
      throw new FiscalProviderError("validation", "Mock validation rejected the transaction.", false);
    }
  }

  async createPayload(transaction: CanonicalFiscalTransaction) {
    return { provider: this.code, transaction };
  }

  async assignLocalTransactionId(transaction: CanonicalFiscalTransaction) {
    return transaction.localTransactionId;
  }

  async submit(transaction: CanonicalFiscalTransaction) {
    await this.validateTransaction(transaction);
    if (this.scenario === "network_timeout") {
      throw new FiscalProviderError("network_timeout", "Mock provider timed out.", true);
    }
    if (this.scenario === "provider_rejection") {
      return {
        status: "rejected",
        retryable: false,
        responseCode: "MOCK_REJECTED",
        correlationId: correlation(transaction, "rejected"),
      } satisfies FiscalProviderResult;
    }
    if (this.scenario === "duplicate_transaction") {
      return {
        status: "reconciliation_required",
        retryable: false,
        responseCode: "MOCK_DUPLICATE",
        correlationId: correlation(transaction, "duplicate"),
      } satisfies FiscalProviderResult;
    }
    if (this.scenario === "delayed_response") {
      return {
        status: "retry_scheduled",
        retryable: true,
        responseCode: "MOCK_DELAYED",
        correlationId: correlation(transaction, "delayed"),
      } satisfies FiscalProviderResult;
    }
    return this.success(transaction, "submit");
  }

  async retry(transaction: CanonicalFiscalTransaction, attempt: number): Promise<FiscalProviderResult> {
    if (this.scenario === "retry_failure") {
      return {
        status: "retry_scheduled",
        retryable: true,
        responseCode: "MOCK_RETRY_FAILED",
        correlationId: correlation(transaction, `retry-${attempt}`),
      };
    }
    return this.success(transaction, `retry-${attempt}`);
  }

  async reconcile(transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult> {
    if (this.scenario === "reconciliation_mismatch") {
      return {
        status: "reconciliation_required",
        retryable: false,
        responseCode: "MOCK_AMOUNT_MISMATCH",
        correlationId: correlation(transaction, "reconciliation-mismatch"),
      };
    }
    return {
      ...this.success(transaction, "reconciled"),
      status: "reconciled",
    };
  }

  async cancel(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult> {
    if (!reason.trim()) throw new FiscalProviderError("validation", "Cancellation reason is required.", false);
    return {
      status: "cancelled",
      retryable: false,
      responseCode: "MOCK_CANCELLED",
      correlationId: correlation(transaction, "cancelled"),
    };
  }

  async correct(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult> {
    if (!reason.trim()) throw new FiscalProviderError("validation", "Correction reason is required.", false);
    return {
      ...this.success(transaction, "corrected"),
      status: "fiscalized",
    };
  }

  async refund(transaction: CanonicalFiscalTransaction, reason: string): Promise<FiscalProviderResult> {
    if (!reason.trim()) throw new FiscalProviderError("validation", "Refund reason is required.", false);
    return {
      status: "refunded",
      retryable: false,
      responseCode: "MOCK_REFUNDED",
      correlationId: correlation(transaction, "refunded"),
    };
  }

  async healthCheck() {
    return this.scenario === "network_timeout"
      ? { healthy: false, message: "Mock timeout scenario is active." }
      : { healthy: true };
  }

  private success(transaction: CanonicalFiscalTransaction, suffix: string): FiscalProviderResult {
    return {
      status: "fiscalized",
      retryable: false,
      responseCode: "MOCK_OK",
      correlationId: correlation(transaction, suffix),
      identifiers: {
        providerTransactionId: `MOCK-${transaction.localTransactionId}`,
        fiscalReceiptNumber: transaction.orderNumber,
        verificationCode: `VERIFY-${transaction.localTransactionId.slice(0, 8)}`,
      },
      qrData: `operix-fiscal://mock/${transaction.localTransactionId}`,
    };
  }
}

export class DisabledKosovoEfsProvider implements FiscalProvider {
  readonly code = "kosovo_efs";
  readonly enabled = false;

  private unavailable<T>(): Promise<T> {
    return Promise.reject(new FiscalProviderError(
      "provider_disabled",
      "Kosovo EFS is disabled until official current specifications, credentials, and certification requirements are supplied.",
      false,
    ));
  }

  validateTransaction(_transaction: CanonicalFiscalTransaction): Promise<void> { return this.unavailable(); }
  createPayload(_transaction: CanonicalFiscalTransaction): Promise<unknown> { return this.unavailable(); }
  assignLocalTransactionId(_transaction: CanonicalFiscalTransaction): Promise<string> { return this.unavailable(); }
  submit(_transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult> { return this.unavailable(); }
  retry(_transaction: CanonicalFiscalTransaction, _attempt: number): Promise<FiscalProviderResult> { return this.unavailable(); }
  reconcile(_transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult> { return this.unavailable(); }
  cancel(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> { return this.unavailable(); }
  correct(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> { return this.unavailable(); }
  refund(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> { return this.unavailable(); }
  healthCheck() { return Promise.resolve({ healthy: false, message: "Provider is intentionally disabled." }); }
}

export class FiscalProviderError extends Error {
  readonly category: string;
  readonly retryable: boolean;

  constructor(
    category: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "FiscalProviderError";
    this.category = category;
    this.retryable = retryable;
  }
}
