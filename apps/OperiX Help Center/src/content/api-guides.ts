import { b } from "./author";
import type { DocBlock, Locale } from "./types";

type Both<T> = Record<Locale, T>;

/** Interface strings used by the API pages. */
export const apiUi: Both<Record<string, string>> = {
  en: {
    eyebrow: "OperiX for Developers",
    homeTitle: "Build with the OperiX Invoice API",
    homeText: "Create customers, products, invoices and payments from your own website, store or back office — with signed webhooks to keep your systems in step.",
    breadcrumbRoot: "Help Center",
    breadcrumbApi: "API Documentation",
    sectionEyebrow: "OperiX API Documentation",
    onThisPage: "On this page",
    previous: "Previous",
    next: "Next",
    baseUrl: "Base URL",
    openApi: "OpenAPI contract",
    needsAddon: "Cloud feature",
    needsAddonText: "The API is part of OperiX Cloud. It is not available when OperiX Invoice stores data on this device, and it needs an active API Add-on (€4.99 per month, 5,000 requests included).",
    cloudOnly: "Requires OperiX Cloud and the API Add-on",
    endpoints: "Endpoints",
    endpointsText: "Every endpoint of this resource. Examples use fictional data and a placeholder key.",
    scope: "Required scope",
    idempotencyRequired: "Idempotency-Key required",
    parameters: "Parameters",
    name: "Name",
    location: "In",
    required: "Required",
    type: "Type",
    description: "Description",
    yes: "Yes",
    no: "No",
    requestBody: "Request body",
    responses: "Responses",
    requestExample: "Request example",
    responseExample: "Response example",
    errorsNote: "Errors use one envelope with a stable code and a request id. See Errors for every code and what to do.",
    comingSoon: "Coming soon",
    bookingTitle: "The Booking API is coming soon",
    bookingText: "OperiX Booking has not launched, so there is no Booking API to integrate with yet. This page will become the Booking reference when the product opens.",
    bookingAreas: "Planned areas",
    bookingNote: "Do not build against Booking endpoints you may see elsewhere. They are not enabled for customers and can change before launch.",
    bookingCta: "See OperiX Booking",
    host: "API host",
    tryIn: "Examples",
    statusCode: "Status",
  },
  sq: {
    eyebrow: "OperiX për zhvilluesit",
    homeTitle: "Ndërtoni me API-n e OperiX Invoice",
    homeText: "Krijoni klientë, produkte, fatura dhe pagesa nga faqja juaj, dyqani ose zyra — me webhooks të nënshkruara për t'i mbajtur sistemet në sinkron.",
    breadcrumbRoot: "Qendra e ndihmës",
    breadcrumbApi: "Dokumentacioni i API",
    sectionEyebrow: "Dokumentacioni i API të OperiX",
    onThisPage: "Në këtë faqe",
    previous: "Para",
    next: "Pas",
    baseUrl: "URL bazë",
    openApi: "Kontrata OpenAPI",
    needsAddon: "Veçori cloud",
    needsAddonText: "API është pjesë e OperiX Cloud. Nuk është në dispozicion kur OperiX Invoice i ruan të dhënat në këtë pajisje dhe kërkon një API Add-on aktiv (€4.99 në muaj, 5,000 kërkesa të përfshira).",
    cloudOnly: "Kërkon OperiX Cloud dhe API Add-on",
    endpoints: "Pikat fundore",
    endpointsText: "Çdo pikë fundore e këtij burimi. Shembujt përdorin të dhëna fiktive dhe një çelës zëvendësues.",
    scope: "Fushëveprimi i kërkuar",
    idempotencyRequired: "Kërkohet Idempotency-Key",
    parameters: "Parametrat",
    name: "Emri",
    location: "Vendi",
    required: "E detyrueshme",
    type: "Lloji",
    description: "Përshkrimi",
    yes: "Po",
    no: "Jo",
    requestBody: "Trupi i kërkesës",
    responses: "Përgjigjet",
    requestExample: "Shembull kërkese",
    responseExample: "Shembull përgjigjeje",
    errorsNote: "Gabimet përdorin një zarf me kod të qëndrueshëm dhe identifikues kërkese. Shihni Gabimet për çdo kod dhe çfarë të bëni.",
    comingSoon: "Së shpejti",
    bookingTitle: "API e Booking vjen së shpejti",
    bookingText: "OperiX Booking nuk është hapur ende, ndaj nuk ka ende API të Booking për t'u integruar. Kjo faqe do të bëhet referenca e Booking kur produkti të hapet.",
    bookingAreas: "Fushat e planifikuara",
    bookingNote: "Mos ndërtoni mbi pika fundore të Booking që mund të shihni diku tjetër. Nuk janë aktivizuar për klientët dhe mund të ndryshojnë para nisjes.",
    bookingCta: "Shihni OperiX Booking",
    host: "Hosti i API",
    tryIn: "Shembuj",
    statusCode: "Statusi",
  },
};

const BASE = "https://api.operixsuite.com";

// ---------- Shared code samples ----------
const curlCustomer = `curl -X POST ${BASE}/v1/invoice/customers \\
  -H "Authorization: Bearer $OPERIX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: customer-SHOP-842" \\
  -d '{
    "name": "Arben Krasniqi",
    "email": "arben@example.com",
    "external_reference": "SHOP-CUSTOMER-842"
  }'`;

const jsHelper = `// operix.mjs — a tiny helper. Run it on your server, never in the browser.
const BASE = "${BASE}";
const KEY = process.env.OPERIX_API_KEY; // opx_test_... while you build

export async function operix(path, { method = "GET", body, idempotencyKey } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) {
    const { code, message, request_id } = json.error;
    throw Object.assign(new Error(\`\${code}: \${message}\`), { code, status: response.status, requestId: request_id });
  }
  return json;
}`;

const jsCustomer = `import { operix } from "./operix.mjs";

const { data: customer } = await operix("/v1/invoice/customers", {
  method: "POST",
  idempotencyKey: "customer-SHOP-842",
  body: { name: "Arben Krasniqi", email: "arben@example.com", external_reference: "SHOP-CUSTOMER-842" },
});
console.log(customer.id);`;

const pyHelper = `# operix.py — a tiny helper. Run it on your server, never in the browser.
import os
import requests

BASE = "${BASE}"
KEY = os.environ["OPERIX_API_KEY"]  # opx_test_... while you build


class OperixError(Exception):
    def __init__(self, status, code, message, request_id):
        super().__init__(f"{code}: {message}")
        self.status, self.code, self.request_id = status, code, request_id


def operix(path, method="GET", body=None, idempotency_key=None):
    headers = {"Authorization": f"Bearer {KEY}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    response = requests.request(method, BASE + path, json=body, headers=headers, timeout=30)
    payload = response.json()
    if not response.ok:
        error = payload["error"]
        raise OperixError(response.status_code, error["code"], error["message"], error["request_id"])
    return payload`;

const pyCustomer = `from operix import operix

customer = operix(
    "/v1/invoice/customers",
    method="POST",
    idempotency_key="customer-SHOP-842",
    body={"name": "Arben Krasniqi", "email": "arben@example.com", "external_reference": "SHOP-CUSTOMER-842"},
)["data"]
print(customer["id"])`;

const customerResponse = `{
  "data": {
    "id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10",
    "name": "Arben Krasniqi",
    "email": "arben@example.com",
    "phone": null,
    "company": null,
    "address": null,
    "external_reference": "SHOP-CUSTOMER-842",
    "created_at": "2026-10-29T09:15:02.114Z",
    "updated_at": "2026-10-29T09:15:02.114Z"
  }
}`;

const curlInvoice = `curl -X POST ${BASE}/v1/invoice/invoices \\
  -H "Authorization: Bearer $OPERIX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: invoice-ORDER-58391" \\
  -d '{
    "customer_id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10",
    "currency": "EUR",
    "issue_date": "2026-10-29",
    "due_date": "2026-11-12",
    "payment_method": "bank_transfer",
    "external_reference": "ORDER-58391",
    "items": [
      { "name": "Website design", "quantity": "1", "unit_price": "450.00", "vat_rate": "18" },
      { "name": "Monthly support", "quantity": "2", "unit_price": "60.00", "vat_rate": "18" }
    ]
  }'`;

const jsInvoice = `const { data: invoice } = await operix("/v1/invoice/invoices", {
  method: "POST",
  idempotencyKey: "invoice-ORDER-58391",
  body: {
    customer_id: customer.id,
    currency: "EUR",
    issue_date: "2026-10-29",
    due_date: "2026-11-12",
    payment_method: "bank_transfer",
    external_reference: "ORDER-58391",
    items: [
      { name: "Website design", quantity: "1", unit_price: "450.00", vat_rate: "18" },
      { name: "Monthly support", quantity: "2", unit_price: "60.00", vat_rate: "18" },
    ],
  },
});
console.log(invoice.status, invoice.total); // "draft" 672.6`;

const pyInvoice = `invoice = operix(
    "/v1/invoice/invoices",
    method="POST",
    idempotency_key="invoice-ORDER-58391",
    body={
        "customer_id": customer["id"],
        "currency": "EUR",
        "issue_date": "2026-10-29",
        "due_date": "2026-11-12",
        "payment_method": "bank_transfer",
        "external_reference": "ORDER-58391",
        "items": [
            {"name": "Website design", "quantity": "1", "unit_price": "450.00", "vat_rate": "18"},
            {"name": "Monthly support", "quantity": "2", "unit_price": "60.00", "vat_rate": "18"},
        ],
    },
)["data"]
print(invoice["status"], invoice["total"])  # draft 672.6`;

const invoiceResponse = `{
  "data": {
    "id": "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55",
    "number": "FAT-2026-000123",
    "status": "draft",
    "subtotal": 570,
    "vat": 102.6,
    "total": 672.6,
    "currency": "EUR",
    "customer": { "id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", "name": "Arben Krasniqi", "email": "arben@example.com" },
    "items": [
      { "id": "f1a1…", "product_id": null, "name": "Website design", "quantity": 1, "unit_price": 450, "vat_rate": 18, "discount_percent": 0, "unit": "pcs", "sku": null, "tax_included": false, "amount": 450 },
      { "id": "f1a2…", "product_id": null, "name": "Monthly support", "quantity": 2, "unit_price": 60, "vat_rate": 18, "discount_percent": 0, "unit": "pcs", "sku": null, "tax_included": false, "amount": 120 }
    ],
    "external_reference": "ORDER-58391",
    "issue_date": "2026-10-29",
    "due_date": "2026-11-12",
    "notes": null,
    "created_at": "2026-10-29T09:16:40.201Z",
    "updated_at": "2026-10-29T09:16:40.201Z"
  }
}`;

const curlFinalize = `curl -X POST ${BASE}/v1/invoice/invoices/c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55/finalize \\
  -H "Authorization: Bearer $OPERIX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: finalize-ORDER-58391"`;

const jsFinalize = `const { data: issued } = await operix(\`/v1/invoice/invoices/\${invoice.id}/finalize\`, {
  method: "POST",
  idempotencyKey: "finalize-ORDER-58391",
});
console.log(issued.status); // "issued"`;

const pyFinalize = `issued = operix(
    f"/v1/invoice/invoices/{invoice['id']}/finalize",
    method="POST",
    idempotency_key="finalize-ORDER-58391",
)["data"]
print(issued["status"])  # issued`;

const curlPayment = `curl -X POST ${BASE}/v1/invoice/payments \\
  -H "Authorization: Bearer $OPERIX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: payment-ORDER-58391-1" \\
  -d '{
    "customer_id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10",
    "invoice_id": "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55",
    "amount": "672.60",
    "currency": "EUR",
    "payment_date": "2026-11-02",
    "payment_method": "bank_transfer",
    "external_reference": "BANK-REF-20261102-77"
  }'`;

const jsPayment = `const { data: payment } = await operix("/v1/invoice/payments", {
  method: "POST",
  idempotencyKey: "payment-ORDER-58391-1",
  body: {
    customer_id: customer.id,
    invoice_id: invoice.id,
    amount: "672.60",
    currency: "EUR",
    payment_date: "2026-11-02",
    payment_method: "bank_transfer",
    external_reference: "BANK-REF-20261102-77",
  },
});
console.log(payment.allocation.allocated_amount);`;

const pyPayment = `payment = operix(
    "/v1/invoice/payments",
    method="POST",
    idempotency_key="payment-ORDER-58391-1",
    body={
        "customer_id": customer["id"],
        "invoice_id": invoice["id"],
        "amount": "672.60",
        "currency": "EUR",
        "payment_date": "2026-11-02",
        "payment_method": "bank_transfer",
        "external_reference": "BANK-REF-20261102-77",
    },
)["data"]
print(payment["allocation"]["allocated_amount"])`;

const paymentResponse = `{
  "data": {
    "id": "5b7f3d0e-1c35-4f0e-8f0b-3d8e2d9a0c11",
    "payment_number": "PAY-2026-000045",
    "amount": 672.6,
    "currency": "EUR",
    "payment_date": "2026-11-02",
    "payment_method": "bank_transfer",
    "customer_id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10",
    "invoice_id": "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55",
    "external_reference": "BANK-REF-20261102-77",
    "notes": null,
    "allocation_amount": 672.6,
    "created_at": "2026-11-02T10:02:11.870Z",
    "allocation": {
      "id": "a77d…",
      "payment_id": "5b7f3d0e-1c35-4f0e-8f0b-3d8e2d9a0c11",
      "invoice_id": "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55",
      "allocated_amount": 672.6,
      "allocation_date": "2026-11-02",
      "status": "active"
    }
  }
}`;

const curlPdf = `curl ${BASE}/v1/invoice/invoices/c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55/pdf \\
  -H "Authorization: Bearer $OPERIX_API_KEY"
# → { "data": { "url": "https://invoice.operixsuite.com/api/internal/public-pdf?token=…", "expires_at": "2026-11-02T10:03:11.870Z" } }
# Download it within 60 seconds:
curl -L -o invoice.pdf "<the url from the response>"`;

const jsPdf = `import { writeFile } from "node:fs/promises";

const { data } = await operix(\`/v1/invoice/invoices/\${invoice.id}/pdf\`);
// The link works for 60 seconds. Download it straight away.
const pdf = await fetch(data.url);
await writeFile("invoice.pdf", Buffer.from(await pdf.arrayBuffer()));`;

const pyPdf = `data = operix(f"/v1/invoice/invoices/{invoice['id']}/pdf")["data"]
# The link works for 60 seconds. Download it straight away.
with open("invoice.pdf", "wb") as file:
    file.write(requests.get(data["url"], timeout=30).content)`;

const webhookNode = `import crypto from "node:crypto";
import express from "express";

const SECRET = process.env.OPERIX_WEBHOOK_SECRET; // whsec_...
const TOLERANCE_SECONDS = 300;
const app = express();

function verify(header, rawBody) {
  if (!header) return false;
  const fields = Object.fromEntries(header.split(",").map((part) => {
    const i = part.indexOf("=");
    return [part.slice(0, i), part.slice(i + 1)];
  }));
  const timestamp = Number(fields.t);
  if (!Number.isSafeInteger(timestamp) || !fields.v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(\`\${timestamp}.\${rawBody}\`, "utf8").digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(fields.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// IMPORTANT: use the raw body. Re-serialising parsed JSON changes the bytes and breaks the signature.
app.post("/webhooks/operix", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body.toString("utf8");
  if (!verify(req.header("x-operix-signature"), raw)) return res.status(400).send("bad signature");
  const event = JSON.parse(raw);
  // Deduplicate on event.id — delivery is at least once.
  console.log(event.type, event.id);
  res.sendStatus(200); // answer quickly, process in the background
});

app.listen(3000);`;

const webhookPython = `import hashlib
import hmac
import os
import time

from flask import Flask, request

SECRET = os.environ["OPERIX_WEBHOOK_SECRET"].encode()  # whsec_...
TOLERANCE_SECONDS = 300
app = Flask(__name__)


def verify(header, raw_body: bytes) -> bool:
    if not header:
        return False
    fields = dict(part.split("=", 1) for part in header.split(",") if "=" in part)
    try:
        timestamp = int(fields["t"])
        signature = fields["v1"]
    except (KeyError, ValueError):
        return False
    if abs(time.time() - timestamp) > TOLERANCE_SECONDS:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(SECRET, signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@app.post("/webhooks/operix")
def operix_webhook():
    raw = request.get_data()  # the raw bytes, not request.json
    if not verify(request.headers.get("X-OperiX-Signature"), raw):
        return "bad signature", 400
    event = request.get_json()
    # Deduplicate on event["id"] — delivery is at least once.
    print(event["type"], event["id"])
    return "", 200`;

const webhookPayload = `{
  "id": "evt_Qm3x7LwZ0a9c2uTfV8kYhA",
  "type": "invoice.finalized",
  "created_at": "2026-10-29T09:18:05.332Z",
  "data": {
    "object": {
      "id": "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55",
      "number": "FAT-2026-000123",
      "status": "issued",
      "total": 672.6,
      "currency": "EUR",
      "external_reference": "ORDER-58391"
    }
  }
}`;

const retryJs = `// Back off on 429 using Retry-After, and retry safely with the SAME Idempotency-Key.
async function withRetry(call, { attempts = 5 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const retryable = error.status === 429 || error.status >= 500 || error.code === "idempotency_in_progress";
      if (!retryable || attempt === attempts) throw error;
      const wait = error.retryAfter ?? Math.min(30, 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
}

// In the helper, copy the header onto the error:  retryAfter: Number(response.headers.get("retry-after")) || undefined`;

