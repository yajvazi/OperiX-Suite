import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Cloud, ExternalLink } from "lucide-react";
import { publicApiOpenApi } from "@invoice-monorepo/public-api/openapi";
import type { DocBlock, Locale } from "../content/types";
import { apiGroups, apiSections, localizedSection, resolveApiSlug, type ApiGroupKey } from "../content/api-docs";
import { apiGuides, apiUi, bookingComingSoon, endpointDocs, fieldDocs, paramDocs } from "../content/api-guides";
import { apiPath } from "../lib/paths";
import { ArticleContent } from "./article-content";
import { CodeBlockClient, TabsClient } from "./article-interactions";
import { Icon } from "./icons";
import { SupportCta } from "./support-cta";
import "../app/api-docs.css";
import { copy } from "../content/ui";

type OpenApiObject = Record<string, unknown>;
type OpenApiSpec = { paths: Record<string, Record<string, OpenApiObject>>; components?: Record<string, Record<string, OpenApiObject>> };
const spec = publicApiOpenApi as unknown as OpenApiSpec;
const methods = ["get", "post", "patch", "put", "delete"] as const;
const BASE = "https://api.operixsuite.com";

/** The paths each resource page documents. Only Invoice endpoints are listed: Booking is not launched. */
const endpointPaths: Record<string, string[]> = {
  "invoice-customers": ["/v1/invoice/customers", "/v1/invoice/customers/{id}"],
  "invoice-products": ["/v1/invoice/products", "/v1/invoice/products/{id}"],
  "invoice-invoices": ["/v1/invoice/invoices", "/v1/invoice/invoices/{id}", "/v1/invoice/invoices/{id}/finalize", "/v1/invoice/invoices/{id}/void"],
  "invoice-payments": ["/v1/invoice/payments", "/v1/invoice/invoices/{id}/payments"],
  "invoice-pdfs": ["/v1/invoice/invoices/{id}/pdf"],
};

function operationsFor(slug: string) {
  return (endpointPaths[slug] || []).flatMap((path) => methods.filter((method) => spec.paths[path]?.[method]).map((method) => ({ path, method, operation: spec.paths[path][method] })));
}

function resolveRef(value: unknown): OpenApiObject {
  const ref = value && typeof value === "object" && "$ref" in value ? String((value as { $ref: string }).$ref) : "";
  if (!ref.startsWith("#/components/")) return (value as OpenApiObject) || {};
  const [, , group, name] = ref.split("/");
  return spec.components?.[group]?.[name] ?? {};
}

function typeLabel(schema: OpenApiObject, locale: Locale): string {
  const ref = (schema as { $ref?: string }).$ref;
  if (ref?.endsWith("/Money")) return locale === "sq" ? "varg dhjetor ose numër" : "decimal string or number";
  const resolved = ref ? resolveRef(schema) : schema;
  const type = Array.isArray(resolved.type) ? (resolved.type as string[]).filter((item) => item !== "null").join(" | ") : String(resolved.type || "object");
  const bits: string[] = [type === "string" && resolved.pattern === "^\\d+(\\.\\d{1,4})?$" ? (locale === "sq" ? "varg dhjetor" : "decimal string") : type];
  if (resolved.format) bits.push(String(resolved.format));
  if (Array.isArray(resolved.enum)) bits.push((resolved.enum as string[]).join(" | "));
  if (resolved.maxLength) bits.push(`max ${resolved.maxLength}`);
  if (resolved.minItems || resolved.maxItems) bits.push(`${resolved.minItems ?? 0}–${resolved.maxItems ?? "∞"} items`);
  if (resolved.minimum !== undefined) bits.push(`min ${resolved.minimum}`);
  if (resolved.maximum !== undefined) bits.push(`max ${resolved.maximum}`);
  if (Array.isArray(resolved.type) && (resolved.type as string[]).includes("null")) bits.push("nullable");
  return bits.join(" · ");
}

type FieldRow = { name: string; type: string; required: boolean };

function fieldRows(schema: OpenApiObject, locale: Locale, prefix = "", allOptional = false): FieldRow[] {
  const resolved = resolveRef(schema);
  const properties = (resolved.properties || {}) as Record<string, OpenApiObject>;
  const required = new Set((resolved.required || []) as string[]);
  return Object.entries(properties).flatMap(([name, property]) => {
    const full = `${prefix}${name}`;
    const row: FieldRow = { name: full, type: typeLabel(property, locale), required: !allOptional && required.has(name) };
    const target = resolveRef(property);
    if (target.type === "array" && target.items) {
      const item = resolveRef(target.items);
      return [row, ...fieldRows(item, locale, `${full}[].`, allOptional)];
    }
    if (!(property as { $ref?: string }).$ref || (property as { $ref?: string }).$ref!.endsWith("/Money")) return [row];
    return [row, ...fieldRows(property, locale, `${full}.`, allOptional)];
  });
}

