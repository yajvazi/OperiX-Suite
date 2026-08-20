export interface Profile {
    id: string;
    company_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    website?: string;
    logo_url?: string;
    signature_url?: string;
    stamp_url?: string;
    currency: string;
    tax_rate: number;
    tax_name: string;
    tax_id?: string;
    bank_name?: string;
    bank_account?: string;
    bank_iban?: string;
    bank_swift?: string;
    primary_color: string;
    is_grayscale: boolean;
    default_client_discount?: number;
    // New fields
    payment_link_stripe?: string;
    payment_link_paypal?: string;
    invoice_language?: string;
    terms_conditions?: string;
    biometric_enabled?: boolean;
    company_id?: string;
    active_company_id?: string;
    /**
     * Legacy profile-level role storage is still present for older accounts.
     * Tenant authorization must use WorkspaceScope.roleCode instead.
     */
    role?: 'owner' | 'admin' | 'manager' | 'employee' | 'worker';
    template_config?: TemplateConfig;
    smtp_host?: string;
    smtp_port?: number;
    smtp_user?: string;
    smtp_pass?: string;
    smtp_secure?: boolean;
    smtp_from_email?: string; // Optional: custom FROM address if different than user email
    // Stripe Connect OAuth fields
    stripe_access_token?: string;
    stripe_refresh_token?: string;
    stripe_account_id?: string;
    stripe_connected_at?: string;
    stripe_livemode?: boolean;
    stripe_last_synced?: string;
    updated_at: string;
}

export interface TemplateConfig {
    showLogo: boolean;
    showSignature: boolean;
    showBuyerSignature: boolean;
    showStamp: boolean;
    showQrCode: boolean;
    showNotes: boolean;
    showDiscount: boolean;
    showTax: boolean;
    showBankDetails: boolean;
    showProductPictures?: boolean;
    visibleColumns: {
        rowNumber: boolean;
        sku: boolean;
        description: boolean;
        quantity: boolean;
        unit: boolean;
        unitPrice: boolean;
        discount: boolean;
        taxRate: boolean;
        lineTotal: boolean;
        grossPrice: boolean;
    };
    labels: Record<string, string>;
    pageSize: 'A4' | 'A5' | 'Receipt';
    style?: TemplateType;
}


export interface Client {
    id: string;
    user_id: string;
    company_id?: string;
    pos_walk_in_customer?: boolean;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    zip_code?: string;
    country?: string;
    tax_id?: string;
    discount_percent?: number;
    discount_type?: 'percentage' | 'fixed';
    notes?: string;
    created_at: string;
}

export interface Product {
    id: string;
    user_id: string;
    company_id?: string;
    name: string;
    description?: string;
    image_url?: string;
    sku?: string;
    barcode?: string;
    unit_price: number;
    tax_rate?: number;
    tax_included?: boolean;
    unit?: string;
    category?: string;
    cost_price?: number;
    purchase_currency?: string;
    exchange_rate?: number;
    supplier_unit_price?: number;
    supplier_discount_percent?: number;
    supplier_unit_price_after_discount?: number;
    transport_cost?: number;
    additional_cost?: number;
    customs_base?: number;
    customs_duty?: number;
    excise?: number;
    import_vat_rate?: number;
    import_vat_amount?: number;
    unit_cost_with_vat?: number;
    tariff_code?: string;
    country_of_origin?: string;
    vat_treatment?:
        | 'standard_18'
        | 'reduced_8'
        | 'exempt_no_credit'
        | 'exempt_with_credit'
        | 'export'
        | 'reverse_charge'
        | 'out_of_scope';
    stock_quantity?: number;
    track_stock?: boolean;
    low_stock_threshold?: number;
    created_at: string;
}

export type ExpenseCategory = string;