const retryPython = `import time

RETRYABLE = {429, 500, 502, 503, 504}

def with_retry(call, attempts=5):
    for attempt in range(1, attempts + 1):
        try:
            return call()
        except OperixError as error:
            retryable = error.status in RETRYABLE or error.code == "idempotency_in_progress"
            if not retryable or attempt == attempts:
                raise
            time.sleep(min(30, 2 ** attempt))

# Always retry a write with the SAME idempotency key:
invoice = with_retry(lambda: operix("/v1/invoice/invoices", "POST", body, idempotency_key="invoice-ORDER-58391"))`;

const orderFlowJs = `// Called by your backend when an order is paid (or confirmed).
export async function invoiceForOrder(order) {
  // 1. The customer — created once, found again by external_reference.
  const { data: customer } = await operix("/v1/invoice/customers", {
    method: "POST",
    idempotencyKey: \`customer-\${order.customerId}\`,
    body: { name: order.billing.name, email: order.billing.email, phone: order.billing.phone, external_reference: \`SHOP-CUSTOMER-\${order.customerId}\` },
  });

  // 2. A draft invoice. One idempotency key per order makes retries safe.
  const { data: invoice } = await operix("/v1/invoice/invoices", {
    method: "POST",
    idempotencyKey: \`invoice-order-\${order.id}\`,
    body: {
      customer_id: customer.id,
      currency: order.currency,
      issue_date: order.paidAt.slice(0, 10),
      due_date: order.paidAt.slice(0, 10),
      payment_method: order.paymentMethod === "card" ? "card" : "bank_transfer",
      external_reference: \`ORDER-\${order.id}\`,
      shipping: order.shipping.net,
      shipping_tax_rate: "18",
      items: order.lines.map((line) => ({ name: line.title, sku: line.sku, quantity: String(line.qty), unit_price: line.netUnitPrice, vat_rate: "18" })),
    },
  });

  // 3. Issue it — the invoice now has its legal number and can no longer be edited.
  const { data: issued } = await operix(\`/v1/invoice/invoices/\${invoice.id}/finalize\`, { method: "POST", idempotencyKey: \`finalize-order-\${order.id}\` });

  // 4. If the customer already paid online, record the payment against it.
  if (order.paid) {
    await operix("/v1/invoice/payments", {
      method: "POST",
      idempotencyKey: \`payment-order-\${order.id}-\${order.paymentId}\`,
      body: { customer_id: customer.id, invoice_id: issued.id, amount: order.total, currency: order.currency, payment_date: order.paidAt.slice(0, 10), payment_method: "online_payment", external_reference: order.paymentId },
    });
  }
  return issued;
}`;

// ---------- Guides ----------
const requirementsEn = b.table(["Requirement", "Details"], [
  ["OperiX Cloud", "The API works on workspaces that store their data in OperiX Cloud. It is not available while OperiX Invoice keeps data on a device."],
  ["Product subscription", "An active OperiX Invoice subscription (or Suite)."],
  ["API Add-on", "€4.99 per month. Includes 5,000 live requests each month. Automatic overage charging is not enabled."],
  ["Who can create keys", "People with permission to manage integrations in the workspace (administrators), in Settings → Developers."],
  ["Server-side only", "Keys are secrets. Call the API from your server or a serverless function, never from a browser or mobile app."],
]);
const requirementsSq = b.table(["Kërkesa", "Detaje"], [
  ["OperiX Cloud", "API funksionon në hapësira pune që i ruajnë të dhënat në OperiX Cloud. Nuk është në dispozicion kur OperiX Invoice i mban të dhënat në një pajisje."],
  ["Abonim produkti", "Një abonim aktiv OperiX Invoice (ose Suite)."],
  ["API Add-on", "€4.99 në muaj. Përfshin 5,000 kërkesa live çdo muaj. Faturimi automatik i tejkalimit nuk është aktivizuar."],
  ["Kush mund të krijojë çelësa", "Njerëzit me leje për të menaxhuar integrimet në hapësirën e punës (administratorët), te Cilësimet → Zhvilluesit."],
  ["Vetëm nga serveri", "Çelësat janë sekrete. Thirrni API nga serveri ose një funksion serverless, kurrë nga shfletuesi ose aplikacioni celular."],
]);

