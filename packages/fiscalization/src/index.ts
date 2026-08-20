import { createHash } from "node:crypto";

export const OPERIX_EFS_STATUS_LABEL =
  "EFS NOT CERTIFIED — DO NOT USE OPERIX AS A CERTIFIED FISCAL RECEIPT SYSTEM" as const;

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

/**
 * This is the application state machine, not a claim about TAK's internal
 * statuses.  A provider adapter may map these states to the exact TAK
 * vocabulary only after the current TAK technical contract is supplied.
 */
export type EfsFiscalState =
  | "not_required"
  | "draft"
  | "ready"
  | "signing"
  | "signed"
  | "submitting"
  | "submitted"
  | "accepted"
  | "rejected"
  | "retry_required"
  | "offline_pending"
  | "corrected"
  | "returned"
  | "cancelled";

export type EfsTransactionType =
  | "sale"
  | "return"
  | "correction"
  | "cancellation"
  | "advance"
  | "training";

const EFS_STATE_TRANSITIONS: Readonly<Record<EfsFiscalState, readonly EfsFiscalState[]>> = {
  not_required: ["draft"],
  draft: ["ready", "offline_pending", "cancelled"],
  ready: ["signing", "offline_pending", "cancelled"],
  signing: ["signed", "rejected", "retry_required"],
  signed: ["submitting", "rejected", "retry_required", "offline_pending"],
  submitting: ["submitted", "accepted", "rejected", "retry_required", "offline_pending"],
  submitted: ["accepted", "rejected", "retry_required"],
  accepted: ["corrected", "returned", "cancelled"],
  rejected: ["ready", "retry_required", "cancelled"],
  retry_required: ["ready", "signing", "submitting", "offline_pending", "cancelled"],
  offline_pending: ["ready", "submitting", "rejected", "cancelled"],
  corrected: [],
  returned: [],
  cancelled: [],
};

export function canTransitionEfsState(from: EfsFiscalState, to: EfsFiscalState): boolean {
  return EFS_STATE_TRANSITIONS[from].includes(to);
}

export function assertEfsStateTransition(from: EfsFiscalState, to: EfsFiscalState): void {
  if (!canTransitionEfsState(from, to)) {
    throw new FiscalProviderError(
      "INVALID_FISCAL_TRANSACTION",
      `Invalid EFS state transition: ${from} -> ${to}.`,
      false,
    );
  }
}

export type FiscalErrorCategory =
  | "FISCAL_CONFIGURATION_MISSING"
  | "CERTIFICATE_MISSING"
  | "CERTIFICATE_EXPIRED"
  | "CERTIFICATE_INVALID"
  | "KEY_UNAVAILABLE"
  | "INVALID_FISCAL_TRANSACTION"
  | "SIGNATURE_FAILED"
  | "TAK_TIMEOUT"
  | "TAK_UNAVAILABLE"
  | "TAK_REJECTED"
  | "DUPLICATE_FISCALIZATION"
  | "OFFLINE_LIMIT_REACHED"
  | "UNSUPPORTED_TRANSACTION"
  | "TECHNICAL_INPUT_REQUIRED"
  | "PRODUCTION_DISABLED"
  | "UNAUTHORIZED"
  | "validation"
  | "network_timeout"
  | "provider_disabled";

export interface FiscalInstallationIdentity {
  taxpayerIdentifier?: string;
  taxpayerName?: string;
  businessUnitNumber?: string;
  posNumber?: string;
  softwareSolutionCode?: string;
  fiscalizationNumber?: string;
  uniqueFiscalizationCode?: string;
}

export interface FiscalCertificateMetadata {
  certificateReference: string;
  issuer?: string;
  serialNumber?: string;
  fingerprint?: string;
  validFrom?: string;
  validUntil?: string;
  status: "pending" | "active" | "expired" | "revoked" | "invalid";
}

export interface FiscalKeyStatus {
  available: boolean;
  keyReference: string;
  provider: "kms" | "hsm" | "vault" | "test" | "unconfigured";
  productionSafe: boolean;
  message?: string;
}

/**
 * Production implementations sign through a server-side KMS/HSM/Vault
 * adapter.  The private key itself is intentionally not part of this API.
 */
export interface FiscalKeyProvider {
  getStatus(keyReference: string): Promise<FiscalKeyStatus>;
  sign(input: {
    keyReference: string;
    algorithm: string;
    digest: string;
    payload: Uint8Array;
  }): Promise<string>;
}

export interface FiscalizationFeatureFlags {
  kosovoEfsEnabled: boolean;
  kosovoEfsCertificationMode: boolean;
  kosovoEfsProductionEnabled: boolean;
}

export const DEFAULT_FISCALIZATION_FEATURE_FLAGS: FiscalizationFeatureFlags = {
  kosovoEfsEnabled: false,
  kosovoEfsCertificationMode: false,
  kosovoEfsProductionEnabled: false,
};

