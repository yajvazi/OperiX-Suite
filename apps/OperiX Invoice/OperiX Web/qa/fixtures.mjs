// Fictional data for visual QA. Nothing here refers to a real business or person.
const day = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const stamp = (offset, hour = 10) => `${day(offset)}T${String(hour).padStart(2, '0')}:15:00.000Z`;
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const uid = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const USER = {
  id: uid('11111111', 1), aud: 'authenticated', role: 'authenticated', email: 'arta@demo-trade.example',
  email_confirmed_at: stamp(-200), phone: '', confirmed_at: stamp(-200), last_sign_in_at: stamp(0),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { first_name: 'Arta', last_name: 'Krasniqi' },
  identities: [], created_at: stamp(-200), updated_at: stamp(0),
};
const C1 = uid('22222222', 1);
const B1 = uid('33333333', 1); const B2 = uid('33333333', 2);

export const RELATIONS = {
  invoices: { client: { table: 'clients', fk: 'client_id' }, clients: { table: 'clients', fk: 'client_id' }, items: { table: 'invoice_items', fk: 'invoice_id', many: true }, invoice_items: { table: 'invoice_items', fk: 'invoice_id', many: true } },
  invoice_items: { product: { table: 'products', fk: 'product_id' }, products: { table: 'products', fk: 'product_id' } },
  payments: { client: { table: 'clients', fk: 'client_id' }, clients: { table: 'clients', fk: 'client_id' }, invoice: { table: 'invoices', fk: 'invoice_id' }, invoices: { table: 'invoices', fk: 'invoice_id' } },
  expenses: { vendor: { table: 'vendors', fk: 'vendor_id' }, vendors: { table: 'vendors', fk: 'vendor_id' } },
  supplier_bills: { vendor: { table: 'vendors', fk: 'vendor_id' }, vendors: { table: 'vendors', fk: 'vendor_id' } },
  vendor_payments: { vendor: { table: 'vendors', fk: 'vendor_id' }, vendors: { table: 'vendors', fk: 'vendor_id' } },
  contracts: { client: { table: 'clients', fk: 'client_id' }, clients: { table: 'clients', fk: 'client_id' } },
  customer_portal_tokens: { client: { table: 'clients', fk: 'client_id' }, clients: { table: 'clients', fk: 'client_id' } },
  recurring_invoice_templates: { client: { table: 'clients', fk: 'client_id' }, clients: { table: 'clients', fk: 'client_id' } },
  invoice_reminders: { invoice: { table: 'invoices', fk: 'invoice_id' }, invoices: { table: 'invoices', fk: 'invoice_id' } },
  payment_links: { invoice: { table: 'invoices', fk: 'invoice_id' }, invoices: { table: 'invoices', fk: 'invoice_id' } },
  other_income: { category: { table: 'other_income_categories', fk: 'category_id' }, other_income_categories: { table: 'other_income_categories', fk: 'category_id' } },
};