export const apiGuides: Record<string, Both<DocBlock[]>> = {
  introduction: {
    en: [
      b.p("The OperiX Invoice API lets your own systems create and read the same data you see in OperiX Invoice: customers, products, invoices, payments and invoice PDFs. Totals, VAT, numbering and status rules are calculated by OperiX, exactly as in the web and mobile apps, so an invoice created through the API is the same invoice you would have created by hand."),
      b.h2("what-you-need", "What you need"),
      requirementsEn,
      b.h2("how-requests-work", "How requests work"),
      b.ul([
        `**Base URL** — ${BASE}. All paths start with /v1, for example /v1/invoice/invoices.`,
        "**JSON** — send and receive application/json. Request bodies are limited to 256 KiB.",
        "**Authentication** — a Bearer API key in the Authorization header (see Authentication).",
        "**Money** — send amounts as decimal strings such as \"450.00\" (numbers are accepted too, up to 4 decimals). Responses return amounts as JSON numbers or decimal strings; parse them with a decimal library, not floating point.",
        "**Dates** — dates are ISO 8601: 2026-10-29 for dates and 2026-10-29T09:15:02Z for timestamps.",
        "**Envelope** — a single resource is returned as { \"data\": {...} } and a list as { \"data\": [...], \"pagination\": {...} }.",
        "**Request ids** — every response carries an X-Request-Id header. Quote it when you contact support.",
      ].map((item) => item.replace(/\*\*/g, ""))),
      b.h2("resources", "Resources"),
      b.link("Customers", "People and companies you bill.", "/en/api/invoice-customers"),
      b.link("Products", "Products and services with price, VAT and stock.", "/en/api/invoice-products"),
      b.link("Invoices", "Invoices and supported commercial documents, with a draft → issued → void lifecycle.", "/en/api/invoice-invoices"),
      b.link("Payments", "Money received, allocated to invoices or kept on account.", "/en/api/invoice-payments"),
      b.link("PDFs", "The same PDF OperiX Invoice produces.", "/en/api/invoice-pdfs"),
      b.h2("what-the-api-does-not-do", "What the API does not do"),
      b.ul([
        "It does not submit anything to the Tax Administration. OperiX Invoice prepares VAT registers and reports but does not file declarations electronically.",
        "It cannot rewrite an issued invoice. Finalized financial records are immutable; correct them with the supported correction documents.",
        "It does not accept client-supplied totals. Totals are always computed by OperiX from your lines.",
        "It does not expose payroll, accounting ledgers or settings.",
      ]),
      b.note("OperiX Booking will get its own API when the product launches. See Booking API — Coming Soon.", "Booking"),
      b.h2("next-steps", "Next steps"),
      b.link("Quick Start", "Make your first requests in a few minutes.", "/en/api/quick-start"),
      b.link("Authentication", "Keys, environments and attribution.", "/en/api/authentication"),
    ],
    sq: [
      b.p("API e OperiX Invoice i lejon sistemeve tuaja të krijojnë dhe lexojnë të njëjtat të dhëna që shihni në OperiX Invoice: klientë, produkte, fatura, pagesa dhe PDF të faturave. Totalet, TVSH-ja, numërimi dhe rregullat e statusit llogariten nga OperiX, saktësisht si në aplikacionet web dhe celular, ndaj një faturë e krijuar përmes API është e njëjta faturë që do të krijonit me dorë."),
      b.h2("what-you-need", "Çfarë ju duhet"),
      requirementsSq,
      b.h2("how-requests-work", "Si funksionojnë kërkesat"),
      b.ul([
        `URL bazë — ${BASE}. Të gjitha rrugët fillojnë me /v1, për shembull /v1/invoice/invoices.`,
        "JSON — dërgoni dhe merrni application/json. Trupat e kërkesave kufizohen në 256 KiB.",
        "Autentikimi — një çelës Bearer API në header-in Authorization (shihni Autentikimin).",
        "Paratë — dërgoni shumat si vargje dhjetore si \"450.00\" (pranohen edhe numra, deri në 4 dhjetore). Përgjigjet i kthejnë shumat si numra JSON ose vargje dhjetore; përpunojini me një bibliotekë dhjetore, jo me pikë lundruese.",
        "Datat — datat janë ISO 8601: 2026-10-29 për data dhe 2026-10-29T09:15:02Z për vula kohore.",
        "Zarfi — një burim i vetëm kthehet si { \"data\": {...} } dhe një listë si { \"data\": [...], \"pagination\": {...} }.",
        "Identifikuesit e kërkesave — çdo përgjigje mban header-in X-Request-Id. Citojeni kur kontaktoni mbështetjen.",
      ]),
      b.h2("resources", "Burimet"),
      b.link("Klientët", "Persona dhe kompani që faturoni.", "/sq/api/invoice-customers"),
      b.link("Produktet", "Produkte e shërbime me çmim, TVSH dhe stok.", "/sq/api/invoice-products"),
      b.link("Faturat", "Fatura dhe dokumente tregtare të mbështetura, me ciklin draft → lëshuar → anuluar.", "/sq/api/invoice-invoices"),
      b.link("Pagesat", "Para të marra, të alokuara te faturat ose të mbajtura në llogari.", "/sq/api/invoice-payments"),
      b.link("PDF", "I njëjti PDF që prodhon OperiX Invoice.", "/sq/api/invoice-pdfs"),
      b.h2("what-the-api-does-not-do", "Çfarë nuk bën API"),
      b.ul([
        "Nuk dorëzon asgjë te Administrata Tatimore. OperiX Invoice përgatit librat e TVSH-së dhe raportet por nuk paraqet deklarata elektronikisht.",
        "Nuk mund të rishkruajë një faturë të lëshuar. Regjistrimet financiare të finalizuara janë të pandryshueshme; korrigjojini me dokumentet korrigjuese të mbështetura.",
        "Nuk pranon totale të dërguara nga klienti. Totalet llogariten gjithmonë nga OperiX nga rreshtat tuaj.",
        "Nuk ekspozon pagat, librat kontabël ose cilësimet.",
      ]),
      b.note("OperiX Booking do të ketë API-n e vet kur produkti të hapet. Shihni API e Booking — së shpejti.", "Booking"),
      b.h2("next-steps", "Hapat e ardhshëm"),
      b.link("Fillim i shpejtë", "Bëni kërkesat e para për pak minuta.", "/sq/api/quick-start"),
      b.link("Autentikimi", "Çelësat, mjediset dhe atribuimi.", "/sq/api/authentication"),
    ],
  },

  "quick-start": {
    en: [
      b.p("This walkthrough creates a customer, an invoice, issues it, records a payment and downloads the PDF. Use a Test key so nothing touches your real books."),
      b.h2("before-you-start", "Before you start"),
      b.steps([
        { title: "Make sure you are on OperiX Cloud", text: "Open Settings → Data storage in OperiX Invoice. The API needs the cloud mode. Switch the workspace to OperiX Cloud if it is on this device." },
        { title: "Add the API Add-on", text: "Open Settings → Developers and choose Add API Access (€4.99/month). Checkout is handled by Stripe." },
        { title: "Create a Test key", text: "In Settings → Developers → API keys, enter a name, choose Test, tick the scopes you need (customer:write, invoice:write, invoice:finalize, payment:write, document:read, plus the read scopes), and choose Create API key." },
        { title: "Copy the secret now", text: "The full key is shown once. Store it in an environment variable such as OPERIX_API_KEY on your server." },
      ]),
      b.warn("Never put an API key in front-end code, a mobile app, a public repository or a chat. If one leaks, revoke it in Settings → Developers and create a new one.", "Keep keys secret"),
      b.h2("helper", "A small helper"),
      b.p("The examples below use one helper that adds the headers, parses errors and reports the request id."),
      b.tabs([{ label: "JavaScript", language: "javascript", code: jsHelper }, { label: "Python", language: "python", code: pyHelper }]),
      b.h2("create-a-customer", "1. Create a customer"),
      b.p("Send an Idempotency-Key with every write. The external_reference is your own id for the customer; OperiX can find the customer again by it."),
      b.tabs([{ label: "cURL", language: "bash", code: curlCustomer }, { label: "JavaScript", language: "javascript", code: jsCustomer }, { label: "Python", language: "python", code: pyCustomer }]),
      b.code("json", customerResponse, "201 Created"),
      b.h2("create-an-invoice", "2. Create an invoice"),
      b.p("The invoice is created as a draft. OperiX calculates subtotal, VAT and total from your lines. If you leave vat_rate out, the line is created with 0% VAT, so set it explicitly (18 or 8 for Kosovo)."),
      b.tabs([{ label: "cURL", language: "bash", code: curlInvoice }, { label: "JavaScript", language: "javascript", code: jsInvoice }, { label: "Python", language: "python", code: pyInvoice }]),
      b.code("json", invoiceResponse, "201 Created"),
      b.h2("finalize-the-invoice", "3. Finalize (issue) the invoice"),
      b.p("Finalizing issues the invoice. After this it can no longer be edited, only paid, voided or corrected."),
      b.tabs([{ label: "cURL", language: "bash", code: curlFinalize }, { label: "JavaScript", language: "javascript", code: jsFinalize }, { label: "Python", language: "python", code: pyFinalize }]),
      b.h2("record-a-payment", "4. Record a payment"),
      b.p("Send customer_id and, to allocate the money to the invoice, invoice_id. Leave invoice_id out to keep the money on the customer's account."),
      b.tabs([{ label: "cURL", language: "bash", code: curlPayment }, { label: "JavaScript", language: "javascript", code: jsPayment }, { label: "Python", language: "python", code: pyPayment }]),
      b.code("json", paymentResponse, "201 Created"),
      b.h2("download-the-pdf", "5. Download the PDF"),
      b.p("The PDF endpoint returns a link that works for 60 seconds. Request it when you need it and download it immediately."),
      b.tabs([{ label: "cURL", language: "bash", code: curlPdf }, { label: "JavaScript", language: "javascript", code: jsPdf }, { label: "Python", language: "python", code: pyPdf }]),
      b.h2("what-next", "What next"),
      b.ul(["Read Idempotency before you retry writes.", "Set up Webhooks so you do not have to poll.", "Read the Invoice Integration Guide to connect a store.", "Create a Live key only after your Test integration works."]),
    ],
    sq: [
      b.p("Ky udhëzues krijon një klient, një faturë, e lëshon, regjistron një pagesë dhe shkarkon PDF-në. Përdorni një çelës Test që asgjë të mos prekë librat tuaj realë."),
      b.h2("before-you-start", "Para se të filloni"),
      b.steps([
        { title: "Sigurohuni që jeni në OperiX Cloud", text: "Hapni Cilësimet → Ruajtja e të dhënave te OperiX Invoice. API kërkon mënyrën cloud. Kaloni hapësirën e punës në OperiX Cloud nëse është në këtë pajisje." },
        { title: "Shtoni API Add-on", text: "Hapni Cilësimet → Zhvilluesit dhe zgjidhni Shto qasje në API (€4.99/muaj). Pagesën e kryen Stripe." },
        { title: "Krijoni një çelës Test", text: "Te Cilësimet → Zhvilluesit → Çelësat API, shkruani një emër, zgjidhni Test, zgjidhni fushëveprimet që ju duhen (customer:write, invoice:write, invoice:finalize, payment:write, document:read, plus ato të leximit) dhe zgjidhni Krijo çelës API." },
        { title: "Kopjojeni sekretin tani", text: "Çelësi i plotë shfaqet vetëm një herë. Ruajeni në një ndryshore mjedisi si OPERIX_API_KEY në serverin tuaj." },
      ]),
      b.warn("Mos e vendosni kurrë një çelës API në kod front-end, aplikacion celular, depo publike ose bisedë. Nëse rrjedh, shfuqizojeni te Cilësimet → Zhvilluesit dhe krijoni një të ri.", "Mbajini çelësat sekretë"),
      b.h2("helper", "Një ndihmës i vogël"),
      b.p("Shembujt më poshtë përdorin një ndihmës që shton header-at, analizon gabimet dhe raporton identifikuesin e kërkesës."),
      b.tabs([{ label: "JavaScript", language: "javascript", code: jsHelper }, { label: "Python", language: "python", code: pyHelper }]),
      b.h2("create-a-customer", "1. Krijoni një klient"),
      b.p("Dërgoni një Idempotency-Key me çdo shkrim. external_reference është id-ja juaj për klientin; OperiX mund ta gjejë klientin përsëri me të."),
      b.tabs([{ label: "cURL", language: "bash", code: curlCustomer }, { label: "JavaScript", language: "javascript", code: jsCustomer }, { label: "Python", language: "python", code: pyCustomer }]),
      b.code("json", customerResponse, "201 Created"),
      b.h2("create-an-invoice", "2. Krijoni një faturë"),
      b.p("Fatura krijohet si draft. OperiX llogarit nëntotalin, TVSH-në dhe totalin nga rreshtat tuaj. Nëse e lini jashtë vat_rate, rreshti krijohet me 0% TVSH, ndaj vendoseni qartë (18 ose 8 për Kosovën)."),
      b.tabs([{ label: "cURL", language: "bash", code: curlInvoice }, { label: "JavaScript", language: "javascript", code: jsInvoice }, { label: "Python", language: "python", code: pyInvoice }]),
      b.code("json", invoiceResponse, "201 Created"),
      b.h2("finalize-the-invoice", "3. Finalizoni (lëshoni) faturën"),
      b.p("Finalizimi e lëshon faturën. Pas kësaj nuk mund të ndryshohet më, vetëm të paguhet, anulohet ose korrigjohet."),
      b.tabs([{ label: "cURL", language: "bash", code: curlFinalize }, { label: "JavaScript", language: "javascript", code: jsFinalize }, { label: "Python", language: "python", code: pyFinalize }]),
      b.h2("record-a-payment", "4. Regjistroni një pagesë"),
      b.p("Dërgoni customer_id dhe, për ta alokuar paranë te fatura, invoice_id. Lëreni jashtë invoice_id për ta mbajtur paranë në llogarinë e klientit."),
      b.tabs([{ label: "cURL", language: "bash", code: curlPayment }, { label: "JavaScript", language: "javascript", code: jsPayment }, { label: "Python", language: "python", code: pyPayment }]),
      b.code("json", paymentResponse, "201 Created"),
      b.h2("download-the-pdf", "5. Shkarkoni PDF-në"),
      b.p("Pika fundore e PDF kthen një lidhje që funksionon 60 sekonda. Kërkojeni kur ju duhet dhe shkarkojeni menjëherë."),
      b.tabs([{ label: "cURL", language: "bash", code: curlPdf }, { label: "JavaScript", language: "javascript", code: jsPdf }, { label: "Python", language: "python", code: pyPdf }]),
      b.h2("what-next", "Çfarë më pas"),
      b.ul(["Lexoni Idempotencën para se të riprovoni shkrime.", "Vendosni Webhooks që të mos duhet të pyesni vazhdimisht.", "Lexoni Udhëzuesin e integrimit për të lidhur një dyqan.", "Krijoni një çelës Live vetëm pasi integrimi me Test të funksionojë."]),
    ],
  },

  authentication: {
    en: [
      b.p("Every request is authenticated with an API key sent as a Bearer token."),
      b.code("http", "GET /v1/invoice/customers HTTP/1.1\nHost: api.operixsuite.com\nAuthorization: Bearer opx_test_9fK2…\nAccept: application/json", "Request headers"),
      b.h2("key-format", "Key format"),
      b.table(["Part", "Meaning"], [
        ["opx_test_… / opx_live_…", "The prefix tells the API which environment the key belongs to. Test keys can never read or write live data."],
        ["Random part", "43 characters generated from 32 random bytes. Only a SHA-256 hash is stored, so OperiX cannot show you the key again."],
        ["Masked prefix", "In Settings → Developers you see the first 13 characters and the last 4, for example opx_live_AbCd…WxYz, to recognise a key without exposing it."],
      ]),
      b.h2("who-the-request-acts-as", "Who the request acts as"),
      b.p("A key belongs to one workspace and acts with the permissions of the person who created it. Data visibility and write rules are the same as for that person in OperiX Invoice. If that person is removed from the workspace, the key stops working and returns api_key_unusable; create a new key from an active administrator."),
      b.h2("what-is-checked", "What is checked on every request"),
      b.ol([
        "The Authorization header is present and is a Bearer key — otherwise 401 invalid_api_key.",
        "The key exists, matches its environment, is not revoked and has not expired — 401 invalid_api_key, wrong_environment, api_key_revoked or api_key_expired.",
        "The rate limit for the key — 429 rate_limit_exceeded.",
        "An active API Add-on and Invoice subscription for the workspace — 403 api_subscription_required.",
        "The scope for the endpoint — 403 missing_scope.",
      ]),
      b.h2("good-practice", "Good practice"),
      b.ul(["Keep keys in environment variables or a secrets manager.", "Use one key per integration so you can revoke one without breaking others.", "Give each key only the scopes it needs.", "Set an expiry date on keys for temporary integrations.", "Rotate keys regularly and when someone with access leaves."]),
      b.danger("Never send a key in a URL, a query string, a front-end bundle or a log. Redact the Authorization header in your logs.", "Secrets"),
    ],
    sq: [
      b.p("Çdo kërkesë autentikohet me një çelës API të dërguar si token Bearer."),
      b.code("http", "GET /v1/invoice/customers HTTP/1.1\nHost: api.operixsuite.com\nAuthorization: Bearer opx_test_9fK2…\nAccept: application/json", "Header-at e kërkesës"),
      b.h2("key-format", "Formati i çelësit"),
      b.table(["Pjesa", "Kuptimi"], [
        ["opx_test_… / opx_live_…", "Prefiksi i tregon API cilit mjedis i përket çelësi. Çelësat Test nuk mund të lexojnë ose shkruajnë kurrë të dhëna live."],
        ["Pjesa e rastësishme", "43 karaktere të gjeneruara nga 32 bajt të rastësishëm. Ruhet vetëm një hash SHA-256, ndaj OperiX nuk mund t'jua shfaqë çelësin përsëri."],
        ["Prefiksi i maskuar", "Te Cilësimet → Zhvilluesit shihni 13 karakteret e para dhe 4 të fundit, p.sh. opx_live_AbCd…WxYz, për ta njohur një çelës pa e ekspozuar."],
      ]),
      b.h2("who-the-request-acts-as", "Si kush vepron kërkesa"),
      b.p("Një çelës i përket një hapësire pune dhe vepron me lejet e personit që e krijoi. Dukshmëria e të dhënave dhe rregullat e shkrimit janë të njëjta si për atë person në OperiX Invoice. Nëse ai person hiqet nga hapësira, çelësi ndalon së funksionuari dhe kthen api_key_unusable; krijoni një çelës të ri nga një administrator aktiv."),
      b.h2("what-is-checked", "Çfarë kontrollohet në çdo kërkesë"),
      b.ol([
        "Header-i Authorization ekziston dhe është çelës Bearer — përndryshe 401 invalid_api_key.",
        "Çelësi ekziston, përputhet me mjedisin, nuk është shfuqizuar dhe nuk ka skaduar — 401 invalid_api_key, wrong_environment, api_key_revoked ose api_key_expired.",
        "Kufiri i kërkesave për çelësin — 429 rate_limit_exceeded.",
        "Një API Add-on aktiv dhe abonim Invoice për hapësirën e punës — 403 api_subscription_required.",
        "Fushëveprimi për pikën fundore — 403 missing_scope.",
      ]),
      b.h2("good-practice", "Praktikë e mirë"),
      b.ul(["Ruajini çelësat në ndryshore mjedisi ose në një menaxher sekretesh.", "Përdorni një çelës për integrim që të shfuqizoni njërin pa prishur të tjerët.", "Jepini çdo çelësi vetëm fushëveprimet që i duhen.", "Vendosni datë skadimi për çelësat e integrimeve të përkohshme.", "Rrotulloni çelësat rregullisht dhe kur largohet dikush me qasje."]),
      b.danger("Mos e dërgoni kurrë një çelës në URL, në query string, në paketë front-end ose në regjistra. Maskojeni header-in Authorization në regjistrat tuaj.", "Sekretet"),
    ],
  },

  "test-mode": {
    en: [
      b.p("Test mode lets you build and check an integration without creating real invoices or payments. It uses the same host and the same endpoints, with opx_test_ keys."),
      b.table(["", "Test", "Live"], [
        ["Key prefix", "opx_test_", "opx_live_"],
        ["Data", "Separate test data. Never reads or writes your live workspace.", "Your real workspace data."],
        ["Rate limit", "60 requests per minute per key", "120 requests per minute per key"],
        ["Counts toward the 5,000 monthly requests", "No", "Yes"],
        ["Webhook endpoints", "Environment: Test", "Environment: Live"],
        ["Legal effect", "None. Do not use test invoices as financial records.", "Real invoices, numbering and payments."],
      ]),
      b.h2("responses", "How you can tell which environment answered"),
      b.p("Every response includes the header X-OperiX-Environment with the value test or live. Log it next to X-Request-Id."),
      b.h2("going-live", "Going live"),
      b.ol([
        "Run your whole flow — customer, invoice, finalize, payment, PDF and webhooks — with a Test key.",
        "Create a Live key with the same scopes in Settings → Developers.",
        "Add a Live webhook endpoint and keep the secret separate from the Test one.",
        "Switch the key in your server configuration. No code changes are needed; only the key differs.",
        "Check the first live invoice in OperiX Invoice and confirm the numbering and VAT.",
      ]),
      b.warn("A Test key used against the wrong URL or a Live key in a test script is the most common mistake. Keep keys in separate environment variables for each environment.", "Mixing environments"),
    ],
    sq: [
      b.p("Modaliteti Test ju lejon të ndërtoni dhe kontrolloni një integrim pa krijuar fatura ose pagesa reale. Përdor të njëjtin host dhe të njëjtat pika fundore, me çelësa opx_test_."),
      b.table(["", "Test", "Live"], [
        ["Prefiksi i çelësit", "opx_test_", "opx_live_"],
        ["Të dhënat", "Të dhëna test të ndara. Nuk lexon e nuk shkruan kurrë hapësirën tuaj live.", "Të dhënat reale të hapësirës suaj."],
        ["Kufiri i kërkesave", "60 kërkesa në minutë për çelës", "120 kërkesa në minutë për çelës"],
        ["Llogaritet te 5,000 kërkesat mujore", "Jo", "Po"],
        ["Pikat fundore webhook", "Mjedisi: Test", "Mjedisi: Live"],
        ["Efekti ligjor", "Asnjë. Mos i përdorni faturat test si regjistrime financiare.", "Fatura, numërim dhe pagesa reale."],
      ]),
      b.h2("responses", "Si e dalloni cili mjedis u përgjigj"),
      b.p("Çdo përgjigje përfshin header-in X-OperiX-Environment me vlerën test ose live. Regjistrojeni pranë X-Request-Id."),
      b.h2("going-live", "Kalimi live"),
      b.ol([
        "Ekzekutoni gjithë rrjedhën — klient, faturë, finalizim, pagesë, PDF dhe webhooks — me një çelës Test.",
        "Krijoni një çelës Live me të njëjtat fushëveprime te Cilësimet → Zhvilluesit.",
        "Shtoni një pikë fundore webhook Live dhe mbajeni sekretin të ndarë nga ai i Test.",
        "Ndryshoni çelësin në konfigurimin e serverit. Nuk duhen ndryshime kodi; vetëm çelësi ndryshon.",
        "Kontrolloni faturën e parë live te OperiX Invoice dhe konfirmoni numërimin dhe TVSH-në.",
      ]),
      b.warn("Një çelës Test në URL të gabuar ose një çelës Live në një skript testi është gabimi më i shpeshtë. Mbajini çelësat në ndryshore të ndara mjedisi për çdo mjedis.", "Përzierja e mjediseve"),
    ],
  },

  "api-keys": {
    en: [
      b.p("API keys are created and managed in OperiX Invoice on the web: Settings → Developers. The Developers tab appears only for workspaces on OperiX Cloud, and only to people who can manage integrations."),
      b.h2("create", "Create a key"),
      b.steps([
        { title: "Open Settings → Developers", text: "If you see an offer for the API Add-on, add it first (€4.99 per month, 5,000 requests included)." },
        { title: "Name the key", text: "Use something you will recognise, such as Website Production or Test shop." },
        { title: "Choose the environment", text: "Test or Live." },
        { title: "Optionally set an expiry", text: "Useful for temporary integrations." },
        { title: "Tick the scopes", text: "Only what this integration needs. See Permissions and Scopes." },
        { title: "Create API key and copy the secret", text: "The secret is shown once, in a yellow box. Copy it now." },
      ]),
      b.h2("manage", "Rotate and revoke"),
      b.table(["Action", "What happens", "When to use it"], [
        ["Rotate", "A new secret replaces the old one immediately. The old secret stops working at once and the new one is shown once. Name, environment and scopes stay the same.", "On a schedule, or after a person with access leaves. Update your server configuration straight away."],
        ["Revoke", "The key is disabled permanently. Requests with it return api_key_revoked.", "When a key is no longer needed or may have leaked."],
        ["Expiry", "After the expiry time the key returns api_key_expired.", "For temporary access."],
      ]),
      b.note("Because a rotated key stops working immediately, rotate during a quiet moment or deploy the new key first where you can run two keys side by side (create a second key, switch over, then revoke the first).", "Zero-downtime rotation"),
      b.h2("monitor", "Monitor usage"),
      b.p("Settings → Developers shows requests in the current period against the 5,000 included, requests today, successful and failed calls, your top endpoints and recent request logs (request id, method, endpoint, status and duration). Request bodies and secrets are never logged."),
      b.h2("limits", "Good to know"),
      b.ul(["A key can only reach its own workspace.", "Last used time is shown for each key so you can find unused ones.", "Test requests do not count toward the monthly included requests."]),
    ],
    sq: [
      b.p("Çelësat API krijohen dhe menaxhohen në OperiX Invoice në web: Cilësimet → Zhvilluesit. Skeda Zhvilluesit shfaqet vetëm për hapësira pune në OperiX Cloud dhe vetëm për persona që mund të menaxhojnë integrimet."),
      b.h2("create", "Krijoni një çelës"),
      b.steps([
        { title: "Hapni Cilësimet → Zhvilluesit", text: "Nëse shihni ofertën për API Add-on, shtojeni fillimisht (€4.99 në muaj, 5,000 kërkesa të përfshira)." },
        { title: "Emërtojeni çelësin", text: "Përdorni diçka që do ta njihni, si Website Production ose Dyqani test." },
        { title: "Zgjidhni mjedisin", text: "Test ose Live." },
        { title: "Opsionalisht vendosni skadim", text: "E dobishme për integrime të përkohshme." },
        { title: "Zgjidhni fushëveprimet", text: "Vetëm çfarë i duhet këtij integrimi. Shihni Lejet dhe fushëveprimet." },
        { title: "Krijo çelës API dhe kopjoni sekretin", text: "Sekreti shfaqet një herë, në një kuti të verdhë. Kopjojeni tani." },
      ]),
      b.h2("manage", "Rrotullimi dhe shfuqizimi"),
      b.table(["Veprimi", "Çfarë ndodh", "Kur ta përdorni"], [
        ["Rrotullo", "Një sekret i ri zëvendëson të vjetrin menjëherë. Sekreti i vjetër ndalon së funksionuari në çast dhe i riu shfaqet një herë. Emri, mjedisi dhe fushëveprimet mbeten.", "Sipas orarit, ose pasi largohet dikush me qasje. Përditësoni konfigurimin e serverit menjëherë."],
        ["Shfuqizo", "Çelësi çaktivizohet përgjithmonë. Kërkesat me të kthejnë api_key_revoked.", "Kur çelësi nuk duhet më ose mund të ketë rrjedhur."],
        ["Skadimi", "Pas kohës së skadimit çelësi kthen api_key_expired.", "Për qasje të përkohshme."],
      ]),
      b.note("Meqë një çelës i rrotulluar ndalon menjëherë, rrotulloni në një moment të qetë ose vendosni çelësin e ri fillimisht ku mund të përdorni dy çelësa paralelisht (krijoni një çelës të dytë, kaloni, pastaj shfuqizoni të parin).", "Rrotullim pa ndërprerje"),
      b.h2("monitor", "Ndiqni përdorimin"),
      b.p("Cilësimet → Zhvilluesit tregon kërkesat e periudhës aktuale ndaj 5,000 të përfshirave, kërkesat e sotme, thirrjet e suksesshme dhe të dështuara, pikat fundore kryesore dhe regjistrat e fundit të kërkesave (identifikuesi, metoda, pika fundore, statusi dhe kohëzgjatja). Trupat e kërkesave dhe sekretet nuk regjistrohen kurrë."),
      b.h2("limits", "Mirë për t'u ditur"),
      b.ul(["Një çelës mund të arrijë vetëm hapësirën e vet të punës.", "Koha e përdorimit të fundit shfaqet për çdo çelës që të gjeni të papërdorurit.", "Kërkesat Test nuk llogariten te kërkesat mujore të përfshira."]),
    ],
  },

  permissions: {
    en: [
      b.p("Scopes decide what a key may do. Choose the smallest set that works. A request without the needed scope returns 403 missing_scope and names the scope it needed."),
      b.h2("scopes", "Invoice scopes"),
      b.table(["Scope", "Allows"], [
        ["customer:read", "List and get customers."],
        ["customer:write", "Create and update customers. Also lets invoice creation create an inline customer."],
        ["product:read", "List and get products."],
        ["product:write", "Create and update products."],
        ["invoice:read", "List and get invoices (document type INVOICE)."],
        ["invoice:write", "Create invoices and update draft invoices."],
        ["invoice:finalize", "Finalize (issue) an invoice."],
        ["invoice:void", "Void (cancel) an invoice."],
        ["payment:read", "List payments and an invoice's payments."],
        ["payment:write", "Record payments."],
        ["document:read", "Read documents that are not plain invoices (quotes, pro-formas, orders, delivery notes, credit and debit notes) and retrieve invoice PDFs."],
        ["document:write", "Create, update, finalize or void documents that are not plain invoices."],
      ]),
      b.note("Booking scopes (booking:read, availability:read, service:write and so on) exist in the key creation form but belong to OperiX Booking, which is coming soon. Do not select them for an Invoice integration.", "Booking scopes"),
      b.h2("recipes", "Recommended scope sets"),
      b.table(["Integration", "Scopes"], [
        ["Ecommerce store that creates and issues invoices", "customer:write, customer:read, invoice:write, invoice:finalize, invoice:read, payment:write, document:read"],
        ["Read-only reporting or sync", "customer:read, product:read, invoice:read, payment:read"],
        ["Product catalogue sync", "product:read, product:write"],
        ["Payment reconciliation job", "invoice:read, payment:read, payment:write, customer:read"],
        ["Back office that also voids invoices", "invoice:read, invoice:write, invoice:finalize, invoice:void, customer:read, payment:read"],
      ]),
      b.h2("document-types", "Documents other than invoices"),
      b.p("The invoice endpoints also handle other commercial documents when you pass document_type. For any type other than INVOICE the document:write scope is needed to create, update, finalize or void, and document:read to list or get. See Document Types."),
      b.h2("entitlements", "Subscription checks"),
      b.p("Scopes are not the only gate. The workspace also needs an active OperiX Invoice subscription and the API Add-on, otherwise every call returns 403 api_subscription_required."),
    ],
    sq: [
      b.p("Fushëveprimet vendosin çfarë mund të bëjë një çelës. Zgjidhni bashkësinë më të vogël që funksionon. Një kërkesë pa fushëveprimin e nevojshëm kthen 403 missing_scope dhe emërton fushëveprimin e kërkuar."),
      b.h2("scopes", "Fushëveprimet e Invoice"),
      b.table(["Fushëveprimi", "Lejon"], [
        ["customer:read", "Listimin dhe marrjen e klientëve."],
        ["customer:write", "Krijimin dhe përditësimin e klientëve. Lejon gjithashtu krijimin e faturës të krijojë një klient brenda saj."],
        ["product:read", "Listimin dhe marrjen e produkteve."],
        ["product:write", "Krijimin dhe përditësimin e produkteve."],
        ["invoice:read", "Listimin dhe marrjen e faturave (lloji INVOICE)."],
        ["invoice:write", "Krijimin e faturave dhe përditësimin e drafteve."],
        ["invoice:finalize", "Finalizimin (lëshimin) e një fature."],
        ["invoice:void", "Anulimin e një fature."],
        ["payment:read", "Listimin e pagesave dhe të pagesave të një fature."],
        ["payment:write", "Regjistrimin e pagesave."],
        ["document:read", "Leximin e dokumenteve që nuk janë fatura të thjeshta (oferta, proformë, porosi, fletëdërgesa, nota krediti e debiti) dhe marrjen e PDF të faturave."],
        ["document:write", "Krijimin, përditësimin, finalizimin ose anulimin e dokumenteve që nuk janë fatura të thjeshta."],
      ]),
      b.note("Fushëveprimet e Booking (booking:read, availability:read, service:write etj.) ekzistojnë në formularin e krijimit të çelësit por i përkasin OperiX Booking, që vjen së shpejti. Mos i zgjidhni për një integrim Invoice.", "Fushëveprimet e Booking"),
      b.h2("recipes", "Bashkësi të rekomanduara"),
      b.table(["Integrimi", "Fushëveprimet"], [
        ["Dyqan online që krijon dhe lëshon fatura", "customer:write, customer:read, invoice:write, invoice:finalize, invoice:read, payment:write, document:read"],
        ["Raportim ose sinkronizim vetëm për lexim", "customer:read, product:read, invoice:read, payment:read"],
        ["Sinkronizim i katalogut të produkteve", "product:read, product:write"],
        ["Punë pajtimi pagesash", "invoice:read, payment:read, payment:write, customer:read"],
        ["Zyra që anulon edhe fatura", "invoice:read, invoice:write, invoice:finalize, invoice:void, customer:read, payment:read"],
      ]),
      b.h2("document-types", "Dokumente të ndryshme nga faturat"),
      b.p("Pikat fundore të faturave trajtojnë edhe dokumente të tjera tregtare kur jepni document_type. Për çdo lloj tjetër nga INVOICE nevojitet document:write për të krijuar, përditësuar, finalizuar ose anuluar, dhe document:read për të listuar ose marrë. Shihni Llojet e dokumenteve."),
      b.h2("entitlements", "Kontrollet e abonimit"),
      b.p("Fushëveprimet nuk janë porta e vetme. Hapësira e punës ka nevojë edhe për një abonim aktiv OperiX Invoice dhe API Add-on, përndryshe çdo thirrje kthen 403 api_subscription_required."),
    ],
  },

  "rate-limits": {
    en: [
      b.p("Requests are limited per API key, in a fixed 60-second window."),
      b.table(["Environment", "Limit"], [["Live (opx_live_)", "120 requests per minute per key"], ["Test (opx_test_)", "60 requests per minute per key"]]),
      b.p("This is separate from the monthly volume included with the API Add-on (5,000 live requests). Automatic overage charging is not enabled."),
      b.h2("headers", "Headers"),
      b.table(["Header", "Meaning"], [
        ["X-RateLimit-Limit", "Requests allowed in the window."],
        ["X-RateLimit-Remaining", "Requests left in the current window."],
        ["X-RateLimit-Reset", "When the window resets, as a Unix timestamp in seconds."],
        ["Retry-After", "On a 429 only: seconds to wait before trying again."],
        ["X-Request-Id", "A unique id for the request. Always present."],
      ]),
      b.p("The X-RateLimit headers are sent on successful responses and on 429 responses. Other error responses (for example 401 or 422) carry X-Request-Id but not the rate-limit headers."),
      b.h2("429", "When you are limited"),
      b.code("json", `HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1793264580

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Retry after the rate limit resets.",
    "request_id": "req_Hn3sV1xk0pQ2aW7e",
    "details": { "retry_after": 23, "rate_limit": 120, "rate_remaining": 0, "rate_reset": 1793264580 }
  }
}`),
      b.p("Wait for Retry-After seconds, then retry the same request with the same Idempotency-Key. Do not retry in a tight loop."),
      b.tabs([{ label: "JavaScript", language: "javascript", code: retryJs }, { label: "Python", language: "python", code: retryPython }]),
      b.h2("tips", "Staying under the limit"),
      b.ul(["Use webhooks instead of polling for status changes.", "Filter lists (status, customer_id, created_after) instead of fetching everything.", "Queue bulk work and send it at a steady pace, well under the limit.", "Use a separate key per integration so one busy job cannot starve another."]),
    ],
    sq: [
      b.p("Kërkesat kufizohen për çelës API, në një dritare fikse 60 sekondash."),
      b.table(["Mjedisi", "Kufiri"], [["Live (opx_live_)", "120 kërkesa në minutë për çelës"], ["Test (opx_test_)", "60 kërkesa në minutë për çelës"]]),
      b.p("Kjo është e ndarë nga vëllimi mujor i përfshirë me API Add-on (5,000 kërkesa live). Faturimi automatik i tejkalimit nuk është aktivizuar."),
      b.h2("headers", "Header-at"),
      b.table(["Header-i", "Kuptimi"], [
        ["X-RateLimit-Limit", "Kërkesat e lejuara në dritare."],
        ["X-RateLimit-Remaining", "Kërkesat e mbetura në dritaren aktuale."],
        ["X-RateLimit-Reset", "Kur rivendoset dritarja, si vulë kohore Unix në sekonda."],
        ["Retry-After", "Vetëm në 429: sekondat për të pritur para se të provoni përsëri."],
        ["X-Request-Id", "Një identifikues unik i kërkesës. Gjithmonë i pranishëm."],
      ]),
      b.p("Header-at X-RateLimit dërgohen në përgjigjet e suksesshme dhe në ato 429. Përgjigjet e tjera me gabim (p.sh. 401 ose 422) mbajnë X-Request-Id por jo header-at e kufirit."),
      b.h2("429", "Kur kufizoheni"),
      b.code("json", `HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1793264580

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Retry after the rate limit resets.",
    "request_id": "req_Hn3sV1xk0pQ2aW7e",
    "details": { "retry_after": 23, "rate_limit": 120, "rate_remaining": 0, "rate_reset": 1793264580 }
  }
}`),
      b.p("Prisni Retry-After sekonda, pastaj riprovoni të njëjtën kërkesë me të njëjtin Idempotency-Key. Mos riprovoni në ciklë të ngjeshur."),
      b.tabs([{ label: "JavaScript", language: "javascript", code: retryJs }, { label: "Python", language: "python", code: retryPython }]),
      b.h2("tips", "Si të qëndroni nën kufi"),
      b.ul(["Përdorni webhooks në vend të pyetjes së vazhdueshme për ndryshime statusi.", "Filtroni listat (status, customer_id, created_after) në vend të marrjes së gjithçkaje.", "Radhitni punët masive dhe dërgojini me ritëm të qëndrueshëm, shumë nën kufi.", "Përdorni çelës të ndarë për integrim që një punë e ngarkuar të mos privojë një tjetër."]),
    ],
  },

  idempotency: {
    en: [
      b.p("Networks fail. If a request times out you cannot know whether OperiX created the invoice. An Idempotency-Key lets you send the same request again safely: OperiX performs the operation once and returns the same answer every time."),
      b.h2("which", "Which requests need it"),
      b.p("Every request that creates or changes data: POST and PATCH on customers, products, invoices, and payments, and the finalize and void actions. Without the header the API returns 400 idempotency_key_required. GET requests do not use it."),
      b.h2("rules", "The rules"),
      b.table(["Rule", "Detail"], [
        ["Header", "Idempotency-Key: <your key>. Up to 255 characters. Use something unique and meaningful, such as invoice-ORDER-58391, or a UUID."],
        ["Scope", "Keys are unique per workspace and environment. A Test key and a Live key never collide."],
        ["Lifetime", "A key is remembered for 48 hours."],
        ["Same key, same request", "The first response is replayed, with the header Idempotent-Replayed: true. Nothing is created twice."],
        ["Same key, different request", "409 idempotency_key_reused. A request is identified by method, path and body, so change the key when you change the request."],
        ["Same key while the first is still running", "409 idempotency_in_progress. Wait a moment and retry with the same key."],
        ["A failed request", "The failure is stored too. Fix the problem and send the corrected request with a new key."],
      ]),
      b.h2("choosing", "Choosing a key"),
      b.ul(["Derive it from your own record: invoice-order-58391, payment-order-58391-attempt-1.", "Use a different key for each different operation on the same order (create, finalize, pay).", "Never reuse a key for a different order.", "For a retry after a timeout, send the exact same key and body."]),
      b.code("bash", `# First attempt — times out, you do not know if it worked
curl -X POST ${BASE}/v1/invoice/invoices -H "Authorization: Bearer $OPERIX_API_KEY" -H "Idempotency-Key: invoice-order-58391" -d @invoice.json

# Retry — safe. If it already worked you get the same invoice back with Idempotent-Replayed: true
curl -X POST ${BASE}/v1/invoice/invoices -H "Authorization: Bearer $OPERIX_API_KEY" -H "Idempotency-Key: invoice-order-58391" -d @invoice.json`, "Safe retry"),
      b.note("Idempotency protects you from duplicates created by retries. It does not make two different orders into one invoice. Use external_reference to link records to your own ids.", "Not a de-duplication tool"),
    ],
    sq: [
      b.p("Rrjetat dështojnë. Nëse një kërkesë skadon nuk mund ta dini nëse OperiX e krijoi faturën. Një Idempotency-Key ju lejon ta dërgoni të njëjtën kërkesë përsëri me siguri: OperiX e kryen veprimin një herë dhe kthen të njëjtën përgjigje çdo herë."),
      b.h2("which", "Cilat kërkesa e kërkojnë"),
      b.p("Çdo kërkesë që krijon ose ndryshon të dhëna: POST dhe PATCH te klientët, produktet, faturat dhe pagesat, si dhe veprimet finalize e void. Pa header-in API kthen 400 idempotency_key_required. Kërkesat GET nuk e përdorin."),
      b.h2("rules", "Rregullat"),
      b.table(["Rregulli", "Detaji"], [
        ["Header-i", "Idempotency-Key: <çelësi juaj>. Deri në 255 karaktere. Përdorni diçka unike dhe kuptimplote, si invoice-ORDER-58391, ose një UUID."],
        ["Fusha", "Çelësat janë unikë për hapësirë pune dhe mjedis. Një çelës Test dhe një Live nuk përplasen kurrë."],
        ["Jetëgjatësia", "Një çelës mbahet mend për 48 orë."],
        ["I njëjti çelës, e njëjta kërkesë", "Përgjigjja e parë ribëhet, me header-in Idempotent-Replayed: true. Asgjë nuk krijohet dy herë."],
        ["I njëjti çelës, kërkesë ndryshe", "409 idempotency_key_reused. Një kërkesë identifikohet nga metoda, rruga dhe trupi, ndaj ndryshoni çelësin kur ndryshoni kërkesën."],
        ["I njëjti çelës ndërsa e para ende po ekzekutohet", "409 idempotency_in_progress. Prisni pak dhe riprovoni me të njëjtin çelës."],
        ["Një kërkesë e dështuar", "Edhe dështimi ruhet. Rregulloni problemin dhe dërgoni kërkesën e korrigjuar me çelës të ri."],
      ]),
      b.h2("choosing", "Zgjedhja e një çelësi"),
      b.ul(["Nxirreni nga regjistrimi juaj: invoice-order-58391, payment-order-58391-attempt-1.", "Përdorni çelës ndryshe për çdo veprim ndryshe në të njëjtën porosi (krijim, finalizim, pagesë).", "Mos e ripërdorni kurrë një çelës për porosi tjetër.", "Për një riprovim pas skadimit, dërgoni saktësisht të njëjtin çelës dhe trup."]),
      b.code("bash", `# Përpjekja e parë — skadon, nuk dini nëse funksionoi
curl -X POST ${BASE}/v1/invoice/invoices -H "Authorization: Bearer $OPERIX_API_KEY" -H "Idempotency-Key: invoice-order-58391" -d @invoice.json

# Riprovimi — i sigurt. Nëse funksionoi tashmë merrni të njëjtën faturë me Idempotent-Replayed: true
curl -X POST ${BASE}/v1/invoice/invoices -H "Authorization: Bearer $OPERIX_API_KEY" -H "Idempotency-Key: invoice-order-58391" -d @invoice.json`, "Riprovim i sigurt"),
      b.note("Idempotenca ju mbron nga dublikatat e krijuara nga riprovimet. Nuk i bën dy porosi të ndryshme një faturë. Përdorni external_reference për t'i lidhur regjistrimet me id-të tuaja.", "Jo mjet de-duplikimi"),
    ],
  },

  pagination: {
    en: [
      b.p("Lists return the newest records first and never more than 100 at a time."),
      b.code("json", `{
  "data": [ { "id": "…", "…": "…" } ],
  "pagination": { "has_more": true, "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0xMC0yOVQwOToxNjo0MC4yMDFaIiwiaWQiOiJjM2QyYTBhOC4uLiJ9" }
}`, "A collection"),
      b.h2("how", "How to page"),
      b.ol(["Request the list: GET /v1/invoice/invoices.", "If pagination.has_more is true, call again with ?cursor=<next_cursor>.", "Repeat until has_more is false. next_cursor is then null."]),
      b.ul(["The page size is fixed at 100. There is no limit parameter.", "A cursor is opaque. Do not build or parse it.", "Keep your filters the same on every page of one listing.", "An invalid cursor returns 400 invalid_cursor."]),
      b.h2("filters", "Filters"),
      b.table(["Parameter", "Available on", "Meaning"], [
        ["cursor", "All lists", "The cursor from the previous page."],
        ["search", "Customers, products", "Matches the name (and email for customers)."],
        ["external_reference", "Customers, products, invoices, payments", "Exact match on your own reference."],
        ["status", "Invoices", "Document status, for example draft or issued."],
        ["document_type", "Invoices", "One of the document types (default listing shows INVOICE types you can read)."],
        ["customer_id", "Invoices, payments", "Records for one customer."],
        ["invoice_id", "Payments", "Payments allocated to one invoice."],
        ["created_after / created_before", "Invoices, payments, and lists with cursors", "ISO 8601 timestamps to bound the creation time."],
      ]),
      b.tabs([
        { label: "JavaScript", language: "javascript", code: `export async function* allInvoices(params = {}) {
  let cursor;
  do {
    const query = new URLSearchParams({ ...params, ...(cursor ? { cursor } : {}) });
    const page = await operix(\`/v1/invoice/invoices?\${query}\`);
    yield* page.data;
    cursor = page.pagination.has_more ? page.pagination.next_cursor : undefined;
  } while (cursor);
}

for await (const invoice of allInvoices({ status: "issued", created_after: "2026-10-01T00:00:00Z" })) {
  console.log(invoice.number, invoice.total);
}` },
        { label: "Python", language: "python", code: `def all_invoices(**params):
    cursor = None
    while True:
        query = {**params, **({"cursor": cursor} if cursor else {})}
        page = operix("/v1/invoice/invoices?" + urlencode(query))
        yield from page["data"]
        if not page["pagination"]["has_more"]:
            break
        cursor = page["pagination"]["next_cursor"]

for invoice in all_invoices(status="issued", created_after="2026-10-01T00:00:00Z"):
    print(invoice["number"], invoice["total"])` },
      ]),
      b.note("The list of payments for one invoice (GET /v1/invoice/invoices/{id}/payments) returns up to 100 payments and has no cursor.", "One exception"),
    ],
    sq: [
      b.p("Listat kthejnë së pari regjistrimet më të reja dhe kurrë më shumë se 100 njëherësh."),
      b.code("json", `{
  "data": [ { "id": "…", "…": "…" } ],
  "pagination": { "has_more": true, "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0xMC0yOVQwOToxNjo0MC4yMDFaIiwiaWQiOiJjM2QyYTBhOC4uLiJ9" }
}`, "Një koleksion"),
      b.h2("how", "Si të faqosni"),
      b.ol(["Kërkoni listën: GET /v1/invoice/invoices.", "Nëse pagination.has_more është true, thirrni përsëri me ?cursor=<next_cursor>.", "Përsëriteni derisa has_more të jetë false. Atëherë next_cursor është null."]),
      b.ul(["Madhësia e faqes është fikse në 100. Nuk ka parametër limit.", "Një kursor është i errët. Mos e ndërtoni e mos e analizoni.", "Mbajini filtrat të njëjtë në çdo faqe të një listimi.", "Një kursor i pavlefshëm kthen 400 invalid_cursor."]),
      b.h2("filters", "Filtrat"),
      b.table(["Parametri", "Në dispozicion te", "Kuptimi"], [
        ["cursor", "Të gjitha listat", "Kursori nga faqja e mëparshme."],
        ["search", "Klientët, produktet", "Përputhet me emrin (dhe email-in për klientët)."],
        ["external_reference", "Klientët, produktet, faturat, pagesat", "Përputhje e saktë me referencën tuaj."],
        ["status", "Faturat", "Statusi i dokumentit, p.sh. draft ose issued."],
        ["document_type", "Faturat", "Një nga llojet e dokumenteve."],
        ["customer_id", "Faturat, pagesat", "Regjistrimet e një klienti."],
        ["invoice_id", "Pagesat", "Pagesat e alokuara te një faturë."],
        ["created_after / created_before", "Faturat, pagesat dhe listat me kursorë", "Vula kohore ISO 8601 për të kufizuar kohën e krijimit."],
      ]),
      b.tabs([
        { label: "JavaScript", language: "javascript", code: `export async function* allInvoices(params = {}) {
  let cursor;
  do {
    const query = new URLSearchParams({ ...params, ...(cursor ? { cursor } : {}) });
    const page = await operix(\`/v1/invoice/invoices?\${query}\`);
    yield* page.data;
    cursor = page.pagination.has_more ? page.pagination.next_cursor : undefined;
  } while (cursor);
}` },
        { label: "Python", language: "python", code: `def all_invoices(**params):
    cursor = None
    while True:
        query = {**params, **({"cursor": cursor} if cursor else {})}
        page = operix("/v1/invoice/invoices?" + urlencode(query))
        yield from page["data"]
        if not page["pagination"]["has_more"]:
            break
        cursor = page["pagination"]["next_cursor"]` },
      ]),
      b.note("Lista e pagesave të një fature (GET /v1/invoice/invoices/{id}/payments) kthen deri në 100 pagesa dhe nuk ka kursor.", "Një përjashtim"),
    ],
  },

  errors: {
    en: [
      b.p("Every error uses the same envelope. The HTTP status tells you the class of problem; error.code tells your code exactly what happened."),
      b.code("json", `{
  "error": {
    "code": "invalid_request",
    "message": "The request body is invalid.",
    "request_id": "req_Hn3sV1xk0pQ2aW7e",
    "details": { "formErrors": [], "fieldErrors": { "items": ["Required"] } }
  }
}`, "422 Unprocessable Entity"),
      b.ul(["code — stable and machine-readable. Branch on this, never on message.", "message — a human-readable explanation. It may change.", "request_id — also in the X-Request-Id header. Quote it to support.", "details — present for validation errors (field-by-field) and 429."]),
      b.p("Errors never contain SQL, stack traces or internal paths."),
      b.h2("status", "HTTP status codes"),
      b.table(["Status", "Meaning"], [["200 / 201", "Success (201 when a resource was created)."], ["400", "The request is malformed."], ["401", "Authentication failed."], ["403", "Authenticated, but not allowed."], ["404", "Not found."], ["409", "Conflict with existing data or a repeated key."], ["413", "Body too large."], ["422", "Validation failed."], ["429", "Rate limited."], ["500", "Unexpected error — retry later and quote the request id."], ["503", "Temporarily unavailable — retry with the same Idempotency-Key."]]),
      b.h2("codes", "Error codes"),
      b.table(["Code", "HTTP", "Cause", "What to do"], [
        ["invalid_api_key", "401", "The Authorization header is missing, malformed, or the key is unknown.", "Send Authorization: Bearer opx_… with a key that exists."],
        ["wrong_environment", "401", "The key's environment does not match the request.", "Use the key for the environment you mean (test or live)."],
        ["api_key_revoked", "401", "The key was revoked.", "Create a new key in Settings → Developers."],
        ["api_key_expired", "401", "The key passed its expiry date.", "Create a new key."],
        ["api_key_unusable", "403", "The person who created the key is no longer active in the workspace.", "Create a key from an active administrator."],
        ["api_subscription_required", "403", "The workspace has no active API Add-on or Invoice subscription.", "Add the API Add-on and make sure the subscription is active."],
        ["missing_scope", "403", "The key lacks the scope the endpoint needs.", "Create a key with the scope named in the message."],
        ["operation_not_allowed", "403", "The operation is not allowed for this workspace or key.", "Check workspace permissions and subscription."],
        ["invalid_json", "400", "The body is not valid JSON.", "Send valid JSON with Content-Type: application/json."],
        ["invalid_id", "400", "A path id is not a valid UUID.", "Use the id returned by the API."],
        ["invalid_cursor", "400", "The pagination cursor is invalid.", "Use next_cursor exactly as returned, or start again."],
        ["idempotency_key_required", "400", "A write was sent without Idempotency-Key.", "Add the header."],
        ["invalid_request", "422", "The body or a query parameter failed validation.", "Read details.fieldErrors and correct the fields."],
        ["request_too_large", "413", "The body is larger than 256 KiB.", "Send fewer lines per request."],
        ["customer_not_found", "404", "The customer id does not exist in this workspace.", "Check the id, or create the customer first."],
        ["product_not_found", "404", "The product id does not exist.", "Check the id."],
        ["invoice_not_found", "404", "The invoice id does not exist.", "Check the id."],
        ["not_found", "404", "The endpoint does not exist.", "Check the path and method."],
        ["idempotency_key_reused", "409", "The key was already used for a different request.", "Use a new key for a different request."],
        ["idempotency_in_progress", "409", "An identical request is still running.", "Wait and retry with the same key."],
        ["external_reference_conflict", "409", "The external_reference is already used by another record.", "Use a unique reference, or look the record up by it first."],
        ["conflict", "409", "The request conflicts with existing data (for example a status that does not allow the change).", "Fetch the record, check its status and adjust."],
        ["rate_limit_exceeded", "429", "Too many requests for this key.", "Wait for Retry-After seconds and retry."],
        ["api_not_configured", "503", "The API environment is not configured.", "Retry later; contact support if it persists."],
        ["api_auth_unavailable", "503", "Authorization could not be checked just now.", "Retry with backoff."],
        ["rate_limit_unavailable", "503", "Rate limiting is temporarily unavailable.", "Retry with backoff."],
        ["entitlement_unavailable", "503", "The subscription check is temporarily unavailable.", "Retry with backoff."],
        ["pdf_not_configured", "503", "Secure PDF delivery is not available.", "Retry later; contact support if it persists."],
        ["internal_error", "500", "An unexpected problem on our side.", "Retry later and quote the request id."],
      ]),
      b.h2("handling", "Handling errors well"),
      b.ul(["Retry 429, 500, 503 and idempotency_in_progress with backoff and the same Idempotency-Key.", "Do not retry 400, 401, 403, 404 or 422 until you have fixed the cause.", "Log request_id with every failure.", "Show your own friendly message to customers; never pass error.message through to a checkout page."]),
    ],
    sq: [
      b.p("Çdo gabim përdor të njëjtin zarf. Statusi HTTP ju tregon klasën e problemit; error.code i tregon kodit tuaj saktësisht çfarë ndodhi."),
      b.code("json", `{
  "error": {
    "code": "invalid_request",
    "message": "The request body is invalid.",
    "request_id": "req_Hn3sV1xk0pQ2aW7e",
    "details": { "formErrors": [], "fieldErrors": { "items": ["Required"] } }
  }
}`, "422 Unprocessable Entity"),
      b.ul(["code — i qëndrueshëm dhe i lexueshëm nga makina. Degëzoni mbi të, kurrë mbi message.", "message — shpjegim i lexueshëm nga njeriu. Mund të ndryshojë.", "request_id — edhe te header-i X-Request-Id. Citojeni te mbështetja.", "details — i pranishëm për gabime validimi (fushë pas fushe) dhe për 429."]),
      b.p("Gabimet nuk përmbajnë kurrë SQL, gjurmë stack ose rrugë të brendshme."),
      b.h2("status", "Kodet e statusit HTTP"),
      b.table(["Statusi", "Kuptimi"], [["200 / 201", "Sukses (201 kur u krijua një burim)."], ["400", "Kërkesa është e keqformuar."], ["401", "Autentikimi dështoi."], ["403", "I autentikuar, por i palejuar."], ["404", "Nuk u gjet."], ["409", "Konflikt me të dhëna ekzistuese ose çelës i përsëritur."], ["413", "Trupi shumë i madh."], ["422", "Validimi dështoi."], ["429", "Kufizim kërkesash."], ["500", "Gabim i papritur — riprovoni më vonë dhe citoni identifikuesin e kërkesës."], ["503", "Përkohësisht i padisponueshëm — riprovoni me të njëjtin Idempotency-Key."]]),
      b.h2("codes", "Kodet e gabimeve"),
      b.table(["Kodi", "HTTP", "Shkaku", "Çfarë të bëni"], [
        ["invalid_api_key", "401", "Header-i Authorization mungon, është i keqformuar, ose çelësi nuk njihet.", "Dërgoni Authorization: Bearer opx_… me një çelës që ekziston."],
        ["wrong_environment", "401", "Mjedisi i çelësit nuk përputhet me kërkesën.", "Përdorni çelësin për mjedisin që synoni (test ose live)."],
        ["api_key_revoked", "401", "Çelësi u shfuqizua.", "Krijoni një çelës të ri te Cilësimet → Zhvilluesit."],
        ["api_key_expired", "401", "Çelësi ka kaluar datën e skadimit.", "Krijoni një çelës të ri."],
        ["api_key_unusable", "403", "Personi që e krijoi çelësin nuk është më aktiv në hapësirë.", "Krijoni një çelës nga një administrator aktiv."],
        ["api_subscription_required", "403", "Hapësira nuk ka API Add-on ose abonim Invoice aktiv.", "Shtoni API Add-on dhe sigurohuni që abonimi është aktiv."],
        ["missing_scope", "403", "Çelësit i mungon fushëveprimi që kërkon pika fundore.", "Krijoni një çelës me fushëveprimin e emërtuar në mesazh."],
        ["operation_not_allowed", "403", "Veprimi nuk lejohet për këtë hapësirë ose çelës.", "Kontrolloni lejet e hapësirës dhe abonimin."],
        ["invalid_json", "400", "Trupi nuk është JSON i vlefshëm.", "Dërgoni JSON të vlefshëm me Content-Type: application/json."],
        ["invalid_id", "400", "Një id në rrugë nuk është UUID i vlefshëm.", "Përdorni id-në e kthyer nga API."],
        ["invalid_cursor", "400", "Kursori i faqosjes është i pavlefshëm.", "Përdorni next_cursor saktësisht siç u kthye, ose filloni sërish."],
        ["idempotency_key_required", "400", "Një shkrim u dërgua pa Idempotency-Key.", "Shtoni header-in."],
        ["invalid_request", "422", "Trupi ose një parametër query dështoi në validim.", "Lexoni details.fieldErrors dhe korrigjoni fushat."],
        ["request_too_large", "413", "Trupi është më i madh se 256 KiB.", "Dërgoni më pak rreshta për kërkesë."],
        ["customer_not_found", "404", "Id-ja e klientit nuk ekziston në këtë hapësirë.", "Kontrolloni id-në, ose krijoni fillimisht klientin."],
        ["product_not_found", "404", "Id-ja e produktit nuk ekziston.", "Kontrolloni id-në."],
        ["invoice_not_found", "404", "Id-ja e faturës nuk ekziston.", "Kontrolloni id-në."],
        ["not_found", "404", "Pika fundore nuk ekziston.", "Kontrolloni rrugën dhe metodën."],
        ["idempotency_key_reused", "409", "Çelësi u përdor tashmë për kërkesë tjetër.", "Përdorni çelës të ri për kërkesë tjetër."],
        ["idempotency_in_progress", "409", "Një kërkesë identike është ende në ekzekutim.", "Prisni dhe riprovoni me të njëjtin çelës."],
        ["external_reference_conflict", "409", "external_reference përdoret tashmë nga një regjistrim tjetër.", "Përdorni referencë unike, ose kërkoni fillimisht regjistrimin me të."],
        ["conflict", "409", "Kërkesa përplaset me të dhëna ekzistuese (p.sh. status që nuk lejon ndryshimin).", "Merrni regjistrimin, kontrolloni statusin dhe përshtateni."],
        ["rate_limit_exceeded", "429", "Shumë kërkesa për këtë çelës.", "Prisni Retry-After sekonda dhe riprovoni."],
        ["api_not_configured", "503", "Mjedisi i API nuk është i konfiguruar.", "Riprovoni më vonë; kontaktoni mbështetjen nëse vazhdon."],
        ["api_auth_unavailable", "503", "Autorizimi nuk u kontrollua tani.", "Riprovoni me prapambetje."],
        ["rate_limit_unavailable", "503", "Kufizimi i kërkesave është përkohësisht i padisponueshëm.", "Riprovoni me prapambetje."],
        ["entitlement_unavailable", "503", "Kontrolli i abonimit është përkohësisht i padisponueshëm.", "Riprovoni me prapambetje."],
        ["pdf_not_configured", "503", "Dorëzimi i sigurt i PDF nuk është i disponueshëm.", "Riprovoni më vonë; kontaktoni mbështetjen nëse vazhdon."],
        ["internal_error", "500", "Një problem i papritur nga ana jonë.", "Riprovoni më vonë dhe citoni identifikuesin e kërkesës."],
      ]),
      b.h2("handling", "Trajtimi i mirë i gabimeve"),
      b.ul(["Riprovoni 429, 500, 503 dhe idempotency_in_progress me prapambetje dhe të njëjtin Idempotency-Key.", "Mos riprovoni 400, 401, 403, 404 ose 422 derisa të rregulloni shkakun.", "Regjistroni request_id me çdo dështim.", "Shfaqni mesazhin tuaj miqësor te klientët; mos e kaloni kurrë error.message në faqen e arkës."]),
    ],
  },

  webhooks: {
    en: [
      b.p("Webhooks tell your server when something happens in OperiX Invoice — an invoice is finalized, a payment arrives — so you do not need to poll. OperiX sends an HTTPS POST to your endpoint with a signed JSON event."),
      b.h2("setup", "Set up an endpoint"),
      b.steps([
        { title: "Open Settings → Developers → Webhooks", text: "You need the API Add-on and permission to manage integrations." },
        { title: "Add endpoint", text: "Give it a name, your HTTPS URL, choose Test or Live, and tick the events you want." },
        { title: "Copy the signing secret", text: "A secret starting with whsec_ is shown once. Store it on your server." },
        { title: "Respond with 2xx", text: "Your endpoint must answer within 10 seconds with a 2xx status." },
      ]),
      b.p("From the endpoint list you can disable, enable, delete or rotate the secret (the old secret stops working immediately) and retry a delivery from the delivery history."),
      b.h3("url-rules", "URL rules"),
      b.ul(["HTTPS only, on the standard port.", "No credentials in the URL.", "The host must be public — localhost, private networks, cloud metadata addresses and *.internal or *.local names are rejected.", "For local testing use a tunnelling tool that gives you a public HTTPS address."]),
      b.h2("events", "Events"),
      b.table(["Event", "Sent when"], [
        ["invoice.created", "An invoice is created (draft), from the API, web or mobile."],
        ["invoice.finalized", "An invoice is issued."],
        ["invoice.paid", "An invoice becomes fully paid."],
        ["invoice.partially_paid", "A payment covers part of an invoice."],
        ["invoice.overdue", "An issued invoice passes its due date unpaid."],
        ["invoice.voided", "An invoice is cancelled."],
        ["payment.created", "A payment is recorded."],
        ["customer.created", "A customer is created."],
      ]),
      b.note("The event list also contains booking.* events. They belong to OperiX Booking and are not sent yet.", "Booking events"),
      b.p("Live events are produced by OperiX itself for any change, whether it came from the API, the web app or the mobile app. Subscribe only to what you need."),
      b.h2("payload", "The payload"),
      b.code("json", webhookPayload, "invoice.finalized"),
      b.table(["Field", "Meaning"], [["id", "Unique event id (evt_…). Use it to deduplicate."], ["type", "The event name."], ["created_at", "When the event was created (ISO 8601)."], ["data.object", "The resource as the API returns it, at the time of the event."]]),
      b.h2("headers", "Request headers"),
      b.table(["Header", "Value"], [["Content-Type", "application/json"], ["User-Agent", "OperiX-Webhooks/1.0"], ["X-OperiX-Event", "The event name, e.g. invoice.finalized"], ["X-OperiX-Event-Id", "The event id"], ["X-OperiX-Signature", "t=<unix seconds>,v1=<hex HMAC>"]]),
      b.h2("verify", "Verify the signature"),
      b.p("Always verify before you trust an event. The signature is an HMAC-SHA256, using your whsec_ secret, of the string <timestamp>.<raw body>. Compare in constant time, reject timestamps older than 5 minutes (replay protection) and use the raw request body — not re-serialised JSON."),
      b.tabs([{ label: "Node.js (Express)", language: "javascript", code: webhookNode }, { label: "Python (Flask)", language: "python", code: webhookPython }]),
      b.h2("delivery", "Delivery and retries"),
      b.ul([
        "A response with any 2xx status counts as delivered.",
        "Anything else — a non-2xx status, a timeout (10 seconds) or a connection error — is retried with exponential backoff: roughly 2, 4, 8, 16… seconds up to a maximum of 24 hours between attempts.",
        "After 8 failed attempts the delivery is marked exhausted. You can retry it by hand from the delivery history.",
        "An endpoint that keeps failing is marked failing in Settings → Developers. A later successful delivery makes it active again.",
        "Delivery is at least once. The same event can arrive more than once, and events can arrive out of order. Deduplicate on event.id and, when order matters, fetch the resource to get its current state.",
      ]),
      b.h2("test", "Testing"),
      b.ol(["Create a Test webhook endpoint pointing at your development server through a tunnel.", "Make Test API calls (create an invoice, finalize it, record a payment).", "Watch the deliveries arrive, and check them in the delivery history in Settings → Developers.", "When it works, add a Live endpoint with its own secret."]),
      b.tip("Process webhooks asynchronously: verify, store the event id, return 200, then do the work. A slow handler causes timeouts and retries.", "Keep handlers fast"),
    ],
    sq: [
      b.p("Webhooks i tregojnë serverit tuaj kur ndodh diçka në OperiX Invoice — një faturë finalizohet, arrin një pagesë — që të mos keni nevojë të pyesni vazhdimisht. OperiX dërgon një HTTPS POST te pika juaj fundore me një ngjarje JSON të nënshkruar."),
      b.h2("setup", "Konfiguroni një pikë fundore"),
      b.steps([
        { title: "Hapni Cilësimet → Zhvilluesit → Webhooks", text: "Ju duhet API Add-on dhe leje për të menaxhuar integrimet." },
        { title: "Shto pikë fundore", text: "Jepini një emër, URL-në tuaj HTTPS, zgjidhni Test ose Live dhe zgjidhni ngjarjet që doni." },
        { title: "Kopjoni sekretin e nënshkrimit", text: "Një sekret që fillon me whsec_ shfaqet një herë. Ruajeni në serverin tuaj." },
        { title: "Përgjigjuni me 2xx", text: "Pika juaj fundore duhet të përgjigjet brenda 10 sekondash me status 2xx." },
      ]),
      b.p("Nga lista e pikave fundore mund të çaktivizoni, aktivizoni, fshini ose rrotulloni sekretin (sekreti i vjetër ndalon menjëherë) dhe të riprovoni një dërgim nga historiku i dërgimeve."),
      b.h3("url-rules", "Rregullat e URL"),
      b.ul(["Vetëm HTTPS, në portën standarde.", "Pa kredenciale në URL.", "Hosti duhet të jetë publik — localhost, rrjetet private, adresat e metadatave të cloud dhe emrat *.internal ose *.local refuzohen.", "Për testim lokal përdorni një mjet tuneli që ju jep adresë publike HTTPS."]),
      b.h2("events", "Ngjarjet"),
      b.table(["Ngjarja", "Dërgohet kur"], [
        ["invoice.created", "Krijohet një faturë (draft), nga API, web ose celulari."],
        ["invoice.finalized", "Lëshohet një faturë."],
        ["invoice.paid", "Një faturë paguhet plotësisht."],
        ["invoice.partially_paid", "Një pagesë mbulon një pjesë të faturës."],
        ["invoice.overdue", "Një faturë e lëshuar kalon afatin pa u paguar."],
        ["invoice.voided", "Anulohet një faturë."],
        ["payment.created", "Regjistrohet një pagesë."],
        ["customer.created", "Krijohet një klient."],
      ]),
      b.note("Lista e ngjarjeve përmban edhe ngjarje booking.*. Ato i përkasin OperiX Booking dhe nuk dërgohen ende.", "Ngjarjet e Booking"),
      b.p("Ngjarjet live prodhohen nga vetë OperiX për çdo ndryshim, qoftë nga API, aplikacioni web ose celulari. Abonohuni vetëm te ato që ju duhen."),
      b.h2("payload", "Ngarkesa"),
      b.code("json", webhookPayload, "invoice.finalized"),
      b.table(["Fusha", "Kuptimi"], [["id", "Id unike e ngjarjes (evt_…). Përdoreni për de-duplikim."], ["type", "Emri i ngjarjes."], ["created_at", "Kur u krijua ngjarja (ISO 8601)."], ["data.object", "Burimi siç e kthen API, në kohën e ngjarjes."]]),
      b.h2("headers", "Header-at e kërkesës"),
      b.table(["Header-i", "Vlera"], [["Content-Type", "application/json"], ["User-Agent", "OperiX-Webhooks/1.0"], ["X-OperiX-Event", "Emri i ngjarjes, p.sh. invoice.finalized"], ["X-OperiX-Event-Id", "Id e ngjarjes"], ["X-OperiX-Signature", "t=<sekonda unix>,v1=<HMAC hex>"]]),
      b.h2("verify", "Verifikoni nënshkrimin"),
      b.p("Verifikoni gjithmonë para se t'i besoni një ngjarjeje. Nënshkrimi është një HMAC-SHA256, me sekretin tuaj whsec_, i vargut <vula kohore>.<trupi bruto>. Krahasoni në kohë konstante, refuzoni vula kohore më të vjetra se 5 minuta (mbrojtje nga ripërsëritja) dhe përdorni trupin bruto të kërkesës — jo JSON të ri-serializuar."),
      b.tabs([{ label: "Node.js (Express)", language: "javascript", code: webhookNode }, { label: "Python (Flask)", language: "python", code: webhookPython }]),
      b.h2("delivery", "Dërgimi dhe riprovimet"),
      b.ul([
        "Një përgjigje me çdo status 2xx llogaritet e dorëzuar.",
        "Çdo gjë tjetër — status jo-2xx, skadim (10 sekonda) ose gabim lidhjeje — riprovohet me prapambetje eksponenciale: afërsisht 2, 4, 8, 16… sekonda deri në maksimum 24 orë mes përpjekjeve.",
        "Pas 8 përpjekjesh të dështuara dërgimi shënohet i shteruar. Mund ta riprovoni me dorë nga historiku i dërgimeve.",
        "Një pikë fundore që dështon vazhdimisht shënohet failing te Cilësimet → Zhvilluesit. Një dërgim i mëvonshëm i suksesshëm e bën sërish aktive.",
        "Dërgimi është të paktën një herë. I njëjti ngjarje mund të vijë më shumë se një herë dhe ngjarjet mund të vijnë jashtë radhe. De-duplikoni mbi event.id dhe, kur rëndësi ka rendi, merrni burimin për gjendjen e tij aktuale.",
      ]),
      b.h2("test", "Testimi"),
      b.ol(["Krijoni një pikë fundore Test webhook që drejton te serveri juaj i zhvillimit përmes një tuneli.", "Bëni thirrje Test API (krijoni një faturë, finalizojeni, regjistroni një pagesë).", "Shikoni dërgimet që mbërrijnë dhe kontrolloni ato në historikun e dërgimeve te Cilësimet → Zhvilluesit.", "Kur funksionon, shtoni një pikë fundore Live me sekretin e vet."]),
      b.tip("Përpunoni webhooks në mënyrë asinkrone: verifikoni, ruani id-në e ngjarjes, ktheni 200, pastaj bëni punën. Një trajtues i ngadaltë shkakton skadime dhe riprovime.", "Mbajini trajtuesit të shpejtë"),
    ],
  },

  "invoice-integration": {
    en: [
      b.p("This guide shows the recommended flow for connecting a website, store or CRM to OperiX Invoice: when an order is confirmed, your backend creates the customer and an invoice in OperiX, issues it, and records the payment."),
      b.h2("architecture", "Architecture"),
      b.ol(["Customer checks out on your site.", "Your backend (not the browser) receives the order.", "Your backend calls the OperiX Invoice API with a secret key.", "OperiX returns the invoice; you store its id and number with the order.", "Optionally subscribe to webhooks to learn when the invoice is paid or goes overdue."]),
      b.h2("mapping", "Map your order to OperiX"),
      b.table(["Your order", "OperiX field", "Notes"], [
        ["Customer id", "customer.external_reference", "Lets OperiX find the same customer again on the next order."],
        ["Billing name / email / phone", "customer.name / email / phone", "Name is required (max 160). Company can go in company."],
        ["Order id", "invoice.external_reference", "Also use it inside your Idempotency-Key."],
        ["Order lines", "items[]", "name, quantity, unit_price, vat_rate, discount_percent, unit, sku. 1–500 lines."],
        ["Net or gross prices", "items[].tax_included", "false: unit_price excludes VAT. true: unit_price already includes it."],
        ["Shipping", "shipping + shipping_tax_rate", "Also transport and additional_fee with their own tax rates."],
        ["Coupon / order discount", "document_discount_percent or items[].discount_percent", "Percentages 0–100."],
        ["Currency", "currency", "Three-letter code, for example EUR."],
        ["Payment method", "payment_method", "cash, bank, bank_transfer, card, online_payment, cheque, other, customer_credit."],
        ["Order date / due date", "issue_date / due_date", "ISO dates. Omit and OperiX uses today."],
        ["Anything else", "metadata", "A free-form object you can use for your own tags."],
      ]),
      b.h2("vat", "VAT"),
      b.ul(["Set vat_rate on every line. If you omit it the line has 0% VAT.", "In Kosovo the standard rate is 18% and the reduced rate 8%. Send 18 or 8, not 0.18.", "Totals are always calculated by OperiX from your lines. Any totals you send are ignored.", "Use a product's product_id to take its price and VAT from your catalogue instead of repeating them."]),
      b.h2("flow", "The flow in code"),
      b.code("javascript", orderFlowJs, "invoiceForOrder.mjs"),
      b.h2("idempotency", "One key per order and step"),
      b.p("Use one Idempotency-Key per operation and order — invoice-order-58391, finalize-order-58391, payment-order-58391-<paymentId>. If your job crashes halfway, run it again: steps that already happened are replayed and the rest are completed."),
      b.h2("reconcile", "Reconcile payments"),
      b.ul(["When the payment arrives through your payment provider, POST /v1/invoice/payments with invoice_id. The response contains the allocation.", "To be told when payments are applied, subscribe to invoice.paid and invoice.partially_paid.", "To check a single invoice, GET /v1/invoice/invoices/{id}/payments.", "To reconcile a period, list payments with created_after and created_before.", "Money that does not belong to an invoice can be recorded without invoice_id (on account) and allocated later in OperiX Invoice."]),
      b.h2("corrections", "Cancellations and refunds"),
      b.ul(["A draft can still be changed with PATCH /v1/invoice/invoices/{id}.", "An issued invoice can be voided with POST /v1/invoice/invoices/{id}/void (needs invoice:void). OperiX checks that the document can be voided.", "Issued invoices cannot be rewritten. For legal corrections create the supported correction document (document_type CREDIT_NOTE or DEBIT_NOTE) with the document:write scope."]),
      b.h2("checklist", "Go-live checklist"),
      b.ul(["Keys are server-side only and stored as secrets.", "Test flow passes end to end, including a retry with the same Idempotency-Key.", "Every line sets vat_rate.", "You store the invoice id and number against the order.", "429 and 5xx are retried with backoff.", "Webhook signatures are verified and events are deduplicated.", "A Live key with only the scopes you need is in production."]),
    ],
    sq: [
      b.p("Ky udhëzues tregon rrjedhën e rekomanduar për të lidhur një faqe, dyqan ose CRM me OperiX Invoice: kur një porosi konfirmohet, backend-i juaj krijon klientin dhe një faturë në OperiX, e lëshon dhe regjistron pagesën."),
      b.h2("architecture", "Arkitektura"),
      b.ol(["Klienti kryen arkën në faqen tuaj.", "Backend-i juaj (jo shfletuesi) merr porosinë.", "Backend-i juaj thërret API e OperiX Invoice me një çelës sekret.", "OperiX kthen faturën; ju ruani id-në dhe numrin e saj me porosinë.", "Opsionalisht abonohuni te webhooks për të mësuar kur fatura paguhet ose kalon afatin."]),
      b.h2("mapping", "Lidheni porosinë me OperiX"),
      b.table(["Porosia juaj", "Fusha në OperiX", "Shënime"], [
        ["Id e klientit", "customer.external_reference", "I lejon OperiX ta gjejë të njëjtin klient në porosinë tjetër."],
        ["Emri / email / telefoni i faturimit", "customer.name / email / phone", "Emri është i detyrueshëm (maks. 160). Kompania mund të shkojë te company."],
        ["Id e porosisë", "invoice.external_reference", "Përdoreni edhe brenda Idempotency-Key tuaj."],
        ["Rreshtat e porosisë", "items[]", "name, quantity, unit_price, vat_rate, discount_percent, unit, sku. 1–500 rreshta."],
        ["Çmime neto ose bruto", "items[].tax_included", "false: unit_price nuk përfshin TVSH. true: unit_price e përfshin tashmë."],
        ["Dërgesa", "shipping + shipping_tax_rate", "Gjithashtu transport dhe additional_fee me norma tatimi të veta."],
        ["Kupon / zbritje porosie", "document_discount_percent ose items[].discount_percent", "Përqindje 0–100."],
        ["Monedha", "currency", "Kod me tre shkronja, p.sh. EUR."],
        ["Mënyra e pagesës", "payment_method", "cash, bank, bank_transfer, card, online_payment, cheque, other, customer_credit."],
        ["Data e porosisë / afati", "issue_date / due_date", "Data ISO. Nëse i lini jashtë OperiX përdor sot."],
        ["Çdo gjë tjetër", "metadata", "Një objekt i lirë që mund ta përdorni për etiketat tuaja."],
      ]),
      b.h2("vat", "TVSH"),
      b.ul(["Vendosni vat_rate në çdo rresht. Nëse e lini jashtë rreshti ka 0% TVSH.", "Në Kosovë norma standarde është 18% dhe ajo e reduktuar 8%. Dërgoni 18 ose 8, jo 0.18.", "Totalet llogariten gjithmonë nga OperiX nga rreshtat tuaj. Totalet që dërgoni injorohen.", "Përdorni product_id të një produkti për të marrë çmimin dhe TVSH-në nga katalogu juaj në vend që t'i përsërisni."]),
      b.h2("flow", "Rrjedha në kod"),
      b.code("javascript", orderFlowJs, "invoiceForOrder.mjs"),
      b.h2("idempotency", "Një çelës për porosi dhe hap"),
      b.p("Përdorni një Idempotency-Key për veprim dhe porosi — invoice-order-58391, finalize-order-58391, payment-order-58391-<paymentId>. Nëse puna juaj ndalon në mes, ekzekutojeni sërish: hapat që ndodhën tashmë ribëhen dhe të tjerët plotësohen."),
      b.h2("reconcile", "Pajtimi i pagesave"),
      b.ul(["Kur pagesa mbërrin përmes ofruesit tuaj të pagesave, POST /v1/invoice/payments me invoice_id. Përgjigjja përmban alokimin.", "Për të mësuar kur aplikohen pagesat, abonohuni te invoice.paid dhe invoice.partially_paid.", "Për të kontrolluar një faturë, GET /v1/invoice/invoices/{id}/payments.", "Për të pajtuar një periudhë, listoni pagesat me created_after dhe created_before.", "Paratë që nuk i përkasin një fature mund të regjistrohen pa invoice_id (në llogari) dhe të alokohen më vonë në OperiX Invoice."]),
      b.h2("corrections", "Anulimet dhe kthimet"),
      b.ul(["Një draft mund të ndryshohet ende me PATCH /v1/invoice/invoices/{id}.", "Një faturë e lëshuar mund të anulohet me POST /v1/invoice/invoices/{id}/void (kërkon invoice:void). OperiX kontrollon që dokumenti mund të anulohet.", "Faturat e lëshuara nuk mund të rishkruhen. Për korrigjime ligjore krijoni dokumentin korrigjues të mbështetur (document_type CREDIT_NOTE ose DEBIT_NOTE) me fushëveprimin document:write."]),
      b.h2("checklist", "Lista para nisjes live"),
      b.ul(["Çelësat janë vetëm në server dhe ruhen si sekrete.", "Rrjedha Test kalon nga fillimi në fund, përfshirë një riprovim me të njëjtin Idempotency-Key.", "Çdo rresht vendos vat_rate.", "Ruani id-në dhe numrin e faturës te porosia.", "429 dhe 5xx riprovohen me prapambetje.", "Nënshkrimet e webhooks verifikohen dhe ngjarjet de-duplikohen.", "Një çelës Live vetëm me fushëveprimet që ju duhen është në prodhim."]),
    ],
  },

  "invoice-documents": {
    en: [
      b.p("The invoice resource also handles the other commercial documents OperiX Invoice supports. Pass document_type when you create, and filter with it when you list."),
      b.table(["document_type", "Document"], [
        ["INVOICE", "Invoice (the default)."],
        ["QUOTE", "Quote / offer."],
        ["PROFORMA", "Pro-forma invoice."],
        ["SALES_ORDER", "Sales order."],
        ["DELIVERY_NOTE", "Delivery note."],
        ["ADVANCE_INVOICE", "Advance invoice."],
        ["FINAL_INVOICE", "Final invoice."],
        ["CREDIT_NOTE", "Credit note."],
        ["DEBIT_NOTE", "Debit note."],
        ["SIMPLIFIED_INVOICE", "Simplified invoice."],
        ["FISCAL_RECEIPT", "Fiscal receipt."],
        ["BAD_DEBT_INVOICE", "Bad-debt invoice."],
      ]),
      b.h2("scopes", "Scopes"),
      b.ul(["Plain INVOICE: invoice:read / invoice:write / invoice:finalize / invoice:void.", "Any other type: document:read to list and get, document:write to create, update, finalize or void."]),
      b.h2("lifecycle", "Lifecycle"),
      b.p("Each type follows the lifecycle OperiX Invoice defines for it. A request that the lifecycle does not allow (for example voiding a document that cannot be voided) returns a conflict error. Quotes, orders and delivery notes can be converted into invoices inside OperiX Invoice; there is no separate convert endpoint in the API yet."),
      b.warn("OperiX Invoice is not certified fiscal software and does not issue fiscal receipts. The FISCAL_RECEIPT and SIMPLIFIED_INVOICE types exist in the document model, but OperiX does not submit them to the Tax Administration. Do not rely on them for fiscal compliance.", "Fiscal documents"),
      b.code("bash", `# A quote for the same customer
curl -X POST ${BASE}/v1/invoice/invoices \\
  -H "Authorization: Bearer $OPERIX_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: quote-Q-1042" \\
  -d '{ "document_type": "QUOTE", "customer_id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", "currency": "EUR",
        "items": [ { "name": "Website design", "quantity": "1", "unit_price": "450.00", "vat_rate": "18" } ] }'

# List quotes
curl "${BASE}/v1/invoice/invoices?document_type=QUOTE" -H "Authorization: Bearer $OPERIX_API_KEY"`),
    ],
    sq: [
      b.p("Burimi i faturës trajton edhe dokumentet e tjera tregtare që mbështet OperiX Invoice. Jepni document_type kur krijoni dhe filtroni me të kur listoni."),
      b.table(["document_type", "Dokumenti"], [
        ["INVOICE", "Faturë (parazgjedhja)."],
        ["QUOTE", "Ofertë."],
        ["PROFORMA", "Faturë proformë."],
        ["SALES_ORDER", "Porosi shitjeje."],
        ["DELIVERY_NOTE", "Fletëdërgesë."],
        ["ADVANCE_INVOICE", "Faturë avansi."],
        ["FINAL_INVOICE", "Faturë përfundimtare."],
        ["CREDIT_NOTE", "Notë krediti."],
        ["DEBIT_NOTE", "Notë debiti."],
        ["SIMPLIFIED_INVOICE", "Faturë e thjeshtuar."],
        ["FISCAL_RECEIPT", "Kupon fiskal."],
        ["BAD_DEBT_INVOICE", "Faturë borxhi të keq."],
      ]),
      b.h2("scopes", "Fushëveprimet"),
      b.ul(["INVOICE e thjeshtë: invoice:read / invoice:write / invoice:finalize / invoice:void.", "Çdo lloj tjetër: document:read për të listuar e marrë, document:write për të krijuar, përditësuar, finalizuar ose anuluar."]),
      b.h2("lifecycle", "Cikli i jetës"),
      b.p("Çdo lloj ndjek ciklin që OperiX Invoice përcakton për të. Një kërkesë që cikli nuk e lejon (p.sh. anulimi i një dokumenti që nuk anulohet) kthen gabim konflikti. Ofertat, porositë dhe fletëdërgesat mund të shndërrohen në fatura brenda OperiX Invoice; nuk ka ende pikë fundore të veçantë shndërrimi në API."),
      b.warn("OperiX Invoice nuk është softuer fiskal i çertifikuar dhe nuk lëshon kupona fiskalë. Llojet FISCAL_RECEIPT dhe SIMPLIFIED_INVOICE ekzistojnë në modelin e dokumenteve, por OperiX nuk i dorëzon te Administrata Tatimore. Mos mbështetuni te ato për përputhshmëri fiskale.", "Dokumentet fiskale"),
      b.code("bash", `# Një ofertë për të njëjtin klient
curl -X POST ${BASE}/v1/invoice/invoices \\
  -H "Authorization: Bearer $OPERIX_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: quote-Q-1042" \\
  -d '{ "document_type": "QUOTE", "customer_id": "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", "currency": "EUR",
        "items": [ { "name": "Website design", "quantity": "1", "unit_price": "450.00", "vat_rate": "18" } ] }'

# Listoni ofertat
curl "${BASE}/v1/invoice/invoices?document_type=QUOTE" -H "Authorization: Bearer $OPERIX_API_KEY"`),
    ],
  },

  "invoice-customers": {
    en: [
      b.p("Customers are the people and companies you invoice. Create them once and refer to them by id, or let an invoice create one inline."),
      b.h2("references", "External references"),
      b.p("external_reference is your own id for the customer (up to 160 characters). When an invoice is created with an inline customer that carries an external_reference, OperiX reuses the existing customer with the same reference instead of creating a duplicate. You can also list customers with ?external_reference=…."),
      b.h2("inline", "Customers inside invoices"),
      b.p("When you create an invoice you can send customer_id for an existing customer or a customer object. The customer object needs name; with customer:write scope OperiX creates it (or reuses the one with the same external_reference)."),
    ],
    sq: [
      b.p("Klientët janë personat dhe kompanitë që faturoni. Krijojini një herë dhe referojuni me id, ose lëreni një faturë të krijojë një brenda saj."),
      b.h2("references", "Referencat e jashtme"),
      b.p("external_reference është id-ja juaj për klientin (deri në 160 karaktere). Kur një faturë krijohet me një klient brenda saj që mban external_reference, OperiX ripërdor klientin ekzistues me të njëjtën referencë në vend që të krijojë dublikat. Mund t'i listoni klientët edhe me ?external_reference=…."),
      b.h2("inline", "Klientët brenda faturave"),
      b.p("Kur krijoni një faturë mund të dërgoni customer_id për një klient ekzistues ose një objekt customer. Objekti customer kërkon name; me fushëveprimin customer:write OperiX e krijon (ose ripërdor atë me të njëjtën external_reference)."),
    ],
  },

  "invoice-products": {
    en: [
      b.p("Products and services hold the price, VAT rate, unit and optional stock that invoice lines can reuse. Send product_id on an invoice line to link the line to a product."),
      b.ul(["unit_price and tax_rate are decimal strings. tax_rate is a percentage such as \"18\".", "tax_included says whether the price already includes VAT.", "Set track_stock with stock_quantity and low_stock_threshold to track stock in OperiX Invoice.", "Updates use PATCH with only the fields you want to change."]),
    ],
    sq: [
      b.p("Produktet dhe shërbimet mbajnë çmimin, normën e TVSH-së, njësinë dhe stokun opsional që rreshtat e faturës mund t'i ripërdorin. Dërgoni product_id në një rresht fature për ta lidhur rreshtin me një produkt."),
      b.ul(["unit_price dhe tax_rate janë vargje dhjetore. tax_rate është përqindje si \"18\".", "tax_included tregon nëse çmimi e përfshin tashmë TVSH-në.", "Vendosni track_stock me stock_quantity dhe low_stock_threshold për të ndjekur stokun në OperiX Invoice.", "Përditësimet përdorin PATCH vetëm me fushat që doni të ndryshoni."]),
    ],
  },

  "invoice-invoices": {
    en: [
      b.p("An invoice moves through a simple lifecycle. The API creates drafts; you issue and void them with actions."),
      b.table(["Status", "What it means", "What you can do"], [
        ["draft", "Created but not issued. No legal number is final yet.", "Edit with PATCH, finalize, or leave it."],
        ["issued", "Finalized. The invoice has its number and affects your books and VAT register.", "Record payments, void, create corrections. It cannot be edited."],
        ["cancelled", "Voided.", "Read-only."],
      ]),
      b.p("Other statuses follow the document lifecycle of OperiX Invoice (for example when payments change the payment status). Always treat status as a string that can gain values over time."),
      b.h2("create", "Creating an invoice"),
      b.ul(["Send customer_id or an inline customer, currency, and 1–500 items.", "OperiX computes subtotal, VAT and total; totals you send are ignored.", "Item vat_rate defaults to 0 — set it.", "document_discount_percent, shipping, transport and additional_fee (each with its own tax rate) are supported.", "external_reference links the invoice to your order id.", "The invoice is created as a draft. Finalize it to issue it."]),
      b.h2("editing", "Editing a draft"),
      b.p("PATCH /v1/invoice/invoices/{id} replaces the fields you send on a draft. Finalized financial records cannot be rewritten."),
      b.h2("finalize-void", "Finalize and void"),
      b.ul(["POST …/finalize issues the invoice (scope invoice:finalize).", "POST …/void cancels it (scope invoice:void). Send an optional JSON body {\"reason\": \"…\"}.", "If the status does not allow the action you receive a 409 conflict. Fetch the invoice and check its status."]),
    ],
    sq: [
      b.p("Një faturë kalon nëpër një cikël të thjeshtë. API krijon drafte; ju i lëshoni dhe i anuloni me veprime."),
      b.table(["Statusi", "Çfarë do të thotë", "Çfarë mund të bëni"], [
        ["draft", "Krijuar por jo lëshuar. Ende nuk ka numër ligjor përfundimtar.", "Ndryshoni me PATCH, finalizoni, ose lëreni."],
        ["issued", "Finalizuar. Fatura ka numrin e vet dhe ndikon në librat dhe librin e TVSH-së.", "Regjistroni pagesa, anuloni, krijoni korrigjime. Nuk ndryshohet."],
        ["cancelled", "Anuluar.", "Vetëm për lexim."],
      ]),
      b.p("Statuse të tjera ndjekin ciklin e dokumentit të OperiX Invoice (p.sh. kur pagesat ndryshojnë statusin e pagesës). Trajtojeni gjithmonë status si varg që mund të fitojë vlera me kalimin e kohës."),
      b.h2("create", "Krijimi i një fature"),
      b.ul(["Dërgoni customer_id ose një klient brenda, currency dhe 1–500 items.", "OperiX llogarit nëntotalin, TVSH-në dhe totalin; totalet që dërgoni injorohen.", "vat_rate i rreshtit është 0 si parazgjedhje — vendoseni.", "Mbështeten document_discount_percent, shipping, transport dhe additional_fee (secili me normë tatimi të vet).", "external_reference e lidh faturën me id-në e porosisë suaj.", "Fatura krijohet si draft. Finalizojeni për ta lëshuar."]),
      b.h2("editing", "Ndryshimi i një drafti"),
      b.p("PATCH /v1/invoice/invoices/{id} zëvendëson fushat që dërgoni në një draft. Regjistrimet financiare të finalizuara nuk mund të rishkruhen."),
      b.h2("finalize-void", "Finalizimi dhe anulimi"),
      b.ul(["POST …/finalize e lëshon faturën (fushëveprimi invoice:finalize).", "POST …/void e anulon (fushëveprimi invoice:void). Dërgoni trup JSON opsional {\"reason\": \"…\"}.", "Nëse statusi nuk e lejon veprimin merrni 409 conflict. Merrni faturën dhe kontrolloni statusin e saj."]),
    ],
  },

  "invoice-payments": {
    en: [
      b.p("Payments record money received from a customer. A payment can be allocated to an invoice or kept on the customer's account."),
      b.ul(["customer_id and amount are required. amount must be greater than zero.", "Send invoice_id to allocate the money to that invoice. The response contains the allocation.", "Leave invoice_id out to record the money on account.", "payment_method is one of cash, bank, bank_transfer, card, online_payment, cheque, other. currency defaults to EUR; payment_date defaults to today.", "external_reference is stored as the payment's bank reference — use it for your payment provider's transaction id.", "company_bank_account_id and fund_account_id choose which account the money went to."]),
      b.p("Payments follow immutable financial rules: an amount that exceeds what OperiX allows for the allocation is rejected, and recorded payments are not edited through the API."),
    ],
    sq: [
      b.p("Pagesat regjistrojnë paranë e marrë nga një klient. Një pagesë mund të alokohet te një faturë ose të mbahet në llogarinë e klientit."),
      b.ul(["customer_id dhe amount janë të detyrueshme. amount duhet të jetë më e madhe se zero.", "Dërgoni invoice_id për ta alokuar paranë te ajo faturë. Përgjigjja përmban alokimin.", "Lëreni jashtë invoice_id për ta regjistruar paranë në llogari.", "payment_method është një nga cash, bank, bank_transfer, card, online_payment, cheque, other. currency është EUR si parazgjedhje; payment_date është sot.", "external_reference ruhet si referenca bankare e pagesës — përdoreni për id-në e transaksionit të ofruesit tuaj.", "company_bank_account_id dhe fund_account_id zgjedhin te cila llogari shkoi paraja."]),
      b.p("Pagesat ndjekin rregulla financiare të pandryshueshme: një shumë që tejkalon çfarë lejon OperiX për alokimin refuzohet dhe pagesat e regjistruara nuk ndryshohen përmes API."),
    ],
  },

  "invoice-pdfs": {
    en: [
      b.p("The PDF endpoint returns the same document OperiX Invoice produces — your template, logo, stamp and signature — as a short-lived download link."),
      b.table(["", ""], [["Endpoint", "GET /v1/invoice/invoices/{id}/pdf"], ["Scope", "document:read"], ["Response", "200 with { \"data\": { \"url\": \"…\", \"expires_at\": \"…\" } }"], ["Link lifetime", "60 seconds"]]),
      b.ul(["Request the link when you need it; do not store it.", "Download it straight away from your server. The link does not need your API key.", "If it expires, ask for a new one."]),
      b.code("bash", curlPdf),
    ],
    sq: [
      b.p("Pika fundore e PDF kthen të njëjtin dokument që prodhon OperiX Invoice — shablloni, logoja, vula dhe nënshkrimi juaj — si lidhje shkarkimi me jetë të shkurtër."),
      b.table(["", ""], [["Pika fundore", "GET /v1/invoice/invoices/{id}/pdf"], ["Fushëveprimi", "document:read"], ["Përgjigjja", "200 me { \"data\": { \"url\": \"…\", \"expires_at\": \"…\" } }"], ["Jetëgjatësia e lidhjes", "60 sekonda"]]),
      b.ul(["Kërkoni lidhjen kur ju duhet; mos e ruani.", "Shkarkojeni menjëherë nga serveri juaj. Lidhja nuk ka nevojë për çelësin tuaj API.", "Nëse skadon, kërkoni një të re."]),
      b.code("bash", curlPdf),
    ],
  },

  changelog: {
    en: [
      b.h2("policy", "Version policy"),
      b.ul(["The public contract is /v1. The OpenAPI document is versioned with it (1.0.0).", "Compatible changes can happen in /v1 without notice: new endpoints, new optional request fields, new response fields, new event types and new error codes. Write your client to ignore fields it does not know.", "Breaking changes — removing or renaming a field, changing a type or a status — need a new major version such as /v2. /v1 keeps working.", "Deprecations are announced here and in What's New before anything is removed."]),
      b.h2("log", "Changes"),
      b.table(["Date", "Change"], [
        ["2026-10", "Documentation rewritten for OperiX Invoice: full quick start, scopes, errors, webhooks and integration guide. OperiX Booking API marked as coming soon."],
        ["2026-08", "Public API 1.0.0: customers, products, invoices (create, update draft, finalize, void), payments and PDF links; Test and Live keys; signed webhooks."],
      ]),
      b.h2("openapi", "The contract"),
      b.p("The machine-readable OpenAPI 3 document describes every path and schema. This site renders its reference from the same file, so what you read here matches what is deployed."),
    ],
    sq: [
      b.h2("policy", "Politika e versioneve"),
      b.ul(["Kontrata publike është /v1. Dokumenti OpenAPI versionohet me të (1.0.0).", "Ndryshime të përputhshme mund të ndodhin në /v1 pa njoftim: pika fundore të reja, fusha opsionale të reja kërkese, fusha të reja përgjigjeje, lloje të reja ngjarjesh dhe kode të reja gabimesh. Shkruani klientin tuaj të injorojë fushat që nuk i njeh.", "Ndryshimet thyese — heqja ose riemërtimi i një fushe, ndryshimi i llojit ose i një statusi — kërkojnë version të ri madhor si /v2. /v1 vazhdon të funksionojë.", "Vjetërsimet njoftohen këtu dhe te Çfarë ka të re para se të hiqet çfarëdo."]),
      b.h2("log", "Ndryshimet"),
      b.table(["Data", "Ndryshimi"], [
        ["2026-10", "Dokumentacioni u rishkrua për OperiX Invoice: fillim i shpejtë i plotë, fushëveprime, gabime, webhooks dhe udhëzues integrimi. API e OperiX Booking u shënua si së shpejti."],
        ["2026-08", "API publike 1.0.0: klientë, produkte, fatura (krijim, përditësim drafti, finalizim, anulim), pagesa dhe lidhje PDF; çelësa Test dhe Live; webhooks të nënshkruara."],
      ]),
      b.h2("openapi", "Kontrata"),
      b.p("Dokumenti OpenAPI 3 i lexueshëm nga makina përshkruan çdo rrugë dhe skemë. Kjo faqe e rendit referencën nga i njëjti skedar, ndaj çfarë lexoni këtu përputhet me çfarë është vendosur."),
    ],
  },
};

