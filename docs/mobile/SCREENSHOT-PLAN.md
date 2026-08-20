# Screenshot plan

Screenshots must be captured from the actual app with test data. Do not create synthetic screenshots. Capture both English and Albanian variants where the UI contains user-facing copy.

| Screen | Route | Required state | English | Albanian | Purpose |
|---|---|---|---|---|---|
| Sign in | Auth `SignIn` | Signed-out, empty and invalid-login states | Needed | Needed | Show entry and error handling |
| Sign up / OTP | Auth `SignUp` | New account form and verification-code step | Needed | Needed | Explain registration |
| Join team | Auth `JoinTeam` | Valid invite token with verified company | Needed | Needed | Explain invited access |
| Home dashboard | `Home` | Company with invoices, payments, expenses, low-stock product | Needed | Needed | Identify metrics and quick actions |
| Sales document trail | `Sales` | At least one invoice, proforma, quote, order, delivery note | Needed | Needed | Explain filters and shared trail |
| New invoice | `InvoiceForm` | Customer, two items, discount, VAT, due date | Needed | Needed | Main invoice walkthrough |
| Invoice detail | `InvoiceDetail` | Issued invoice with payment and related document | Needed | Needed | Explain status, actions, timeline |
| Conversion menu | `InvoiceDetail` | Quote/proforma/order with conversion actions | Needed | Needed | Explain source chain |
| PDF preview | Invoice preview WebView | Company logo, bank data, notes, items | Needed | Needed | Explain PDF identity and sharing |
| POS cart | `POS` | Tracked products, customer, non-empty cart | Needed | Needed | Explain checkout path |
| Customer list/form | `ClientsList` / `ClientForm` | Existing customer and new customer form | Needed | Needed | Explain identifiers and contact data |
| Product form | `ProductForm` | Product with SKU, VAT, stock tracking, low-stock threshold | Needed | Needed | Explain catalog fields |
| Payments | `PaymentsList` / `PaymentForm` | Partial payment allocated to invoice | Needed | Needed | Explain balances and methods |
| Expense form | `ExpenseForm` | Expense with category and receipt image | Needed | Needed | Explain expenses |
| Business workspace | `Business` | Products, stock, expenses, vendors | Needed | Needed | Explain operational shortcuts |
| Reports hub/preview | `ReportsHub` / `ReportPreview` | Posted rows and empty state | Needed | Needed | Explain report sources and export |
| Tax Center | `TaxCenter` | `EFS NOT CERTIFIED` warning and book list | Needed | Needed | Set correct EFS expectation |
| Manage companies | `Settings > ManageCompanies` | Main company, subdivision, member and invite | Needed | Needed | Explain tenant switching and roles |
| Settings | `Settings > SettingsMain` | Language, theme, company, branding, bank, security sections | Needed | Needed | Explain preferences |
| Payment integrations | `Settings > PaymentIntegrations` | Disconnected and connected Stripe states | Needed | Needed | Explain integration status without exposing secrets |
| Help Center home | `HelpSupport` | Bundled articles, popular section, categories, search field, English/Sq switch | Needed | Needed | Explain the native offline documentation portal |
| Help category | `HelpCategory` | One populated category with article list and category search | Needed | Needed | Show category browsing and local search |
| Help article | `HelpArticle` | Article with headings, links, related articles, and a partial/disabled status where applicable | Needed | Needed | Explain article reading and related navigation |
| About | `About` | Version card and support links | Needed | Needed | Explain app information and external support entry points |

For every capture, record app version, platform, locale, selected company, role, seeded record IDs (outside the screenshot), and whether the data came from a test tenant.
