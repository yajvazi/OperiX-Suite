import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CommercialDocumentType } from '@invoice-monorepo/commercial-documents';

export type PosCartItem = {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate?: number;
    taxIncluded?: boolean;
    unit?: string;
    sku?: string;
};

export type InvoiceFormParams = {
    invoiceId?: string;
    clientId?: string;
    type?: 'invoice' | 'offer';
    subtype?: string;
    documentType?: CommercialDocumentType;
    sourceDocumentId?: string;
    documentKey?: string;
    salesBookAmendmentId?: string;
    posCart?: PosCartItem[];
    posCustomerId?: string;
    posPaymentMethod?: 'cash' | 'card' | 'debt' | 'other';
    posIdempotencyKey?: string;
};

export type LegacyInvoicesStackParamList = {
    FaturatMain: undefined;
    InvoicesList: { tab?: string; subtype?: string; status?: string } | undefined;
    AllInvoices: { type?: string } | undefined;
    InvoiceForm: InvoiceFormParams | undefined;
    InvoiceDetail: { invoiceId: string; autoPreview?: boolean };
    ContractForm: { contractId?: string; subtype?: string } | undefined;
    ContractDetail: { contractId: string };
    ReportPreview: { subtype?: string } | undefined;
    SalesBook: undefined;
    PaymentForm: { paymentId?: string; invoiceId?: string; clientId?: string } | undefined;
    PaymentsList: undefined;
    ClientForm: { clientId?: string } | undefined;
    CustomerLedger: { clientId?: string } | undefined;
    VendorLedger: { vendorId?: string } | undefined;
    VendorForm: { vendorId?: string } | undefined;
    VendorsList: undefined;
    VendorPaymentForm: { paymentId?: string } | undefined;
    VendorPaymentsList: undefined;
    SupplierBillForm: { billId?: string; scannedData?: unknown } | undefined;
    SupplierBillsList: undefined;
    ScanBill: undefined;
    ExpenseForm: { expenseId?: string; type?: string; scannedData?: unknown } | undefined;
};

export type LegacyManagementStackParamList = {
    ManagementTabs: { activeTab?: 'products' | 'clients' | 'vendors' } | undefined;
    ManagementDashboard: undefined;
    ClientsList: undefined;
    ProductsList: undefined;
    VendorsList: undefined;
    ExpenseForm: { expenseId?: string; type?: string; scannedData?: unknown } | undefined;
    ExpensesList: undefined;
    ClientForm: { clientId?: string } | undefined;
    ProductForm: { productId?: string; scannedSKU?: string; restoredData?: unknown } | undefined;
    VendorForm: { vendorId?: string } | undefined;
    VendorPaymentForm: { paymentId?: string } | undefined;
    CustomerLedger: { clientId?: string } | undefined;
    VendorLedger: { vendorId?: string } | undefined;
};

export type LegacyExpensesStackParamList = {
    ExpensesDashboard: undefined;
    ExpensesList: { type?: 'expense' | 'income' } | undefined;
    ExpenseForm: { expenseId?: string; type?: string; scannedData?: unknown } | undefined;
};

export type SettingsStackParamList = {
    SettingsMain: undefined;
    TemplateEditor: undefined;
    ContractTemplates: undefined;
    ContractTemplateEditor: { templateId?: string } | undefined;
    InvoiceTemplateSettings: undefined;
    PaymentIntegrations: undefined;
    StripeDashboard: undefined;
    ManageCompanies: undefined;
    AdvancedSettings: { section?: 'intelligence' } | undefined;
};

export type MainTabParamList = {
    Home: undefined;
    Sales: undefined;
    POS: { productId?: string } | undefined;
    Business: undefined;
    More: undefined;
};

export type RootStackParamList = {
    MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
    GlobalSearch: { scannedSearch?: string } | undefined;
    OperixAI: undefined;
    Notifications: undefined;
    QRScanner: { mode?: string; returnTo?: string; currentData?: unknown } | undefined;
    Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
    ContractTemplates: undefined;
    Profile: undefined;
    Accounting: undefined;
    AccountantReport: undefined;
    Payroll: undefined;
    PayrollSetup: undefined;
    ReportsHub: undefined;
    CashBalances: undefined;
    AgentActivity: { agentId: string; agentName: string };
    TaxCenter: undefined;
    HelpSupport: { language?: 'en' | 'sq' } | undefined;
    HelpCategory: { category: string; language?: 'en' | 'sq' };
    HelpArticle: { articleId: string; language?: 'en' | 'sq' };
    About: undefined;

    InvoiceForm: InvoiceFormParams | undefined;
    InvoiceDetail: { invoiceId: string; autoPreview?: boolean };
    InvoicesList: { tab?: string; subtype?: string; status?: string } | undefined;
    AllInvoices: { type?: string } | undefined;
    PaymentsList: undefined;
    PaymentForm: { paymentId?: string; invoiceId?: string; clientId?: string } | undefined;
    ClientForm: { clientId?: string } | undefined;
    CustomerDetail: { clientId: string };
    ProductsList: undefined;
    ProductForm: { productId?: string; scannedSKU?: string; restoredData?: unknown } | undefined;
    ProductDetail: { productId: string };
    ExpenseForm: { expenseId?: string; type?: string; scannedData?: unknown } | undefined;
    ExpensesList: { type?: 'expense' | 'income' } | undefined;
    VendorsList: undefined;
    VendorForm: { vendorId?: string } | undefined;
    VendorLedger: { vendorId?: string } | undefined;
    CustomerLedger: { clientId?: string } | undefined;
    VendorPaymentForm: { paymentId?: string } | undefined;
    VendorPaymentsList: undefined;
    SupplierBillForm: { billId?: string; scannedData?: unknown } | undefined;
    SupplierBillsList: undefined;
    ScanBill: undefined;
    ContractForm: { contractId?: string; subtype?: string } | undefined;
    ContractDetail: { contractId: string };
    ReportPreview: { subtype?: string } | undefined;
    SalesBook: undefined;

    // Compatibility routes kept while legacy screens are still reachable from advanced flows.
    InvoicesTab: NavigatorScreenParams<LegacyInvoicesStackParamList> | undefined;
    Management: NavigatorScreenParams<LegacyManagementStackParamList> | undefined;
};

export type AuthStackParamList = {
    SignIn: undefined;
    SignUp: undefined;
    JoinTeam: undefined;
};