/** The Booking coming-soon page content. */
export const bookingComingSoon: Both<{ areas: Array<{ title: string; text: string }> }> = {
  en: {
    areas: [
      { title: "Services", text: "Read and manage the services people can book, with durations, prices and rules." },
      { title: "Providers", text: "Staff and providers who perform services." },
      { title: "Locations", text: "The places where bookings happen." },
      { title: "Resources", text: "Rooms, equipment and other things a booking needs." },
      { title: "Availability", text: "Ask which time slots are free for a service." },
      { title: "Bookings", text: "Create, reschedule, confirm, cancel, check in and complete bookings." },
    ],
  },
  sq: {
    areas: [
      { title: "Shërbimet", text: "Lexoni dhe menaxhoni shërbimet që njerëzit mund të rezervojnë, me kohëzgjatje, çmime dhe rregulla." },
      { title: "Ofruesit", text: "Stafi dhe ofruesit që kryejnë shërbimet." },
      { title: "Vendndodhjet", text: "Vendet ku ndodhin rezervimet." },
      { title: "Burimet", text: "Dhoma, pajisje dhe gjëra të tjera që i duhen një rezervimi." },
      { title: "Disponueshmëria", text: "Pyesni cilat intervale kohore janë të lira për një shërbim." },
      { title: "Rezervimet", text: "Krijoni, riplanifikoni, konfirmoni, anuloni, regjistroni mbërritjen dhe përfundoni rezervime." },
    ],
  },
};