export interface CompanyBankAccount {
    id: string;
    company_id: string;
    bank_name: string;
    account_name?: string | null;
    account_number?: string | null;
    iban?: string | null;
    swift_bic?: string | null;
    currency: string;
    is_primary: boolean;
    is_active: boolean;
    created_at: string;
    owner_company_id?: string | null;
    available_company_id?: string | null;
    is_shared?: boolean;
}

export interface CompanyBankAccountShare {
    id: string;
    company_bank_account_id: string;
    shared_company_id: string;
    is_active: boolean;
    created_at: string;
}

export interface CompanyAgent {
    user_id: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    membership_role?: string | null;
}

export interface FundBalance {
    id: string;
    company_id: string;
    owner_company_id?: string | null;
    fund_type: 'cash' | 'bank';
    company_bank_account_id?: string | null;
    stripe_store_id?: string | null;
    name: string;
    currency: string;
    opening_balance: number;
    transaction_total: number;
    balance: number;
    provider_available_balance?: number | null;
    provider_pending_balance?: number | null;
    provider_balance_as_of?: string | null;
    is_active: boolean;
    is_shared?: boolean;
}

export interface FundTransfer {
    id: string;
    company_id: string;
    source_fund_account_id: string;
    target_fund_account_id: string;
    amount: number;
    currency: string;
    transfer_date: string;
    description?: string | null;
    status: 'posted' | 'reversed';
    created_at: string;
}

export interface Expense {
    id: string;
    user_id: string;
    company_id?: string;
    amount: number;
    category: ExpenseCategory;
    vendor_name?: string;
    invoice_number?: string;
    description?: string;
    date: string;
    receipt_url?: string;
    payment_method?: 'cash' | 'bank';
    company_bank_account_id?: string | null;
    bank_reference?: string | null;
    notes?: string | null;
    created_at: string;
    type?: 'expense' | 'income';
}

export type InvoiceStatus = 'draft' | 'sent' | 'pending' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethod = 'cash' | 'bank' | 'card';

export interface Invoice {
    id: string;
    user_id: string;
    company_id?: string;
    client_id?: string;
    invoice_number: string;
    public_qr_token?: string | null;
    issue_date: string;
    due_date?: string;
    delivery_method?: string | null;
    pickup_branch_id?: string | null;
    delivery_details?: string | null;
    status: InvoiceStatus;
    type: 'invoice' | 'offer';
    subtype?: string;
    commercial_document_type?: string;
    commercial_status?: string;
    accounting_state?: string;
    accounting_status?: string;
    vat_status?: string;
    inventory_status?: string;
    payment_status?: string;
    fiscalization_status?: string;
    source_document_type?: string;
    source_document_id?: string;
    original_invoice_id?: string;
    advance_applied_amount?: number;
    buyer_signature_url?: string;
    customer_signature_requested?: boolean;
    customer_signature_status?: 'not_requested' | 'pending' | 'signed' | 'declined';
    customer_signature_name?: string;
    customer_signed_at?: string;
    show_product_pictures?: boolean;
    discount_amount: number;
    discount_percent?: number;
    tax_amount: number;
    total_amount: number;
    notes?: string;
    template_id: string;
    // New fields
    recurring_interval?: 'monthly' | 'yearly';
    last_recurring_date?: string;
    payment_method?: PaymentMethod;
    amount_received?: number;
    change_amount?: number;
    paper_size?: 'A4' | 'A5' | 'Receipt';
    created_at: string;
    client?: Client;
    items?: InvoiceItem[];
}

export interface InvoiceItem {
    id: string;
    invoice_id: string;
    product_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
    tax_included?: boolean;
    discount?: number;
    amount: number;
    unit?: string;
    sku?: string;
    image_url?: string;
}

export interface Payment {
    id: string;
    user_id: string;
    company_id?: string;
    client_id?: string;
    invoice_id?: string;
    payment_number: string;
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    company_bank_account_id?: string | null;
    bank_reference?: string;
    notes?: string;
    created_at: string;
    client?: Client;
    invoice?: Invoice;
}

