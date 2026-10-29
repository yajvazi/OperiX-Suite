import { LOCAL_TABLES, type DataRecord, type StoreTable } from "@invoice-monorepo/data-store";
import { getLocalStore } from "./local-store";

type Row = Record<string, unknown> & { id: string };

export function isLocalTable(table: string): table is StoreTable {
  return (LOCAL_TABLES as readonly string[]).includes(table);
}

/** Embedded lookups in a select string, for example `client:clients(name)` -> alias "client", table "clients". */
function embeddedRelations(select: string) {
  return Array.from(select.matchAll(/(\w+):(\w+)\(/g)).map((match) => ({ alias: match[1], table: match[2] }))
    .filter((relation) => isLocalTable(relation.table) && relation.table !== "invoice_items");
}

/** Rows of one collection with the lookups its select asks for (customer on an invoice...) attached. */
export async function listLocalResource(table: string, select = "*"): Promise<Row[]> {
  if (!isLocalTable(table)) return [];
  const store = await getLocalStore();
  const rows = (await store.list(table)) as Row[];
  const relations = embeddedRelations(select);
  if (!relations.length) return rows;
  const lookups = await Promise.all(relations.map(async (relation) => {
    const records = await store.list(relation.table as StoreTable);
    return [relation, new Map(records.map((record: DataRecord) => [record.id, record]))] as const;
  }));
  return rows.map((row) => {
    const next: Row = { ...row };
    for (const [relation, byId] of lookups) next[relation.alias] = byId.get(String(row[`${relation.alias}_id`] ?? "")) ?? null;
    return next;
  });
}

export async function saveLocalResource(table: string, payload: Record<string, unknown>, id?: string): Promise<Row> {
  if (!isLocalTable(table)) throw new Error(`"${table}" is not available in on-device mode.`);
  const store = await getLocalStore();
  const { user_id: _user, company_id: _company, ...fields } = payload;
  void _user; void _company;
  return (await store.save(table, { ...fields, company_id: store.companyId, ...(id ? { id } : {}) })) as Row;
}

export async function removeLocalResource(table: string, id: string): Promise<void> {
  const store = await getLocalStore();
  if (table === "payments") { await store.reverseCustomerPayment(id, "Removed from payments"); return; }
  if (!isLocalTable(table)) throw new Error(`"${table}" is not available in on-device mode.`);
  await store.remove(table, id);
}

/** Up to six rows whose given fields contain the text, shaped like a backend answer (`{ data }`). */
export async function searchLocalResource(table: string, fields: string[], term: string, select = "*") {
  const needle = term.trim().toLowerCase();
  const rows = await listLocalResource(table, select);
  return { data: rows.filter((row) => fields.some((field) => String(row[field] ?? "").toLowerCase().includes(needle))).slice(0, 6) };
}