// ---------- Endpoint reference extras (examples keyed by "METHOD /path") ----------
export interface EndpointDoc {
  summary?: Both<string>;
  notes?: Both<string[]>;
  request?: unknown;
  response?: unknown;
  status?: string;
}

const customerObject = { id: "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", name: "Arben Krasniqi", email: "arben@example.com", phone: null, company: null, address: null, external_reference: "SHOP-CUSTOMER-842", created_at: "2026-10-29T09:15:02.114Z", updated_at: "2026-10-29T09:15:02.114Z" };
const productObject = { id: "2c9a41de-7f1b-4a0e-95d6-8a2b7d3f6c40", name: "Website design", description: "One-page business website", sku: "WEB-001", unit: "pcs", unit_price: 450, tax_rate: 18, tax_included: false, track_stock: false, stock_quantity: null, low_stock_threshold: null, category: "Services", currency: "EUR", external_reference: "SKU-WEB-001", created_at: "2026-10-20T08:00:00.000Z", updated_at: "2026-10-20T08:00:00.000Z" };
const invoiceObject = JSON.parse(invoiceResponse.replace("f1a1…", "f1a1c0de").replace("f1a2…", "f1a2c0de")).data;
const issuedInvoice = { ...invoiceObject, status: "issued" };
const paymentObject = JSON.parse(paymentResponse.replace('"a77d…"', '"a77d0c11"')).data;
const list = (items: unknown[]) => ({ data: items, pagination: { has_more: false, next_cursor: null } });

