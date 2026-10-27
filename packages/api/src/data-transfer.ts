export type DataTransferEntity = 'clients' | 'products' | 'vendors' | 'expenses';

export type DataTransferFieldKind = 'text' | 'number' | 'boolean' | 'date';

export interface DataTransferField {
  key: string;
  label: string;
  kind?: DataTransferFieldKind;
  required?: boolean;
  aliases?: string[];
}

export interface DataTransferDefinition {
  entity: DataTransferEntity;
  table: string;
  label: string;
  description: string;
  exportFields: DataTransferField[];
  importFields: DataTransferField[];
}

const clientFields: DataTransferField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['customer', 'client', 'customer name', 'client name', 'emri', 'emri i klientit'] },
  { key: 'email', label: 'Email', kind: 'text', aliases: ['e-mail', 'email address', 'emaili'] },
  { key: 'phone', label: 'Phone', kind: 'text', aliases: ['telephone', 'mobile', 'telefoni'] },
  { key: 'address', label: 'Address', kind: 'text', aliases: ['adresa'] },
  { key: 'city', label: 'City', kind: 'text', aliases: ['qyteti'] },
  { key: 'zip_code', label: 'Postal code', kind: 'text', aliases: ['zip', 'postal code', 'kodi postar'] },
  { key: 'country', label: 'Country', kind: 'text', aliases: ['shteti'] },
  { key: 'tax_id', label: 'Tax ID', kind: 'text', aliases: ['tax number', 'numri fiskal', 'nr fiskal'] },
  { key: 'nui', label: 'Unique business number', kind: 'text', aliases: ['unique number', 'business number', 'nui', 'nr unik'] },
  { key: 'fiscal_number', label: 'Fiscal number', kind: 'text', aliases: ['fiscal no', 'numri fiskal'] },
  { key: 'vat_number', label: 'VAT number', kind: 'text', aliases: ['vat no', 'tvsh', 'nr tvsh'] },
  { key: 'discount_percent', label: 'Default discount (%)', kind: 'number', aliases: ['discount', 'discount %', 'rabati'] },
];