export interface EfsProductionGuardInput {
  softwareCertified: boolean;
  organizationFiscalized: boolean;
  installationActive: boolean;
  certificateValid: boolean;
  keyAvailable: boolean;
  productionEnabled: boolean;
}

export interface EfsReadinessResult {
  softwareReady: boolean;
  productionReady: boolean;
  blockers: string[];
  checks: ReadonlyArray<{ key: string; label: string; passed: boolean; detail: string }>;
}

export function evaluateEfsReadiness(input: EfsProductionGuardInput): EfsReadinessResult {
  const checks = [
    {
      key: "software_certified",
      label: "Software certification",
      passed: input.softwareCertified,
      detail: input.softwareCertified ? "Certified version is configured." : "TAK certification is pending.",
    },
    {
      key: "organization_fiscalized",
      label: "Organization fiscalization",
      passed: input.organizationFiscalized,
      detail: input.organizationFiscalized ? "Taxpayer configuration is active." : "Taxpayer-issued fiscalization data is missing.",
    },
    {
      key: "installation_active",
      label: "Installation",
      passed: input.installationActive,
      detail: input.installationActive ? "Installation is active." : "Business unit/POS installation is not active.",
    },
    {
      key: "certificate_valid",
      label: "Digital certificate",
      passed: input.certificateValid,
      detail: input.certificateValid ? "Certificate is valid." : "A valid TAK-approved certificate is not available.",
    },
    {
      key: "key_available",
      label: "Secure signing key",
      passed: input.keyAvailable,
      detail: input.keyAvailable ? "Signing service reports a key." : "A production-safe signing key provider is not configured.",
    },
    {
      key: "production_enabled",
      label: "Production feature flag",
      passed: input.productionEnabled,
      detail: input.productionEnabled ? "Production fiscalization is enabled." : "Production fiscalization is disabled by default.",
    },
  ] as const;

  const blockers = checks.filter((check) => !check.passed).map((check) => check.detail);
  return {
    softwareReady: input.softwareCertified && input.certificateValid && input.keyAvailable,
    productionReady: checks.every((check) => check.passed),
    blockers,
    checks,
  };
}

export function assertProductionFiscalizationAllowed(input: EfsProductionGuardInput): void {
  const readiness = evaluateEfsReadiness(input);
  if (!readiness.productionReady) {
    throw new FiscalProviderError(
      "PRODUCTION_DISABLED",
      `${OPERIX_EFS_STATUS_LABEL}. ${readiness.blockers.join(" ")}`,
      false,
    );
  }
}

export interface FiscalReceiptPayment {
  method: string;
  amount: FiscalMoney;
  reference?: string;
}

export interface CanonicalFiscalDocument {
  schemaVersion: "operix-efs-boundary-v1";
  sourceTransactionId: string;
  idempotencyKey: string;
  transactionType: EfsTransactionType;
  installationId: string;
  identity: FiscalInstallationIdentity;
  operator: { id: string; displayName: string };
  fiscalTimestamp: string;
  currency: string;
  lines: FiscalReceiptLine[];
  payments: FiscalReceiptPayment[];
  subtotal: FiscalMoney;
  discountTotal: FiscalMoney;
  vatTotal: FiscalMoney;
  grandTotal: FiscalMoney;
  originalFiscalDocumentId?: string;
  sourceAccountingJournalId?: string;
}

export interface FiscalReceiptModel {
  document: CanonicalFiscalDocument;
  fiscalState: EfsFiscalState;
  fiscalIdentifiers?: FiscalProviderIdentifiers;
  qrPayload?: string;
  qrStatus: "not_available" | "test_only" | "tak_verified";
  certificationOnly: boolean;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableFiscalSerialization(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function fiscalPayloadFingerprint(value: unknown): string {
  return createHash("sha256").update(stableFiscalSerialization(value), "utf8").digest("hex");
}

function decimalUnits(value: string, scale = 4): bigint {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", `Invalid decimal amount: ${value}.`, false);
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > scale) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", `Amount has more than ${scale} decimal places.`, false);
  }
  const units = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, "0") || "0");
  return negative ? -units : units;
}

function assertMoneyCurrency(left: FiscalMoney, right: FiscalMoney): void {
  if (left.currency !== right.currency) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal money values must use one currency.", false);
  }
}

/**
 * Checks the commercial totals already produced by the VAT/accounting layer.
 * It never computes a new tax rate; it only proves that the fiscal payload did
 * not change line, VAT, gross, or payment totals in transit.
 */