export const endpointDocs: Record<string, EndpointDoc> = {
  "GET /v1/invoice/customers": { summary: { en: "List customers", sq: "Listoni klientët" }, response: list([customerObject]) },
  "POST /v1/invoice/customers": { summary: { en: "Create a customer", sq: "Krijoni një klient" }, request: { name: "Arben Krasniqi", email: "arben@example.com", phone: "+383 44 000 000", company: "Krasniqi Studio", notes: "Prefers email", external_reference: "SHOP-CUSTOMER-842" }, response: { data: customerObject }, status: "201" },
  "GET /v1/invoice/customers/{id}": { summary: { en: "Get a customer", sq: "Merrni një klient" }, response: { data: customerObject } },
  "PATCH /v1/invoice/customers/{id}": { summary: { en: "Update a customer", sq: "Përditësoni një klient" }, request: { phone: "+383 44 111 222" }, response: { data: { ...customerObject, phone: "+383 44 111 222" } }, notes: { en: ["Send only the fields to change. An Idempotency-Key header is required."], sq: ["Dërgoni vetëm fushat që do të ndryshojnë. Kërkohet header-i Idempotency-Key."] } },
  "GET /v1/invoice/products": { summary: { en: "List products", sq: "Listoni produktet" }, response: list([productObject]) },
  "POST /v1/invoice/products": { summary: { en: "Create a product", sq: "Krijoni një produkt" }, request: { name: "Website design", description: "One-page business website", sku: "WEB-001", unit: "pcs", unit_price: "450.00", tax_rate: "18", category: "Services", external_reference: "SKU-WEB-001" }, response: { data: productObject }, status: "201" },
  "GET /v1/invoice/products/{id}": { summary: { en: "Get a product", sq: "Merrni një produkt" }, response: { data: productObject } },
  "PATCH /v1/invoice/products/{id}": { summary: { en: "Update a product", sq: "Përditësoni një produkt" }, request: { unit_price: "480.00" }, response: { data: { ...productObject, unit_price: 480 } }, notes: { en: ["Send only the fields to change. An Idempotency-Key header is required."], sq: ["Dërgoni vetëm fushat që do të ndryshojnë. Kërkohet header-i Idempotency-Key."] } },
  "GET /v1/invoice/invoices": { summary: { en: "List invoices and supported commercial documents", sq: "Listoni faturat dhe dokumentet tregtare të mbështetura" }, response: list([issuedInvoice]), notes: { en: ["Newest first, 100 per page. Filter with status, document_type, customer_id, external_reference, created_after and created_before."], sq: ["Më të rejat së pari, 100 për faqe. Filtroni me status, document_type, customer_id, external_reference, created_after dhe created_before."] } },
  "POST /v1/invoice/invoices": { summary: { en: "Create an invoice or supported commercial document", sq: "Krijoni një faturë ose dokument tregtar të mbështetur" }, request: { customer_id: "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", currency: "EUR", issue_date: "2026-10-29", due_date: "2026-11-12", payment_method: "bank_transfer", external_reference: "ORDER-58391", items: [{ name: "Website design", quantity: "1", unit_price: "450.00", vat_rate: "18" }, { name: "Monthly support", quantity: "2", unit_price: "60.00", vat_rate: "18" }] }, response: { data: invoiceObject }, status: "201", notes: { en: ["Creates a draft. Totals are calculated by OperiX. vat_rate defaults to 0 when omitted.", "Documents other than INVOICE also need the document:write scope."], sq: ["Krijon një draft. Totalet llogariten nga OperiX. vat_rate është 0 kur lihet jashtë.", "Dokumentet e ndryshme nga INVOICE kërkojnë edhe fushëveprimin document:write."] } },
  "GET /v1/invoice/invoices/{id}": { summary: { en: "Get an invoice", sq: "Merrni një faturë" }, response: { data: issuedInvoice } },
  "PATCH /v1/invoice/invoices/{id}": { summary: { en: "Update a draft invoice", sq: "Përditësoni një faturë draft" }, request: { due_date: "2026-11-30", notes: "Payment within 30 days" }, response: { data: { ...invoiceObject, due_date: "2026-11-30", notes: "Payment within 30 days" } }, notes: { en: ["Only drafts can be changed. Finalized financial records cannot be rewritten."], sq: ["Vetëm draftet mund të ndryshohen. Regjistrimet financiare të finalizuara nuk mund të rishkruhen."] } },
  "POST /v1/invoice/invoices/{id}/finalize": { summary: { en: "Finalize (issue) an invoice", sq: "Finalizoni (lëshoni) një faturë" }, response: { data: issuedInvoice }, notes: { en: ["No request body. Returns 409 when the current status does not allow issuing."], sq: ["Pa trup kërkese. Kthen 409 kur statusi aktual nuk lejon lëshimin."] } },
  "POST /v1/invoice/invoices/{id}/void": { summary: { en: "Void an invoice", sq: "Anuloni një faturë" }, request: { reason: "Order cancelled by customer" }, response: { data: { ...issuedInvoice, status: "cancelled" } }, notes: { en: ["The body is optional. OperiX checks that the document can be voided."], sq: ["Trupi është opsional. OperiX kontrollon që dokumenti mund të anulohet."] } },
  "GET /v1/invoice/invoices/{id}/pdf": { summary: { en: "Retrieve an invoice PDF link", sq: "Merrni lidhjen e PDF të një fature" }, response: { data: { url: "https://invoice.operixsuite.com/api/internal/public-pdf?token=eyJ…", expires_at: "2026-11-02T10:03:11.870Z" } }, notes: { en: ["Returns a link that is valid for 60 seconds. Download it immediately."], sq: ["Kthen një lidhje të vlefshme për 60 sekonda. Shkarkojeni menjëherë."] } },
  "GET /v1/invoice/payments": { summary: { en: "List payments", sq: "Listoni pagesat" }, response: list([paymentObject]) },
  "POST /v1/invoice/payments": { summary: { en: "Record a payment", sq: "Regjistroni një pagesë" }, request: { customer_id: "8f0f6b52-3a43-4c2a-9a6c-2a5d1f9d7a10", invoice_id: "c3d2a0a8-7a5b-4b0e-8d3e-0c1c9a3f2e55", amount: "672.60", currency: "EUR", payment_date: "2026-11-02", payment_method: "bank_transfer", external_reference: "BANK-REF-20261102-77" }, response: { data: paymentObject }, status: "201" },
  "GET /v1/invoice/invoices/{id}/payments": { summary: { en: "List payments allocated to an invoice", sq: "Listoni pagesat e alokuara te një faturë" }, response: list([paymentObject]), notes: { en: ["Up to 100 payments. No cursor."], sq: ["Deri në 100 pagesa. Pa kursor."] } },
};