function requestSchema(operation: OpenApiObject) {
  const body = resolveRef(operation.requestBody);
  const content = body.content as Record<string, { schema?: OpenApiObject }> | undefined;
  return content?.["application/json"]?.schema;
}

function placeholderPath(path: string) {
  return path.replace("{id}", path.includes("/customers/") ? "CUSTOMER_ID" : path.includes("/products/") ? "PRODUCT_ID" : "INVOICE_ID");
}

function samples(path: string, method: string, request: unknown, idempotent: boolean) {
  const url = `${BASE}${placeholderPath(path)}`;
  const upper = method.toUpperCase();
  const key = `${method === "post" ? "create" : "update"}-${path.split("/").filter((part) => !part.startsWith("{")).pop()}-001`;
  const body = request ? JSON.stringify(request, null, 2) : "";
  const curl = `curl${upper === "GET" ? "" : ` -X ${upper}`} "${url}" \\\n  -H "Authorization: Bearer $OPERIX_API_KEY"${request || idempotent ? ' \\\n  -H "Content-Type: application/json"' : ""}${idempotent ? ` \\\n  -H "Idempotency-Key: ${key}"` : ""}${body ? ` \\\n  -d '${body.replace(/'/g, "'\\''")}'` : ""}`;
  const js = `const response = await fetch("${url}", {\n  method: "${upper}",\n  headers: {\n    Authorization: \`Bearer \${process.env.OPERIX_API_KEY}\`,${request || idempotent ? '\n    "Content-Type": "application/json",' : ""}${idempotent ? `\n    "Idempotency-Key": "${key}",` : ""}\n  },${body ? `\n  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),` : ""}\n});\nconst json = await response.json();`;
  const python = `import os, requests\n\nresponse = requests.request(\n    "${upper}",\n    "${url}",\n    headers={\n        "Authorization": f"Bearer {os.environ['OPERIX_API_KEY']}",${idempotent ? `\n        "Idempotency-Key": "${key}",` : ""}\n    },${body ? `\n    json=${body.replace(/\n/g, "\n    ").replace(/\bnull\b/g, "None").replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False")},` : ""}\n)\nprint(response.json())`;
  return [{ label: "cURL", language: "bash", code: curl }, { label: "JavaScript", language: "javascript", code: js }, { label: "Python", language: "python", code: python }];
}

function EndpointReference({ locale, path, method, operation }: { locale: Locale; path: string; method: string; operation: OpenApiObject }) {
  const ui = apiUi[locale];
  const docs = endpointDocs[`${method.toUpperCase()} ${path}`] || {};
  const scope = String(operation["x-operix-scope"] || "");
  const idempotent = method === "post" || method === "patch";
  const parameters = ((operation.parameters as unknown[]) || []).map(resolveRef).filter((parameter) => parameter.name && parameter.name !== "Idempotency-Key") as Array<OpenApiObject>;
  const schema = requestSchema(operation);
  const rows = schema ? fieldRows(schema, locale, "", method === "patch") : [];
  const fields = fieldDocs[locale];
  const params = paramDocs[locale];
  const anchor = `${method}-${path.replace(/[^a-z0-9]+/gi, "-")}`;
  const status = docs.status || (method === "post" && !path.endsWith("/finalize") && !path.endsWith("/void") ? "201" : "200");
  const title = docs.summary?.[locale] || String(operation.summary || "");
  const notes = docs.notes?.[locale] || [];
  return <article className="api-endpoint" id={anchor}>
    <header className="api-endpoint-head"><span className={`api-method api-method-${method}`}>{method.toUpperCase()}</span><code>{path}</code></header>
    <h3>{title}</h3>
    <div className="api-chips">
      {scope ? <span className="api-chip"><strong>{ui.scope}</strong> <code>{scope}</code></span> : null}
      {idempotent ? <span className="api-chip api-chip-warn"><code>Idempotency-Key</code> {locale === "sq" ? "e detyrueshme" : "required"}</span> : null}
    </div>
    {notes.map((note) => <p key={note} className="api-note">{note}</p>)}
    {parameters.length || idempotent ? <div className="api-block"><h4>{ui.parameters}</h4><div className="api-table-wrap"><table className="api-table"><thead><tr><th>{ui.name}</th><th>{ui.location}</th><th>{ui.required}</th><th>{ui.description}</th></tr></thead><tbody>
      {parameters.map((parameter) => <tr key={`${parameter.in}-${parameter.name}`}><td><code>{String(parameter.name)}</code></td><td>{String(parameter.in)}</td><td>{parameter.required ? ui.yes : ui.no}</td><td>{params[String(parameter.name)] || ""}</td></tr>)}
      {idempotent ? <tr><td><code>Idempotency-Key</code></td><td>header</td><td>{ui.yes}</td><td>{params["Idempotency-Key"]}</td></tr> : null}
    </tbody></table></div></div> : null}
    {rows.length ? <div className="api-block"><h4>{ui.requestBody}</h4><div className="api-table-wrap"><table className="api-table"><thead><tr><th>{ui.name}</th><th>{ui.type}</th><th>{ui.required}</th><th>{ui.description}</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.name}><td><code>{row.name}</code></td><td>{row.type}</td><td>{row.required ? ui.yes : ui.no}</td><td>{fields[row.name] || fields[row.name.split(".").pop() || ""] || ""}</td></tr>)}
    </tbody></table></div>{method === "patch" ? <p className="api-note">{locale === "sq" ? "Të gjitha fushat janë opsionale: dërgoni vetëm ato që ndryshojnë." : "All fields are optional: send only the ones that change."}</p> : null}</div> : null}
    <div className="api-block"><h4>{ui.tryIn}</h4><TabsClient locale={locale} tabs={samples(path, method, docs.request, idempotent)} /></div>
    {docs.response ? <div className="api-block"><h4>{ui.responseExample}</h4><CodeBlockClient locale={locale} language="json" code={JSON.stringify(docs.response, null, 2)} filename={`${status} ${status === "201" ? "Created" : "OK"}`} /></div> : null}
    <p className="api-foot">{ui.errorsNote} <Link href={apiPath(locale, "errors")}>{localizedSection("errors", locale)?.title}</Link></p>
  </article>;
}