export interface Vendor {
    id: string;
    user_id: string;
    company_id?: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    zip_code?: string;
    country?: string;
    tax_id?: string;
    notes?: string;
    created_at: string;
}

export interface VendorPayment {
    id: string;
    user_id: string;
    company_id?: string;
    vendor_id?: string;
    payment_number: string;
    amount: number;
    payment_date: string;
    payment_method: PaymentMethod;
    bank_reference?: string;
    description?: string;
    notes?: string;
    created_at: string;
    vendor?: Vendor;
}

export interface SupplierBill {
    id: string;
    user_id: string;
    company_id?: string;
    vendor_id: string;
    bill_number: string;
    issue_date: string;
    due_date?: string;
    total_amount: number;
    tax_amount: number;
    status: 'unpaid' | 'paid' | 'partial';
    notes?: string;
    document_url?: string;
    created_at: string;
    vendor?: Vendor;
    items?: SupplierBillItem[];
}

export interface SupplierBillItem {
    id: string;
    bill_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
}

export interface Contract {
    id: string;
    user_id: string;
    company_id?: string;
    client_id?: string;
    template_id?: string;
    contract_number?: string;
    title: string;
    status: 'draft' | 'pending_approval' | 'approved' | 'ready' | 'sent' | 'viewed' | 'partially_signed' | 'signed' | 'active' | 'expired' | 'terminated' | 'declined' | 'cancelled';
    type: 'service_agreement' | 'nda' | 'employment' | 'general' | string;
    category?: string;
    language?: 'en' | 'sq' | string;
    content: Record<string, any>; // Stores answers/variables
    parties?: ContractParty[];
    variables?: Record<string, any>;
    settings?: Record<string, any>;
    financial_terms?: Record<string, any>;
    signers?: ContractSigner[];
    approval_status?: string;
    provider?: string;
    provider_envelope_id?: string;
    signed_document_path?: string;
    last_activity_at?: string;
    html_body?: string;
    signature_url?: string;
    counterparty_signature_url?: string;
    created_at: string;
    updated_at: string;
    client?: Client;
}

export interface ContractTemplateField {
    id: string;
    label: string;
    placeholder?: string;
    type: string;
    required?: boolean;
    options?: string[]; // for select type
    key?: string;
    variable?: string;
    helpText?: string;
    defaultValue?: string;
    order?: number;
    visibility?: ContractCondition;
}

export type ContractConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
export interface ContractCondition {
    field: string;
    operator: ContractConditionOperator;
    value?: string | number | boolean;
    action?: 'show' | 'hide' | 'include';
    target?: string;
}

export type ContractBlock = {
    id: string;
    type: 'title' | 'heading' | 'paragraph' | 'numbered_clause' | 'bullet_list' | 'numbered_list' | 'table' | 'divider' | 'page_break' | 'variable' | 'signature' | 'conditional_section';
    text?: string;
    level?: number;
    rows?: string[][];
    variable?: string;
    condition?: ContractCondition;
    order: number;
};

export interface ContractParty {
    id: string;
    role: string;
    source: 'company' | 'customer' | 'employee' | 'supplier' | 'contact' | 'manual';
    sourceId?: string;
    name?: string;
    email?: string;
    data?: Record<string, any>;
}

export interface ContractSigner {
    id: string;
    role: string;
    partyId?: string;
    nameVariable?: string;
    emailVariable?: string;
    required: boolean;
    order: number;
    initialsRequired?: boolean;
    signedAt?: string;
}

export interface ContractTemplate {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    fields: ContractTemplateField[];
    created_at: string;
    updated_at: string;
    company_id?: string;
    category?: string;
    language?: 'en' | 'sq';
    tags?: string[];
    numbering?: Record<string, any>;
    parties?: ContractParty[];
    blocks?: ContractBlock[];
    settings?: Record<string, any>;
    financial_terms?: Record<string, any>;
    signers?: ContractSigner[];
    appearance?: Record<string, any>;
}