/** Field and parameter descriptions shown in the reference tables. */
export const fieldDocs: Both<Record<string, string>> = {
  en: {
    name: "Name. Required.", email: "Email address.", phone: "Phone number (max 40).", company: "Company name (max 160).", notes: "Free-text notes.", external_reference: "Your own id for this record (max 160). Used to find or link it; must be unique.",
    description: "Description.", sku: "Stock keeping unit (max 120).", unit: "Unit of measure, for example pcs or hour.", unit_price: "Price per unit as a decimal string. Required.", tax_rate: "VAT rate as a percentage, for example \"18\".", tax_included: "Whether the price already includes VAT.", track_stock: "Track stock for this product.", stock_quantity: "Current stock.", low_stock_threshold: "Warn when stock drops to this level.", category: "Category label (max 120).",
    customer_id: "Id of an existing customer.", customer: "A customer object. Creates or reuses a customer (by external_reference).", items: "Invoice lines, 1–500. Required.", "items[].product_id": "Link the line to a product.", "items[].name": "Line description. Required.", "items[].quantity": "Quantity, greater than zero. Required.", "items[].unit_price": "Unit price. Required.", "items[].vat_rate": "VAT percentage 0–100. Defaults to 0 when omitted.", "items[].discount_percent": "Line discount percentage 0–100.", "items[].unit": "Unit of measure.", "items[].sku": "SKU.", "items[].tax_included": "Whether unit_price includes VAT.",
    currency: "Three-letter currency code. Required for invoices.", issue_date: "Issue date (YYYY-MM-DD). Defaults to today.", due_date: "Due date (YYYY-MM-DD).", payment_method: "How the customer pays.", document_discount_percent: "Discount on the whole document, 0–100.", shipping: "Shipping amount.", shipping_tax_rate: "VAT percentage on shipping.", transport: "Transport amount.", transport_tax_rate: "VAT percentage on transport.", additional_fee: "Additional fee amount.", additional_fee_tax_rate: "VAT percentage on the additional fee.", metadata: "Free-form object for your own data.", document_type: "Document type. Defaults to INVOICE.",
    invoice_id: "Invoice the money is allocated to. Omit for money on account.", amount: "Amount received, greater than zero. Required.", payment_date: "Date received (YYYY-MM-DD). Defaults to today.", company_bank_account_id: "Company bank account that received the money.", fund_account_id: "Cash or fund account that received the money.", reason: "Optional reason, up to 500 characters.",
  },
  sq: {
    name: "Emri. E detyrueshme.", email: "Adresa e email-it.", phone: "Numri i telefonit (maks. 40).", company: "Emri i kompanisë (maks. 160).", notes: "Shënime të lira.", external_reference: "Id-ja juaj për këtë regjistrim (maks. 160). Përdoret për ta gjetur ose lidhur; duhet të jetë unike.",
    description: "Përshkrimi.", sku: "Njësia e stokut (maks. 120).", unit: "Njësia matëse, p.sh. pcs ose orë.", unit_price: "Çmimi për njësi si varg dhjetor. E detyrueshme.", tax_rate: "Norma e TVSH-së si përqindje, p.sh. \"18\".", tax_included: "Nëse çmimi e përfshin tashmë TVSH-në.", track_stock: "Ndiq stokun për këtë produkt.", stock_quantity: "Stoku aktual.", low_stock_threshold: "Paralajmëro kur stoku bie në këtë nivel.", category: "Etiketa e kategorisë (maks. 120).",
    customer_id: "Id e një klienti ekzistues.", customer: "Një objekt klienti. Krijon ose ripërdor një klient (sipas external_reference).", items: "Rreshtat e faturës, 1–500. E detyrueshme.", "items[].product_id": "Lidhni rreshtin me një produkt.", "items[].name": "Përshkrimi i rreshtit. E detyrueshme.", "items[].quantity": "Sasia, më e madhe se zero. E detyrueshme.", "items[].unit_price": "Çmimi për njësi. E detyrueshme.", "items[].vat_rate": "Përqindja e TVSH-së 0–100. 0 kur lihet jashtë.", "items[].discount_percent": "Përqindja e zbritjes së rreshtit 0–100.", "items[].unit": "Njësia matëse.", "items[].sku": "SKU.", "items[].tax_included": "Nëse unit_price përfshin TVSH.",
    currency: "Kodi i monedhës me tre shkronja. E detyrueshme për fatura.", issue_date: "Data e lëshimit (VVVV-MM-DD). Sot si parazgjedhje.", due_date: "Afati i pagesës (VVVV-MM-DD).", payment_method: "Si paguan klienti.", document_discount_percent: "Zbritje për gjithë dokumentin, 0–100.", shipping: "Shuma e dërgesës.", shipping_tax_rate: "Përqindja e TVSH-së për dërgesën.", transport: "Shuma e transportit.", transport_tax_rate: "Përqindja e TVSH-së për transportin.", additional_fee: "Shuma e tarifës shtesë.", additional_fee_tax_rate: "Përqindja e TVSH-së për tarifën shtesë.", metadata: "Objekt i lirë për të dhënat tuaja.", document_type: "Lloji i dokumentit. INVOICE si parazgjedhje.",
    invoice_id: "Fatura te e cila alokohet paraja. Lëreni jashtë për para në llogari.", amount: "Shuma e marrë, më e madhe se zero. E detyrueshme.", payment_date: "Data e marrjes (VVVV-MM-DD). Sot si parazgjedhje.", company_bank_account_id: "Llogaria bankare e kompanisë që e mori paranë.", fund_account_id: "Llogaria e arkës ose fondit që e mori paranë.", reason: "Arsye opsionale, deri në 500 karaktere.",
  },
};