export function buildFixtures() {
  seed = 42;
  const company = {
    id: C1, owner_id: USER.id, parent_company_id: null, company_name: 'Demo Trade SH.P.K.', name: 'Demo Trade SH.P.K.', trade_name: 'Demo Trade',
    unique_business_number: '810000000', fiscal_number: '600000000', vat_number: '330000000', business_activity: 'Wholesale and retail trade',
    email: 'info@demo-trade.example', phone: '+383 44 000 000', address: 'Rr. Nëna Terezë 12', registered_address: 'Rr. Nëna Terezë 12', city: 'Prishtinë', municipality: 'Prishtinë',
    country: 'Kosovo', country_code: 'XK', website: 'demo-trade.example', tax_id: '600000000', vat_registration_status: 'registered', vat_registration_date: '2023-01-01',
    fiscal_year_start_month: 1, currency: 'EUR', default_language: 'en', primary_color: '#004FFE', logo_url: null, bank_name: 'Demo Bank', bank_account: '1234 5678 9012', bank_iban: 'XK05 1234 5678 9012 3456', bank_swift: 'DEMOXKPR',
    archived_at: null, created_at: stamp(-400),
  };
  const profile = {
    id: USER.id, company_name: company.company_name, first_name: 'Arta', last_name: 'Krasniqi', email: USER.email, phone: company.phone, address: company.address, website: company.website,
    tax_id: company.tax_id, currency: 'EUR', tax_rate: 18, tax_name: 'VAT', bank_name: company.bank_name, bank_account: company.bank_account, bank_iban: company.bank_iban, bank_swift: company.bank_swift,
    invoice_language: 'en', terms_conditions: 'Payment is due within the agreed term. Late payments may incur interest.', primary_color: '#004FFE', logo_url: null, signature_url: null, stamp_url: null,
    role: 'admin', company_id: C1, active_company_id: C1, template_config: { style: 'corporate', pageSize: 'A4', showLogo: true, showSignature: true, showStamp: true, showNotes: true, showTax: true },
  };

  const clientNames = [
    ['Alba Construction SH.P.K.', 'Prishtinë'], ['Dardania Trade SH.P.K.', 'Prizren'], ['Iliria Foods SH.P.K.', 'Pejë'], ['Kosova Pharma Plus', 'Prishtinë'], ['Drini Logistics', 'Gjakovë'],
    ['Rilindja Print Studio', 'Prishtinë'], ['Shkëndija Café', 'Ferizaj'], ['Balkan Tech Solutions', 'Prishtinë'], ['Ardiana Boutique', 'Mitrovicë'], ['Ujëvara SH.P.K.', 'Gjilan'],
    ['Lumi & Co', 'Prizren'], ['Gjakova Metal Works', 'Gjakovë'], ['Bardhi Consulting', 'Prishtinë'], ['Walk-in customer', ''],
  ];
  const clients = clientNames.map(([name, city], index) => ({
    id: uid('44444444', index + 1), company_id: C1, user_id: USER.id, name, email: index % 5 === 4 ? '' : `contact${index + 1}@client.example`, phone: `+383 49 ${String(100000 + index * 731).slice(0, 3)} ${String(100 + index * 17).slice(0, 3)}`,
    address: city ? `Rr. e Pavarësisë ${10 + index}` : '', city, zip_code: city ? '10000' : '', country: 'Kosovo', tax_id: city ? `6${String(10000000 + index * 937).slice(0, 8)}` : '', nui: city ? `8${String(10000000 + index * 521).slice(0, 8)}` : '',
    fiscal_number: '', vat_number: index % 3 === 0 ? `33${String(1000000 + index * 77).slice(0, 7)}` : '', discount_percent: index % 4 === 0 ? 5 : 0, pos_walk_in_customer: name === 'Walk-in customer', created_at: stamp(-300 + index * 12),
  }));

  const productDefs = [
    ['Ergonomic office chair', 'Furniture', 129, 18, 24, 'pcs'], ['Standing desk 160cm', 'Furniture', 389, 18, 9, 'pcs'], ['Laptop stand aluminium', 'Accessories', 35, 18, 52, 'pcs'], ['Wireless keyboard', 'Accessories', 49, 18, 3, 'pcs'],
    ['27" monitor', 'Electronics', 249, 18, 14, 'pcs'], ['USB-C docking station', 'Electronics', 119, 18, 2, 'pcs'], ['A4 paper (500 sheets)', 'Stationery', 4.5, 8, 340, 'pack'], ['Printer toner black', 'Stationery', 62, 18, 11, 'pcs'],
    ['Bottled water 1.5L', 'Beverages', 0.6, 8, 1200, 'pcs'], ['Coffee beans 1kg', 'Beverages', 14.9, 8, 48, 'kg'], ['Delivery within Prishtinë', 'Services', 8, 18, 0, 'service'], ['IT support (hour)', 'Services', 35, 18, 0, 'hrs'],
    ['Website maintenance (month)', 'Services', 150, 18, 0, 'month'], ['Cleaning supplies set', 'Household', 22, 18, 30, 'set'], ['Safety helmet', 'Safety', 12.5, 18, 5, 'pcs'], ['Work gloves (pair)', 'Safety', 3.2, 18, 220, 'pair'],
    ['Cement bag 25kg', 'Construction', 5.8, 18, 600, 'bag'], ['Insulation panel', 'Construction', 18, 18, 75, 'pcs'],
  ];
  const products = productDefs.map(([name, category, price, tax, stock, unit], index) => ({
    id: uid('55555555', index + 1), company_id: C1, user_id: USER.id, name, description: `${name} — demo catalogue item`, sku: `SKU-${1000 + index}`, barcode: `38300000${String(1000 + index)}`, image_url: null,
    unit_price: price, tax_rate: tax, tax_included: false, track_stock: unit !== 'service' && unit !== 'hrs' && unit !== 'month', low_stock_threshold: 5, unit, category, stock_quantity: stock, type: ['service', 'hrs', 'month'].includes(unit) ? 'service' : 'product', created_at: stamp(-250 + index * 5),
  }));

  const statuses = [
    ['PAID', 'paid', -75], ['PAID', 'paid', -68], ['PAID', 'paid', -61], ['PAID', 'paid', -52], ['PARTIALLY_PAID', 'partial', -46], ['OVERDUE', 'overdue', -44], ['SENT', 'sent', -33], ['OVERDUE', 'overdue', -31],
    ['PAID', 'paid', -26], ['SENT', 'sent', -22], ['VIEWED', 'viewed', -18], ['PARTIALLY_PAID', 'partial', -15], ['PAID', 'paid', -12], ['SENT', 'sent', -9], ['DRAFT', 'draft', -6], ['PAID', 'paid', -5],
    ['SENT', 'sent', -3], ['DRAFT', 'draft', -2], ['ISSUED', 'sent', -1], ['CANCELLED', 'cancelled', -40],
  ];
  const invoices = []; const items = [];
  statuses.forEach(([commercial, status, offset], index) => {
    const id = uid('66666666', index + 1); const client = clients[index % 13];
    const lineCount = 1 + Math.floor(rnd() * 4); let subtotal = 0; let tax = 0;
    for (let line = 0; line < lineCount; line += 1) {
      const product = pick(products); const quantity = 1 + Math.floor(rnd() * 5); const total = round2(product.unit_price * quantity);
      const lineTax = round2(total * product.tax_rate / 100); subtotal += total; tax += lineTax;
      items.push({ id: uid('77777777', items.length + 1), invoice_id: id, product_id: product.id, description: product.name, quantity, unit_price: product.unit_price, tax_rate: product.tax_rate, tax_included: false, discount: 0, unit: product.unit, sku: product.sku, total_price: total, position: line });
    }
    const totalAmount = round2(subtotal + tax);
    const received = status === 'paid' ? totalAmount : status === 'partial' ? round2(totalAmount * 0.4) : 0;
    invoices.push({
      id, company_id: C1, user_id: USER.id, client_id: client.id, invoice_number: `FAT-2026-${String(index + 1).padStart(6, '0')}`, public_qr_token: `qa-token-${index + 1}`,
      issue_date: day(offset), due_date: day(offset + 14), status, type: 'invoice', subtype: 'regular', commercial_document_type: 'INVOICE', commercial_status: commercial, accounting_state: status === 'draft' ? 'draft' : 'posted',
      payment_status: status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'unpaid', discount_amount: 0, discount_percent: 0, tax_amount: round2(tax), subtotal: round2(subtotal), total_amount: totalAmount,
      payment_method: pick(['bank', 'cash', 'card']), amount_received: received, notes: index % 4 === 0 ? 'Thank you for your business.' : '', currency: 'EUR', branch_id: index % 3 ? B1 : B2, delivery_method: index % 5 === 0 ? 'delivery' : null,
      created_at: stamp(offset), updated_at: stamp(offset + 1),
    });
  });
  // a few quotes / orders
  ['QUOTE:SENT:-20', 'QUOTE:DRAFT:-4', 'SALES_ORDER:CONFIRMED:-8', 'DELIVERY_NOTE:DELIVERED:-7'].forEach((spec, index) => {
    const [type, commercial, offset] = spec.split(':'); const id = uid('66666666', 100 + index); const client = clients[(index + 3) % 13]; const product = pick(products);
    const total = round2(product.unit_price * 3 * (1 + product.tax_rate / 100));
    items.push({ id: uid('77777777', items.length + 1), invoice_id: id, product_id: product.id, description: product.name, quantity: 3, unit_price: product.unit_price, tax_rate: product.tax_rate, tax_included: false, discount: 0, unit: product.unit, sku: product.sku, total_price: round2(product.unit_price * 3), position: 0 });
    invoices.push({ id, company_id: C1, user_id: USER.id, client_id: client.id, invoice_number: `${type === 'QUOTE' ? 'OFR' : type === 'SALES_ORDER' ? 'POR' : 'DNT'}-2026-${String(index + 1).padStart(6, '0')}`, public_qr_token: `qa-token-d${index}`, issue_date: day(Number(offset)), due_date: day(Number(offset) + 30), status: commercial === 'DRAFT' ? 'draft' : 'sent', type: 'offer', subtype: 'offer', commercial_document_type: type, commercial_status: commercial, accounting_state: 'not_applicable', payment_status: 'unpaid', discount_amount: 0, tax_amount: round2(total - product.unit_price * 3), subtotal: round2(product.unit_price * 3), total_amount: total, payment_method: 'bank', amount_received: 0, notes: '', currency: 'EUR', branch_id: B1, created_at: stamp(Number(offset)), updated_at: stamp(Number(offset)) });
  });

  const payments = invoices.filter((inv) => inv.amount_received > 0).map((inv, index) => ({ id: uid('88888888', index + 1), company_id: C1, user_id: USER.id, client_id: inv.client_id, invoice_id: inv.id, payment_number: `PAY-2026-${String(index + 1).padStart(5, '0')}`, amount: inv.amount_received, payment_date: inv.issue_date, payment_method: inv.payment_method, bank_reference: `REF${3000 + index}`, notes: '', created_at: `${inv.issue_date}T12:00:00.000Z` }));

  const vendorNames = ['Dukagjini Supplies', 'Prishtina Energy', 'Balkan Cloud Services', 'Kosovo Telecom Demo', 'Office World Demo', 'Metal Parts Ferizaj', 'Coffee Roasters Demo', 'City Insurance Demo'];
  const vendors = vendorNames.map((name, index) => ({ id: uid('99999999', index + 1), company_id: C1, user_id: USER.id, name, email: `billing${index + 1}@vendor.example`, phone: `+383 38 ${100 + index * 13} ${200 + index * 7}`, address: `Rr. Dëshmorët ${index + 3}`, city: 'Prishtinë', country: 'Kosovo', tax_id: `7${String(1000000 + index * 313).slice(0, 8)}`, created_at: stamp(-280 + index * 9) }));
  const expenseCats = ['rent', 'utilities', 'software', 'office_supplies', 'transport', 'insurance', 'marketing', 'other'];
  const expenses = Array.from({ length: 16 }, (_, index) => ({ id: uid('aaaaaaaa', index + 1), company_id: C1, user_id: USER.id, vendor_id: vendors[index % vendors.length].id, amount: round2(40 + rnd() * 900), category: expenseCats[index % expenseCats.length], description: `${expenseCats[index % expenseCats.length].replace('_', ' ')} — ${vendors[index % vendors.length].name}`, date: day(-index * 5 - 1), type: 'expense', payment_method: pick(['bank', 'cash', 'card']), tax_amount: 0, created_at: stamp(-index * 5 - 1) }));
  const supplier_bills = Array.from({ length: 6 }, (_, index) => ({ id: uid('bbbbbbbb', index + 1), company_id: C1, user_id: USER.id, vendor_id: vendors[index].id, bill_number: `SB-${2100 + index}`, issue_date: day(-30 + index * 4), due_date: day(-16 + index * 4), status: ['paid', 'open', 'open', 'overdue', 'draft', 'open'][index], total_amount: round2(300 + index * 211.5), tax_amount: round2((300 + index * 211.5) * 0.15), amount_paid: index === 0 ? round2(300) : 0, currency: 'EUR', notes: '', created_at: stamp(-30 + index * 4) }));
  const vendor_payments = Array.from({ length: 4 }, (_, index) => ({ id: uid('cccccccc', index + 1), company_id: C1, user_id: USER.id, vendor_id: vendors[index].id, payment_number: `VP-2026-${String(index + 1).padStart(4, '0')}`, amount: round2(200 + index * 140), payment_date: day(-index * 9 - 2), payment_method: 'bank', reference: `VREF${index + 11}`, created_at: stamp(-index * 9 - 2) }));
  const other_income_categories = [['grants', 'Grants', 'Grante'], ['interest', 'Interest', 'Interes'], ['rental', 'Rental income', 'Qira'], ['other', 'Other', 'Tjetër']].map(([key, en, sq], index) => ({ id: uid('dddddddd', index + 1), company_id: C1, key, name_en: en, name_sq: sq, is_active: true }));
  const other_income = Array.from({ length: 4 }, (_, index) => ({ id: uid('eeeeeeee', index + 1), company_id: C1, user_id: USER.id, category_id: other_income_categories[index].id, amount: round2(120 + index * 95), income_date: day(-index * 11 - 3), description: `${other_income_categories[index].name_en} — demo`, payer_source: 'Demo source', net_amount: round2(120 + index * 95), vat_amount: 0, created_at: stamp(-index * 11 - 3) }));
  const contracts = Array.from({ length: 3 }, (_, index) => ({ id: uid('ffffffff', index + 1), company_id: C1, user_id: USER.id, client_id: clients[index].id, contract_number: `CTR-2026-${String(index + 1).padStart(4, '0')}`, title: ['Service agreement', 'Supply contract', 'Maintenance contract'][index], status: ['active', 'draft', 'signed'][index], start_date: day(-60 + index * 10), end_date: day(300 - index * 40), total_value: 4800 + index * 1500, currency: 'EUR', created_at: stamp(-60 + index * 10) }));
  const recurring_invoice_templates = [{ id: uid('12121212', 1), company_id: C1, user_id: USER.id, client_id: clients[2].id, name: 'Monthly maintenance retainer', frequency: 'monthly', next_run_date: day(6), status: 'active', total_amount: 350, currency: 'EUR', created_at: stamp(-90) }];
  const invoice_reminders = [{ id: uid('13131313', 1), company_id: C1, invoice_id: invoices[5].id, status: 'scheduled', channel: 'email', send_at: day(1), created_at: stamp(-2) }];
  const payment_links = [{ id: uid('14141414', 1), company_id: C1, invoice_id: invoices[6].id, status: 'active', url: 'https://pay.example/demo-link', amount: invoices[6].total_amount, created_at: stamp(-4) }];
  const customer_portal_tokens = [{ id: uid('15151515', 1), company_id: C1, client_id: clients[1].id, token: 'qa-portal-token', status: 'active', expires_at: stamp(30), created_at: stamp(-5) }];
  const branches = [{ id: B1, company_id: C1, name: 'Prishtinë main store', city: 'Prishtinë', address: 'Rr. Nëna Terezë 12', is_active: true, is_store: true, created_at: stamp(-300) }, { id: B2, company_id: C1, name: 'Prizren branch', city: 'Prizren', address: 'Rr. Shadërvan 4', is_active: true, is_store: true, created_at: stamp(-200) }];
  const product_branch_stock = products.filter((product) => product.track_stock).map((product, index) => ({ id: uid('18181818', index + 1), company_id: C1, branch_id: B1, product_id: product.id, stock_quantity: (index * 7) % 23, low_stock_threshold: 5 }));
  const BANK = uid('19191919', 1);
  const operix_accessible_company_bank_accounts = [{ id: BANK, company_id: C1, owner_company_id: C1, available_company_id: C1, bank_name: 'Demo Bank', account_name: 'Main account', account_number: '1234567890', iban: 'XK051212012345678906', currency: 'EUR', is_primary: true, is_active: true, is_shared: false, created_at: stamp(-300) }];
  const operix_financial_account_balances = [{ id: uid('20202020', 1), company_id: C1, name: 'Cash register', account_type: 'cash', balance: 420 }, { id: uid('20202020', 2), company_id: C1, name: 'Demo Bank', account_type: 'bank', company_bank_account_id: BANK, balance: 5100 }];
  const chart_of_accounts = [['1010', 'Cash'], ['1020', 'Bank']].map(([code, name], index) => ({ id: uid('21212121', index + 1), company_id: C1, code, name, active: true, posting_allowed: true }));
  const pos_terminals = [{ id: uid('16161616', 1), company_id: C1, branch_id: B1, name: 'Counter 1', code: 'T1', status: 'active', created_at: stamp(-100) }];

  return {
    profiles: [profile], companies: [company, { ...company, id: uid('22222222', 777), company_name: 'Unrelated Tenant SH.P.K.', owner_id: uid('99999999', 1), parent_company_id: null, email: 'other@tenant.example' }], memberships: [{ id: uid('17171717', 1), user_id: USER.id, company_id: C1, status: 'active', role: 'owner' }],
    branches, chart_of_accounts, product_branch_stock, operix_accessible_company_bank_accounts, operix_financial_account_balances, pos_terminals, clients, products, invoices, invoice_items: items, payments, expenses, vendors, supplier_bills, supplier_bill_items: [], vendor_payments,
    other_income, other_income_categories, contracts, recurring_invoice_templates, invoice_reminders, payment_links, customer_portal_tokens,
    invoice_templates: [], company_user_preferences: [], held_orders: [], subscription_accounts: [], tax_reports: [], api_keys: [], audit_events: [], company_feature_flags: [],
    employees: [], payroll_runs: [], accounting_periods: [], journal_entries: [],
  };
}

export function rpcHandlers(db) {
  const permissionsAll = [];
  return {
    get_my_company_role: () => 'super_administrator',
    rbac_get_workspace_access: () => ({ permissions: permissionsAll, scopes: {}, platform_admin: true, role_code: 'super_administrator' }),
    ensure_walk_in_customer: () => db.clients.find((client) => client.pos_walk_in_customer)?.id,
    get_my_product_access: () => ({ invoice: true, booking: false, hr: false, desk: false }),
    get_efs_readiness: () => ({ ready: false, status: 'not_certified' }),
    record_customer_payment_financial: (body) => ({ id: uid('22222222', 900), payment_number: 'PAY-QA-0001', ...body }),
    record_customer_payment_with_bank_account: (body) => ({ id: uid('22222222', 901), payment_number: 'PAY-QA-0002', ...body }),
    allocate_customer_payment: () => ({ ok: true }),
    reserve_invoice_number: (body) => `QA-${String(body?.p_document_type || 'INV').toUpperCase()}-${String(db.invoices.length + 1).padStart(4, '0')}`,
  };
}