const productFields: DataTransferField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['product', 'item', 'product name', 'description', 'emri', 'përshkrimi'] },
  { key: 'sku', label: 'SKU', kind: 'text', aliases: ['code', 'product code', 'shifra', 'kodi'] },
  { key: 'description', label: 'Description', kind: 'text', aliases: ['details', 'përshkrimi'] },
  { key: 'category', label: 'Category', kind: 'text', aliases: ['kategoria'] },
  { key: 'unit', label: 'Unit', kind: 'text', aliases: ['njësia', 'njesia'] },
  { key: 'stock_quantity', label: 'Stock quantity', kind: 'number', aliases: ['stock', 'quantity', 'qty', 'sasia', 'stoku'] },
  { key: 'track_stock', label: 'Track stock', kind: 'boolean', aliases: ['inventory tracking', 'tracked', 'ndiq stokun'] },
  { key: 'low_stock_threshold', label: 'Low stock alert', kind: 'number', aliases: ['low stock', 'threshold', 'pragu i stokut'] },
  { key: 'unit_price', label: 'Sale price', kind: 'number', required: true, aliases: ['price', 'selling price', 'çmimi', 'çmimi i shitjes'] },
  { key: 'tax_rate', label: 'VAT rate (%)', kind: 'number', aliases: ['vat', 'vat %', 'tax', 'tvsh', 'tvsh %'] },
  { key: 'tax_included', label: 'Price includes VAT', kind: 'boolean', aliases: ['tax included', 'vat included', 'përfshin tvsh'] },
  { key: 'vat_treatment', label: 'VAT treatment', kind: 'text', aliases: ['tax treatment', 'trajtimi i tvsh-së'] },
  { key: 'purchase_currency', label: 'Supplier currency', kind: 'text', aliases: ['currency', 'valuta'] },
  { key: 'exchange_rate', label: 'Exchange rate', kind: 'number', aliases: ['rate', 'kursi'] },
  { key: 'supplier_unit_price', label: 'Supplier unit price', kind: 'number', aliases: ['supplier price', 'çmimi i furnitorit'] },
  { key: 'supplier_discount_percent', label: 'Supplier discount (%)', kind: 'number', aliases: ['supplier discount', 'rabati i furnitorit'] },
  { key: 'supplier_unit_price_after_discount', label: 'Supplier price after discount', kind: 'number', aliases: ['price after discount', 'çmimi pas rabatit'] },
  { key: 'transport_cost', label: 'Transport cost', kind: 'number', aliases: ['transport', 'freight', 'transporti'] },
  { key: 'additional_cost', label: 'Additional costs', kind: 'number', aliases: ['additional cost', 'shtesat'] },
  { key: 'customs_base', label: 'Customs base', kind: 'number', aliases: ['customs value', 'baza doganore'] },
  { key: 'customs_duty', label: 'Customs duty', kind: 'number', aliases: ['duty', 'dogana'] },
  { key: 'excise', label: 'Excise', kind: 'number', aliases: ['akciza'] },
  { key: 'import_vat_rate', label: 'Import VAT rate (%)', kind: 'number', aliases: ['import vat', 'import tvsh'] },
  { key: 'import_vat_amount', label: 'Import VAT amount', kind: 'number', aliases: ['vat amount', 'tvsh amount'] },
  { key: 'unit_cost_with_vat', label: 'Unit cost including VAT', kind: 'number', aliases: ['landed cost', 'cost with vat', 'kostoja me tvsh'] },
  { key: 'tariff_code', label: 'Tariff code', kind: 'text', aliases: ['hs code', 'kodi tarifor'] },
  { key: 'country_of_origin', label: 'Country of origin', kind: 'text', aliases: ['origin', 'vendi i origjinës'] },
];

const vendorFields: DataTransferField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['vendor', 'supplier', 'vendor name', 'supplier name', 'emri', 'emri i furnitorit'] },
  { key: 'email', label: 'Email', kind: 'text', aliases: ['e-mail', 'email address', 'emaili'] },
  { key: 'phone', label: 'Phone', kind: 'text', aliases: ['telephone', 'mobile', 'telefoni'] },
  { key: 'address', label: 'Address', kind: 'text', aliases: ['adresa'] },
  { key: 'city', label: 'City', kind: 'text', aliases: ['qyteti'] },
  { key: 'country', label: 'Country', kind: 'text', aliases: ['shteti'] },
  { key: 'tax_id', label: 'Tax ID', kind: 'text', aliases: ['tax number', 'numri fiskal', 'nr fiskal'] },
  { key: 'fiscal_number', label: 'Fiscal number', kind: 'text', aliases: ['fiscal no', 'numri fiskal'] },
  { key: 'vat_number', label: 'VAT number', kind: 'text', aliases: ['vat no', 'tvsh', 'nr tvsh'] },
  { key: 'payment_terms_days', label: 'Payment terms (days)', kind: 'number', aliases: ['payment terms', 'terms days', 'afati i pagesës'] },
  { key: 'default_currency', label: 'Default currency', kind: 'text', aliases: ['currency', 'valuta'] },
  { key: 'supplier_status', label: 'Supplier status', kind: 'text', aliases: ['status', 'statusi'] },
  { key: 'notes', label: 'Notes', kind: 'text', aliases: ['shënime'] },
];

const expenseFields: DataTransferField[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['expense date', 'data'] },
  { key: 'vendor_name', label: 'Supplier', kind: 'text', aliases: ['vendor', 'supplier', 'furnitori'] },
  { key: 'category', label: 'Category', kind: 'text', required: true, aliases: ['kategoria'] },
  { key: 'description', label: 'Description', kind: 'text', required: true, aliases: ['details', 'përshkrimi'] },
  { key: 'amount', label: 'Amount', kind: 'number', required: true, aliases: ['total', 'value', 'shuma', 'vlera'] },
  { key: 'payment_method', label: 'Payment method', kind: 'text', aliases: ['method', 'mënyra e pagesës'] },
];