function headings(blocks: DocBlock[]) {
  return blocks.filter((block): block is Extract<DocBlock, { type: "heading" }> => block.type === "heading" && block.level === 2).map((block) => ({ id: block.id, text: block.text }));
}

function ApiNav({ locale, current }: { locale: Locale; current?: string }) {
  const groups = (Object.keys(apiGroups) as ApiGroupKey[]).sort((a, b) => apiGroups[a].order - apiGroups[b].order);
  return <aside className="api-nav" aria-label={apiUi[locale].breadcrumbApi}>
    <Link className={`api-nav-home ${!current ? "is-active" : ""}`} href={apiPath(locale)}>{apiUi[locale].breadcrumbApi}</Link>
    {groups.map((group) => {
      const items = apiSections.filter((section) => section.group === group).sort((a, b) => a.order - b.order);
      if (!items.length) return null;
      return <div className="api-nav-group" key={group}>
        <p>{apiGroups[group][locale]}</p>
        {items.map((section) => <Link key={section.slug} href={apiPath(locale, section.slug)} className={current === section.slug ? "is-active" : ""} aria-current={current === section.slug ? "page" : undefined}>{localizedSection(section.slug, locale)?.title}{section.comingSoon ? <span className="api-soon">{apiUi[locale].comingSoon}</span> : null}</Link>)}
      </div>;
    })}
    <a className="api-nav-external" href={`${BASE}/v1/`} target="_blank" rel="noreferrer">{apiUi[locale].host}<ExternalLink size={13} /></a>
  </aside>;
}

function CloudNote({ locale }: { locale: Locale }) {
  const ui = apiUi[locale];
  return <aside className="api-cloud-note"><Cloud size={20} aria-hidden="true" /><div><strong>{ui.needsAddon}</strong><p>{ui.needsAddonText}</p></div></aside>;
}

export function ApiHome({ locale }: { locale: Locale }) {
  const ui = apiUi[locale];
  const groups = (Object.keys(apiGroups) as ApiGroupKey[]).sort((a, b) => apiGroups[a].order - apiGroups[b].order);
  return <div className="api-page"><div className="site-container api-shell">
    <ApiNav locale={locale} />
    <main id="main-content" className="api-main">
      <div className="api-hero"><span className="api-hero-icon"><Icon name="code" size={22} /></span><p className="eyebrow">{ui.eyebrow}</p><h1>{ui.homeTitle}</h1><p>{ui.homeText}</p>
        <div className="api-hero-actions"><Link className="button-primary" href={apiPath(locale, "quick-start")}>{localizedSection("quick-start", locale)?.title}<ArrowRight size={16} /></Link><Link className="button-secondary" href={apiPath(locale, "authentication")}>{localizedSection("authentication", locale)?.title}</Link></div>
        <p className="api-hero-base"><span>{ui.baseUrl}</span><code>{BASE}</code></p></div>
      <CloudNote locale={locale} />
      {groups.map((group) => {
        const items = apiSections.filter((section) => section.group === group).sort((a, b) => a.order - b.order);
        if (!items.length) return null;
        return <section key={group} className="api-group"><h2>{apiGroups[group][locale]}</h2><div className="api-card-grid">
          {items.map((section) => { const text = localizedSection(section.slug, locale)!; return <Link className={`api-card ${section.comingSoon ? "is-soon" : ""}`} href={apiPath(locale, section.slug)} key={section.slug}><span className="api-card-icon"><Icon name={section.icon} size={19} /></span><span className="api-card-copy"><strong>{text.title}{section.comingSoon ? <em className="api-soon">{ui.comingSoon}</em> : null}</strong><small>{text.description}</small></span><ArrowRight size={16} /></Link>; })}
        </div></section>;
      })}
      <SupportCta locale={locale} compact />
    </main>
  </div></div>;
}