export const paramDocs: Both<Record<string, string>> = {
  en: { id: "The resource id (UUID).", cursor: "Cursor from the previous page.", search: "Search text (max 160).", status: "Document status filter.", document_type: "Filter by document type.", external_reference: "Exact match on your reference (max 160).", customer_id: "Only records for this customer.", invoice_id: "Only payments allocated to this invoice.", created_after: "Only records created at or after this ISO timestamp.", created_before: "Only records created before this ISO timestamp.", "Idempotency-Key": "Required on writes. Up to 255 characters. See Idempotency." },
  sq: { id: "Id e burimit (UUID).", cursor: "Kursori nga faqja e mëparshme.", search: "Teksti i kërkimit (maks. 160).", status: "Filtër sipas statusit të dokumentit.", document_type: "Filtroni sipas llojit të dokumentit.", external_reference: "Përputhje e saktë me referencën tuaj (maks. 160).", customer_id: "Vetëm regjistrimet e këtij klienti.", invoice_id: "Vetëm pagesat e alokuara te kjo faturë.", created_after: "Vetëm regjistrimet e krijuara në ose pas kësaj vule kohore ISO.", created_before: "Vetëm regjistrimet e krijuara para kësaj vule kohore ISO.", "Idempotency-Key": "E detyrueshme në shkrime. Deri në 255 karaktere. Shihni Idempotencën." },
};
