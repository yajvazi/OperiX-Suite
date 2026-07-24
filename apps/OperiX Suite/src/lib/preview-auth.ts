import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_COOKIE = "operix_preview_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  return process.env.OPERIX_PREVIEW_SESSION_SECRET ?? "";
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function previewAuthConfigured() {
  return Boolean(
    process.env.OPERIX_PREVIEW_USERNAME &&
    process.env.OPERIX_PREVIEW_PASSWORD &&
    getSessionSecret(),
  );
}

export function verifyPreviewCredentials(username: string, password: string) {
  if (!previewAuthConfigured()) return false;
  return (
    safeEqual(username, process.env.OPERIX_PREVIEW_USERNAME ?? "") &&
    safeEqual(password, process.env.OPERIX_PREVIEW_PASSWORD ?? "")
  );
}

export function createPreviewSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyPreviewSession(token: string | undefined) {
  if (!token || !previewAuthConfigured()) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: number };
    return typeof session.expiresAt === "number" && session.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const previewCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