function BookingComingSoon({ locale }: { locale: Locale }) {
  const ui = apiUi[locale];
  return <>
    <div className="api-soon-hero"><span className="api-pill-soon">{ui.comingSoon}</span><h2>{ui.bookingTitle}</h2><p>{ui.bookingText}</p></div>
    <h2 id="areas">{ui.bookingAreas}</h2>
    <div className="api-area-grid">{bookingComingSoon[locale].areas.map((area) => <div className="api-area" key={area.title}><Check size={16} aria-hidden="true" /><div><strong>{area.title}</strong><p>{area.text}</p></div></div>)}</div>
    <aside className="callout callout-note"><div><strong>{locale === "sq" ? "Shënim" : "Note"}</strong><p>{ui.bookingNote}</p></div></aside>
    <Link className="button-secondary" href={`/${locale}/help/booking`}>{ui.bookingCta}<ArrowRight size={16} /></Link>
  </>;
}

export function ApiSectionPage({ locale, slug: requestedSlug }: { locale: Locale; slug: string }) {
  const slug = resolveApiSlug(requestedSlug);
  if (!slug) return <ApiHome locale={locale} />;
  const section = localizedSection(slug, locale)!;
  const ui = apiUi[locale];
  const guide = apiGuides[slug]?.[locale] ?? apiGuides[slug]?.en ?? [];
  const operations = operationsFor(slug);
  const ordered = [...apiSections].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((item) => item.slug === slug);
  const previous = ordered[index - 1];
  const next = ordered[index + 1];
  const toc = [...headings(guide), ...(operations.length ? [{ id: "endpoints", text: ui.endpoints }] : [])];
  const showCloudNote = ["introduction", "quick-start", "api-keys"].includes(slug);
  return <div className="api-page"><div className="site-container api-shell">
    <ApiNav locale={locale} current={slug} />
    <main id="main-content" className="api-main">
      <nav className="article-breadcrumb" aria-label={copy(locale, "breadcrumb")}><Link href={`/${locale}`}>{ui.breadcrumbRoot}</Link><span>/</span><Link href={apiPath(locale)}>{ui.breadcrumbApi}</Link><span>/</span><strong>{section.title}</strong></nav>
      <header className="api-title"><span className="api-hero-icon"><Icon name={section.icon} size={21} /></span><p className="eyebrow">{ui.sectionEyebrow}</p><h1>{section.title}</h1><p>{section.description}</p></header>
      {showCloudNote ? <CloudNote locale={locale} /> : null}
      {slug === "booking-api" ? <BookingComingSoon locale={locale} /> : <ArticleContent blocks={guide} locale={locale} />}
      {operations.length ? <section className="api-reference" id="endpoints"><div className="api-reference-head"><div><p className="eyebrow">{ui.openApi}</p><h2>{ui.endpoints}</h2><p>{ui.endpointsText}</p></div></div>{operations.map((item) => <EndpointReference key={`${item.method}-${item.path}`} locale={locale} {...item} />)}</section> : null}
      <nav className="api-pager" aria-label={copy(locale, "apiPages")}>
        {previous ? <Link href={apiPath(locale, previous.slug)}><ArrowLeft size={15} /><span><small>{ui.previous}</small><strong>{localizedSection(previous.slug, locale)?.title}</strong></span></Link> : <span />}
        {next ? <Link className="is-next" href={apiPath(locale, next.slug)}><span><small>{ui.next}</small><strong>{localizedSection(next.slug, locale)?.title}</strong></span><ArrowRight size={15} /></Link> : <span />}
      </nav>
      <SupportCta locale={locale} compact />
    </main>
    {toc.length > 1 ? <aside className="api-toc" aria-label={ui.onThisPage}><p>{ui.onThisPage}</p><nav>{toc.map((item) => <a key={item.id} href={`#${item.id}`}>{item.text}</a>)}</nav></aside> : null}
  </div></div>;
}