export function assertFiscalTotalsReconcile(transaction: CanonicalFiscalTransaction): void {
  const lineCurrency = transaction.lines[0]?.grossAmount.currency;
  if (!lineCurrency) throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal lines are required.", false);
  const net = transaction.lines.reduce((sum, line) => {
    assertMoneyCurrency(line.netAmount, transaction.subtotal);
    return sum + decimalUnits(line.netAmount.amount);
  }, 0n);
  const vat = transaction.lines.reduce((sum, line) => {
    assertMoneyCurrency(line.vatAmount, transaction.vatTotal);
    return sum + decimalUnits(line.vatAmount.amount);
  }, 0n);
  const gross = transaction.lines.reduce((sum, line) => {
    assertMoneyCurrency(line.grossAmount, transaction.grandTotal);
    const expected = decimalUnits(line.netAmount.amount) + decimalUnits(line.vatAmount.amount);
    if (expected !== decimalUnits(line.grossAmount.amount)) {
      throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", `Line ${line.lineId} net plus VAT does not equal gross.`, false);
    }
    return sum + decimalUnits(line.grossAmount.amount);
  }, 0n);
  if (net !== decimalUnits(transaction.subtotal.amount)) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal net total does not reconcile to lines.", false);
  }
  if (vat !== decimalUnits(transaction.vatTotal.amount)) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal VAT total does not reconcile to lines.", false);
  }
  if (gross !== decimalUnits(transaction.grandTotal.amount)) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal gross total does not reconcile to lines.", false);
  }
  assertMoneyCurrency(transaction.paymentTotal, transaction.grandTotal);
  if (decimalUnits(transaction.paymentTotal.amount) !== decimalUnits(transaction.grandTotal.amount)) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal payment total does not reconcile to the grand total.", false);
  }
}

export interface FiscalQrCodec {
  readonly code: string;
  encode(input: { payload: string; signature: string }): string;
  decode(value: string): { payload: string; signature: string };
}

/**
 * Test-only QR content codec. It is deliberately not a TAK QR implementation
 * and is never used for production receipts. The official TAK QR payload and
 * visual encoding remain a documented integration dependency until TAK's
 * current technical interface package is supplied.
 */
export class CertificationQrContentCodec implements FiscalQrCodec {
  readonly code = "operix-certification-qr-content-v1";

  encode(input: { payload: string; signature: string }): string {
    const value = JSON.stringify({ v: 1, payload: input.payload, signature: input.signature });
    return `operix-efs-certification://${Buffer.from(value, "utf8").toString("base64url")}`;
  }

  decode(value: string): { payload: string; signature: string } {
    const prefix = "operix-efs-certification://";
    if (!value.startsWith(prefix)) {
      throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Unsupported certification QR content.", false);
    }
    const decoded = JSON.parse(Buffer.from(value.slice(prefix.length), "base64url").toString("utf8")) as {
      v?: number;
      payload?: string;
      signature?: string;
    };
    if (decoded.v !== 1 || typeof decoded.payload !== "string" || typeof decoded.signature !== "string") {
      throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Malformed certification QR content.", false);
    }
    return { payload: decoded.payload, signature: decoded.signature };
  }
}

export function validateCanonicalFiscalDocument(document: CanonicalFiscalDocument): void {
  if (!document.sourceTransactionId || !document.idempotencyKey || !document.installationId) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Fiscal source and installation identifiers are required.", false);
  }
  if (!document.operator.id || !document.operator.displayName) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "Anonymous fiscal issuance is not allowed.", false);
  }
  if (!document.lines.length) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "At least one fiscal line is required.", false);
  }
  if (!document.payments.length) {
    throw new FiscalProviderError("INVALID_FISCAL_TRANSACTION", "At least one payment method is required.", false);
  }
  if (document.transactionType !== "sale" && !document.originalFiscalDocumentId) {
    throw new FiscalProviderError(
      "INVALID_FISCAL_TRANSACTION",
      "Return, correction, cancellation, and advance flows must reference the original fiscal document when required by TAK.",
      false,
    );
  }
}

export interface KosovoEfsTechnicalContract {
  version: string;
  sourceUrl: string;
  payloadSchemaReference: string;
  signatureAlgorithm: string;
  qrSpecificationReference: string;
  endpointConfigurationReference: string;
}

/**
 * Provider boundary for the Kosovo adapter. The public TAK technical package
 * currently reviewed by this project refers to separately published data
 * structures, endpoints, certificates, signatures, and QR rules. Until those
 * exact artifacts are supplied, this adapter refuses to construct or submit a
 * production payload rather than guessing an API.
 */
export class KosovoEFSProvider implements FiscalProvider {
  readonly code = "kosovo_efs";
  readonly enabled = false;
  readonly certificationMode: boolean;
  private readonly technicalContract?: KosovoEfsTechnicalContract;

  constructor(options: { certificationMode?: boolean; technicalContract?: KosovoEfsTechnicalContract } = {}) {
    this.certificationMode = options.certificationMode ?? false;
    this.technicalContract = options.technicalContract;
  }

