/* GENERATED FILE. Do not edit manually. Run: npm run docs:mobile:generate */

export type MobileDocLanguage = 'en' | 'sq';
export type MobileDocStatus = 'production' | 'partial' | 'experimental' | 'development' | 'internal' | 'disabled' | 'broken';

export type MobileDocLink = { text: string; href: string; targetId: string | null };
export type MobileDocArticle = {
  id: string;
  language: MobileDocLanguage;
  category: string;
  title: string;
  description: string;
  keywords: string[];
  content: string;
  links: MobileDocLink[];
  relatedArticles: string[];
  app: string;
  status: MobileDocStatus;
  introducedIn: string | null;
  updatedIn: string | null;
  updatedAt: string | null;
};

export type MobileDocCategory = {
  id: string;
  title: { en: string; sq: string };
  icon: string;
  order: number;
};

export const MOBILE_DOCS_GENERATED_AT = "2026-08-19T16:15:28.311Z";
export const MOBILE_DOCS_APP = "operix-invoice-mobile";
export const MOBILE_DOCS_STATUS = "production" as MobileDocStatus;
export const MOBILE_DOC_CATEGORIES: MobileDocCategory[] = [
  {
    "id": "getting-started",
    "title": {
      "en": "Getting Started",
      "sq": "Fillimi"
    },
    "icon": "BookOpen",
    "order": 10
  },
  {
    "id": "dashboard",
    "title": {
      "en": "Dashboard",
      "sq": "Paneli"
    },
    "icon": "LayoutDashboard",
    "order": 20
  },
  {
    "id": "invoices",
    "title": {
      "en": "Invoices",
      "sq": "Faturat"
    },
    "icon": "FileText",
    "order": 30
  },
  {
    "id": "customers",
    "title": {
      "en": "Customers",
      "sq": "Klientët"
    },
    "icon": "Users",
    "order": 40
  },
  {
    "id": "products",
    "title": {
      "en": "Products & Services",
      "sq": "Produktet dhe shërbimet"
    },
    "icon": "Package",
    "order": 50
  },
  {
    "id": "payments",
    "title": {
      "en": "Payments",
      "sq": "Pagesat"
    },
    "icon": "CreditCard",
    "order": 60
  },
  {
    "id": "expenses",
    "title": {
      "en": "Expenses",
      "sq": "Shpenzimet"
    },
    "icon": "WalletCards",
    "order": 70
  },
  {
    "id": "inventory",
    "title": {
      "en": "Inventory",
      "sq": "Inventari"
    },
    "icon": "PackageCheck",
    "order": 80
  },
  {
    "id": "pos",
    "title": {
      "en": "POS",
      "sq": "POS"
    },
    "icon": "ShoppingCart",
    "order": 90
  },
  {
    "id": "documents",
    "title": {
      "en": "Documents",
      "sq": "Dokumentet"
    },
    "icon": "FileCheck2",
    "order": 100
  },
  {
    "id": "reports",
    "title": {
      "en": "Reports",
      "sq": "Raportet"
    },
    "icon": "BarChart3",
    "order": 110
  },
  {
    "id": "accounting",
    "title": {
      "en": "Accounting",
      "sq": "Kontabiliteti"
    },
    "icon": "Landmark",
    "order": 120
  },
  {
    "id": "taxes",
    "title": {
      "en": "Taxes",
      "sq": "Tatimet"
    },
    "icon": "BookOpen",
    "order": 130
  },
  {
    "id": "fiscalization",
    "title": {
      "en": "Fiscalization",
      "sq": "Fiskalizimi"
    },
    "icon": "ShieldCheck",
    "order": 140
  },
  {
    "id": "settings",
    "title": {
      "en": "Settings",
      "sq": "Cilësimet"
    },
    "icon": "SlidersHorizontal",
    "order": 150
  },
  {
    "id": "company",
    "title": {
      "en": "Company",
      "sq": "Kompania"
    },
    "icon": "Building2",
    "order": 160
  },
  {
    "id": "users-and-permissions",
    "title": {
      "en": "Users & Permissions",
      "sq": "Përdoruesit dhe lejet"
    },
    "icon": "Users",
    "order": 170
  },
  {
    "id": "integrations",
    "title": {
      "en": "Integrations",
      "sq": "Integrimet"
    },
    "icon": "Globe2",
    "order": 180
  },
  {
    "id": "notifications",
    "title": {
      "en": "Notifications",
      "sq": "Njoftimet"
    },
    "icon": "Bell",
    "order": 190
  },
  {
    "id": "troubleshooting",
    "title": {
      "en": "Troubleshooting",
      "sq": "Zgjidhja e problemeve"
    },
    "icon": "CircleHelp",
    "order": 200
  },
  {
    "id": "faq",
    "title": {
      "en": "FAQ",
      "sq": "FAQ"
    },
    "icon": "CircleHelp",
    "order": 210
  }
];
export const MOBILE_DOC_POPULAR_IDS: string[] = [
  "invoices/create-and-edit",
  "customers/manage-customers",
  "products/manage-products",
  "payments/record-customer-payment",
  "invoices/pdf-sharing-and-printing",
  "documents/commercial-document-types"
];
export const MOBILE_DOC_ARTICLES: MobileDocArticle[] = [
  {
    "id": "accounting/accounting-workspace",
    "language": "en",
    "category": "accounting",
    "title": "Accounting workspace",
    "description": "Understand the mobile accounting entry points and how posted records are supplied by the backend.",
    "keywords": [
      "accounting",
      "journal",
      "general ledger",
      "posting",
      "periods"
    ],
    "content": "# Accounting workspace\n\nOpen **More > Accounting**. The mobile screen provides shortcuts to sales book, daily report, customer ledger, and related accounting/report tools. The More menu also opens the full [Reports](../reports/financial-reports.md) hub.\n\n## What mobile does\n\nThe mobile client reads company-scoped accounting/report views and calls backend RPCs for operations such as invoice posting, customer payment posting, supplier payment posting, expense posting, and reversals where the originating screen supports them.\n\n## What backend permissions control\n\nThe accounting migrations use company permissions such as journal creation/posting, accounting read, sales-invoice posting, supplier-bill posting, and expense posting. A visible card does not guarantee that the current role can post. The server must authorize the action.\n\n## Posted versus draft data\n\nOperational documents such as quotes, proformas, orders, and delivery notes can remain non-posting records. Invoices and payments may be posted by their specific RPC workflows. Reports generally read posted/accounting views, so a saved draft may not appear in a report.\n\n## Safe support practice\n\nWhen a total differs from a document screen, record the company, document ID, status, accounting state, and report source. Do not manually edit an issued invoice to make a report balance; use the supported correction/posting workflow and review [Invoice statuses](../invoices/invoice-detail-and-statuses.md).",
    "links": [
      {
        "text": "Reports",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      },
      {
        "text": "Invoice statuses",
        "href": "../invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "payments/record-customer-payment",
      "invoices/invoice-detail-and-statuses"
    ]
  },
  {
    "id": "accounting/accounting-workspace",
    "language": "sq",
    "category": "accounting",
    "title": "Hapësira e kontabilitetit",
    "description": "Kuptoni hyrjet e kontabilitetit dhe rolin e backend-it në postim.",
    "keywords": [
      "kontabilitet",
      "ditar",
      "ledger i përgjithshëm",
      "postim",
      "periudha"
    ],
    "content": "# Hapësira e kontabilitetit\n\nHapni **More > Accounting**. Ekrani ofron lidhje për Sales Book, raportin ditor, ledger-in e klientit dhe mjete të tjera. Raportet hapen nga [Raportet](../reports/financial-reports.md).\n\nMobile lexon pamje kontabël të kufizuara në kompani dhe thërret RPC për postimin e faturave, pagesave të klientit, pagesave të furnitorit, shpenzimeve dhe kthimeve kur rrjedha e ekranit e mbështet.\n\nMigrimet përdorin leje si `accounting.read`, `journal.create`, `journal.post`, `sales_invoice.post`, `supplier_bill.post` dhe `expense.post`. Karta mund të jetë e dukshme edhe kur roli nuk mund të postojë.\n\nOfertat, pro-faturat, porositë dhe fletëdërgesat mund të mbeten dokumente operative; faturat dhe pagesat mund të postohen. Raportet zakonisht lexojnë të dhëna të postuara. Mos ndryshoni një faturë të lëshuar për të rregulluar raportin; përdorni korrigjimin e mbështetur.",
    "links": [
      {
        "text": "Raportet",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "payments/record-customer-payment",
      "invoices/invoice-detail-and-statuses"
    ]
  },
  {
    "id": "company/business-workspace",
    "language": "en",
    "category": "company",
    "title": "Business workspace",
    "description": "Use the Business tab to move between products, inventory, expenses, vendors, and income.",
    "keywords": [
      "business",
      "products",
      "inventory",
      "vendors",
      "expenses",
      "income"
    ],
    "content": "# Business workspace\n\nThe **Business** bottom tab is an operational hub. It queries the current workspace and provides shortcuts/cards for:\n\n- Products;\n- Inventory, backed by tracked product records;\n- Expenses;\n- Vendors;\n- Income.\n\nTap a product to open product detail, an expense to open its form, or a vendor to open vendor detail/form where the card provides that action. Use the dedicated pages for the field rules:\n\n- [Products and services](../products/manage-products.md)\n- [Inventory](../inventory/stock-and-low-stock.md)\n- [Expenses and income](../expenses/record-expenses-and-income.md)\n- [Suppliers and bills](./suppliers-and-bills.md)\n\nThe Business tab is not a separate accounting ledger. Accounting/report views are under **More > Accounting/Reports**, and their server-side permissions and posting state determine what appears there.",
    "links": [
      {
        "text": "Products and services",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Inventory",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "Expenses and income",
        "href": "../expenses/record-expenses-and-income.md",
        "targetId": "expenses/record-expenses-and-income"
      },
      {
        "text": "Suppliers and bills",
        "href": "./suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "inventory/stock-and-low-stock",
      "expenses/record-expenses-and-income",
      "company/suppliers-and-bills"
    ]
  },
  {
    "id": "company/business-workspace",
    "language": "sq",
    "category": "company",
    "title": "Hapësira e biznesit",
    "description": "Përdorni skedën Business për produktet, inventarin, shpenzimet, furnitorët dhe të hyrat.",
    "keywords": [
      "biznes",
      "produkte",
      "inventar",
      "furnitorë",
      "shpenzime",
      "të hyra"
    ],
    "content": "# Hapësira e biznesit\n\nSkeda **Business** është qendër operative dhe ofron karta/shkurtore për produktet, inventarin e bazuar në produktet e ndjekura, shpenzimet, furnitorët dhe të hyrat.\n\nShtypni produktin për detaj, shpenzimin për formular ose furnitorin për formular/detaj kur veprimi ofrohet. Shihni [Produktet](../products/manage-products.md), [Inventarin](../inventory/stock-and-low-stock.md), [Shpenzimet](../expenses/record-expenses-and-income.md) dhe [Furnitorët](./suppliers-and-bills.md).\n\nKjo skedë nuk është ledger i veçantë kontabël. Raportet dhe postimet hapen te **More > Accounting/Reports** dhe varen nga backend-i.",
    "links": [
      {
        "text": "Produktet",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Inventarin",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "Shpenzimet",
        "href": "../expenses/record-expenses-and-income.md",
        "targetId": "expenses/record-expenses-and-income"
      },
      {
        "text": "Furnitorët",
        "href": "./suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "inventory/stock-and-low-stock",
      "expenses/record-expenses-and-income",
      "company/suppliers-and-bills"
    ]
  },
  {
    "id": "company/manage-companies-and-members",
    "language": "en",
    "category": "company",
    "title": "Manage companies and switch workspaces",
    "description": "Switch companies, create main companies or subdivisions, invite users, assign roles, and archive a company.",
    "keywords": [
      "company",
      "workspace",
      "subdivision",
      "invite",
      "switch company",
      "archive company"
    ],
    "content": "# Manage companies and switch workspaces\n\nOpen **More > Company**. The screen lists companies available to the authenticated user and shows the active selection.\n\n## Switch company\n\n1. Tap a company card.\n2. Confirm that it becomes active.\n3. Return to Home or another list and refresh the data.\n\nSelecting a main company includes its descendant subdivisions in the workspace scope. Selecting a subdivision includes that subdivision and its descendants, not its parent or sibling subdivisions.\n\n## Create or group companies\n\nAdministrators with permission can:\n\n- create a main company;\n- create a subdivision under a main company;\n- group an existing company under a parent;\n- edit company profile details and hierarchy;\n- archive a company.\n\nThe screen uses company RPCs for these operations. Archive is a destructive administrative action; review the confirmation and company dependencies first.\n\n## Manage members and invitations\n\nFrom a managed company, an administrator can:\n\n1. View members and their roles.\n2. Select a role from the available role list.\n3. Invite a person by email and role.\n4. Copy an invitation token when the flow provides it.\n5. Revoke a pending invitation.\n6. Remove a company member.\n\nRole changes and removals are server-authorized. See [Roles and access](../users-and-permissions/roles-and-access.md).\n\n## Data boundary\n\nEvery business query uses the profile’s active company and accessible company IDs, with Supabase RLS as the database boundary. If the company list or records look wrong, do not switch by editing a local ID; contact an administrator/support.",
    "links": [
      {
        "text": "Roles and access",
        "href": "../users-and-permissions/roles-and-access.md",
        "targetId": "users-and-permissions/roles-and-access"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "users-and-permissions/roles-and-access",
      "getting-started/sign-in-and-account",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "company/manage-companies-and-members",
    "language": "sq",
    "category": "company",
    "title": "Menaxhimi dhe ndërrimi i kompanive",
    "description": "Ndërroni kompaninë, krijoni ndarje, ftoni përdorues dhe caktoni role.",
    "keywords": [
      "kompani",
      "hapësirë pune",
      "degë",
      "ftesë",
      "ndërrim kompanie",
      "arkivim"
    ],
    "content": "# Menaxhimi dhe ndërrimi i kompanive\n\nHapni **More > Company**. Lista tregon kompanitë ku përdoruesi ka qasje dhe kompaninë aktive.\n\n## Ndërrimi\n\n1. Shtypni kartën e kompanisë.\n2. Kontrolloni që u bë aktive.\n3. Kthehuni në Kreu/listë dhe rifreskoni.\n\nKur zgjidhet kompania kryesore, fusha e punës përfshin ndarjet pasardhëse. Kur zgjidhet një ndarje, përfshihen ajo dhe pasardhësit e saj, jo prindi ose motrat.\n\n## Krijimi dhe grupimi\n\nAdministratori me leje mund të krijojë kompani kryesore, ndarje, të grupojë kompani ekzistuese, të ndryshojë profilin/hierarkinë dhe të arkivojë kompani. Këto përdorin RPC; arkivimi kërkon kujdes.\n\n## Anëtarët dhe ftesat\n\nNga kompania e menaxhuar mund të shihni anëtarët, ndryshoni rolin, ftoni me email, kopjoni tokenin, anuloni ftesë dhe hiqni anëtar. Veprimet autorizohen në server. Shihni [Rolet dhe qasja](../users-and-permissions/roles-and-access.md).\n\n## Ndarja e të dhënave\n\nKërkimet përdorin kompaninë aktive dhe ID-të e kompanive pasardhëse; RLS i Supabase është kufiri i të dhënave. Mos ndryshoni ID lokale për të kaluar kufirin.",
    "links": [
      {
        "text": "Rolet dhe qasja",
        "href": "../users-and-permissions/roles-and-access.md",
        "targetId": "users-and-permissions/roles-and-access"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "users-and-permissions/roles-and-access",
      "getting-started/sign-in-and-account",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "company/payroll",
    "language": "en",
    "category": "company",
    "title": "Payroll screen",
    "description": "Understand the payroll entry point and the records currently read by OperiX Invoice Mobile.",
    "keywords": [
      "payroll",
      "payslip",
      "payroll run",
      "liabilities"
    ],
    "content": "# Payroll screen\n\nPayroll is opened from **More** for users who are not restricted as workers and from the Tax Center where the shortcut is available.\n\nThe current mobile screen reads payroll runs, payslip snapshots, and payroll liabilities for the accessible company scope. It presents payroll status/summary information and links to the records returned by the backend.\n\nThe audited source does not establish a complete mobile payroll-run creation, employee self-service, payslip distribution, or tax-filing workflow. Treat the screen as a read/management entry point governed by backend permissions, not as proof that all payroll operations are available from mobile.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "taxes/tax-center",
      "users-and-permissions/roles-and-access"
    ]
  },
  {
    "id": "company/payroll",
    "language": "sq",
    "category": "company",
    "title": "Ekrani i pagave",
    "description": "Kuptoni hyrjen e pagave dhe të dhënat që lexon aplikacioni mobil.",
    "keywords": [
      "paga",
      "fletëpagesë",
      "cikël pagash",
      "detyrime"
    ],
    "content": "# Ekrani i pagave\n\nPagat hapen nga **More** për përdoruesit që nuk janë punonjës të kufizuar dhe nga Qendra e tatimeve kur shfaqet lidhja.\n\nEkrani aktual lexon ciklet e pagave, snapshots të fletëpagesave dhe detyrimet e pagave për kompaninë. Shfaq status/përmbledhje dhe lidhjet e të dhënave të kthyer nga backend-i.\n\nKodi mobil nuk dëshmon rrjedhë të plotë për krijimin e ciklit, self-service të punonjësit, shpërndarjen e fletëpagesave ose dorëzimin tatimor. Qasja varet nga lejet e serverit.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "taxes/tax-center",
      "users-and-permissions/roles-and-access"
    ]
  },
  {
    "id": "company/suppliers-and-bills",
    "language": "en",
    "category": "company",
    "title": "Suppliers, supplier bills, and bill scanning",
    "description": "Manage vendors, supplier bills, supplier payments, and scanned bill data.",
    "keywords": [
      "supplier",
      "vendor",
      "supplier bill",
      "purchase",
      "scan bill"
    ],
    "content": "# Suppliers, supplier bills, and bill scanning\n\n## Create a vendor\n\n1. Open **More > Purchases** or the vendor list from the Business area.\n2. Tap add.\n3. Enter vendor name and optional email, phone, address, city, ZIP, country, tax ID, and notes.\n4. Save.\n\nThe current vendor form includes a Check Registry link and stores the vendor under the active company.\n\n## Create a supplier bill\n\n1. Open the supplier-bill list.\n2. Tap add.\n3. Select a vendor.\n4. Enter bill number, issue date, due date, status, tax amount, notes, and line items.\n5. For each line enter description, quantity, unit price, and review the calculated amount.\n6. Save.\n\nThe total is subtotal plus the entered tax amount. The form can edit an existing bill by replacing its line rows.\n\n## Scan a bill\n\nUse **Scan bill** when available. Recognized vendor name, bill number, date, and lines are passed into the form. Review every value before saving; scanning is a prefill helper and not an automatic accounting approval.\n\n## Related actions\n\nVendor payments and vendor ledgers are documented in [Vendor payments](../payments/vendor-payments.md). The reports/tax screens may expose purchase-book data from server-side views.",
    "links": [
      {
        "text": "Vendor payments",
        "href": "../payments/vendor-payments.md",
        "targetId": "payments/vendor-payments"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/vendor-payments",
      "invoices/qr-scanner",
      "reports/financial-reports"
    ]
  },
  {
    "id": "company/suppliers-and-bills",
    "language": "sq",
    "category": "company",
    "title": "Furnitorët, faturat e furnitorëve dhe skanimi",
    "description": "Menaxhoni furnitorët, faturat e blerjes, pagesat dhe të dhënat e skanuara.",
    "keywords": [
      "furnitor",
      "faturë furnitori",
      "blerje",
      "skano faturën"
    ],
    "content": "# Furnitorët, faturat e furnitorëve dhe skanimi\n\n## Krijoni furnitor\n\nTe **More > Purchases** ose lista e furnitorëve, shtypni shtimin dhe plotësoni emrin, emailin, telefonin, adresën, qytetin, ZIP-in, shtetin, ID-në tatimore dhe shënimet. Ruajeni në kompaninë aktive.\n\n## Krijoni faturë furnitori\n\n1. Hapni listën.\n2. Shtoni faturë.\n3. Zgjidhni furnitorin.\n4. Vendosni numrin, datën e lëshimit, afatin, statusin, tatimin dhe shënimet.\n5. Plotësoni rreshtat me përshkrim, sasi dhe çmim.\n6. Ruajeni.\n\nTotali llogaritet si nëntotal plus tatimi i vendosur. Editimi mund të zëvendësojë rreshtat ekzistues.\n\n## Skanimi\n\n**Scan bill** mund të plotësojë furnitorin, numrin, datën dhe rreshtat. Kontrolloni çdo fushë; skanimi nuk është miratim kontabël automatik.\n\nPër pagesat dhe ledger-in shihni [Pagesat e furnitorëve](../payments/vendor-payments.md).",
    "links": [
      {
        "text": "Pagesat e furnitorëve",
        "href": "../payments/vendor-payments.md",
        "targetId": "payments/vendor-payments"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/vendor-payments",
      "invoices/qr-scanner",
      "reports/financial-reports"
    ]
  },
  {
    "id": "customers/manage-customers",
    "language": "en",
    "category": "customers",
    "title": "Manage customers",
    "description": "Create, search, edit, inspect, and use customers in OperiX Invoice Mobile.",
    "keywords": [
      "customer",
      "client",
      "customer ledger",
      "tax ID",
      "VAT number"
    ],
    "content": "# Manage customers\n\n## Create a customer\n\n1. Open **Business > Clients** or choose the customer quick action.\n2. Tap **Add customer**.\n3. Enter the required name.\n4. Add email, phone, address, city, ZIP/postal code, and country if available.\n5. Open the advanced/business fields when needed and enter tax ID/NUI, fiscal number, VAT number, discount percentage, and notes.\n6. Tap **Save**.\n\nThe form stores the customer under the current company/workspace. The **Check Registry** action opens the ATK VAT registry website in a browser; it does not automatically import or certify the customer record.\n\n## Fields\n\n| Field | Purpose | Current behavior |\n|---|---|---|\n| Name | Customer display name | Required |\n| Email | Contact and invoice email | Optional; used by the email/PDF action when present |\n| Phone | Contact number | Optional |\n| Address, city, ZIP, country | Billing/contact address | Optional; copied into invoice PDF data |\n| Tax ID / NUI | Tax or registration identifier | Optional advanced field; stored with customer |\n| Fiscal number | Fiscal identifier | Optional advanced field |\n| VAT number | VAT registration identifier | Optional advanced field |\n| Discount percent | Default customer discount | Optional; invoice form can apply it when the customer is selected |\n| Notes | Internal/customer notes | Optional |\n\n## Search and list\n\nThe customer list supports search by name, email, phone, or city and a city filter. It shows customer counts and invoice-based value summaries for the current workspace. The app queries tenant-scoped data through the workspace service and Supabase RLS.\n\n## Customer detail\n\nOpen a customer to see contact details, invoice/payment activity, balances as calculated by the screen, and actions for:\n\n- creating an invoice with the customer preselected;\n- recording a payment for the customer;\n- opening the customer ledger;\n- calling or emailing when the platform and contact data allow it.\n\n## Edit or delete\n\nOpen the customer and choose edit where available. The list also has a delete action. The audited mobile UI does not label this as an archive workflow, so confirm before deleting and follow your company retention policy.\n\nRelated: [Create an invoice](../invoices/create-and-edit.md), [Customer payments](../payments/record-customer-payment.md), [Customer ledger](../reports/financial-reports.md).",
    "links": [
      {
        "text": "Create an invoice",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Customer payments",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      },
      {
        "text": "Customer ledger",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "reports/financial-reports"
    ]
  },
  {
    "id": "customers/manage-customers",
    "language": "sq",
    "category": "customers",
    "title": "Menaxhimi i klientëve",
    "description": "Krijoni, kërkoni, ndryshoni dhe përdorni klientët në OperiX Invoice Mobile.",
    "keywords": [
      "klient",
      "klientët",
      "llogaria e klientit",
      "numër fiskal",
      "numër TVSH-je"
    ],
    "content": "# Menaxhimi i klientëve\n\n## Krijoni klient\n\n1. Hapni **Business > Clients** ose veprimin e klientit.\n2. Shtypni **Add customer**.\n3. Shkruani emrin e detyrueshëm.\n4. Shtoni email, telefon, adresë, qytet, ZIP dhe shtet.\n5. Te fushat e avancuara shtoni NUI/ID tatimore, numër fiskal, numër TVSH-je, zbritje dhe shënime.\n6. Shtypni **Save**.\n\nKlienti ruhet në kompaninë aktive. **Check Registry** hap faqen e regjistrit të TVSH-së së ATK-së në shfletues; nuk importon ose certifikon automatikisht të dhënat.\n\n## Fushat\n\n| Fusha | Qëllimi | Sjellja aktuale |\n|---|---|---|\n| Emri | Emri i shfaqur | E detyrueshme |\n| Emaili | Kontakti dhe dërgimi i faturës | Opsional; përdoret nga emaili/PDF-ja |\n| Telefoni | Kontakti | Opsional |\n| Adresa, qyteti, ZIP, shteti | Adresa e faturimit/kontaktit | Opsionale; kopjohet në PDF |\n| ID tatimore/NUI | Identifikues tatimor/regjistrimi | Fushë e avancuar |\n| Numri fiskal | Identifikues fiskal | Fushë e avancuar |\n| Numri i TVSH-së | Regjistrimi i TVSH-së | Fushë e avancuar |\n| Zbritja në përqindje | Zbritje e parazgjedhur | Mund të aplikohet gjatë zgjedhjes në faturë |\n| Shënimet | Informacion shtesë | Opsionale |\n\n## Kërkimi dhe detaji\n\nLista kërkon sipas emrit, emailit, telefonit ose qytetit dhe ka filtër qyteti. Detaji shfaq aktivitetin e faturave/pagesave, bilancet e llogaritura nga ekrani, krijimin e faturës me klient të parazgjedhur, regjistrimin e pagesës, ledger-in dhe thirrjen/emailin kur lejohet.\n\n## Ndryshimi dhe fshirja\n\nPërdorni editimin kur është i disponueshëm. Lista ka edhe fshirje, jo një rrjedhë të veçantë arkivimi; kontrolloni politikën e ruajtjes para fshirjes.\n\nTë lidhura: [Krijimi i faturës](../invoices/create-and-edit.md), [Pagesat](../payments/record-customer-payment.md), [Raportet](../reports/financial-reports.md).",
    "links": [
      {
        "text": "Krijimi i faturës",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Pagesat",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      },
      {
        "text": "Raportet",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "reports/financial-reports"
    ]
  },
  {
    "id": "dashboard/home",
    "language": "en",
    "category": "dashboard",
    "title": "Home dashboard and main navigation",
    "description": "Understand the Home dashboard, quick actions, business tabs, and the More menu in OperiX Invoice Mobile.",
    "keywords": [
      "dashboard",
      "home",
      "quick actions",
      "recent activity",
      "navigation"
    ],
    "content": "# Home dashboard and main navigation\n\n## Home dashboard\n\nThe **Home** tab reads data for the selected workspace and shows:\n\n- revenue for the current day, based on non-cancelled invoice issue dates;\n- invoice/sales count for the current day;\n- outstanding and overdue amounts calculated from invoice statuses and totals;\n- payments received for the current day;\n- a low-stock count for tracked products;\n- recent invoices, payments, and expenses.\n\nTap the refresh control to query the workspace again. Empty values mean that the current scope has no matching records or that the query returned no data; they are not a promise that another company has no records.\n\n## Quick actions\n\nDepending on the current role and screen state, quick actions open:\n\n- **New Invoice** — the invoice form;\n- **Customer** — the customer form/list;\n- **Expense** — the expense form;\n- **Payment** — the customer payment form.\n\nThe global create button is role-aware. Worker users do not see every product or expense creation action.\n\n## Bottom tabs\n\n- **Home**: dashboard and recent activity.\n- **Sales**: quotes, proformas, orders, delivery notes, invoices, filters, and the shared document trail. See [Commercial document types](../documents/commercial-document-types.md).\n- **Invoice**: POS product selection and checkout. See [Point of sale](../pos/point-of-sale.md).\n- **Business**: products, inventory, expenses, vendors, and income shortcuts. See [Business workspace](../company/business-workspace.md).\n- **More**: accounting, reports, taxes, money, purchases, payroll where permitted, contracts, company management, integrations, settings, support, and about.\n\n## Search\n\nThe search icon opens **GlobalSearch** as a modal. It uses the query sources implemented in the screen and is scoped to the current authenticated workspace. It is not a public search and does not expose another company’s data when RLS is configured correctly.\n\n## Refresh and error states\n\nNetwork/query failures show an error state with a retry action on screens that implement it. A loading state is shown while the app reads the workspace. See [Troubleshooting](../troubleshooting/common-problems.md) when a refresh repeatedly fails.",
    "links": [
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "Point of sale",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Business workspace",
        "href": "../company/business-workspace.md",
        "targetId": "company/business-workspace"
      },
      {
        "text": "Troubleshooting",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "customers/manage-customers",
      "products/manage-products"
    ]
  },
  {
    "id": "dashboard/home",
    "language": "sq",
    "category": "dashboard",
    "title": "Paneli kryesor dhe navigimi",
    "description": "Kuptoni panelin Kreu, veprimet e shpejta, skedat e biznesit dhe menynë Më shumë.",
    "keywords": [
      "panel",
      "kreu",
      "veprime të shpejta",
      "aktiviteti i fundit",
      "navigim"
    ],
    "content": "# Paneli kryesor dhe navigimi\n\n## Paneli Kreu\n\nSkeda **Kreu** lexon të dhënat e hapësirës së zgjedhur dhe shfaq:\n\n- të hyrat e ditës nga faturat jo të anuluara;\n- numrin e shitjeve/faturave të ditës;\n- shumat e papaguara dhe të vonuara sipas statuseve dhe totalit të faturave;\n- pagesat e pranuara sot;\n- numrin e produkteve të ndjekura me stok të ulët;\n- faturat, pagesat dhe shpenzimet e fundit.\n\nPërdorni rifreskimin për të kërkuar të dhënat përsëri. Vlera zero mund të nënkuptojë se hapësira nuk ka të dhëna përkatëse.\n\n## Veprimet e shpejta\n\nNë varësi të rolit, veprimet hapin:\n\n- **New Invoice** — formularin e faturës;\n- **Customer** — formularin/listën e klientëve;\n- **Expense** — formularin e shpenzimit;\n- **Payment** — formularin e pagesës së klientit.\n\nButoni i krijimit respekton rolin; punonjësit nuk shohin çdo veprim për produkte ose shpenzime.\n\n## Skedat kryesore\n\n- **Home**: paneli dhe aktiviteti i fundit.\n- **Sales**: ofertat, pro-faturat, porositë, fletëdërgesat, faturat dhe gjurma e dokumenteve. Shihni [Llojet e dokumenteve](../documents/commercial-document-types.md).\n- **Invoice**: përzgjedhja e produkteve dhe shporta e pikës së shitjes. Shihni [Pikën e shitjes](../pos/point-of-sale.md).\n- **Business**: produktet, inventari, shpenzimet, furnitorët dhe të hyrat.\n- **More**: kontabiliteti, raportet, tatimet, blerjet, pagat sipas rolit, kontratat, kompanitë, integrimet, cilësimet, mbështetja dhe informacioni.\n\n## Kërkimi dhe gabimet\n\nIkona e kërkimit hap **GlobalSearch** dhe kërkimi kufizohet në hapësirën e autentikuar. Ekranet shfaqin gjendje ngarkimi, boshllëku ose gabimi me mundësi riprovimi kur këto janë implementuar. Shihni [Zgjidhja e problemeve](../troubleshooting/common-problems.md).",
    "links": [
      {
        "text": "Llojet e dokumenteve",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "Pikën e shitjes",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Zgjidhja e problemeve",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "customers/manage-customers",
      "products/manage-products"
    ]
  },
  {
    "id": "documents/commercial-document-types",
    "language": "en",
    "category": "documents",
    "title": "Commercial document types",
    "description": "Learn how the mobile app distinguishes invoices, quotes, proformas, orders, delivery notes, corrections, and other document types.",
    "keywords": [
      "quote",
      "proforma",
      "sales order",
      "delivery note",
      "invoice",
      "credit note",
      "debit note"
    ],
    "content": "# Commercial document types\n\nOperiX stores the document identity in the explicit `commercial_document_type` field. The shared domain does not infer a type from the PDF title. The mobile form and detail/conversion screens use this vocabulary:\n\n| Type | App label | What the current app provides |\n|---|---|---|\n| `QUOTE` | Quote / Ofertë | Commercial proposal; status and conversion to sales order or invoice |\n| `PROFORMA` | Proforma / Pro-faturë | Preliminary commercial document; conversion to invoice or advance path |\n| `SALES_ORDER` | Sales order / Porosi | Requested/confirmed order; ordered/delivered/remaining line fields in shared schema |\n| `DELIVERY_NOTE` | Delivery note / Fletëdërgesë | Delivery/movement document; fulfillment status/RPC support is partial in mobile |\n| `INVOICE` | Invoice / Faturë | Main invoice flow; POS and posting paths are integrated with backend RPCs |\n| `ADVANCE_INVOICE` | Advance invoice / Faturë Paradhënie | Type and conversion exist; full advance reconciliation is partial in mobile |\n| `FINAL_INVOICE` | Final invoice / Faturë Përfundimtare | Type and conversion from advance exist; review advance application before relying on it |\n| `CREDIT_NOTE` | Credit note / Notë Krediti | Created from an original invoice through correction conversion |\n| `DEBIT_NOTE` | Debit note / Notë Debiti | Created from an original invoice through correction conversion |\n| `SIMPLIFIED_INVOICE` | Simplified invoice / Faturë e Thjeshtuar | Shared type recognized by code; no dedicated quick-create card was found |\n| `FISCAL_RECEIPT` | Fiscal receipt / Kupon Fiskal | Shared type only; production EFS is disabled/not certified |\n| `BAD_DEBT_INVOICE` | Bad-debt invoice | Shared internal vocabulary; not a normal mobile creation action |\n\n## Operational versus financial behavior\n\nThe shared domain marks quote, proforma, order, and delivery-note effects as no-effect or policy-dependent for accounting, VAT, receivable, inventory, and fiscalization. Invoice and correction types have posting/effect states, but final accounting and tax outcomes come from the backend posting functions, permissions, and current company configuration. This page is a code-behavior guide, not independent legal advice.\n\n## Status differences\n\nQuotes use draft, sent, viewed, accepted, rejected, expired, converted, and cancelled. Proformas use draft, sent, viewed, partially paid, paid, converted, expired, and cancelled. Orders and delivery notes have their own confirmation/fulfillment/delivery states. Invoices and notes use issued/payment/correction states. A generic “sent” label must not be interpreted as an issued invoice.\n\n## Creating a type\n\nUse a visible quick action or a conversion from the source document. The app sends both the canonical type and legacy `type`/`subtype` compatibility fields to the existing invoice storage. Never change only the heading in a PDF.\n\nSee [Conversions and related documents](./conversions-and-related-documents.md) and [Invoice creation](../invoices/create-and-edit.md).",
    "links": [
      {
        "text": "Conversions and related documents",
        "href": "./conversions-and-related-documents.md",
        "targetId": "documents/conversions-and-related-documents"
      },
      {
        "text": "Invoice creation",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "documents/conversions-and-related-documents",
      "invoices/create-and-edit",
      "fiscalization/status-and-eligibility"
    ]
  },
  {
    "id": "documents/commercial-document-types",
    "language": "sq",
    "category": "documents",
    "title": "Llojet e dokumenteve tregtare",
    "description": "Mësoni si dallohen faturat, ofertat, pro-faturat, porositë, fletëdërgesat dhe notat korrigjuese.",
    "keywords": [
      "ofertë",
      "pro-faturë",
      "porosi",
      "fletëdërgesë",
      "faturë",
      "notë krediti",
      "notë debiti"
    ],
    "content": "# Llojet e dokumenteve tregtare\n\nOperiX e ruan identitetin në fushën `commercial_document_type`. Lloji nuk merret nga titulli i PDF-së.\n\n| Lloji | Etiketa | Çfarë ofron kodi aktual |\n|---|---|---|\n| `QUOTE` | Ofertë | Propozim tregtar, statuset dhe konvertimi në porosi/faturë |\n| `PROFORMA` | Pro-faturë | Dokument paraprak, konvertim në faturë ose rrjedhë paradhënieje |\n| `SALES_ORDER` | Porosi | Porosi e kërkuar/konfirmuar; fusha për porositur/dërguar/mbetur |\n| `DELIVERY_NOTE` | Fletëdërgesë | Dokument i dorëzimit; rrjedha mobile e përmbushjes është e pjesshme |\n| `INVOICE` | Faturë | Rrjedha kryesore, POS dhe postimi në backend |\n| `ADVANCE_INVOICE` | Faturë Paradhënie | Lloji dhe konvertimi ekzistojnë; rakordimi i plotë është i pjesshëm |\n| `FINAL_INVOICE` | Faturë Përfundimtare | Konvertim nga paradhënia; kontrolloni aplikimin e paradhënies |\n| `CREDIT_NOTE` | Notë Krediti | Krijohet nga faturë origjinale për korrigjim |\n| `DEBIT_NOTE` | Notë Debiti | Krijohet nga faturë origjinale për korrigjim në rritje |\n| `SIMPLIFIED_INVOICE` | Faturë e Thjeshtuar | Njihet nga domeni; nuk ka kartë të veçantë krijimi |\n| `FISCAL_RECEIPT` | Kupon Fiskal | Vetëm lloj i përbashkët; EFS është i çaktivizuar |\n| `BAD_DEBT_INVOICE` | Faturë për borxh të keq | Fjalor i brendshëm; nuk është veprim i zakonshëm mobil |\n\nOfertat, pro-faturat, porositë dhe fletëdërgesat kanë efekte të dallueshme ose të varura nga politika për kontabilitet, TVSH, arkëtim, inventar dhe fiskalizim. Rezultati përfundimtar varet nga RPC-të, lejet dhe konfigurimi i kompanisë; kjo faqe nuk jep këshillë ligjore.\n\nStatuset ndryshojnë sipas llojit. Ofertat kanë draft, dërguar, parë, pranuar, refuzuar, skaduar, konvertuar dhe anuluar. Pro-faturat kanë edhe pjesërisht paguar/paguar. Porositë, fletëdërgesat dhe faturat kanë statuset e tyre.\n\nPërdorni veprim të dukshëm ose konvertim. Mos ndryshoni vetëm titullin e PDF-së.\n\nShihni [Konvertimet](./conversions-and-related-documents.md) dhe [Krijimin e faturës](../invoices/create-and-edit.md).",
    "links": [
      {
        "text": "Konvertimet",
        "href": "./conversions-and-related-documents.md",
        "targetId": "documents/conversions-and-related-documents"
      },
      {
        "text": "Krijimin e faturës",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "documents/conversions-and-related-documents",
      "invoices/create-and-edit",
      "fiscalization/status-and-eligibility"
    ]
  },
  {
    "id": "documents/contracts",
    "language": "en",
    "category": "documents",
    "title": "Contracts and contract templates",
    "description": "Create contracts, inspect contract details, and manage the contract templates exposed by the mobile app.",
    "keywords": [
      "contract",
      "NDA",
      "service agreement",
      "contract template"
    ],
    "content": "# Contracts and contract templates\n\nOpen **More > Contracts** for contract records. The current type vocabulary includes service agreement, NDA, employment, and general contracts.\n\n## Create a contract\n\n1. Open the contracts list.\n2. Tap the add action.\n3. Choose a contract type or template when available.\n4. Select a customer/counterparty when the form provides the field.\n5. Complete the generated fields/content.\n6. Save and open the detail screen.\n\nThe shared type stores content/answers, optional HTML body, a signature URL, and a counterparty signature URL. The presence of a signature image is not documented as a qualified electronic signature.\n\n## Manage templates\n\nThe settings stack contains contract-template list and editor screens. Templates have a name, description, and configurable fields such as text, number, date, textarea, or select. The list supports creating/opening/deleting templates; the editor saves the template record.\n\nContracts are separate from invoice templates and do not automatically create an invoice or payment.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "documents/contracts",
    "language": "sq",
    "category": "documents",
    "title": "Kontratat dhe modelet e kontratave",
    "description": "Krijoni kontrata, shihni detajet dhe menaxhoni modelet e kontratave.",
    "keywords": [
      "kontratë",
      "NDA",
      "marrëveshje shërbimi",
      "model kontrate"
    ],
    "content": "# Kontratat dhe modelet e kontratave\n\nHapni **More > Contracts**. Llojet e mbështetura në fjalorin aktual janë marrëveshje shërbimi, NDA, kontratë punësimi dhe e përgjithshme.\n\n## Krijimi\n\n1. Hapni listën e kontratave.\n2. Shtypni shtimin.\n3. Zgjidhni llojin ose modelin.\n4. Zgjidhni klientin/palën kur ofrohet.\n5. Plotësoni fushat dhe përmbajtjen.\n6. Ruajeni dhe hapni detajin.\n\nTë dhënat mund të përmbajnë HTML, URL të nënshkrimit dhe URL të nënshkrimit të palës. Imazhi i nënshkrimit nuk paraqitet si nënshkrim elektronik i kualifikuar.\n\n## Modelet\n\nTe cilësimet ka listë dhe editor për modelet. Modeli ka emër, përshkrim dhe fusha të llojit tekst, numër, datë, textarea ose select. Kontratat janë të ndara nga modelet e faturave dhe nuk krijojnë automatikisht faturë ose pagesë.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "documents/conversions-and-related-documents",
    "language": "en",
    "category": "documents",
    "title": "Convert documents and follow the source chain",
    "description": "Understand supported commercial-document conversions, source references, and idempotent conversion behavior.",
    "keywords": [
      "convert document",
      "related documents",
      "source document",
      "credit note",
      "final invoice"
    ],
    "content": "# Convert documents and follow the source chain\n\nOpen a document’s detail screen and choose a conversion action from the overflow menu. The shared conversion plan copies commercial data but records a new document and source relation; it does not treat conversion alone as a second sale, payment, or stock movement.\n\n## Supported mobile paths\n\nThe current detail screen exposes these paths when the source type allows them:\n\n- Quote → Sales order\n- Quote → Invoice\n- Proforma → Advance invoice\n- Proforma → Invoice\n- Sales order → Delivery note\n- Sales order → Invoice\n- Delivery note → Invoice\n- Advance invoice → Final invoice\n- Invoice or final/simplified invoice → Credit note\n- Invoice or final/simplified invoice → Debit note\n\nThe backend shared domain also knows additional types, but a path is available only when the detail screen and backend RPC allow it.\n\n## What is copied\n\nConversion carries customer/address context, currency and exchange-rate fields when present, line items and quantities, prices, discounts, tax classifications, notes, attachments/PO references when stored, and a source document reference. The new document receives its own number.\n\n## Related-document graph\n\nThe data model supports one-to-many relationships such as one quote to multiple orders, one order to multiple delivery notes, multiple deliveries to one invoice, one invoice to multiple credit notes, and one invoice to multiple payments. The exact links shown depend on rows returned by `document_source_links` and related invoice fields.\n\n## Partial quantities\n\nOrder and delivery line columns include ordered, delivered, and remaining quantities. The database triggers normalize order lines and fulfillment RPCs can update delivery state. The current mobile UI does not provide a complete multi-delivery editor, so verify quantities in the saved documents before billing.\n\n## Corrections\n\nCredit and debit notes require an original document in the shared type definition. Keep the source invoice; create a new note and review the original reference. The database contains safeguards for credit-line quantity limits where source line IDs are supplied.\n\n## Idempotency and retry\n\nConversion is performed through `convert_commercial_document`. POS and payment/posting flows also use idempotency keys. If the UI shows an error after tapping conversion, check the document list and related-document section before trying again to avoid duplicate records.\n\nRelated: [Invoice detail](../invoices/invoice-detail-and-statuses.md), [Commercial document types](./commercial-document-types.md).",
    "links": [
      {
        "text": "Invoice detail",
        "href": "../invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Commercial document types",
        "href": "./commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "documents/commercial-document-types",
      "invoices/invoice-detail-and-statuses",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "documents/conversions-and-related-documents",
    "language": "sq",
    "category": "documents",
    "title": "Konvertimi dhe dokumentet e lidhura",
    "description": "Kuptoni rrugët e konvertimit, lidhjet burimore dhe sjelljen pa dublikim.",
    "keywords": [
      "konverto dokument",
      "dokumente të lidhura",
      "dokument burimor",
      "notë krediti",
      "faturë përfundimtare"
    ],
    "content": "# Konvertimi dhe dokumentet e lidhura\n\nNga detaji i dokumentit hapni menynë dhe zgjidhni konvertimin. Plani i përbashkët kopjon të dhënat tregtare, krijon dokument të ri dhe ruan lidhjen burimore; konvertimi vetë nuk është shitje, pagesë ose lëvizje e dytë e stokut.\n\n## Rrugët mobile\n\n- Ofertë → Porosi\n- Ofertë → Faturë\n- Pro-faturë → Faturë Paradhënie\n- Pro-faturë → Faturë\n- Porosi → Fletëdërgesë\n- Porosi → Faturë\n- Fletëdërgesë → Faturë\n- Faturë Paradhënie → Faturë Përfundimtare\n- Faturë/faturë përfundimtare/faturë e thjeshtuar → Notë Krediti\n- Faturë/faturë përfundimtare/faturë e thjeshtuar → Notë Debiti\n\n## Çfarë kopjohet\n\nKopjohen klienti dhe adresat, valuta dhe kursi kur ekzistojnë, rreshtat/sasitë, çmimet, zbritjet, klasifikimet tatimore, shënimet, referencat e porosisë dhe të dhëna të tjera tregtare. Dokumenti i ri merr numrin e vet.\n\n## Grafi i lidhjeve\n\nModeli mbështet një ofertë me shumë porosi, një porosi me shumë fletëdërgesa, shumë dërgesa në një faturë, një faturë me shumë nota krediti dhe shumë pagesa. Shfaqja varet nga `document_source_links` dhe fushat e lidhjes.\n\n## Sasitë dhe korrigjimet\n\nRreshtat kanë sasi të porositur, të dorëzuar dhe të mbetur. Për notat, ruani faturën origjinale dhe krijoni dokument të ri me referencë. Baza e të dhënave ka kufizime për sasinë e kredituar kur jepet rreshti burimor.\n\nNë rast gabimi pas konvertimit, kontrolloni listën dhe dokumentet e lidhura para se ta provoni përsëri.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "documents/commercial-document-types",
      "invoices/invoice-detail-and-statuses",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "expenses/record-expenses-and-income",
    "language": "en",
    "category": "expenses",
    "title": "Record expenses and income",
    "description": "Create expense or income records, assign categories, attach a receipt image, and review totals.",
    "keywords": [
      "expense",
      "income",
      "receipt",
      "expense category",
      "expense report"
    ],
    "content": "# Record expenses and income\n\n## Create an expense\n\n1. Open **Business > Expenses** or **More > Expenses** when the route is available.\n2. Tap **Add expense**.\n3. Select **Expense**.\n4. Enter date, description, amount, and category.\n5. Optionally add a receipt image from the device library and notes.\n6. Save.\n\nPositive amounts are required. New expense records use the expense-posting RPC with an idempotency key when the backend flow is available. The record is scoped to the active company.\n\n## Create an income record\n\n1. Open the same form.\n2. Switch the type to **Income**.\n3. Enter the date, description, amount, and category.\n4. Save.\n\nThe mobile form stores income differently from a posted expense; the current source does not document a complete income accounting workflow separate from invoice/payment posting.\n\n## Fields\n\n| Field | Meaning | Current behavior |\n|---|---|---|\n| Date | Date of the record | Defaults to the current date |\n| Type | Expense or income | Controls category options and save path |\n| Description | Human-readable detail | Optional/used in list and PDF |\n| Amount | Money value | Required and greater than zero |\n| Category | Classification | Built-in categories include Travel, Supplies, Marketing, Software, Rent, Utilities, Other; income has Sales, Refund, Grant, Investment, Other, plus loaded categories |\n| Receipt | Image proof | Optional; the form reads an image with base64 data and stores the resulting data URL path |\n| Notes | Additional detail | Optional where shown |\n\n## Review and delete\n\nThe expenses screen filters by all, expense, income, category, and search text. Dashboard totals include total expenses, total incomes, and balance. The current UI exposes delete; confirm before removing a record that may already be used in accounting.\n\nRelated: [Reports](../reports/financial-reports.md), [Supplier bills](../company/suppliers-and-bills.md), [Troubleshooting](../troubleshooting/common-problems.md).",
    "links": [
      {
        "text": "Reports",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      },
      {
        "text": "Supplier bills",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      },
      {
        "text": "Troubleshooting",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "company/suppliers-and-bills"
    ]
  },
  {
    "id": "expenses/record-expenses-and-income",
    "language": "sq",
    "category": "expenses",
    "title": "Regjistrimi i shpenzimeve dhe të hyrave",
    "description": "Krijoni shpenzim ose të hyrë, caktoni kategori dhe bashkëngjitni dëshmi.",
    "keywords": [
      "shpenzim",
      "të hyra",
      "dëshmi",
      "kategori shpenzimi"
    ],
    "content": "# Regjistrimi i shpenzimeve dhe të hyrave\n\n## Krijoni shpenzim\n\n1. Hapni **Business > Expenses** ose **More > Expenses**.\n2. Shtypni **Add expense**.\n3. Zgjidhni **Expense**.\n4. Vendosni datën, përshkrimin, shumën dhe kategorinë.\n5. Shtoni foto të faturës dhe shënime nëse duhet.\n6. Ruajeni.\n\nShuma duhet të jetë pozitive. Rrjedha e re e shpenzimit përdor RPC-në e postimit me idempotency key kur backend-i e lejon.\n\n## Krijoni të hyrë\n\nNë të njëjtin formular zgjidhni **Income**, plotësoni datën, përshkrimin, shumën dhe kategorinë dhe ruajeni. Burimi aktual e ruan ndryshe nga shpenzimi i postuar; nuk dokumentohet si rrjedhë e plotë e veçantë kontabël.\n\n## Fushat dhe kategoritë\n\nFushat janë data, lloji, përshkrimi, shuma, kategoria, dëshmia/fotoja dhe shënimet. Kategoritë e shpenzimeve përfshijnë Travel, Supplies, Marketing, Software, Rent, Utilities dhe Other. Të hyrat përfshijnë Sales, Refund, Grant, Investment dhe Other, si dhe kategori të ngarkuara.\n\nLista filtron sipas llojit, kategorisë dhe kërkimit. Paneli tregon shpenzime, të hyra dhe bilancin. Ekziston fshirja; kontrolloni politikën para heqjes së të dhënës.\n\nTë lidhura: [Raportet](../reports/financial-reports.md), [Faturat e furnitorëve](../company/suppliers-and-bills.md).",
    "links": [
      {
        "text": "Raportet",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      },
      {
        "text": "Faturat e furnitorëve",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "company/suppliers-and-bills"
    ]
  },
  {
    "id": "faq",
    "language": "en",
    "category": "faq",
    "title": "Frequently asked questions",
    "description": "Answers to common questions about the current OperiX Invoice Mobile workflows.",
    "keywords": [
      "FAQ",
      "invoice questions",
      "payment questions",
      "company questions"
    ],
    "content": "# Frequently asked questions\n\n## How do I create an invoice?\n\nOpen **Invoice** or a new-invoice action, select a customer, add at least one line, review dates/tax/total, and save. See [Create and edit an invoice](../invoices/create-and-edit.md).\n\n## Can I create a quote or proforma?\n\nYes. The shared commercial-document form and Sales conversion paths recognize Quote and Proforma. Their stored type is different from `INVOICE`; changing a PDF title is not enough. See [Commercial document types](../documents/commercial-document-types.md).\n\n## Can I edit an issued invoice?\n\nThe detail screen blocks ordinary editing for immutable statuses and posted accounting state. Use the supported credit/debit correction path and preserve the original.\n\n## How do I mark an invoice paid?\n\nRecord a customer payment and allocate it to the invoice. The status changes based on the allocation result, not simply on opening the payment form.\n\n## Can I record a partial payment?\n\nYes. Enter the amount received and allocate it to the invoice. Verify the remaining balance in invoice detail.\n\n## How do I change invoice numbering?\n\nNumber reservation is handled by the backend document-sequence allocator. Advanced settings exposes sequence-related data, but users must not reuse or silently change an issued number. Ask an administrator.\n\n## Can I change VAT?\n\nThe invoice form and product form contain tax-rate/tax-treatment fields. Select the value used by your company’s configured workflow and verify the resulting document; the app does not replace professional tax advice.\n\n## How do I add a logo or bank details?\n\nOpen **More > Settings**, expand the identity or bank section, and save the values. They are used by PDF data when configured.\n\n## Can I use multiple currencies?\n\nShared formatting recognizes multiple currencies, but current mobile invoice/company forms default to EUR and do not expose a complete currency-management workflow. Confirm the saved document and accounting setup before using a non-EUR flow.\n\n## Is customer portal access available in mobile?\n\nNo dedicated customer-portal screen was found in the mobile app. Mobile can compose email/share PDFs; portal behavior belongs to other repository surfaces and must not be assumed from this app.\n\n## Is the app offline?\n\nNot as a complete offline-first app. Theme/language are persisted locally and POS held orders are temporary screen state. Records generally require live Supabase access.\n\n## Is fiscalization active?\n\nThe current Tax Center shows **EFS NOT CERTIFIED** and production EFS is disabled in the audited mobile configuration. Do not call an ordinary invoice PDF a fiscal receipt.",
    "links": [
      {
        "text": "Create and edit an invoice",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "customers/manage-customers",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "faq",
    "language": "sq",
    "category": "faq",
    "title": "Pyetjet e shpeshta",
    "description": "Përgjigje për rrjedhat aktuale të OperiX Invoice Mobile.",
    "keywords": [
      "FAQ",
      "pyetje fature",
      "pyetje pagesash",
      "pyetje kompanie"
    ],
    "content": "# Pyetjet e shpeshta\n\n## Si krijoj faturë?\n\nHapni **Invoice**, zgjidhni klientin, shtoni të paktën një rresht, kontrolloni datën/TVSH-në/totalin dhe ruajeni. Shihni [Krijimi i faturës](../invoices/create-and-edit.md).\n\n## A mund të krijoj ofertë ose pro-faturë?\n\nPo. Forma dhe konvertimet i njohin të dyja. Lloji ruhet ndryshe nga `INVOICE`; titulli i PDF-së nuk mjafton.\n\n## A mund të ndryshoj faturë të lëshuar?\n\nJo me editim të zakonshëm kur statusi është i pandryshueshëm. Përdorni notë krediti/debiti dhe ruani origjinalin.\n\n## Si e shënoj faturën të paguar?\n\nRegjistroni pagesën e klientit dhe alokojeni te fatura. Statusi ndryshon sipas rezultatit të alokimit.\n\n## A mund të regjistroj pagesë të pjesshme?\n\nPo. Vendosni shumën e pranuar dhe kontrolloni bilancin e mbetur.\n\n## Si ndryshohet numërimi?\n\nSeritë caktohen nga allocator-i transaksional i backend-it. Mos ripërdorni numër të lëshuar; kontaktoni administratorin.\n\n## Si ndryshohet TVSH-ja?\n\nFormulari i faturës dhe produktit ka normë/trajtim tatimor. Kontrolloni konfigurimin e kompanisë dhe rezultatin; aplikacioni nuk zëvendëson këshillën tatimore.\n\n## Si shtoj logon dhe bankën?\n\nTe **More > Settings** hapni seksionet e identitetit ose bankës dhe ruani logo, nënshkrim, bankë, IBAN dhe SWIFT.\n\n## A mbështeten valuta të ndryshme?\n\nFormatter-i njeh disa valuta, por formularët aktualë mobilë përdorin EUR si parazgjedhje dhe nuk kanë rrjedhë të plotë menaxhimi të valutës.\n\n## A ka portal klienti në mobile?\n\nNuk u gjet ekran i portalit të klientit në aplikacion. Mobile mund të dërgojë email ose PDF; portali duhet verifikuar në sipërfaqe tjetër të repository-t.\n\n## A punon aplikacioni offline?\n\nJo si aplikacion i plotë offline-first. Tema/gjuha ruhen lokalisht, ndërsa dokumentet zakonisht kërkojnë Supabase live dhe shporta POS është e përkohshme.\n\n## A është aktiv fiskalizimi?\n\nQendra e tatimeve shfaq **EFS NOT CERTIFIED** dhe EFS i prodhimit është i çaktivizuar në konfigurimin e audituar. PDF-ja e zakonshme nuk është kupon fiskal.",
    "links": [
      {
        "text": "Krijimi i faturës",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "customers/manage-customers",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "fiscalization/status-and-eligibility",
    "language": "en",
    "category": "fiscalization",
    "title": "Fiscalization status and EFS behavior",
    "description": "Understand what the current mobile app shows about Kosovo EFS fiscalization and what it does not claim.",
    "keywords": [
      "EFS",
      "fiscalization",
      "fiscal receipt",
      "TAK",
      "certified"
    ],
    "content": "# Fiscalization status and EFS behavior\n\nThe Tax Center reads `kosovo_efs_status` for the selected company IDs. If no accepted status is available, the UI displays **EFS NOT CERTIFIED** and a production-disabled warning.\n\n## What this means for users\n\n- A normal invoice, quote, proforma, order, or delivery note is not automatically a fiscal receipt just because it has a PDF.\n- The shared domain contains a `FISCAL_RECEIPT` type and provider-only fiscalization effect, but this type is not a proof that EFS is enabled.\n- The current mobile source does not demonstrate TAK acceptance, a fiscal QR/receipt returned from a live provider, or production certification.\n\nDo not add fiscal identifiers to a PDF manually and do not tell a customer that an emailed PDF is a fiscal receipt. Follow the company’s approved fiscalization process and the current official requirements outside this user guide.\n\n## Troubleshooting the status\n\nIf the status is unexpected, confirm the selected company, query permissions, and `kosovo_efs_status` record with an authorized administrator. A report/query failure is not the same as an accepted fiscalization response.\n\nRelated: [Tax Center](../taxes/tax-center.md), [Commercial document types](../documents/commercial-document-types.md). Developer EFS notes are maintained separately from the mobile Help Center.",
    "links": [
      {
        "text": "Tax Center",
        "href": "../taxes/tax-center.md",
        "targetId": "taxes/tax-center"
      },
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "disabled",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "taxes/tax-center",
      "documents/commercial-document-types"
    ]
  },
  {
    "id": "fiscalization/status-and-eligibility",
    "language": "sq",
    "category": "fiscalization",
    "title": "Statusi i fiskalizimit dhe EFS",
    "description": "Kuptoni çfarë tregon aplikacioni për EFS dhe çfarë nuk pretendon.",
    "keywords": [
      "EFS",
      "fiskalizim",
      "kupon fiskal",
      "ATK",
      "certifikim"
    ],
    "content": "# Statusi i fiskalizimit dhe EFS\n\nQendra e tatimeve lexon `kosovo_efs_status`. Kur nuk ka status të pranuar, shfaq **EFS NOT CERTIFIED** dhe paralajmërimin se EFS i prodhimit është i çaktivizuar.\n\nKjo do të thotë:\n\n- fatura, oferta, pro-fatura, porosia ose fletëdërgesa nuk bëhet automatikisht kupon fiskal vetëm sepse ka PDF;\n- domeni ka llojin `FISCAL_RECEIPT`, por kjo nuk dëshmon aktivizimin e EFS-së;\n- kodi mobil nuk dëshmon pranim të drejtpërdrejtë nga ATK, QR fiskal të gjeneruar nga shërbimi ose certifikim prodhimi.\n\nMos shtoni identifikues fiskalë me dorë dhe mos e quani PDF-në e zakonshme kupon fiskal. Për status të pasaktë kontrolloni kompaninë, lejet dhe të dhënën `kosovo_efs_status` me administratorin e autorizuar.\n\nTë lidhura: [Qendra e tatimeve](../taxes/tax-center.md), [Llojet e dokumenteve](../documents/commercial-document-types.md).",
    "links": [
      {
        "text": "Qendra e tatimeve",
        "href": "../taxes/tax-center.md",
        "targetId": "taxes/tax-center"
      },
      {
        "text": "Llojet e dokumenteve",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "disabled",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "taxes/tax-center",
      "documents/commercial-document-types"
    ]
  },
  {
    "id": "getting-started/sign-in-and-account",
    "language": "en",
    "category": "getting-started",
    "title": "Sign in, register, and join a team",
    "description": "Learn how authentication, email verification, Google sign-in, and team invitations work in OperiX Invoice Mobile.",
    "keywords": [
      "sign in",
      "register",
      "email verification",
      "Google sign in",
      "join team"
    ],
    "content": "# Sign in, register, and join a team\n\n## Sign in\n\n1. Open OperiX Invoice Mobile.\n2. On **Sign In**, enter your email and password.\n3. Tap **Sign In**.\n4. If the account is valid, the app loads the currently selected workspace.\n\nThe screen also contains a Google sign-in action. It opens the browser authentication flow and returns to the app through its configured redirect flow.\n\n## Register a new account\n\n1. Tap **Sign Up** on the sign-in screen.\n2. Enter first name, last name, email, password, password confirmation, and phone.\n3. Optionally enter company name and registered number.\n4. Submit the form.\n5. Enter the email verification code when the verification step appears.\n\nThe form validates required values, matching passwords, and the password minimum implemented in the screen. Account creation is handled by Supabase Auth.\n\n## Join an existing company\n\n1. Choose the team-invite link from the sign-up flow.\n2. Enter the invitation token.\n3. Confirm the company shown by **verify invite token**.\n4. Enter your name, email, and password.\n5. Submit the request.\n\nThe user may see an approval-pending screen while a company administrator completes access. The **Check status** action queries the employee record; the current navigator may require a restart or a new sign-in before the approved workspace opens.\n\n## Session and sign out\n\nSupabase restores the current session when the app starts and listens for auth changes. To leave the workspace, open **More > Settings** or **More > Sign out**, confirm, and let the app return to the auth stack.\n\n## Biometric lock\n\nIf enabled in [Preferences and templates](../settings/preferences-and-templates.md), the app asks the device for biometric/passcode authentication before showing the authenticated screens. This is a device gate, not a replacement for the Supabase password or account-recovery process.\n\n## Not currently exposed\n\nThe audited mobile code has no password-reset screen. If you cannot access the account, contact the workspace administrator or support using [Help and About](../settings/help-and-about.md).",
    "links": [
      {
        "text": "Preferences and templates",
        "href": "../settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      },
      {
        "text": "Help and About",
        "href": "../settings/help-and-about.md",
        "targetId": "settings/help-and-about"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "users-and-permissions/roles-and-access",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "getting-started/sign-in-and-account",
    "language": "sq",
    "category": "getting-started",
    "title": "Hyrja, regjistrimi dhe bashkimi në ekip",
    "description": "Mësoni si funksionojnë autentikimi, verifikimi i emailit, hyrja me Google dhe ftesat në ekip.",
    "keywords": [
      "hyrje",
      "regjistrim",
      "verifikim emaili",
      "Google",
      "bashkohu në ekip"
    ],
    "content": "# Hyrja, regjistrimi dhe bashkimi në ekip\n\n## Hyrja\n\n1. Hapni OperiX Invoice Mobile.\n2. Te **Sign In**, shkruani emailin dhe fjalëkalimin.\n3. Shtypni **Sign In**.\n4. Pas hyrjes, aplikacioni ngarkon hapësirën e zgjedhur të punës.\n\nEkrani ka edhe hyrjen me Google. Kjo hap shfletuesin për autentikim dhe kthehet në aplikacion përmes ridrejtimit të konfiguruar.\n\n## Regjistrimi\n\n1. Shtypni **Sign Up**.\n2. Plotësoni emrin, mbiemrin, emailin, fjalëkalimin, konfirmimin e tij dhe telefonin.\n3. Nëse dëshironi, plotësoni emrin e kompanisë dhe numrin e regjistrimit.\n4. Dërgoni formularin.\n5. Vendosni kodin e verifikimit të emailit.\n\nFormulari kontrollon fushat e detyrueshme, përputhjen e fjalëkalimeve dhe minimumin e fjalëkalimit të implementuar në ekran. Llogaria krijohet përmes Supabase Auth.\n\n## Bashkimi në një kompani ekzistuese\n\n1. Hapni rrjedhën e ftesës nga regjistrimi.\n2. Shkruani tokenin e ftesës.\n3. Konfirmoni kompaninë e verifikuar.\n4. Plotësoni emrin, emailin dhe fjalëkalimin.\n5. Dërgoni kërkesën.\n\nMund të shfaqet ekrani i pritjes për miratim. Administratori duhet të përfundojë qasjen. **Check status** kërkon të dhënat e punonjësit; navigimi aktual mund të kërkojë rinisje ose hyrje të re pas miratimit.\n\n## Sesioni dhe dalja\n\nSupabase rikthen sesionin në nisje dhe dëgjon ndryshimet e autentikimit. Për të dalë, hapni **More > Settings** ose **More > Sign out**, konfirmoni dhe kthehuni në ekranin e autentikimit.\n\n## Kyçja biometrike\n\nNëse aktivizohet te [Preferencat dhe modelet](../settings/preferences-and-templates.md), aplikacioni kërkon biometrinë ose kodin e pajisjes para ekraneve të autentikuara. Kjo nuk zëvendëson fjalëkalimin ose rikuperimin e llogarisë.\n\n## Funksion që nuk është i ekspozuar\n\nNë kodin mobil nuk u gjet ekran për rivendosjen e fjalëkalimit. Për ndihmë, kontaktoni administratorin ose [Mbështetjen](../settings/help-and-about.md).",
    "links": [
      {
        "text": "Preferencat dhe modelet",
        "href": "../settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      },
      {
        "text": "Mbështetjen",
        "href": "../settings/help-and-about.md",
        "targetId": "settings/help-and-about"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "users-and-permissions/roles-and-access",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "integrations/stripe-and-connected-services",
    "language": "en",
    "category": "integrations",
    "title": "Stripe, PayPal, and connected services",
    "description": "Understand the payment-integration screens, Stripe synchronization paths, and PayPal link behavior.",
    "keywords": [
      "Stripe",
      "Stripe Connect",
      "PayPal",
      "payment integration",
      "sync"
    ],
    "content": "# Stripe, PayPal, and connected services\n\nOpen **More > Integrations**.\n\n## Stripe\n\nThe current code contains a Stripe Connect OAuth flow and a Stripe dashboard. Depending on the connection, the app can:\n\n- start an OAuth connection in the browser;\n- read connection status from the profile;\n- synchronize transactions and payouts through a Supabase Edge Function;\n- use a developer-mode direct API-key synchronization path;\n- show transaction/payout summaries;\n- open a payout flow to record income where the screen provides it;\n- disconnect the account.\n\nSynchronization can be incremental or a deeper sync. The dashboard shows last-sync information when stored.\n\n## PayPal\n\nThe integration screen supports storing a PayPal payment link and disconnecting/clearing it. The audited mobile code does not provide a complete PayPal transaction synchronization workflow.\n\n## Security\n\nNever paste a secret Stripe API key into support tickets, screenshots, documentation, or chat. The direct API-key path is marked developer-mode in source and needs server/security review before being used broadly. Prefer the server-side OAuth/Edge Function path when enabled for the tenant.\n\n## Failure handling\n\nIf sync fails, retry from the integration/dashboard screen and check the selected company, connection status, and Edge Function logs with an administrator. See [Troubleshooting](../troubleshooting/common-problems.md).",
    "links": [
      {
        "text": "Troubleshooting",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/record-customer-payment",
      "settings/preferences-and-templates",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "integrations/stripe-and-connected-services",
    "language": "sq",
    "category": "integrations",
    "title": "Stripe, PayPal dhe shërbimet e lidhura",
    "description": "Kuptoni integrimet e pagesave, sinkronizimin e Stripe dhe lidhjet PayPal.",
    "keywords": [
      "Stripe",
      "Stripe Connect",
      "PayPal",
      "integrim pagese",
      "sinkronizim"
    ],
    "content": "# Stripe, PayPal dhe shërbimet e lidhura\n\nHapni **More > Integrations**.\n\n## Stripe\n\nKodi ka OAuth të Stripe Connect dhe dashboard. Në varësi të lidhjes mund të nisni OAuth në shfletues, të lexoni statusin, të sinkronizoni transaksione dhe payout-e përmes Edge Function, të përdorni rrugën developer me API key, të shihni përmbledhje, të regjistroni të hyra nga payout-i dhe të shkëputni llogarinë.\n\nSinkronizimi mund të jetë inkremental ose i thellë. Dashboard-i tregon sinkronizimin e fundit kur ruhet.\n\n## PayPal\n\nIntegrimi ruan një lidhje pagese PayPal dhe mund ta pastrojë. Sinkronizim i plotë i transaksioneve PayPal nuk u gjet në kodin mobil.\n\n## Siguria\n\nMos vendosni çelës sekret Stripe në dokumente, screenshots, ticket-a ose biseda. Rruga me API key është developer mode dhe duhet rishikuar përpara përdorimit të gjerë; preferohet rruga server-side kur është e aktivizuar.\n\nNë gabim kontrolloni kompaninë, lidhjen dhe Edge Function me administratorin. Shihni [Zgjidhja e problemeve](../troubleshooting/common-problems.md).",
    "links": [
      {
        "text": "Zgjidhja e problemeve",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/record-customer-payment",
      "settings/preferences-and-templates",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "inventory/stock-and-low-stock",
    "language": "en",
    "category": "inventory",
    "title": "Inventory, stock, and low-stock indicators",
    "description": "Understand the product-backed stock values and the stock behavior used by POS.",
    "keywords": [
      "inventory",
      "stock",
      "low stock",
      "available quantity",
      "warehouse"
    ],
    "content": "# Inventory, stock, and low-stock indicators\n\n## What the mobile app shows\n\nInventory in the current mobile app is product-backed. A product can have:\n\n- stock quantity;\n- a **Track stock** flag;\n- a low-stock threshold;\n- SKU/barcode and unit data.\n\nThe product list calculates total stock value as unit price × stock quantity and shows low-stock and out-of-stock counts. The Home dashboard counts tracked products below their threshold.\n\n## POS stock behavior\n\nWhen a tracked product is selected in POS, the cart uses available stock to limit the quantity that can be added. The final POS invoice flow calls the stock-tracked invoice RPC. A reserved quantity and physically moved quantity are different concepts in the backend domain, but the mobile product screen does not show a complete on-hand/reserved/available warehouse board.\n\n## What is not a complete mobile workflow\n\nThe audited mobile source does not expose a complete screen for manual stock adjustments, purchase receipts, warehouse transfers, returns, stock valuation, batch/serial tracking, or warehouse selection. Backend tables/migrations may exist for some of these, but this guide does not present them as mobile features.\n\nRelated: [Products](../products/manage-products.md), [POS](../pos/point-of-sale.md), [Reports](../reports/financial-reports.md).",
    "links": [
      {
        "text": "Products",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "POS",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Reports",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "pos/point-of-sale",
      "reports/financial-reports"
    ]
  },
  {
    "id": "inventory/stock-and-low-stock",
    "language": "sq",
    "category": "inventory",
    "title": "Inventari, stoku dhe treguesit e stokut të ulët",
    "description": "Kuptoni stokun e produkteve dhe sjelljen e stokut në POS.",
    "keywords": [
      "inventar",
      "stok",
      "stok i ulët",
      "sasi e disponueshme",
      "depo"
    ],
    "content": "# Inventari, stoku dhe treguesit e stokut të ulët\n\nInventari mobil bazohet në produktet. Produkti ka sasi stoku, **Track stock**, prag të stokut të ulët, SKU/barkod dhe njësi. Lista llogarit vlerën si çmim për njësi × sasi dhe tregon stok të ulët ose zero. Kreu numëron produktet e ndjekura poshtë pragut.\n\nNë POS, produktet e ndjekura kufizojnë sasinë që mund të shtohet. Ruajtja e faturës POS thërret RPC-në e faturës me stok. Backend-i mund të dallojë rezervimin nga lëvizja fizike, por aplikacioni mobil nuk paraqet tabelë të plotë on-hand/reserved/available.\n\nNuk u gjetën ekrane të plota mobile për rregullime manuale, transferime magazine, kthime, vlerësim stoku, lote/seri ose zgjedhje magazine. Mos i paraqitni këto si funksione mobile të disponueshme.\n\nTë lidhura: [Produktet](../products/manage-products.md), [POS](../pos/point-of-sale.md), [Raportet](../reports/financial-reports.md).",
    "links": [
      {
        "text": "Produktet",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "POS",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Raportet",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "pos/point-of-sale",
      "reports/financial-reports"
    ]
  },
  {
    "id": "invoices/create-and-edit",
    "language": "en",
    "category": "invoices",
    "title": "Create and edit an invoice",
    "description": "Learn how to create an invoice or another supported commercial document in OperiX Invoice Mobile.",
    "keywords": [
      "invoice",
      "create invoice",
      "edit invoice",
      "VAT",
      "customer",
      "product"
    ],
    "content": "# Create and edit an invoice\n\nThe app uses one shared commercial-document form. The record’s explicit `commercial_document_type` determines whether it is an invoice, quote, proforma, order, delivery note, or another supported type. The PDF heading alone does not change the record type.\n\n## Create an invoice\n\n1. Open **Invoice** or choose **More > Sales** and tap the create action.\n2. Select **Invoice** if a document-type choice is shown.\n3. Select an existing customer, choose **Citizen**, or use **Add customer**.\n4. Add a product or choose **Custom item**.\n5. Enter quantity, unit price, unit, discount, and tax rate for each line.\n6. Set the issue date and, if needed, the due date.\n7. Review subtotal, discount, tax, and total.\n8. Choose a payment method if the payment section is shown: bank transfer, cash, or card.\n9. Enter amount received when applicable and review change.\n10. Add notes or advanced document details if needed.\n11. Tap **Save**.\n\nThe form requires at least one line and an active company. For a non-POS invoice without a customer, it uses the configured walk-in customer path. The invoice number is normally reserved at save through the `reserve_invoice_number` RPC.\n\n## Important fields\n\n| Field | Meaning | Required/default/validation |\n|---|---|---|\n| Invoice/document number | Number shown on the document | Usually allocated on save; manual advanced editing exists but must not be used to create duplicates |\n| Customer | Client attached to the document | Optional in the form because walk-in customer can be used; a saved non-POS sale receives a walk-in customer if none is selected |\n| Issue date | Date the document is issued | Defaults to the current date in the form |\n| Due date | Date payment is expected | Optional; blank is stored as null |\n| Product/service | Existing product or custom line | A line description and price are needed for a useful line |\n| Description | Text printed for the line | Copied from the product when an existing product is selected |\n| Quantity | Number of units/services | Entered per line; POS quantity controls use positive stock-aware values |\n| Unit | Unit label such as pcs, hrs, kg, or unit | Product unit is copied when available |\n| Unit price | Price before the line calculation | Product price is copied when available |\n| Discount | Line/global discount percentage or amount as represented by the form | Customer default discount can be applied; totals use the form’s numeric value |\n| Tax rate | Percentage used to calculate tax | Product tax rate is copied; the form calculates tax on the discounted amount |\n| Notes | Free text attached to the document | Optional |\n| Payment method | Bank, cash, or card in the invoice form | Optional in ordinary creation; POS supplies a method from the checkout flow |\n| Amount received | Money received during the form flow | Optional; exact amount and change helpers are available |\n| Customer signature | Requests a buyer signature | Only shown for `INVOICE`; a signature pad is required before saving when requested |\n\nThe form calculates each line as quantity × price less discount, then applies tax to the discounted amount. The displayed summary is subtotal, discount, tax, and total. Verify the saved document when a legacy screen displays a different subtotal convention.\n\n## Edit a draft\n\n1. Open the document from the invoice list or document trail.\n2. Open the overflow menu.\n3. Choose **Edit** when the document is still editable.\n4. Change the fields and save.\n\nThe detail screen prevents normal editing when the commercial status is immutable, such as issued, paid, overdue, credited, corrected, or cancelled. Use a credit/debit correction path instead of rewriting an issued financial document. See [Statuses and corrections](./invoice-detail-and-statuses.md).\n\n## Duplicate as draft\n\nThe detail overflow menu can create a new draft copy. This creates a separate document; it does not change the original and should not be treated as a payment or accounting reversal.\n\n## Create other documents\n\nThe same form is used by the commercial-document conversion and creation paths. For differences between invoice, quote, proforma, order, delivery note, advance, final, credit, and debit documents, see [Commercial document types](../documents/commercial-document-types.md).\n\n## Related help\n\n- [Customers](../customers/manage-customers.md)\n- [Products](../products/manage-products.md)\n- [VAT and tax screens](../taxes/tax-center.md)\n- [Record a payment](../payments/record-customer-payment.md)\n- [PDF, sharing, and printing](./pdf-sharing-and-printing.md)",
    "links": [
      {
        "text": "Statuses and corrections",
        "href": "./invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "Customers",
        "href": "../customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Products",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "VAT and tax screens",
        "href": "../taxes/tax-center.md",
        "targetId": "taxes/tax-center"
      },
      {
        "text": "Record a payment",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      },
      {
        "text": "PDF, sharing, and printing",
        "href": "./pdf-sharing-and-printing.md",
        "targetId": "invoices/pdf-sharing-and-printing"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "customers/manage-customers",
      "products/manage-products",
      "payments/record-customer-payment",
      "invoices/pdf-sharing-and-printing"
    ]
  },
  {
    "id": "invoices/create-and-edit",
    "language": "sq",
    "category": "invoices",
    "title": "Krijimi dhe ndryshimi i një fature",
    "description": "Mësoni si të krijoni faturë ose dokument tjetër tregtar të mbështetur.",
    "keywords": [
      "faturë",
      "krijo faturë",
      "ndrysho faturë",
      "TVSH",
      "klient",
      "produkt"
    ],
    "content": "# Krijimi dhe ndryshimi i një fature\n\nAplikacioni përdor një formular të përbashkët për dokumentet tregtare. Lloji ruhet në `commercial_document_type`; titulli i PDF-së nuk e ndryshon llojin e të dhënës.\n\n## Krijoni një faturë\n\n1. Hapni **Invoice** ose një veprim për faturë të re.\n2. Zgjidhni **Invoice** nëse shfaqet zgjedhja e llojit.\n3. Zgjidhni klientin, klientin pa emër ose shtoni klient të ri.\n4. Shtoni produkt ose **Custom item**.\n5. Vendosni sasinë, njësinë, çmimin, zbritjen dhe normën e tatimit.\n6. Vendosni datën e lëshimit dhe, nëse duhet, afatin e pagesës.\n7. Kontrolloni nëntotalin, zbritjen, tatimin dhe totalin.\n8. Zgjidhni bankë, para në dorë ose kartë kur shfaqet seksioni i pagesës.\n9. Vendosni shumën e pranuar dhe kontrolloni kusurin kur aplikohet.\n10. Shtoni shënime ose detaje të avancuara.\n11. Shtypni **Save**.\n\nKërkohet së paku një rresht dhe kompani aktive. Kur nuk ka klient në një shitje jo-POS, përdoret rrjedha e klientit pa emër. Numri zakonisht rezervohet gjatë ruajtjes përmes `reserve_invoice_number`.\n\n## Fushat kryesore\n\n| Fusha | Kuptimi | Sjellja aktuale |\n|---|---|---|\n| Numri i dokumentit | Numri i shfaqur në dokument | Zakonisht caktohet gjatë ruajtjes; ndryshimi manual duhet të shmangë përsëritjen |\n| Klienti | Klienti i dokumentit | Formulari mund të përdorë klientin pa emër |\n| Data e lëshimit | Data e lëshimit | Parazgjedhje është data e sotme |\n| Afati i pagesës | Data kur pritet pagesa | Opsional |\n| Produkt/shërbim | Produkt ekzistues ose rresht i lirë | Për produktin kopjohen të dhënat e tij |\n| Përshkrimi | Teksti i rreshtit | Opsional sipas validimit të rreshtit |\n| Sasia | Numri i njësive/shërbimeve | Vendoset për çdo rresht |\n| Njësia | pcs, hrs, kg, lbs, mt, ft, l, gal ose unit | Zgjidhet në formular |\n| Çmimi për njësi | Çmimi para llogaritjes | Kopjohet nga produkti kur ekziston |\n| Zbritja | Zbritja e rreshtit ose globale | Zbritja e klientit mund të aplikohet |\n| Norma e tatimit | Përqindja e tatimit | Kopjohet nga produkti dhe llogaritet mbi shumën pas zbritjes |\n| Shënimet | Tekst shtesë | Opsionale |\n| Mënyra e pagesës | Bankë, para në dorë ose kartë | Përdoret edhe nga rrjedha POS |\n| Shuma e pranuar | Shuma e marrë | Opsionale; ka ndihmë për shumën e saktë dhe kusurin |\n| Nënshkrimi i klientit | Kërkon nënshkrim të blerësit | Shfaqet vetëm për `INVOICE` dhe kërkon Signature Pad |\n\nLlogaritja e rreshtit është sasi × çmim, minus zbritja; tatimi aplikohet mbi shumën pas zbritjes. Kontrolloni dokumentin e ruajtur nëse një ekran i vjetër shfaq nëntotal me konventë tjetër.\n\n## Ndryshoni një draft\n\nHapni dokumentin, zgjidhni **Edit** nga menyja dhe ruajeni. Dokumentet e lëshuara, të paguara, të vonuara, të kredituara, të korrigjuara ose të anuluara trajtohen si të pandryshueshme. Përdorni korrigjimin me notë krediti/debiti.\n\n## Dokumente të tjera\n\nI njëjti formular përdoret nga rrjedhat e ofertës, pro-faturës, porosisë, fletëdërgesës dhe konvertimit. Për dallimet shihni [Llojet e dokumenteve](../documents/commercial-document-types.md).\n\nTë lidhura: [Klientët](../customers/manage-customers.md), [Produktet](../products/manage-products.md), [Pagesa](../payments/record-customer-payment.md), [PDF-ja](./pdf-sharing-and-printing.md).",
    "links": [
      {
        "text": "Llojet e dokumenteve",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "Klientët",
        "href": "../customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Produktet",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Pagesa",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      },
      {
        "text": "PDF-ja",
        "href": "./pdf-sharing-and-printing.md",
        "targetId": "invoices/pdf-sharing-and-printing"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "customers/manage-customers",
      "products/manage-products",
      "payments/record-customer-payment",
      "invoices/pdf-sharing-and-printing"
    ]
  },
  {
    "id": "invoices/invoice-detail-and-statuses",
    "language": "en",
    "category": "invoices",
    "title": "Invoice detail, statuses, and corrections",
    "description": "Understand invoice detail actions, commercial statuses, payments, related documents, and immutable corrections.",
    "keywords": [
      "invoice detail",
      "invoice status",
      "paid",
      "overdue",
      "credit note",
      "debit note"
    ],
    "content": "# Invoice detail, statuses, and corrections\n\nOpen an invoice from **Sales**, **Invoices**, the Home activity list, or a customer detail screen. The detail view loads the customer, line items, payments, source links, linked documents, and commercial timeline when those records exist.\n\n## Actions\n\nThe overflow menu can expose actions according to type and status:\n\n- edit a draft or otherwise editable operational document;\n- preview the document;\n- share or print a PDF;\n- record a payment;\n- convert to an allowed next document;\n- change a supported commercial status;\n- create a credit note or debit note from an invoice-type document;\n- duplicate as a new draft;\n- delete a draft when the backend permission and immutable checks allow it;\n- open related documents.\n\nIssued financial documents are not silently deleted or rewritten. The database includes immutable/issued fields and the app checks the commercial status and accounting state before allowing destructive actions.\n\n## Statuses\n\nThe shared domain defines type-specific statuses. Common invoice statuses are:\n\n- **Draft** — being prepared;\n- **Issued** — financial document has been issued/posted by the relevant flow;\n- **Partially paid** — some payment has been allocated;\n- **Paid** — allocated payment reaches the payable amount;\n- **Overdue** — the document is past due according to the status data;\n- **Credited** or **Partially credited** — a credit correction is linked;\n- **Cancelled/Corrected** — a correction/cancellation state represented by the backend.\n\nQuotes, proformas, orders, and delivery notes use different status sets. Do not infer their state from the invoice status label; see [Commercial document types](../documents/commercial-document-types.md).\n\n## Payments and balance\n\nThe detail page reads payment rows for the invoice and can open **Record payment**. A payment may be posted first and allocated to an invoice in a separate operation. If allocation reports a warning, check both the payment list and invoice balance before retrying.\n\n## Related documents and timeline\n\nThe **Related documents** section follows source links such as quote → order → delivery note → invoice, proforma → advance/final invoice, and invoice → credit/debit note. The timeline shows database events when present. An email compose action is not proof that the message was delivered, opened, or legally accepted.\n\n## Corrections\n\nTo correct an issued invoice:\n\n1. Open the original invoice.\n2. Open the overflow menu.\n3. Choose **Create Credit Note** or **Create Debit Note** when offered.\n4. Keep the original invoice unchanged.\n5. Review the new document and its original-document reference.\n\nCredit/debit note behavior is implemented through the shared commercial-document domain and backend accounting functions. Use the current company procedure for reasons, VAT treatment, and approval; this user guide does not make an independent legal determination.\n\n## Delete behavior\n\nDelete is intended for drafts and is guarded by permissions. Issued or posted financial records are expected to remain traceable. If the delete action is missing, the status, accounting state, or company permission is preventing it.\n\nRelated: [Record a payment](../payments/record-customer-payment.md), [Conversions](../documents/conversions-and-related-documents.md), [PDF actions](./pdf-sharing-and-printing.md).",
    "links": [
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "Record a payment",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      },
      {
        "text": "Conversions",
        "href": "../documents/conversions-and-related-documents.md",
        "targetId": "documents/conversions-and-related-documents"
      },
      {
        "text": "PDF actions",
        "href": "./pdf-sharing-and-printing.md",
        "targetId": "invoices/pdf-sharing-and-printing"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/record-customer-payment",
      "documents/conversions-and-related-documents",
      "invoices/pdf-sharing-and-printing"
    ]
  },
  {
    "id": "invoices/invoice-detail-and-statuses",
    "language": "sq",
    "category": "invoices",
    "title": "Detajet, statuset dhe korrigjimi i faturës",
    "description": "Kuptoni veprimet e detajit, statuset, pagesat, dokumentet e lidhura dhe korrigjimet e pandryshueshme.",
    "keywords": [
      "detaj i faturës",
      "status faturë",
      "paguar",
      "vonuar",
      "notë krediti",
      "notë debiti"
    ],
    "content": "# Detajet, statuset dhe korrigjimi i faturës\n\nHapeni faturën nga **Sales**, lista e faturave, aktiviteti në Kreu ose detaji i klientit. Detaji ngarkon klientin, rreshtat, pagesat, dokumentet burimore, dokumentet e lidhura dhe ngjarjet kur ekzistojnë.\n\n## Veprimet\n\nMenyja e veprimeve mund të ofrojë ndryshimin, pamjen paraprake, PDF-në, printimin, regjistrimin e pagesës, konvertimin, statusin, notën e kreditit/debitit, kopjimin si draft dhe fshirjen e draftit kur lejohet. Dokumentet financiare të lëshuara nuk fshihen ose ndryshohen në heshtje.\n\n## Statuset e zakonshme\n\n- **Draft** — dokumenti po përgatitet;\n- **Issued** — dokumenti është lëshuar/postuar nga rrjedha përkatëse;\n- **Partially paid** — është alokuar një pjesë e pagesës;\n- **Paid** — pagesa e alokuar mbulon shumën;\n- **Overdue** — status i vonuar sipas të dhënave;\n- **Credited / Partially credited** — është lidhur korrigjimi;\n- **Cancelled/Corrected** — gjendje korrigjimi/anulimi nga backend-i.\n\nOfertat, pro-faturat, porositë dhe fletëdërgesat kanë statuse të tjera. Shihni [Llojet e dokumenteve](../documents/commercial-document-types.md).\n\n## Pagesat dhe bilanci\n\nDetaji lexon rreshtat e pagesave dhe hap **Record payment**. Pagesa mund të postohet dhe të alokohet në dy veprime të ndara. Nëse del paralajmërim, kontrolloni listën e pagesave dhe bilancin e faturës.\n\n## Dokumentet e lidhura dhe aktiviteti\n\n**Related documents** mund të tregojë ofertë → porosi → fletëdërgesë → faturë, pro-faturë → paradhënie/faturë përfundimtare dhe faturë → notë krediti/debiti. Kompozimi i emailit nuk provon dërgim, hapje ose pranim ligjor.\n\n## Korrigjimi\n\n1. Hapni faturën origjinale.\n2. Hapni menynë e veprimeve.\n3. Zgjidhni **Create Credit Note** ose **Create Debit Note** kur ofrohet.\n4. Mos ndryshoni faturën origjinale.\n5. Kontrolloni lidhjen me dokumentin origjinal.\n\nArsyet dhe trajtimi tatimor duhet të ndiqen sipas procedurës së kompanisë; kjo faqe nuk jep interpretim të pavarur ligjor.",
    "links": [
      {
        "text": "Llojet e dokumenteve",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "payments/record-customer-payment",
      "documents/conversions-and-related-documents",
      "invoices/pdf-sharing-and-printing"
    ]
  },
  {
    "id": "invoices/pdf-sharing-and-printing",
    "language": "en",
    "category": "invoices",
    "title": "Preview, share, email, and print a document PDF",
    "description": "Learn how OperiX Invoice Mobile prepares invoice and transaction PDFs and shares them from the device.",
    "keywords": [
      "PDF",
      "preview invoice",
      "share invoice",
      "print invoice",
      "email invoice"
    ],
    "content": "# Preview, share, email, and print a document PDF\n\n## Preview\n\n1. Open an invoice or commercial document.\n2. Choose **Preview** or open the automatic preview after saving.\n3. Review the document in the in-app web view.\n\nThe detail screen builds `InvoiceData` from company, customer, document, line, payment, branding, and bank fields. The current preview path uses the corporate template adapter. The PDF service also contains a thermal/receipt path for receipt-sized output.\n\n## Share or download through the device\n\n1. Open the document detail screen.\n2. Choose **Share PDF**.\n3. Select an installed device destination such as Files, Mail, Messages, or another share target.\n\nThe app creates a temporary PDF with Expo Print and opens the native sharing sheet through Expo Sharing. The app does not provide a separate in-app document-storage library.\n\n## Email\n\nThe email action requires a customer email address and uses the device mail composer. It attaches the generated PDF when the platform supports it. A compose action does not prove delivery, opening, or customer acceptance; the current mobile source does not provide a delivery-tracking service for this action.\n\n## Print\n\nChoose **Print** from the detail actions. The app first generates the PDF and then invokes the platform print dialog. A thermal print helper is also present for receipt-oriented output.\n\n## Document identity and sensitive fields\n\nThe template receives the explicit commercial document type and label. For quote, proforma, order, and delivery-note documents, the detail data path hides fiscal identifiers. Do not manually rename a PDF heading and assume that it changes the stored type. See [Commercial document types](../documents/commercial-document-types.md).\n\nCompany branding and payment information come from [company settings](../settings/preferences-and-templates.md): logo, company information, signature/stamp, bank name, IBAN, SWIFT, and payment links where configured. Do not place secrets or private API keys in a document template.\n\n## If PDF generation fails\n\nCheck that the document has a valid company/customer context and at least one line, retry with network/device storage available, and try the system share/print action again. If the problem persists, capture the document ID and contact support; see [Troubleshooting](../troubleshooting/common-problems.md).",
    "links": [
      {
        "text": "Commercial document types",
        "href": "../documents/commercial-document-types.md",
        "targetId": "documents/commercial-document-types"
      },
      {
        "text": "company settings",
        "href": "../settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      },
      {
        "text": "Troubleshooting",
        "href": "../troubleshooting/common-problems.md",
        "targetId": "troubleshooting/common-problems"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "invoices/invoice-detail-and-statuses",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "invoices/pdf-sharing-and-printing",
    "language": "sq",
    "category": "invoices",
    "title": "Pamja paraprake, shpërndarja dhe printimi i PDF-së",
    "description": "Mësoni si krijohen dhe shpërndahen PDF-të e faturave dhe transaksioneve.",
    "keywords": [
      "PDF",
      "pamje paraprake",
      "shpërndaj faturën",
      "printo faturën",
      "email faturë"
    ],
    "content": "# Pamja paraprake, shpërndarja dhe printimi i PDF-së\n\n## Pamja paraprake\n\n1. Hapni detajin e dokumentit.\n2. Zgjidhni **Preview**.\n3. Kontrolloni PDF-në në web view të aplikacionit.\n\nTë dhënat ndërtohen nga kompania, klienti, dokumenti, rreshtat, pagesat, logoja, nënshkrimi, vula dhe banka. Rrjedha aktuale e pamjes paraprake përdor adapterin corporate; shërbimi ka edhe sjellje thermal/receipt.\n\n## Shpërndarja\n\nZgjidhni **Share PDF** dhe përdorni menynë e sistemit për Files, Mail, Messages ose destinacion tjetër. PDF-ja krijohet me Expo Print dhe ndahet me Expo Sharing.\n\n## Emaili dhe printimi\n\nEmaili kërkon email të klientit dhe përdor kompozuesin e emailit të pajisjes. Kjo nuk provon dërgimin ose hapjen. **Print** hap dialogun e printimit pas krijimit të PDF-së; ekziston edhe ndihmë për format thermal.\n\n## Identiteti i dokumentit\n\nPDF-ja merr llojin e qartë të dokumentit. Për ofertë, pro-faturë, porosi dhe fletëdërgesë rrjedha e detajit fsheh identifikuesit fiskalë. Ndryshimi i një titulli në PDF nuk e ndryshon llojin e ruajtur.\n\nLogoja, informacioni i kompanisë, nënshkrimi/vula, banka, IBAN-i, SWIFT-i dhe lidhjet e pagesës vijnë nga [Cilësimet](../settings/preferences-and-templates.md).\n\nNëse PDF-ja dështon, kontrolloni kompaninë, rreshtat dhe lidhjen e pajisjes; më pas provoni përsëri dhe dërgoni ID-në e dokumentit te mbështetja.",
    "links": [
      {
        "text": "Cilësimet",
        "href": "../settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "invoices/invoice-detail-and-statuses",
      "settings/preferences-and-templates"
    ]
  },
  {
    "id": "invoices/qr-scanner",
    "language": "en",
    "category": "invoices",
    "title": "QR and barcode scanner",
    "description": "Understand the QR/barcode scanner entry points used by invoice, product, and purchase flows.",
    "keywords": [
      "QR scanner",
      "barcode",
      "scan invoice",
      "SKU"
    ],
    "content": "# QR and barcode scanner\n\nThe app registers a modal `QRScanner` route. The calling screen supplies a mode and, in some flows, the screen to return to.\n\n## Invoice/document QR\n\nThe invoice list/detail flow can open the scanner to inspect invoice QR data. The scanner must receive a supported code and return to the requesting flow. It is not documented as a universal fiscal-receipt verifier; live fiscalization is disabled in the current app configuration.\n\n## Product SKU/barcode\n\nProduct creation can open the scanner to populate a SKU. Products list screens also expose barcode scanning for product lookup. Confirm the returned value before saving because the scanner is an input helper, not a stock adjustment.\n\n## Purchase-bill scanning\n\nThe purchase flow can open **Scan bill** and pass scanned data to the supplier-bill form. The current form uses recognized vendor, bill number, date, and line values when they are present; unrecognized values still require manual review.\n\nRelated: [Products](../products/manage-products.md), [Supplier bills](../company/suppliers-and-bills.md), [Fiscalization status](../fiscalization/status-and-eligibility.md).",
    "links": [
      {
        "text": "Products",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Supplier bills",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      },
      {
        "text": "Fiscalization status",
        "href": "../fiscalization/status-and-eligibility.md",
        "targetId": "fiscalization/status-and-eligibility"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "company/suppliers-and-bills",
      "fiscalization/status-and-eligibility"
    ]
  },
  {
    "id": "invoices/qr-scanner",
    "language": "sq",
    "category": "invoices",
    "title": "Skaneri QR dhe barkodit",
    "description": "Kuptoni hyrjet e skanerit që përdoren për faturat, produktet dhe blerjet.",
    "keywords": [
      "skaner QR",
      "barkod",
      "skano faturën",
      "SKU"
    ],
    "content": "# Skaneri QR dhe barkodit\n\nAplikacioni ka rrugën modale `QRScanner`. Ekrani thirrës i dërgon mënyrën dhe, në disa rrjedha, ekranin ku duhet të kthehet.\n\n## QR për faturë/dokument\n\nLista ose detaji i faturës mund të hapë skanerin për të lexuar të dhëna të QR-së. Ky nuk dokumentohet si verifikues universal i kuponëve fiskalë; fiskalizimi i prodhimit është i çaktivizuar në konfigurimin aktual.\n\n## SKU dhe barkod produkti\n\nFormulari i produktit mund të plotësojë SKU-në me skaner. Lista e produkteve mund të kërkojë/skanojë barkodin. Kontrolloni vlerën para ruajtjes; skaneri nuk ndryshon stokun.\n\n## Fatura e blerjes\n\n**Scan bill** mund të kalojë emrin e furnitorit, numrin, datën dhe rreshtat te formulari i faturës së furnitorit. Vlerat e panjohura duhet të kontrollohen manualisht.\n\nTë lidhura: [Produktet](../products/manage-products.md), [Faturat e furnitorëve](../company/suppliers-and-bills.md), [Fiskalizimi](../fiscalization/status-and-eligibility.md).",
    "links": [
      {
        "text": "Produktet",
        "href": "../products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Faturat e furnitorëve",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      },
      {
        "text": "Fiskalizimi",
        "href": "../fiscalization/status-and-eligibility.md",
        "targetId": "fiscalization/status-and-eligibility"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "company/suppliers-and-bills",
      "fiscalization/status-and-eligibility"
    ]
  },
  {
    "id": "mobile-guide",
    "language": "en",
    "category": "getting-started",
    "title": "OperiX Invoice Mobile user guide",
    "description": "User guide for the current OperiX Invoice Mobile application.",
    "keywords": [
      "OperiX Invoice Mobile",
      "invoices",
      "customers",
      "payments"
    ],
    "content": "# OperiX Invoice Mobile user guide\n\nOperiX Invoice Mobile is an authenticated, multi-company workspace for invoices, commercial documents, customers, products, payments, expenses, purchasing, reports, and related business controls.\n\n## Start here\n\n- [Sign in, register, verify email, or join a team](./getting-started/sign-in-and-account.md)\n- [Home dashboard](./dashboard/home.md)\n- [Create and edit an invoice](./invoices/create-and-edit.md)\n- [Open an invoice, change its status, and correct it](./invoices/invoice-detail-and-statuses.md)\n- [Create a customer](./customers/manage-customers.md)\n- [Create a product or service](./products/manage-products.md)\n\n## Main navigation\n\nThe authenticated app has five bottom tabs:\n\n1. **Home** — dashboard metrics, quick actions, and recent activity.\n2. **Sales** — commercial documents and the shared document trail.\n3. **Invoice** — the point-of-sale product and cart flow.\n4. **Business** — products, inventory, expenses, vendors, and income shortcuts.\n5. **More** — accounting, reports, taxes, purchases, payroll for permitted roles, contracts, company management, integrations, settings, support, and about.\n\nThe app also opens detail and form screens from these tabs. The complete internal route inventory is maintained in the developer documentation outside the mobile Help Center.\n\n## Status notation\n\nPages distinguish between a feature implemented in the mobile code and a feature that is partial, compatibility-only, developer-only, or disabled. Do not interpret a screen being visible as proof that a legal, accounting, or fiscal service is enabled for a tenant.\n\n## Language and currency\n\nThe application supports English (`en`) and Albanian (`sq`). The language setting is persisted locally. EUR is the default currency in the current mobile forms; shared formatting code also recognizes USD, GBP, JPY, CAD, AUD, CHF, CNY, and INR. See [Preferences and templates](./settings/preferences-and-templates.md).",
    "links": [
      {
        "text": "Sign in, register, verify email, or join a team",
        "href": "./getting-started/sign-in-and-account.md",
        "targetId": "getting-started/sign-in-and-account"
      },
      {
        "text": "Home dashboard",
        "href": "./dashboard/home.md",
        "targetId": "dashboard/home"
      },
      {
        "text": "Create and edit an invoice",
        "href": "./invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Open an invoice, change its status, and correct it",
        "href": "./invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Create a customer",
        "href": "./customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Create a product or service",
        "href": "./products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Preferences and templates",
        "href": "./settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "getting-started/sign-in-and-account",
      "dashboard/home",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "mobile-guide",
    "language": "sq",
    "category": "getting-started",
    "title": "Udhëzuesi i përdorimit për OperiX Invoice Mobile",
    "description": "Udhëzuesi i përdorimit për versionin aktual të aplikacionit OperiX Invoice Mobile.",
    "keywords": [
      "OperiX Invoice Mobile",
      "faturat",
      "klientët",
      "pagesat"
    ],
    "content": "# Udhëzuesi i përdorimit për OperiX Invoice Mobile\n\nOperiX Invoice Mobile është një hapësirë e autentikuar për biznese me shumë kompani, për faturat, dokumentet tregtare, klientët, produktet, pagesat, shpenzimet, blerjet, raportet dhe kontrollet e tjera të biznesit.\n\n## Filloni këtu\n\n- [Hyrja, regjistrimi, verifikimi i emailit dhe bashkimi në ekip](./getting-started/sign-in-and-account.md)\n- [Paneli kryesor](./dashboard/home.md)\n- [Krijimi dhe ndryshimi i një fature](./invoices/create-and-edit.md)\n- [Hapja e faturës, statuset dhe korrigjimi](./invoices/invoice-detail-and-statuses.md)\n- [Krijimi i klientit](./customers/manage-customers.md)\n- [Krijimi i produktit ose shërbimit](./products/manage-products.md)\n\n## Navigimi kryesor\n\nAplikacioni i autentikuar ka pesë skeda në pjesën e poshtme:\n\n1. **Kreu** — matjet e panelit, veprimet e shpejta dhe aktiviteti i fundit.\n2. **Shitjet** — dokumentet tregtare dhe gjurma e përbashkët e dokumenteve.\n3. **Faturë** — rrjedha e pikës së shitjes me produkte dhe shportë.\n4. **Biznesi** — shkurtoret për produktet, inventarin, shpenzimet, furnitorët dhe të hyrat.\n5. **Më shumë** — kontabiliteti, raportet, tatimet, blerjet, pagat për rolet e lejuara, kontratat, menaxhimi i kompanisë, integrimet, cilësimet, mbështetja dhe informacioni.\n\nDetajet dhe formularët hapen nga këto skeda. Lista e plotë e rrugëve të brendshme mbahet në dokumentacionin e zhvilluesve, jashtë Help Center-it mobil.\n\n## Shënim për statuset\n\nFaqet dallojnë mes funksioneve të implementuara në kodin mobil dhe funksioneve të pjesshme, të pajtueshmërisë, të zhvilluesit ose të çaktivizuara. Prania e një ekrani nuk dëshmon se një shërbim ligjor, kontabël ose fiskal është aktiv për kompaninë.\n\n## Gjuha dhe valuta\n\nAplikacioni mbështet anglishten (`en`) dhe shqipen (`sq`). Cilësimi i gjuhës ruhet lokalisht. EUR është valuta e parazgjedhur në formularët aktualë mobilë; kodi i përbashkët njeh edhe USD, GBP, JPY, CAD, AUD, CHF, CNY dhe INR. Shihni [Preferencat dhe modelet](./settings/preferences-and-templates.md).",
    "links": [
      {
        "text": "Hyrja, regjistrimi, verifikimi i emailit dhe bashkimi në ekip",
        "href": "./getting-started/sign-in-and-account.md",
        "targetId": "getting-started/sign-in-and-account"
      },
      {
        "text": "Paneli kryesor",
        "href": "./dashboard/home.md",
        "targetId": "dashboard/home"
      },
      {
        "text": "Krijimi dhe ndryshimi i një fature",
        "href": "./invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Hapja e faturës, statuset dhe korrigjimi",
        "href": "./invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Krijimi i klientit",
        "href": "./customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Krijimi i produktit ose shërbimit",
        "href": "./products/manage-products.md",
        "targetId": "products/manage-products"
      },
      {
        "text": "Preferencat dhe modelet",
        "href": "./settings/preferences-and-templates.md",
        "targetId": "settings/preferences-and-templates"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "getting-started/sign-in-and-account",
      "dashboard/home",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "notifications/alerts-and-device-actions",
    "language": "en",
    "category": "notifications",
    "title": "Notifications, alerts, and device actions",
    "description": "Understand the alerts, mail composer, share sheet, and notification capabilities currently present in mobile source.",
    "keywords": [
      "notifications",
      "alerts",
      "reminders",
      "email",
      "share sheet"
    ],
    "content": "# Notifications, alerts, and device actions\n\nThe mobile app uses in-app alerts for validation, confirmation, errors, sign-out, company changes, and completed actions. It also uses platform actions for:\n\n- email composition through Expo Mail Composer;\n- PDF/document sharing through Expo Sharing;\n- printing through Expo Print;\n- browser links for support, registry, OAuth, and website pages.\n\n## What is not currently documented as active\n\nThe audited mobile source contains no complete push-notification registration, token lifecycle, foreground handler, or reminder scheduler. An email compose success is not a delivery receipt, and opening a help link is not a notification subscription.\n\nIf a user expects an overdue reminder or push alert, check the account/company process and the backend notification work separately. Push notification registration is not documented as an available mobile workflow.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "settings/help-and-about",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "notifications/alerts-and-device-actions",
    "language": "sq",
    "category": "notifications",
    "title": "Njoftimet, alarmet dhe veprimet e pajisjes",
    "description": "Kuptoni alarmet, emailin, share sheet dhe aftësitë e njoftimeve në kodin mobil.",
    "keywords": [
      "njoftime",
      "alarme",
      "kujtesa",
      "email",
      "share sheet"
    ],
    "content": "# Njoftimet, alarmet dhe veprimet e pajisjes\n\nAplikacioni përdor alarme brenda aplikacionit për validim, konfirmim, gabime, dalje, ndryshim kompanie dhe përfundim veprimesh. Përdor edhe email composer, ndarjen e PDF-së, printimin dhe lidhjet e shfletuesit.\n\nNë kodin mobil nuk u gjetën regjistrimi i plotë për push notifications, token lifecycle, handler-i në foreground ose planifikues kujtesash. Kompozimi i emailit nuk është dëshmi e dërgimit. Për pritje të njoftimit të vonesës kontrolloni procesin e kompanisë/backend-in veçmas.\n\nRegjistrimi i njoftimeve push nuk dokumentohet si rrjedhë e disponueshme në aplikacionin mobil.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "settings/help-and-about",
      "troubleshooting/common-problems"
    ]
  },
  {
    "id": "payments/record-customer-payment",
    "language": "en",
    "category": "payments",
    "title": "Record a customer payment",
    "description": "Record cash, bank, or card payments and optionally allocate them to an invoice.",
    "keywords": [
      "customer payment",
      "partial payment",
      "payment allocation",
      "cash",
      "bank transfer",
      "card"
    ],
    "content": "# Record a customer payment\n\n## Create a payment\n\n1. Open **More > Money** or choose **Record payment** from a customer or invoice.\n2. Enter or review the payment number.\n3. Select the customer.\n4. Optionally select an unpaid invoice.\n5. Enter the amount. It must be greater than zero.\n6. Select **Cash**, **Bank**, or **Card**.\n7. For bank payments, enter the bank reference when available.\n8. Set the payment date and add notes if needed.\n9. Save the payment.\n\nWhen an invoice is selected, the form calls the customer-payment posting RPC and then an allocation RPC. The invoice status/balance changes only when the allocation succeeds. A warning can therefore mean that the payment exists but is not linked to the invoice yet.\n\n## Partial and full payments\n\nEnter only the amount actually received for a partial payment. Repeat the process for later payments. The invoice detail reads payment rows and the backend allocation state; use the invoice and payment lists together to verify the remaining balance.\n\n## Fields\n\n| Field | Meaning | Current behavior |\n|---|---|---|\n| Payment number | Reference for the payment | Form proposes a `PAY-` number based on the current count and permits editing |\n| Payment date | Date received | Defaults to the current date string |\n| Customer | Payer/customer | Required |\n| Invoice | Invoice to allocate | Optional; list shows unpaid invoices for the selected customer |\n| Amount | Amount received | Required and must be positive |\n| Method | Cash, bank, or card | Required selection in the form |\n| Bank reference | Transfer/reference number | Shown for bank method |\n| Notes | Additional description | Optional |\n\nThe posting path selects a company settlement account (cash or bank) and uses an idempotency key for the RPC call. The app then shares a transaction PDF in the completed flow when the platform permits it.\n\n## Payment history\n\n**Payments** lists recorded customer payments and totals for the current workspace. Open a payment to edit where the screen allows it. Refunds were not found as a dedicated mobile workflow.\n\nRelated: [Invoice statuses](../invoices/invoice-detail-and-statuses.md), [Customer detail](../customers/manage-customers.md), [Vendor payments](./vendor-payments.md).",
    "links": [
      {
        "text": "Invoice statuses",
        "href": "../invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Customer detail",
        "href": "../customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Vendor payments",
        "href": "./vendor-payments.md",
        "targetId": "payments/vendor-payments"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/invoice-detail-and-statuses",
      "customers/manage-customers",
      "payments/vendor-payments"
    ]
  },
  {
    "id": "payments/record-customer-payment",
    "language": "sq",
    "category": "payments",
    "title": "Regjistrimi i pagesës së klientit",
    "description": "Regjistroni pagesa me para në dorë, bankë ose kartë dhe alokojini te një faturë.",
    "keywords": [
      "pagesë klienti",
      "pagesë e pjesshme",
      "alokim pagese",
      "para në dorë",
      "bankë",
      "kartë"
    ],
    "content": "# Regjistrimi i pagesës së klientit\n\n## Krijoni pagesë\n\n1. Hapni **More > Money** ose **Record payment** nga klienti/fatura.\n2. Kontrolloni numrin e pagesës.\n3. Zgjidhni klientin.\n4. Zgjidhni faturën e papaguar nëse pagesa duhet të alokohet.\n5. Vendosni shumën; duhet të jetë më e madhe se zero.\n6. Zgjidhni **Cash**, **Bank** ose **Card**.\n7. Për bankë vendosni referencën.\n8. Vendosni datën dhe shënimet.\n9. Ruajeni.\n\nRrjedha poston pagesën dhe pastaj thërret alokimin. Statusi i faturës ndryshon vetëm kur alokimi kryhet. Nëse shfaqet paralajmërim, pagesa mund të ekzistojë por të mos jetë lidhur me faturën.\n\n## Pagesë e pjesshme ose e plotë\n\nVendosni vetëm shumën e pranuar për pagesë të pjesshme. Përsëriteni për pagesat e tjera dhe kontrolloni bilancin e mbetur në detajin e faturës.\n\n## Fushat\n\n| Fusha | Kuptimi | Sjellja aktuale |\n|---|---|---|\n| Numri i pagesës | Referenca | Sugjerohet si `PAY-` sipas numërimit aktual dhe mund të ndryshohet |\n| Data e pagesës | Data e pranimit | Parazgjedhje është data e sotme |\n| Klienti | Paguesi | E detyrueshme |\n| Fatura | Fatura ku alokohet | Opsionale |\n| Shuma | Shuma e pranuar | E detyrueshme dhe pozitive |\n| Metoda | Para, bankë ose kartë | Zgjedhje e detyrueshme |\n| Referenca bankare | Numër/tekst transferi | Shfaqet për bankë |\n| Shënimet | Përshkrim shtesë | Opsionale |\n\nLista e pagesave tregon historikun dhe totalet e hapësirës. Rimbursim i veçantë mobil nuk u gjet.\n\nTë lidhura: [Statuset e faturës](../invoices/invoice-detail-and-statuses.md), [Klientët](../customers/manage-customers.md), [Pagesat e furnitorëve](./vendor-payments.md).",
    "links": [
      {
        "text": "Statuset e faturës",
        "href": "../invoices/invoice-detail-and-statuses.md",
        "targetId": "invoices/invoice-detail-and-statuses"
      },
      {
        "text": "Klientët",
        "href": "../customers/manage-customers.md",
        "targetId": "customers/manage-customers"
      },
      {
        "text": "Pagesat e furnitorëve",
        "href": "./vendor-payments.md",
        "targetId": "payments/vendor-payments"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/invoice-detail-and-statuses",
      "customers/manage-customers",
      "payments/vendor-payments"
    ]
  },
  {
    "id": "payments/vendor-payments",
    "language": "en",
    "category": "payments",
    "title": "Vendor payments and supplier balances",
    "description": "Record supplier payments and open vendor payment history in OperiX Invoice Mobile.",
    "keywords": [
      "vendor payment",
      "supplier payment",
      "vendor ledger",
      "payables"
    ],
    "content": "# Vendor payments and supplier balances\n\nOpen **More > Purchases** for supplier bills and vendor actions, or open **More > Money** and choose the vendor-payment list where available.\n\n## Record a vendor payment\n\n1. Open **Vendor payments**.\n2. Tap the add action.\n3. Select a vendor.\n4. Enter payment number, date, amount, and method.\n5. Add bank reference or notes when needed.\n6. Save.\n\nThe shared types support cash, bank, and card. The accounting completion migrations include a supplier-payment posting path with company permission checks; a tenant must have the relevant backend capability and role permission.\n\n## Vendor ledger\n\nOpen a vendor and choose the ledger to inspect supplier activity. The exact totals depend on the supplier-bill and payment records visible to the current company scope.\n\n## Limitations\n\nThe mobile code does not provide a full supplier settlement/reconciliation workbench or a refund workflow. For the bill itself, see [Suppliers and supplier bills](../company/suppliers-and-bills.md).",
    "links": [
      {
        "text": "Suppliers and supplier bills",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/suppliers-and-bills",
      "reports/financial-reports"
    ]
  },
  {
    "id": "payments/vendor-payments",
    "language": "sq",
    "category": "payments",
    "title": "Pagesat e furnitorëve dhe bilancet",
    "description": "Regjistroni pagesa të furnitorëve dhe hapni historikun e tyre.",
    "keywords": [
      "pagesë furnitori",
      "furnizues",
      "ledger furnitori",
      "detyrime"
    ],
    "content": "# Pagesat e furnitorëve dhe bilancet\n\nHapni **More > Purchases** për faturat e furnitorëve ose listën e pagesave të furnitorëve kur ajo është e disponueshme.\n\n## Regjistroni pagesë\n\n1. Hapni **Vendor payments**.\n2. Shtypni shtimin.\n3. Zgjidhni furnitorin.\n4. Vendosni numrin, datën, shumën dhe metodën.\n5. Shtoni referencën bankare ose shënime.\n6. Ruajeni.\n\nLlojet e përbashkëta mbështesin para në dorë, bankë dhe kartë. Migrimet kontabël kanë rrjedhë për postimin e pagesës së furnitorit me kontroll lejesh.\n\n## Ledger-i dhe kufizimet\n\nLedger-i hapet nga furnitori dhe shfaq aktivitetin që lejohet në kompaninë aktuale. Nuk u gjet një hapësirë e plotë mobile për barazim furnitori ose rimbursime. Për faturën shihni [Furnitorët dhe faturat](../company/suppliers-and-bills.md).",
    "links": [
      {
        "text": "Furnitorët dhe faturat",
        "href": "../company/suppliers-and-bills.md",
        "targetId": "company/suppliers-and-bills"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/suppliers-and-bills",
      "reports/financial-reports"
    ]
  },
  {
    "id": "pos/point-of-sale",
    "language": "en",
    "category": "pos",
    "title": "Point of sale",
    "description": "Build a product cart, choose a customer and payment intent, and send the sale through the invoice checkout flow.",
    "keywords": [
      "POS",
      "point of sale",
      "cart",
      "checkout",
      "held order"
    ],
    "content": "# Point of sale\n\nOpen the **Invoice** bottom tab to open the POS screen. The tab label is invoice because a completed POS cart is sent through the invoice workflow.\n\n## Start a sale\n\n1. Search products or select a category.\n2. Tap a product to add it to the cart.\n3. Use plus/minus controls to change quantity.\n4. Open the customer picker and select a customer or **Citizen**.\n5. Review the cart total.\n6. Choose a payment intent: cash, card, debt, or other.\n7. Continue to the invoice form.\n8. Review the invoice, customer, taxes, and payment data.\n9. Save/create the invoice.\n\nThe POS screen itself does not complete a standalone receipt. `InvoiceFormScreen` receives the cart, customer, payment method, and an idempotency key; the invoice save path then calls the stock-tracked invoice RPC.\n\n## Stock and totals\n\nTracked products use their stock quantity to limit additions. The POS cart total is calculated from quantity × unit price. Tax and invoice totals are handled in the subsequent invoice form; review the final invoice rather than treating the cart total as the complete tax calculation.\n\n## Hold and restore\n\nThe screen can hold a cart and restore it while the screen remains mounted. The audited mobile implementation stores held orders in React state. It does not persist them to device storage or call the backend persisted-held-order functions, so a reload or unmount can lose them.\n\n## Not found as complete mobile POS features\n\nNo complete mobile cashier shift/register close, cash drawer reconciliation, return/refund screen, receipt printer setup, or offline queue was found. Backend migrations contain POS/idempotency concepts; the mobile screen must still be treated as the source of the current user-visible behavior.\n\nRelated: [Inventory](../inventory/stock-and-low-stock.md), [Create an invoice](../invoices/create-and-edit.md), [Payments](../payments/record-customer-payment.md).",
    "links": [
      {
        "text": "Inventory",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "Create an invoice",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Payments",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "inventory/stock-and-low-stock",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "pos/point-of-sale",
    "language": "sq",
    "category": "pos",
    "title": "Pika e shitjes",
    "description": "Ndërtoni shportën, zgjidhni klientin dhe mënyrën e pagesës dhe dërgojeni shitjen në rrjedhën e faturës.",
    "keywords": [
      "POS",
      "pikë shitjeje",
      "shportë",
      "arkë",
      "porosi e mbajtur"
    ],
    "content": "# Pika e shitjes\n\nSkeda e poshtme **Invoice** hap POS-in, sepse shporta e përfunduar kalon në rrjedhën e faturës.\n\n## Nisni shitjen\n\n1. Kërkoni produkt ose zgjidhni kategori.\n2. Shtypni produktin për ta shtuar.\n3. Përdorni plus/minus për sasinë.\n4. Zgjidhni klientin ose **Qytetar**.\n5. Kontrolloni totalin e shportës.\n6. Zgjidhni cash, card, debt ose other.\n7. Vazhdoni në formularin e faturës.\n8. Kontrolloni klientin, taksat dhe pagesën.\n9. Ruajeni/krijoni faturën.\n\nPOS-i nuk krijon vetë një kupon të pavarur. `InvoiceFormScreen` merr shportën, klientin, metodën dhe idempotency key dhe rrjedha e ruajtjes thërret RPC-në e faturës me stok.\n\n## Stoku dhe totali\n\nProduktet e ndjekura kufizojnë sasinë. Totali i shportës është sasi × çmim; tatimi dhe totali final përpunohen në formularin e faturës. Kontrolloni faturën finale.\n\n## Mbajtja e shportës\n\nShporta mund të mbahet dhe rikthehet sa kohë ekrani është i hapur. Kodi aktual e ruan në state të React-it. Rinisja ose çmontimi i ekranit mund ta humbë atë; nuk u gjet thirrje nga ky ekran për radhë offline të qëndrueshme.\n\nNuk u gjetën rrjedha të plota mobile për mbyllje turni arke, barazim sirtari, kthime, rimbursime ose printer kuponësh.\n\nTë lidhura: [Inventari](../inventory/stock-and-low-stock.md), [Fatura](../invoices/create-and-edit.md), [Pagesat](../payments/record-customer-payment.md).",
    "links": [
      {
        "text": "Inventari",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "Fatura",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      },
      {
        "text": "Pagesat",
        "href": "../payments/record-customer-payment.md",
        "targetId": "payments/record-customer-payment"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "partial",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "products/manage-products",
      "inventory/stock-and-low-stock",
      "invoices/create-and-edit"
    ]
  },
  {
    "id": "products/manage-products",
    "language": "en",
    "category": "products",
    "title": "Manage products and services",
    "description": "Create catalog items, configure prices and VAT, track stock, and select products during invoicing.",
    "keywords": [
      "product",
      "service",
      "SKU",
      "barcode",
      "stock",
      "VAT"
    ],
    "content": "# Manage products and services\n\n## Create a product or service\n\n1. Open **Business > Products**.\n2. Tap **Add product**.\n3. Enter the name.\n4. Add description, SKU/barcode, category, unit, selling price, tax rate, and whether tax is included.\n5. If inventory is relevant, set stock quantity, **Track stock**, and the low-stock threshold.\n6. Use the advanced import-cost fields only when they apply to your catalog.\n7. Tap **Save**.\n\n## Main fields\n\n| Field | Meaning | Current behavior |\n|---|---|---|\n| Name | Catalog name shown in lists and invoice lines | Required |\n| Description | Additional product/service text | Optional |\n| SKU | Internal stock code | Optional; scanner can populate it |\n| Barcode | Barcode value | Optional; product list can search/scan it |\n| Unit price | Selling price | Required by the validation path; displayed as a money value |\n| Tax rate | Product tax percentage | Copied into invoice lines |\n| Tax included | Whether the stored price includes tax | Stored on the product; review the invoice summary after selection |\n| Unit | pcs, hrs, kg, lbs, mt, ft, l, gal, or unit | Selected from the form’s choices |\n| Category | Service, Product, Subscription, Consulting, or custom category | Used for filtering/organization |\n| Stock quantity | Current quantity value | Used by stock cards and POS availability |\n| Track stock | Enables tracked stock behavior | POS uses it to limit/add stock-aware quantities |\n| Low-stock threshold | Alert/list threshold | Used for low-stock count/status |\n| Import cost fields | Supplier price, discount, transport, customs, excise, import VAT, tariff, origin, and VAT treatment | Optional advanced product-cost data; not a complete landed-cost reporting screen |\n\nVAT treatment choices in the current form include standard 18%, reduced 8%, exempt options, export, reverse charge, and out of scope. Selecting a label does not replace reviewing the applicable tax treatment for the transaction.\n\n## Search, filter, and product detail\n\nThe product list searches name, SKU, barcode, and description; filters by category; and sorts by name, price, or stock. It displays total products, total stock value based on unit price × quantity, low-stock count, and out-of-stock count.\n\nProduct detail shows category, VAT rate, current stock, tracking, SKU/barcode, and an action to create an invoice with the product preselected.\n\n## Delete\n\nThe current list exposes delete rather than a dedicated archive flow. Check dependencies and company policy before deleting a catalog item used by historical documents.\n\nRelated: [Inventory](../inventory/stock-and-low-stock.md), [POS](../pos/point-of-sale.md), [Create an invoice](../invoices/create-and-edit.md).",
    "links": [
      {
        "text": "Inventory",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "POS",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Create an invoice",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "inventory/stock-and-low-stock",
      "pos/point-of-sale"
    ]
  },
  {
    "id": "products/manage-products",
    "language": "sq",
    "category": "products",
    "title": "Menaxhimi i produkteve dhe shërbimeve",
    "description": "Krijoni artikuj, vendosni çmimet dhe TVSH-në, ndiqni stokun dhe përdorni produktet në faturim.",
    "keywords": [
      "produkt",
      "shërbim",
      "SKU",
      "barkod",
      "stok",
      "TVSH"
    ],
    "content": "# Menaxhimi i produkteve dhe shërbimeve\n\n## Krijoni produkt ose shërbim\n\n1. Hapni **Business > Products**.\n2. Shtypni **Add product**.\n3. Vendosni emrin.\n4. Shtoni përshkrim, SKU/barkod, kategori, njësi, çmim dhe normë tatimore.\n5. Nëse ndiqet stoku, vendosni sasinë, **Track stock** dhe pragun e stokut të ulët.\n6. Plotësoni fushat e kostos së importit vetëm kur nevojiten.\n7. Shtypni **Save**.\n\n## Fushat kryesore\n\n| Fusha | Kuptimi | Sjellja aktuale |\n|---|---|---|\n| Emri | Emri në katalog dhe faturë | E detyrueshme |\n| Përshkrimi | Tekst shtesë | Opsional |\n| SKU | Kodi i brendshëm | Opsional; mund të plotësohet me skaner |\n| Barkodi | Vlera e barkodit | Opsional; përdoret në kërkim/skanim |\n| Çmimi për njësi | Çmimi i shitjes | Validimi kërkon vlerë të vlefshme |\n| Norma tatimore | Përqindja e tatimit | Kopjohet në rreshtin e faturës |\n| Tax included | A përfshihet tatimi në çmim | Ruhet te produkti; kontrolloni totalin e faturës |\n| Njësia | pcs, hrs, kg, lbs, mt, ft, l, gal ose unit | Zgjidhet në formular |\n| Kategoria | Service, Product, Subscription, Consulting ose kategori e personalizuar | Përdoret për filtër |\n| Sasia e stokut | Sasia aktuale | Përdoret në listë dhe POS |\n| Track stock | Aktivizon ndjekjen | POS kufizon sasinë e disponueshme |\n| Pragu i stokut të ulët | Pragu i paralajmërimit | Përdoret në numërimin e stokut të ulët |\n| Fushat e importit | Çmimi i furnitorit, transporti, dogana, akciza, TVSH-ja e importit, tarifa dhe origjina | Të avancuara; nuk janë raport i plotë i kostos |\n\nTrajtimet e TVSH-së në formular përfshijnë standard 18%, të reduktuar 8%, përjashtime, eksport, reverse charge dhe jashtë fushës. Zgjedhja e etiketës nuk zëvendëson kontrollin profesional tatimor.\n\n## Kërkimi dhe detaji\n\nLista kërkon emër, SKU, barkod dhe përshkrim; filtron kategori dhe rendit sipas emrit, çmimit ose stokut. Detaji shfaq kategorinë, TVSH-në, stokun, ndjekjen dhe ka veprim për krijimin e faturës.\n\n## Fshirja\n\nEkziston fshirja, jo një rrjedhë e veçantë arkivimi. Kontrolloni varësitë para fshirjes së një produkti të përdorur në dokumente historike.\n\nTë lidhura: [Inventari](../inventory/stock-and-low-stock.md), [POS](../pos/point-of-sale.md), [Krijimi i faturës](../invoices/create-and-edit.md).",
    "links": [
      {
        "text": "Inventari",
        "href": "../inventory/stock-and-low-stock.md",
        "targetId": "inventory/stock-and-low-stock"
      },
      {
        "text": "POS",
        "href": "../pos/point-of-sale.md",
        "targetId": "pos/point-of-sale"
      },
      {
        "text": "Krijimi i faturës",
        "href": "../invoices/create-and-edit.md",
        "targetId": "invoices/create-and-edit"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "inventory/stock-and-low-stock",
      "pos/point-of-sale"
    ]
  },
  {
    "id": "reports/financial-reports",
    "language": "en",
    "category": "reports",
    "title": "Reports, ledgers, and report export",
    "description": "Review the financial, tax, inventory, receivables, payables, and ledger reports exposed by the mobile app.",
    "keywords": [
      "reports",
      "profit and loss",
      "balance sheet",
      "ledger",
      "aging",
      "sales book"
    ],
    "content": "# Reports, ledgers, and report export\n\nOpen **More > Reports**. The hub reads a company-scoped summary and shows report cards. Selecting a report opens `ReportPreview`.\n\n## Available report definitions\n\nThe current source maps these reports to database views/tables:\n\n- Financial snapshot/daily report — `operix_report_summary`;\n- Trial balance — `operix_trial_balance`;\n- Profit & Loss — `operix_profit_loss`;\n- Balance Sheet — `operix_balance_sheet`;\n- Cash Flow and Cash & Payments — `operix_cash_flow`;\n- Changes in Equity — `operix_changes_in_equity`;\n- General Ledger — `operix_general_ledger`;\n- Asset Register — `operix_asset_register`;\n- Inventory Register — `inventory_register`;\n- Receivables Aging — `operix_ar_aging`;\n- Payables Aging — `operix_ap_open_items`;\n- Sales Book — `kosovo_sales_book`;\n- Purchase Book — `kosovo_purchase_book`;\n- Withholding Tax — `withholding_transactions`;\n- Declarations — `tax_declarations`;\n- Archived Documents — `document_archive`;\n- Tax Calendar — `kosovo_tax_calendar`.\n\nThe accounting and tax views are server-side sources. The mobile screen does not recalculate the ledger from raw invoices.\n\n## Preview behavior\n\nThe preview loads the selected companies’ rows in pages, so larger reports are not silently truncated at 250 records. Daily reports aggregate revenue, expenses, and net profit across the selected company scope. Other reports show row count, a primary total, and source name; rows are ordered by the report’s date/account fields and up to 100 are rendered in the list.\n\n## Export and share\n\n- **Share** sends a short text summary through the native share dialog.\n- **Export PDF** builds a landscape print table from the first eight discovered columns and the loaded report data.\n\nThis is a convenient preview/export, not a complete statutory book export. Some report labels and errors are currently hard-coded in English.\n\n## Ledgers\n\nCustomer and vendor ledger screens are also reachable from the customer/vendor detail and legacy finance flows. Their contents depend on tenant scope and posted data. If totals look empty, check the company selection and whether records have been posted.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "accounting/accounting-workspace",
      "taxes/tax-center",
      "customers/manage-customers"
    ]
  },
  {
    "id": "reports/financial-reports",
    "language": "sq",
    "category": "reports",
    "title": "Raportet, ledger-ët dhe eksporti",
    "description": "Shikoni raportet financiare, tatimore, të inventarit, arkëtimeve, detyrimeve dhe librat në aplikacion.",
    "keywords": [
      "raporte",
      "fitim dhe humbje",
      "bilanc",
      "ledger",
      "vjetërsim",
      "libër shitjesh"
    ],
    "content": "# Raportet, ledger-ët dhe eksporti\n\nHapni **More > Reports**. Raportet lexojnë përmbledhjen e kompanisë dhe hapin `ReportPreview`.\n\n## Raportet aktuale\n\nKodi harton përmbledhjen ditore, trial balance, Profit & Loss, Balance Sheet, Cash Flow, Changes in Equity, General Ledger, Asset Register, Inventory Register, Receivables Aging, Payables Aging, Sales Book, Purchase Book, Withholding Tax, Declarations, Archived Documents dhe Tax Calendar me pamjet burimore të bazës së të dhënave.\n\n## Pamja dhe eksporti\n\nPamja ngarkon rreshtat e kompanive të zgjedhura në faqe, prandaj raportet më të mëdha nuk kufizohen pa u vënë re në 250 rreshta. Raporti ditor bashkon të ardhurat, shpenzimet dhe fitimin neto për të gjitha kompanitë në fushëveprimin aktiv. Raportet e tjera shfaqin numrin e rreshtave, totalin kryesor dhe burimin; rreshtat renditen sipas datës/llogarisë dhe në listë shfaqen deri në 100.\n**Share** dërgon përmbledhje tekstuale. **Export PDF** krijon tabelë horizontale nga tetë kolonat e para dhe të dhënat e ngarkuara. Ky nuk është eksport i plotë ligjor/statutor. Disa etiketa të `ReportPreviewScreen` janë ende anglisht.\n\nLedger-i i klientit dhe furnitorit varet nga të dhënat e postuara dhe kompania aktive. Nëse raporti është bosh, kontrolloni kompaninë dhe lejet.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "accounting/accounting-workspace",
      "taxes/tax-center",
      "customers/manage-customers"
    ]
  },
  {
    "id": "settings/help-and-about",
    "language": "en",
    "category": "settings",
    "title": "Help, support, and About",
    "description": "Use the native Help & Support documentation portal, external support links, and About information.",
    "keywords": [
      "help",
      "support",
      "FAQ",
      "about",
      "app version"
    ],
    "content": "# Help, support, and About\n\n## Help and Support\n\nOpen **More > Help & Support**. The screen contains the bundled documentation portal for the current mobile app version:\n\n- **Search help...** for article titles, descriptions, keywords, categories, and content;\n- **Popular** articles and **Recently viewed** articles;\n- documentation categories that have articles in the installed app version;\n- an English/Shqip switch for documentation language;\n- article pages with supported Markdown content, related articles, and internal links;\n- a contact/support link and an optional external Help Center link.\n\nThe bundled articles are available without an internet connection. Search and article navigation do not call the network. The documentation language follows the app language by default, but the language switch changes the Help Center language independently for the current Help Center flow.\n\nTo read an article:\n\n1. Open **More > Help & Support**.\n2. Search for a topic or select a category.\n3. Tap an article.\n4. Use related articles or links inside the article to continue.\n\nExternal links open in the device browser. If a link cannot be opened, the app shows an alert and asks you to retry.\n\n## About\n\nOpen **More > About** to see OperiX branding, app feature descriptions, website link, help link, release information, and the version label currently defined by the screen (`1.0.0` in the audited source).\n\n## Support request details\n\nWhen contacting support, include the app version, selected company, user role, screen/route, document or record ID, exact error, and whether the failure occurs on Wi-Fi/mobile data. Never send passwords, access tokens, private API keys, or other secrets.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "troubleshooting/common-problems",
      "getting-started/sign-in-and-account"
    ]
  },
  {
    "id": "settings/help-and-about",
    "language": "sq",
    "category": "settings",
    "title": "Ndihma, mbështetja dhe Rreth aplikacionit",
    "description": "Përdorni portalin vendas të dokumentacionit, lidhjet e mbështetjes dhe informacionin e aplikacionit.",
    "keywords": [
      "ndihmë",
      "mbështetje",
      "FAQ",
      "rreth",
      "version"
    ],
    "content": "# Ndihma, mbështetja dhe Rreth aplikacionit\n\n## Help & Support\n\nTe **More > Help & Support** gjeni portalin e dokumentacionit të integruar në aplikacion:\n\n- **Kërko në ndihmë...** kërkon në titujt, përshkrimet, fjalët kyçe, kategoritë dhe përmbajtjen e artikujve;\n- artikujt **Të përdorura shpesh** dhe **Të shikuara së fundmi**;\n- kategoritë që kanë artikuj në versionin e instaluar të aplikacionit;\n- ndërruesin e gjuhës English/Shqip për dokumentacionin;\n- artikuj me përmbajtje Markdown të mbështetur, artikuj të ngjashëm dhe lidhje të brendshme;\n- lidhjen për kontakt me mbështetjen dhe, sipas nevojës, lidhjen e jashtme të Help Center.\n\nArtikujt e paketuar janë të disponueshëm edhe pa internet. Kërkimi dhe navigimi në artikuj nuk përdorin rrjetin. Gjuha e dokumentacionit ndjek gjuhën e aplikacionit si parazgjedhje, por ndërruesi i gjuhës mund ta ndryshojë gjuhën e Help Center-it pa ndryshuar domosdoshmërisht gjithë aplikacionin.\n\nPër të lexuar një artikull:\n\n1. Hapni **More > Help & Support**.\n2. Kërkoni një temë ose zgjidhni një kategori.\n3. Prekni artikullin.\n4. Vazhdoni me artikujt e ngjashëm ose me lidhjet brenda artikullit.\n\n## About\n\nTe **More > About** shihni markën OperiX, përshkrimet e funksioneve, uebfaqen, ndihmën, informacionin e lëshimit dhe versionin e vendosur nga ekrani (`1.0.0` në kodin e audituar).\n\n## Çfarë t’i dërgoni mbështetjes\n\nJepni versionin, kompaninë aktive, rolin, ekranin/rrugën, ID-në e dokumentit, gabimin e saktë dhe llojin e lidhjes. Mos dërgoni fjalëkalime, tokena, çelësa API ose sekrete.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "troubleshooting/common-problems",
      "getting-started/sign-in-and-account"
    ]
  },
  {
    "id": "settings/preferences-and-templates",
    "language": "en",
    "category": "settings",
    "title": "Preferences, company profile, numbering, and templates",
    "description": "Configure language, appearance, company branding, bank details, security, exports, and document templates.",
    "keywords": [
      "settings",
      "language",
      "theme",
      "logo",
      "bank details",
      "invoice numbering",
      "templates"
    ],
    "content": "# Preferences, company profile, numbering, and templates\n\nOpen **More > Settings**. Sections are expandable and changes generally save when editing ends.\n\n## Language and appearance\n\n- **Language**: English or Shqip. The selection is stored locally and updates the app translation locale.\n- **Theme**: System, Light, or Dark.\n- **Brand color**: choose from the available palette, including OperiX blue.\n\n## Company profile\n\nThe active company profile can include company name, tax/registration ID, email, phone, address, city, country, and website. These values can appear in PDFs and company cards. Company switching and member management are separate actions under [Manage companies](../company/manage-companies-and-members.md).\n\n## Logo, signature, and stamp\n\nThe identity/visuals section can select a logo, upload a signature image, draw a signature, and select an official-stamp image. These assets are stored on the profile/company record as URL/data values used by document generation. A decorative image does not by itself constitute a qualified electronic signature.\n\n## Bank details\n\nThe bank section stores bank name, IBAN, and SWIFT/BIC for document payment instructions. These values can be rendered in a PDF; they do not initiate a bank transfer.\n\n## Security\n\nThe security section can enable the biometric lock. The next authenticated app gate asks the device for biometric/passcode verification. See [Authentication](../getting-started/sign-in-and-account.md).\n\n## Advanced settings and export\n\nAdvanced settings reads profiles, document sequences, and workspace records. The export action can prepare JSON or CSV data for invoices, clients, products, expenses, and vendors and opens the native share sheet. It is a client-side export of queried records, not a complete database backup.\n\n## Invoice numbering\n\nThe backend has a transactional document-sequence allocator and independent document-type sequence vocabulary. The current allocator supports invoice/offer/proforma/order compatibility types and a fiscal-year period key. Do not manually reuse an issued number. If the preview, legacy list, and saved number disagree, stop and contact an administrator rather than editing the issued document.\n\n## Templates\n\nThe settings stack registers invoice template settings, a general template editor, contract templates, and a contract-template editor. Shared template configuration can control logo, signature, buyer signature, stamp, QR visibility, notes, discount, tax, bank details, visible columns, page size, and labels. The mobile preview currently follows the PDF factory’s corporate/thermal behavior; see [PDF actions](../invoices/pdf-sharing-and-printing.md).",
    "links": [
      {
        "text": "Manage companies",
        "href": "../company/manage-companies-and-members.md",
        "targetId": "company/manage-companies-and-members"
      },
      {
        "text": "Authentication",
        "href": "../getting-started/sign-in-and-account.md",
        "targetId": "getting-started/sign-in-and-account"
      },
      {
        "text": "PDF actions",
        "href": "../invoices/pdf-sharing-and-printing.md",
        "targetId": "invoices/pdf-sharing-and-printing"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/pdf-sharing-and-printing",
      "company/manage-companies-and-members",
      "getting-started/sign-in-and-account"
    ]
  },
  {
    "id": "settings/preferences-and-templates",
    "language": "sq",
    "category": "settings",
    "title": "Preferencat, profili i kompanisë, numërimi dhe modelet",
    "description": "Konfiguroni gjuhën, pamjen, markën, bankën, sigurinë, eksportin dhe modelet e dokumenteve.",
    "keywords": [
      "cilësime",
      "gjuhë",
      "temë",
      "logo",
      "të dhëna bankare",
      "numërim faturash",
      "modele"
    ],
    "content": "# Preferencat, profili i kompanisë, numërimi dhe modelet\n\nHapni **More > Settings**. Seksionet hapen dhe ndryshimet zakonisht ruhen kur përfundon editimi.\n\n## Gjuha dhe pamja\n\n- **Language**: English ose Shqip; ruhet lokalisht.\n- **Theme**: System, Light ose Dark.\n- **Brand color**: ngjyra nga paleta, përfshirë blunë e OperiX.\n\n## Profili i kompanisë\n\nMund të ruhen emri, ID-ja tatimore/regjistrimi, emaili, telefoni, adresa, qyteti, shteti dhe uebfaqja. Këto përdoren në kartat e kompanisë dhe PDF. Ndërrimi dhe anëtarët menaxhohen te [Kompanitë](../company/manage-companies-and-members.md).\n\n## Logoja, nënshkrimi dhe vula\n\nTe identiteti mund të zgjidhni logo, të ngarkoni figurë nënshkrimi, të vizatoni nënshkrim dhe të zgjidhni vulë. Figura nuk paraqitet si nënshkrim elektronik i kualifikuar.\n\n## Të dhënat bankare\n\nRuani emrin e bankës, IBAN-in dhe SWIFT/BIC për udhëzimet e pagesës në PDF. Këto nuk nisin transfer bankar.\n\n## Siguria\n\nTe Security mund të aktivizoni kyçjen biometrike. Në hyrjen tjetër aplikacioni kërkon verifikim nga pajisja.\n\n## Cilësimet e avancuara dhe eksporti\n\nAdvanced settings lexon profilet, seritë e dokumenteve dhe të dhënat e hapësirës. JSON/CSV mund të përgatitet për fatura, klientë, produkte, shpenzime dhe furnitorë dhe të dërgohet me share sheet. Ky nuk është backup i plotë i bazës së të dhënave.\n\n## Numërimi i faturave\n\nBackend-i ka allocator transaksional të serive sipas llojit dhe vitit fiskal. Mos ripërdorni numër të lëshuar. Nëse lista, pamja dhe numri i ruajtur nuk përputhen, ndaloni dhe kontaktoni administratorin.\n\n## Modelet\n\nKa cilësime për modelet e faturave, editor të përgjithshëm dhe modele kontratash. Konfigurimi mund të kontrollojë logon, nënshkrimin, QR-në, shënimet, zbritjen, tatimin, bankën, kolonat, madhësinë e faqes dhe etiketat. Pamja mobile ndjek sjelljen corporate/thermal të fabrikës së PDF-së.",
    "links": [
      {
        "text": "Kompanitë",
        "href": "../company/manage-companies-and-members.md",
        "targetId": "company/manage-companies-and-members"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/pdf-sharing-and-printing",
      "company/manage-companies-and-members",
      "getting-started/sign-in-and-account"
    ]
  },
  {
    "id": "taxes/tax-center",
    "language": "en",
    "category": "taxes",
    "title": "Tax Center and tax books",
    "description": "Use the Tax Center links for sales, purchase, cash, withholding, declarations, archive, and tax-calendar views.",
    "keywords": [
      "taxes",
      "VAT",
      "sales book",
      "purchase book",
      "declarations",
      "tax calendar"
    ],
    "content": "# Tax Center and tax books\n\nOpen **More > Taxes**. The screen reads the EFS status for the selected company scope and displays links to tax/accounting views.\n\n## Available links\n\n- Sales Book — posted sales and output VAT view;\n- Purchase Book — supplier invoices and input VAT view;\n- Cash & Payments — cash/bank journal view;\n- Payroll — payroll PIT/pension entry point, subject to role;\n- Withholding Tax — recorded withholding transactions;\n- Declarations — declaration preview/status;\n- Archived Documents — source-document archive view;\n- Tax Calendar — tax obligations/deadlines view.\n\nEach link opens a report preview backed by a server-side source. See [Reports](../reports/financial-reports.md) for row limits and export behavior.\n\n## VAT and tax dates\n\nThe mobile invoice form stores issue, due, supply/order/delivery, and payment-related date fields where applicable. It does not replace the centralized backend tax logic or provide a legal interpretation of a tax point. Review the current company accounting/tax procedure before issuing or correcting a document.\n\n## EFS warning\n\nThe current screen displays `EFS NOT CERTIFIED` when no accepted status is found and states that production EFS is disabled. See [Fiscalization status](../fiscalization/status-and-eligibility.md).",
    "links": [
      {
        "text": "Reports",
        "href": "../reports/financial-reports.md",
        "targetId": "reports/financial-reports"
      },
      {
        "text": "Fiscalization status",
        "href": "../fiscalization/status-and-eligibility.md",
        "targetId": "fiscalization/status-and-eligibility"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "fiscalization/status-and-eligibility",
      "accounting/accounting-workspace"
    ]
  },
  {
    "id": "taxes/tax-center",
    "language": "sq",
    "category": "taxes",
    "title": "Qendra e tatimeve dhe librat tatimorë",
    "description": "Përdorni lidhjet për librin e shitjeve, blerjeve, arkës, mbajtjes, deklaratave dhe kalendarit tatimor.",
    "keywords": [
      "tatime",
      "TVSH",
      "libër shitjesh",
      "libër blerjesh",
      "deklarata",
      "kalendar tatimor"
    ],
    "content": "# Qendra e tatimeve dhe librat tatimorë\n\nHapni **More > Taxes**. Ekrani lexon statusin EFS për kompaninë/kompanitë e zgjedhura dhe ofron:\n\n- Sales Book — shitjet e postuara dhe TVSH-ja dalëse;\n- Purchase Book — faturat e furnitorëve dhe TVSH-ja hyrëse;\n- Cash & Payments — lëvizjet e arkës/bankës;\n- Payroll — pagat sipas rolit;\n- Withholding Tax — transaksionet e mbajtjes;\n- Declarations — përgatitja/statusi i deklaratave;\n- Archived Documents — arkivi;\n- Tax Calendar — detyrimet dhe afatet.\n\nLidhjet hapin pamje të serverit dhe varen nga lejet. Fushat e datës së faturës nuk zëvendësojnë logjikën qendrore të tatimit ose këshillën profesionale.\n\nAktualisht shfaqet paralajmërimi **EFS NOT CERTIFIED** kur nuk ka status të pranuar. Shihni [Fiskalizimi](../fiscalization/status-and-eligibility.md).",
    "links": [
      {
        "text": "Fiskalizimi",
        "href": "../fiscalization/status-and-eligibility.md",
        "targetId": "fiscalization/status-and-eligibility"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "reports/financial-reports",
      "fiscalization/status-and-eligibility",
      "accounting/accounting-workspace"
    ]
  },
  {
    "id": "troubleshooting/common-problems",
    "language": "en",
    "category": "troubleshooting",
    "title": "Troubleshooting common problems",
    "description": "Diagnose login, saving, totals, PDF, payment, synchronization, permission, and access problems in the mobile app.",
    "keywords": [
      "troubleshooting",
      "cannot save invoice",
      "PDF error",
      "sync problem",
      "permission denied"
    ],
    "content": "# Troubleshooting common problems\n\n## Cannot log in\n\n**Symptoms:** Sign-in returns an error or the session does not open.\n\n**Likely causes:** Wrong credentials, unverified email, network failure, expired session, or a Supabase Auth issue.\n\n**Try:** Check the email/password, retry on a stable connection, complete the email OTP flow, and restart the app. If Google sign-in fails, retry the browser flow. There is no mobile password-reset screen in the audited source, so contact support/admin if recovery is required.\n\n## The account is pending\n\n**Symptoms:** The approval-pending screen remains visible.\n\n**Try:** Ask the company administrator to approve the employee record, tap **Check status**, then restart or sign out/sign in if the navigator has not changed.\n\n## Invoice does not save\n\n**Likely causes:** No line, no active company, missing required customer context, invalid numeric field, missing permission, or a backend RPC error.\n\n**Try:** Add at least one valid item, confirm the company selector, review customer and amount fields, retry once, and record the exact error/document ID. Do not repeatedly tap save if a posting flow may have succeeded; check the invoice list first.\n\n## Customer or product does not appear\n\nRefresh the list and confirm the selected company. The mobile queries are workspace-scoped. Check spelling/search filters and whether the record was saved under another company or as a legacy record without a company ID.\n\n## Totals or VAT look wrong\n\nReview quantity, unit price, discount, tax rate, and whether a product price is tax-included. The invoice form applies tax to the discounted line value. Compare the saved invoice with the backend/report source; do not edit an issued document to force a total.\n\n## PDF does not generate or share\n\nConfirm the document has a company, at least one line, and valid data. Retry with device storage and network access, then use the native share/print dialog. If email is the problem, check that the customer has an email address. A compose screen does not prove delivery.\n\n## Payment status is incorrect\n\nOpen both the invoice and payment list. A customer payment is posted and then allocated in a second call. If allocation failed, the payment may exist while the invoice remains unpaid/partial. Ask an administrator to inspect the allocation record before retrying.\n\n## Data does not synchronize / offline issue\n\nThe app uses live Supabase queries and local theme/language persistence. The POS held-order list is screen state and may be lost after reload. Reconnect, refresh, and verify the record in the current company. Do not assume an offline save occurred unless the document appears after reconnection.\n\n## Permission denied\n\nAsk the company owner/admin to verify membership, role, selected company, and the relevant backend permission. UI hiding is not the only authorization layer.\n\n## EFS or fiscalization warning\n\nThe Tax Center currently shows **EFS NOT CERTIFIED** when no accepted status is available. Do not treat an ordinary PDF as a fiscal receipt. Contact the authorized fiscalization administrator.\n\n## App crash or blank screen\n\nRestart the app, confirm the installed build and platform, retry the last action, and record the route plus account/company context. For support, include logs only after removing tokens, passwords, and private keys.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "settings/help-and-about"
    ]
  },
  {
    "id": "troubleshooting/common-problems",
    "language": "sq",
    "category": "troubleshooting",
    "title": "Zgjidhja e problemeve të zakonshme",
    "description": "Diagnostikoni problemet e hyrjes, ruajtjes, totalit, PDF-së, pagesës, sinkronizimit dhe lejeve.",
    "keywords": [
      "zgjidhja e problemeve",
      "nuk ruhet fatura",
      "gabim PDF",
      "sinkronizim",
      "qasje e refuzuar"
    ],
    "content": "# Zgjidhja e problemeve të zakonshme\n\n## Nuk mund të hyj\n\nKontrolloni emailin dhe fjalëkalimin, lidhjen, verifikimin me OTP dhe rinisni aplikacionin. Për Google provoni përsëri rrjedhën në shfletues. Në kod nuk u gjet rivendosje fjalëkalimi; kontaktoni mbështetjen.\n\n## Llogaria është në pritje\n\nAdministratori duhet të miratojë punonjësin. Shtypni **Check status**, pastaj rinisni ose dilni/hyni përsëri nëse navigimi nuk ndryshon.\n\n## Fatura nuk ruhet\n\nKontrolloni që ka rresht, kompani aktive, klient kur kërkohet, vlera numerike dhe leje. Provoni vetëm një herë dhe kontrolloni listën para se të ripërsëritni një veprim postimi.\n\n## Klienti ose produkti mungon\n\nRifreskoni, kontrolloni kompaninë aktive dhe filtrin/kërkimin. Të dhënat janë të kufizuara sipas hapësirës dhe mund të jenë ruajtur në kompani tjetër.\n\n## Totali/TVSH-ja nuk përputhet\n\nKontrolloni sasinë, çmimin, zbritjen, normën dhe nëse çmimi përfshin tatimin. Formulari aplikon tatimin mbi vlerën pas zbritjes. Mos ndryshoni dokument të lëshuar për të detyruar totalin.\n\n## PDF-ja nuk krijohet/shpërndahet\n\nKontrolloni kompaninë dhe rreshtat, hapësirën e pajisjes dhe lidhjen. Për email duhet emaili i klientit. Kompozimi nuk dëshmon dërgimin.\n\n## Statusi i pagesës është i gabuar\n\nKontrolloni faturën dhe listën e pagesave. Pagesa postohet dhe alokohet veçmas; mund të ekzistojë pagesa ndërsa fatura mbetet e papaguar nëse alokimi dështoi.\n\n## Probleme offline/sinkronizimi\n\nAplikacioni përdor kërkime live në Supabase; vetëm gjuha/tema ruhen lokalisht dhe shporta e mbajtur në POS mund të humbet. Rilidhuni, rifreskoni dhe kontrolloni në kompaninë aktive.\n\n## Leja u refuzua\n\nKërkoni administratorin të kontrollojë anëtarësimin, rolin, kompaninë dhe lejen e backend-it. Mos u përpiqni të anashkaloni lejet nga ndërfaqja.\n\n## Paralajmërim EFS\n\n**EFS NOT CERTIFIED** do të thotë se nuk ka status të pranuar në ekran. PDF-ja e zakonshme nuk është automatikisht kupon fiskal.\n\n## Aplikacioni mbyllet\n\nRiniseni, shënoni versionin, platformën, rrugën dhe veprimin e fundit. Para dërgimit të log-eve hiqni tokenat, fjalëkalimet dhe çelësat privatë.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "invoices/create-and-edit",
      "payments/record-customer-payment",
      "settings/help-and-about"
    ]
  },
  {
    "id": "users-and-permissions/roles-and-access",
    "language": "en",
    "category": "users-and-permissions",
    "title": "Roles, members, and permissions",
    "description": "Understand Super admin, Admin, Manager, Employee, invitations, and server-enforced company permissions.",
    "keywords": [
      "roles",
      "permissions",
      "super admin",
      "admin",
      "manager",
      "employee",
      "team members"
    ],
    "content": "# Roles, members, and permissions\n\n## Roles visible in the mobile app\n\nThe workspace role model includes exactly four roles:\n\n- **Super admin** — reserved for the company owner and the only role with access to OperiX Control;\n- **Admin** — full tenant administration without OperiX Control access;\n- **Manager** — operational administration for the assigned tenant;\n- **Employee** — can create invoices and all supported proforma/commercial document types, but cannot edit or delete existing invoices, products, or other business records.\n\nSuper admin is never assignable through an invitation or role-change menu. The server derives it from company ownership.\n\n## Employee restrictions visible in mobile\n\nThe More menu and global create actions hide non-document creation actions for Employees. These are convenience restrictions only; the database/RPC permission checks are the security boundary.\n\n## Administrative actions\n\nAuthorized administrators can manage company hierarchy, profile details, invitations, member roles, member removal, and company archiving. See [Manage companies](../company/manage-companies-and-members.md).\n\n## Permission errors\n\nAn action can be visible but fail with a permission error if the server role lacks a required permission such as invoice posting, journal posting, supplier payment, or company role management. Do not work around this by changing request parameters; ask the company owner/admin.\n\n## Tenant separation\n\nThe mobile client selects an active company and accessible descendants. Supabase RLS and security-definer RPC permission checks must reject records outside that scope. If access looks wrong, contact an administrator rather than attempting to work around the restriction.",
    "links": [
      {
        "text": "Manage companies",
        "href": "../company/manage-companies-and-members.md",
        "targetId": "company/manage-companies-and-members"
      }
    ],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "getting-started/sign-in-and-account"
    ]
  },
  {
    "id": "users-and-permissions/roles-and-access",
    "language": "sq",
    "category": "users-and-permissions",
    "title": "Rolet, anëtarët dhe qasja",
    "description": "Kuptoni Super admin, Admin, Menaxherin, Punonjësin, ftesat dhe lejet e kompanisë.",
    "keywords": [
      "role",
      "leje",
      "super admin",
      "admin",
      "menaxher",
      "punonjës",
      "anëtarë"
    ],
    "content": "# Rolet, anëtarët dhe qasja\n\nModeli i hapësirës së punës ka saktësisht katër role:\n\n- **Super admin** — vetëm pronari i kompanisë dhe i vetmi rol me qasje në OperiX Control;\n- **Admin** — administrim i plotë i tenant-it pa qasje në OperiX Control;\n- **Menaxher** — administrim operacional për tenant-in e caktuar;\n- **Punonjës** — mund të krijojë faturat dhe të gjitha llojet e dokumenteve proforma/komerciale, por nuk mund të ndryshojë ose fshijë faturat, produktet apo regjistrat e tjerë.\n\nSuper admin nuk mund të caktohet përmes ftesës ose menusë së roleve; serveri e përcakton nga pronësia e kompanisë.\n\nNë aplikacion, punonjësi nuk sheh veprimet e krijimit për produkte, shpenzime dhe të dhëna të tjera jashtë dokumenteve. Këto janë kufizime të ndërfaqes; RLS dhe RPC-të janë kufiri i sigurisë.\n\nAdministratorët e autorizuar menaxhojnë kompaninë, ftesat, rolet, heqjen e anëtarëve dhe arkivimin. Një veprim mund të jetë i dukshëm por të refuzohet në server për mungesë të `sales_invoice.post`, `journal.post`, `roles.manage` ose lejes tjetër.\n\nTë dhënat ndahen sipas kompanisë aktive dhe pasardhësve të lejuar. Nëse qasja duket e pasaktë, kontaktoni administratorin dhe mos u përpiqni ta anashkaloni kufizimin.",
    "links": [],
    "app": "operix-invoice-mobile",
    "status": "production",
    "introducedIn": null,
    "updatedIn": null,
    "updatedAt": null,
    "relatedArticles": [
      "company/manage-companies-and-members",
      "getting-started/sign-in-and-account"
    ]
  }
];
