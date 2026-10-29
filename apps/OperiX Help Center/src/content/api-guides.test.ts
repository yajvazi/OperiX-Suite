import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INVOICE_SCOPES, PUBLIC_WEBHOOK_EVENTS } from "@invoice-monorepo/public-api/contracts";
import { publicApiOpenApi } from "@invoice-monorepo/public-api/openapi";
import { apiSections } from "./api-docs";
import { apiGuides, endpointDocs } from "./api-guides";
import type { DocBlock } from "./types";

const root = resolve(process.cwd(), "../..");
const gateway = readFileSync(resolve(root, "apps/OperiX Public API/src/app/v1/[...path]/route.ts"), "utf8");
const spec = publicApiOpenApi as unknown as { paths: Record<string, Record<string, unknown>> };

const text = (blocks: DocBlock[]) => JSON.stringify(blocks);

describe("API documentation", () => {
  it("has an English and Albanian guide for every section that needs one", () => {
    for (const section of apiSections.filter((item) => !item.comingSoon && !item.slug.startsWith("invoice-") || ["invoice-integration", "invoice-customers", "invoice-products", "invoice-invoices", "invoice-documents", "invoice-payments", "invoice-pdfs"].includes(item.slug))) {
      expect(apiGuides[section.slug]?.en?.length, `${section.slug} en`).toBeGreaterThan(0);
      expect(apiGuides[section.slug]?.sq?.length, `${section.slug} sq`).toBeGreaterThan(0);
    }
  });

  it("uses unique heading ids per guide and the same ids in both languages", () => {
    for (const [slug, guide] of Object.entries(apiGuides)) {
      const ids = (blocks: DocBlock[]) => blocks.filter((block) => block.type === "heading").map((block) => (block as { id: string }).id);
      expect(new Set(ids(guide.en)).size, slug).toBe(ids(guide.en).length);
      expect(ids(guide.sq), slug).toEqual(ids(guide.en));
    }
  });

  it("documents every Invoice operation in the OpenAPI contract", () => {
    for (const [path, item] of Object.entries(spec.paths)) {
      if (!path.startsWith("/v1/invoice/")) continue;
      for (const method of ["get", "post", "patch"]) if (item[method]) expect(endpointDocs[`${method.toUpperCase()} ${path}`], `${method} ${path}`).toBeDefined();
    }
    for (const key of Object.keys(endpointDocs)) {
      const [method, path] = key.split(" ");
      expect(spec.paths[path]?.[method.toLowerCase()], key).toBeDefined();
    }
  });

  it("only names scopes and events that exist", () => {
    const scopeMentions = new Set([...text(apiGuides.permissions.en).matchAll(/"((?:customer|product|invoice|payment|document):[a-z]+)"/g)].map((match) => match[1]));
    for (const scope of scopeMentions) expect(INVOICE_SCOPES as readonly string[]).toContain(scope);
    for (const scope of INVOICE_SCOPES) expect(scopeMentions.has(scope), scope).toBe(true);
    const events = new Set([...text(apiGuides.webhooks.en).matchAll(/"((?:invoice|payment|customer)\.[a-z_]+)"/g)].map((match) => match[1]));
    for (const event of events) expect(PUBLIC_WEBHOOK_EVENTS as readonly string[]).toContain(event);
  });

  it("lists only error codes the gateway can return", () => {
    const codes = [...text(apiGuides.errors.en).matchAll(/\["([a-z_]+)","(\d{3})"/g)].map((match) => match[1]);
    expect(codes.length).toBeGreaterThan(20);
    const known = new Set(["conflict", "internal_error"]);
    for (const code of codes) if (!known.has(code)) expect(gateway.includes(`"${code}"`) || readFileSync(resolve(root, "packages/public-api/src/server.ts"), "utf8").includes(`"${code}"`), code).toBe(true);
  });

  it("states the rate limits and idempotency lifetime that the code enforces", () => {
    expect(gateway).toContain('environment === "test" ? 60 : 120');
    expect(text(apiGuides["rate-limits"].en)).toContain("120 requests per minute");
    expect(text(apiGuides["rate-limits"].en)).toContain("60 requests per minute");
    expect(gateway).toContain("const PAGE_SIZE = 100");
    expect(gateway).toContain("256 * 1024");
    expect(readFileSync(resolve(root, "supabase/migrations/20260824261000_public_api_platform.sql"), "utf8")).toContain("interval '48 hours'");
  });
});