  private unavailable<T>(): Promise<T> {
    return Promise.reject(new FiscalProviderError(
      "TECHNICAL_INPUT_REQUIRED",
      "TAK technical input required: exact EFS schema, signature, QR, authentication, and endpoint contract are not configured. Production fiscalization remains disabled.",
      false,
    ));
  }

  async validateTransaction(transaction: CanonicalFiscalTransaction): Promise<void> {
    if (!this.technicalContract) return this.unavailable();
    await new DisabledKosovoEfsProvider().validateTransaction(transaction);
  }

  createPayload(_transaction: CanonicalFiscalTransaction): Promise<unknown> {
    return this.unavailable();
  }

  assignLocalTransactionId(_transaction: CanonicalFiscalTransaction): Promise<string> {
    return this.unavailable();
  }

  submit(_transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  retry(_transaction: CanonicalFiscalTransaction, _attempt: number): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  reconcile(_transaction: CanonicalFiscalTransaction): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  cancel(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  correct(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  refund(_transaction: CanonicalFiscalTransaction, _reason: string): Promise<FiscalProviderResult> {
    return this.unavailable();
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({
      healthy: false,
      message: this.technicalContract
        ? "Kosovo EFS contract is present but transport/signing integration is disabled pending TAK certification inputs."
        : "TAK technical input required; no Kosovo EFS contract is configured.",
    });
  }
}

export class DevelopmentTestKeyProvider implements FiscalKeyProvider {
  async getStatus(keyReference: string): Promise<FiscalKeyStatus> {
    return {
      available: Boolean(keyReference),
      keyReference,
      provider: "test",
      productionSafe: false,
      message: "Development-only deterministic signer. Never use for production fiscalization.",
    };
  }

  async sign(input: { keyReference: string; algorithm: string; digest: string; payload: Uint8Array }): Promise<string> {
    const status = await this.getStatus(input.keyReference);
    if (!status.available) throw new FiscalProviderError("KEY_UNAVAILABLE", "Test signing key is unavailable.", false);
    return `test-signature:${input.algorithm}:${input.digest}:${fiscalPayloadFingerprint(Array.from(input.payload))}`;
  }
}

export type MockTakScenario =
  | "success"
  | "validation_rejection"
  | "authentication_failure"
  | "bad_signature"
  | "duplicate_transaction"
  | "timeout"
  | "server_error"
  | "malformed_response"
  | "unavailable_service";

export interface MockTakResponse {
  accepted: boolean;
  status: "accepted" | "rejected" | "retry_required";
  responseCode: string;
  requestId: string;
  fiscalIdentifier?: string;
  sanitizedMessage: string;
}

/** Deterministic local simulator. It is not TAK and never contacts the network. */
export class MockTakServer {
  private readonly scenario: MockTakScenario;

  constructor(scenario: MockTakScenario = "success") {
    this.scenario = scenario;
  }

  handle(request: { idempotencyKey: string; payloadFingerprint: string }): MockTakResponse {
    const requestId = `mock-tak:${request.idempotencyKey}`;
    switch (this.scenario) {
      case "success":
        return {
          accepted: true,
          status: "accepted",
          responseCode: "MOCK_ACCEPTED",
          requestId,
          fiscalIdentifier: `CERT-${request.payloadFingerprint.slice(0, 16)}`,
          sanitizedMessage: "Accepted by deterministic local simulator.",
        };
      case "validation_rejection":
        return { accepted: false, status: "rejected", responseCode: "MOCK_VALIDATION_REJECTED", requestId, sanitizedMessage: "Validation rejected." };
      case "authentication_failure":
        return { accepted: false, status: "rejected", responseCode: "MOCK_AUTHENTICATION_FAILURE", requestId, sanitizedMessage: "Authentication failed." };
      case "bad_signature":
        return { accepted: false, status: "rejected", responseCode: "MOCK_BAD_SIGNATURE", requestId, sanitizedMessage: "Signature rejected." };
      case "duplicate_transaction":
        return { accepted: false, status: "rejected", responseCode: "MOCK_DUPLICATE", requestId, sanitizedMessage: "Duplicate idempotency key." };
      case "timeout":
      case "unavailable_service":
        return { accepted: false, status: "retry_required", responseCode: "MOCK_UNAVAILABLE", requestId, sanitizedMessage: "Simulator is unavailable; retry is required." };
      case "server_error":
        return { accepted: false, status: "retry_required", responseCode: "MOCK_SERVER_ERROR", requestId, sanitizedMessage: "Simulator returned a server error." };
      case "malformed_response":
        return { accepted: false, status: "rejected", responseCode: "MOCK_MALFORMED_RESPONSE", requestId, sanitizedMessage: "Simulator returned a malformed response." };
    }
  }
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
    assertFiscalTotalsReconcile(transaction);
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
