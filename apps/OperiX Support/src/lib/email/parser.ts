import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { simpleParser, type ParsedMail } from "mailparser";
import { normalizeMessageId, parseEmailBody } from "@invoice-monorepo/support";

export type ParsedIncomingAttachment = { filename: string; contentType: string; content: Buffer; contentId?: string; providerAttachmentId?: string };
export type ParsedIncomingEmail = {
  from: { address: string; name: string | null };
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string;
  bodyText: string;
  bodyHtml: string | null;
  rawBody: string;
  headers: Record<string, string>;
  attachments: ParsedIncomingAttachment[];
  messageHash: string;
};

const HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "hr"],
  allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "width", "height"], "*": ["class"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
};

function headerText(value: unknown): string | null { if (typeof value === "string") return value; if (Array.isArray(value)) return value.join(", "); if (value && typeof value === "object" && "text" in value) return String((value as { text: unknown }).text); return value == null ? null : String(value); }

function headersToRecord(headers: Map<string, unknown>): Record<string, string> { const result: Record<string, string> = {}; headers.forEach((value, key) => { const text = headerText(value); if (text) result[key.toLowerCase()] = text.slice(0, 20_000); }); return result; }

function cleanHtml(html: string | false | undefined): string | null { if (!html) return null; const cleaned = sanitizeHtml(html, HTML_OPTIONS).trim(); return cleaned || null; }
function decodeBasicEntities(value: string): string { return value.replaceAll("&gt;", "> ").replaceAll("&lt;", "<").replaceAll("&quot;", '"').replaceAll("&#039;", "'").replaceAll("&amp;", "&"); }

export async function parseIncomingEmail(raw: Buffer | string): Promise<ParsedIncomingEmail> {
  const source = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const parsed: ParsedMail = await simpleParser(source);
  const sender = parsed.from?.value?.find((value) => value.address);
  if (!sender?.address) throw new Error("Incoming email does not contain a sender address");
  const textSource = parsed.text && /<[^>]+>/.test(parsed.text)
    ? decodeBasicEntities(sanitizeHtml(parsed.text, { allowedTags: [], allowedAttributes: {} }))
    : parsed.text ?? "";
  const bodyText = parseEmailBody(textSource);
  const bodyHtml = cleanHtml(parsed.html);
  const rawBody = source.toString("utf8");
  const rawReferences = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
  const references = [...new Set(rawReferences.map((value) => normalizeMessageId(value)).filter((value): value is string => Boolean(value)))];
  const attachments = parsed.attachments.map((attachment, index) => ({ filename: (attachment.filename || `attachment-${index + 1}`).slice(0, 160), contentType: attachment.contentType || "application/octet-stream", content: attachment.content, contentId: attachment.contentId, providerAttachmentId: attachment.cid ?? undefined }));
  return {
    from: { address: sender.address.trim().toLowerCase(), name: sender.name?.trim() || null },
    subject: (parsed.subject || "No subject").trim().slice(0, 240),
    messageId: normalizeMessageId(parsed.messageId),
    inReplyTo: normalizeMessageId(parsed.inReplyTo),
    references,
    receivedAt: (parsed.date ?? new Date()).toISOString(),
    bodyText: bodyText || "(No text body)",
    bodyHtml,
    rawBody,
    headers: headersToRecord(parsed.headers),
    attachments,
    messageHash: createHash("sha256").update(source).digest("hex"),
  };
}