export interface InvoiceData {
    company: {
        name: string;
        address: string;
        city?: string;
        country?: string;
        email?: string;
        phone?: string;
        website?: string;
        taxId?: string;
        businessId?: string;
        vatNumber?: string;
        logoUrl?: string;
        signatureUrl?: string;
        stampUrl?: string;
        bankName?: string;
        bankAccount?: string;
        bankIban?: string;
        bankSwift?: string;
        primaryColor?: string;
        isGrayscale?: boolean;
        paymentLinkStripe?: string;
        paymentLinkPaypal?: string;
    };
    client: {
        name: string;
        address: string;
        email: string;
        phone?: string;
        taxId?: string;
        nui?: string;
        fiscalNumber?: string;
        vatNumber?: string;
        deliveryName?: string;
        deliveryAddress?: string;
        deliveryContact?: string;
    };
    details: {
        number: string;
        issueDate: string;
        dueDate: string;
        currency: string;
        language?: string;
        notes?: string;
        terms?: string;
        buyerSignatureUrl?: string;
        type?: 'invoice' | 'offer';
        subtype?: string;
        /** Canonical commercial identity; never infer this from the PDF title. */
        commercialDocumentType?: string;
        documentTypeLabel?: string;
        supplyDate?: string;
        customerPoNumber?: string;
        fiscalizationStatus?: string;
        fiscalNumber?: string;
        vatReference?: string;
        showBuyerSignature?: boolean;
        paymentMethod?: PaymentMethod;
        amountReceived?: number;
        changeAmount?: number;
        // Kosovo invoice fields
        department?: string;
        reference?: string;
        agent?: string;
        yourReference?: string;
        paymentTerms?: string;
        amountInWords?: string;
        deliveryMethod?: string;
        deliveryDetails?: string;
        showProductPictures?: boolean;
        /** Per-invoice choice used by the mobile creation preview. */
        showStampOnInvoice?: boolean;
        /** Opaque public QR reference; never use an invoice number as a bearer token. */
        qrReference?: string;
    };
    items: Array<{
        description: string;
        quantity: number;
        price: number;
        /** Final line amount after discounts and VAT. */
        total: number;
        /** Tax-exclusive line amount used by the accounting calculation. */
        taxable?: number;
        /** VAT amount for this line. */
        tax?: number;
        /** Whether the entered unit price already contains VAT. */
        taxIncluded?: boolean;
        unit?: string;
        sku?: string;
        discount?: number;
        taxRate?: number;
        imageUrl?: string;
    }>;
    summary: {
        subtotal: number;
        tax: number;
        discount: number;
        total: number;
        amountReceived?: number;
        changeAmount?: number;
        discountPercent?: number;
    };
    config?: TemplateConfig;
}

export type TemplateType = 'corporate' | 'thermal';


export interface Company {
    id: string;
    company_name: string;
    parent_company_id?: string | null;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    website?: string;
    logo_url?: string;
    signature_url?: string;
    stamp_url?: string;
    currency: string;
    tax_rate: number;
    tax_name: string;
    tax_id?: string;
    bank_name?: string;
    bank_account?: string;
    bank_iban?: string;
    bank_swift?: string;
    payment_link_stripe?: string;
    payment_link_paypal?: string;
    invoice_language?: string;
    terms_conditions?: string;
    primary_color: string;
    is_grayscale: boolean;
    template_config?: TemplateConfig;
    created_at: string;
}

export interface Membership {
    id: string;
    user_id: string;
    company_id: string;
    role: 'owner' | 'admin' | 'manager' | 'employee';
    created_at: string;
    company?: Company;
}

export interface Compliance {
    id: string;
    company_id: string;
    title: string;
    description?: string;
    status: 'pending' | 'completed' | 'expired';
    due_date?: string;
    completed_at?: string;
    attachment_url?: string;
    created_at: string;
}
