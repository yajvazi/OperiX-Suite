import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprint = process.env.OPERIX_INVOICE_ANDROID_SHA256_CERT_FINGERPRINT?.trim();
  const packageName = process.env.OPERIX_INVOICE_ANDROID_PACKAGE?.trim();
  if (!fingerprint || !packageName) return NextResponse.json([]);
  const fingerprints = fingerprint.split(",").map((value) => value.trim()).filter(Boolean);
  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }]);
}