export const dataTransferDefinitions: Record<DataTransferEntity, DataTransferDefinition> = {
  clients: { entity: 'clients', table: 'clients', label: 'Clients', description: 'Customer and client records.', exportFields: clientFields, importFields: clientFields },
  products: { entity: 'products', table: 'products', label: 'Products', description: 'Products, services, pricing and stock.', exportFields: productFields, importFields: productFields },
  vendors: { entity: 'vendors', table: 'vendors', label: 'Vendors', description: 'Suppliers and vendor contacts.', exportFields: vendorFields, importFields: vendorFields },
  expenses: { entity: 'expenses', table: 'expenses', label: 'Expenses', description: 'Expense records and payment information.', exportFields: expenseFields, importFields: expenseFields },
};

export type TransferCsvRecord = Record<string, string>;
export type TransferColumnMapping = Record<string, string>;

function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

export function parseTransferCsv(input: string): { headers: string[]; rows: TransferCsvRecord[] } {
  const source = input.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) lines.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) lines.push(row);
  const headers = (lines.shift() || []).map((header, index) => header || `Column ${index + 1}`);
  return { headers, rows: lines.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))) };
}

export function autoMapTransferColumns(entity: DataTransferEntity, headers: string[]): TransferColumnMapping {
  const fields = dataTransferDefinitions[entity].importFields;
  return Object.fromEntries(headers.map((header) => {
    const candidate = normalizeHeader(header);
    const exact = fields.find((field) => normalizeHeader(field.key) === candidate || [field.label, ...(field.aliases || [])].some((alias) => normalizeHeader(alias) === candidate));
    const partial = exact || fields.find((field) => [field.label, ...(field.aliases || [])].some((alias) => candidate.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(candidate)));
    return [header, partial?.key || ''];
  }));
}

export function mappedTransferRecord(record: TransferCsvRecord, mapping: TransferColumnMapping) {
  return Object.fromEntries(Object.entries(mapping).filter(([source, target]) => target && record[source] !== undefined).map(([source, target]) => [target, record[source]]));
}

export function parseTransferNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let source = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!source) return 0;
  const lastComma = source.lastIndexOf(','), lastDot = source.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) source = lastComma > lastDot ? source.replaceAll('.', '').replace(',', '.') : source.replaceAll(',', '');
  else if (lastComma >= 0) source = source.replace(',', '.');
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTransferValue(field: DataTransferField, value: unknown): string | number | boolean {
  if (field.kind === 'number') return parseTransferNumber(value);
  if (field.kind === 'boolean') return ['true', '1', 'yes', 'y', 'po'].includes(String(value ?? '').trim().toLowerCase());
  return String(value ?? '').trim();
}

export function normalizeTransferRow(entity: DataTransferEntity, record: Record<string, unknown>) {
  const fields = dataTransferDefinitions[entity].importFields;
  return Object.fromEntries(fields.filter((field) => record[field.key] !== undefined && record[field.key] !== '').map((field) => [field.key, normalizeTransferValue(field, record[field.key])]));
}

export function missingTransferFields(entity: DataTransferEntity, record: Record<string, unknown>) {
  return dataTransferDefinitions[entity].importFields.filter((field) => field.required && !String(record[field.key] ?? '').trim()).map((field) => field.label);
}

export function csvEscape(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function stringifyTransferCsv(entity: DataTransferEntity, rows: Array<Record<string, unknown>>) {
  const fields = dataTransferDefinitions[entity].exportFields;
  return [fields.map((field) => csvEscape(field.label)), ...rows.map((row) => fields.map((field) => csvEscape(row[field.key])))]
    .map((line) => line.join(','))
    .join('\n');
}
