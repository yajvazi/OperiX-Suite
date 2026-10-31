import { refreshDailySalesWidget } from '../../services/iosWidgetService';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Modal,
    Switch,
    TextInput
} from 'react-native';
import {
    ArrowLeft,
    Save,
    Calendar,
    User,
    Plus,
    ScanLine,
    Trash2,
    FileText,
    CreditCard,
    Banknote,
    Landmark,
    Globe2,
    Clock3,
    Store,
    Truck,
    BusFront,
    Check,
    Search,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Hash,
    AlignLeft,
    CircleHelp,
    Eye,
    X
} from 'lucide-react-native';
import { BarcodeScannerModal } from '../../components/mobile/BarcodeScannerModal';
import { WebView } from 'react-native-webview';
import { generateInvoiceHtml } from '../../services/pdf/TemplateFactory';
import { useAuth } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { dueDateForPreset, isCashPaymentAllowed, TAX_REPORTING_CATEGORIES, taxReportingCategoryLabel } from '@invoice-monorepo/api/domain';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input, SignaturePadModal } from '@invoice-monorepo/ui';
import { Invoice, InvoiceItem, Client, Product, Profile, PaymentMethod } from '@invoice-monorepo/types';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { calculateInvoice } from '@invoice-monorepo/money';
import { applySalesBookAmendment, buildSalesBookAmendmentPayload, completePosSale, getAgentSignature, getInvoice, getPreferredBranchId, listBranches, listCustomers, listInvoices, listProductBranchStock, listProducts, saveCustomerPayment, saveInvoiceDocument, setInvoiceBranch, setInvoiceDeliveryDetails, setInvoiceProductPictures, type InvoiceDraftInput } from '@invoice-monorepo/api/repositories';
import type { CommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import {
    COMMERCIAL_DOCUMENT_TYPES,
    DOCUMENT_DEFINITIONS,
    documentTypeLabel,
    resolveCommercialDocumentType,
} from '@invoice-monorepo/commercial-documents';
import { normalizeBrandColor } from '../../theme/brand';
import { getActiveProductCompanyIds, getWorkspaceScope, hasWorkspacePermission } from '../../services/workspace';
import { getDataStore } from '../../services/dataStore';
import { DecimalInput } from '../../components/mobile/DecimalInput';
import { notifyInvoiceCreated } from '../../services/pushNotifications';
import { openExternalLink } from '../../services/externalLinks';
import { getHelpdeskArticleUrl } from '../../services/helpDocumentation';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../../services/mobileCache';
import * as Crypto from 'expo-crypto';
import { ModalBackdrop } from '../../components/mobile/ModalBackdrop';
interface InvoiceFormScreenProps {
    navigation: any;
    route: any;
}
const wholePercentageValue = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, Math.trunc(parsed)));
};
const documentTypeHelpKeys = {
    QUOTE: 'documentTypeHelpQuote',
    PROFORMA: 'documentTypeHelpProforma',
    SALES_ORDER: 'documentTypeHelpSalesOrder',
    DELIVERY_NOTE: 'documentTypeHelpDeliveryNote',
    INVOICE: 'documentTypeHelpInvoice',
    ADVANCE_INVOICE: 'documentTypeHelpAdvanceInvoice',
    FINAL_INVOICE: 'documentTypeHelpFinalInvoice',
    CREDIT_NOTE: 'documentTypeHelpCreditNote',
    DEBIT_NOTE: 'documentTypeHelpDebitNote',
    SIMPLIFIED_INVOICE: 'documentTypeHelpSimplifiedInvoice',
    FISCAL_RECEIPT: 'documentTypeHelpFiscalReceipt',
    BAD_DEBT_INVOICE: 'documentTypeHelpBadDebtInvoice',
} as const;
const wholePercentageText = (text: string) => {
    const integerPart = text.split(/[.,]/, 1)[0].replace(/\D/g, '');
    return integerPart ? String(wholePercentageValue(integerPart)) : '';
};
const paymentTypeLabel = (value: PaymentMethod, language: 'en' | 'sq') => {
    switch (value) {
        case 'cash': return t('cash', language);
        case 'bank': return t('bankTransfer', language);
        case 'card': return t('card', language);
        case 'online_payment': return t('onlinePayment', language);
        case 'cheque': return t('cheque', language);
        case 'other': return t('other', language);
        case 'customer_credit': return t('debt', language);
        default: return value;
    }
};
type DeliveryMethod = 'pickup' | 'delivery' | 'bus' | 'other';
type DueDatePreset = 'one_week' | 'two_weeks' | 'one_month' | 'two_months' | 'three_months' | 'custom';
type StoreLocation = {
    id: string;
    name: string;
    code?: string | null;
    registered_address?: string | null;
    municipality?: string | null;
};
function toMinorCurrencyUnits(value: number) {
    return Math.round((Number.isFinite(value) ? value : 0) * 100);
}
export function InvoiceFormScreen({ navigation, route }: InvoiceFormScreenProps) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const { invoiceId, clientId, type = 'invoice', subtype = 'regular', documentType: routeDocumentType, sourceDocumentId, documentKey, salesBookAmendmentId, posCart, posCustomerId, posPaymentMethod, posIdempotencyKey } = route.params || {};
    const initialDocumentType = (routeDocumentType || resolveCommercialDocumentType({ type, subtype })) as CommercialDocumentType;
    const isPosFlow = Array.isArray(posCart) && posCart.length > 0;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedPopup, setSavedPopup] = useState<{ invoiceId: string; message: string } | null>(null);
    const saveInFlight = useRef(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    // Form State
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [issueDate, setIssueDate] = useState(new Date());
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [dueDatePreset, setDueDatePreset] = useState<DueDatePreset | null>(null);
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);
    const [deliveryDetails, setDeliveryDetails] = useState('');
    const [postCod, setPostCod] = useState(false);
    const [taxReportingCategory, setTaxReportingCategory] = useState('');
    const [showTaxCategoryPicker, setShowTaxCategoryPicker] = useState(false);
    const [pickupBranchId, setPickupBranchId] = useState<string | null>(null);
    const [invoiceBranchId, setInvoiceBranchId] = useState<string | null>(null);
    const [storeLocations, setStoreLocations] = useState<StoreLocation[]>([]);
    const [branchStockByProduct, setBranchStockByProduct] = useState<Record<string, number>>({});
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [walkInCustomer, setWalkInCustomer] = useState<Client | null>(null);
    const [items, setItems] = useState<Partial<InvoiceItem>[]>([]);
    const [notes, setNotes] = useState('');
    const [discount, setDiscount] = useState<string>('0'); // Persist as string for input
    const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue'>('draft');
    const [commercialStatus, setCommercialStatus] = useState('DRAFT');
    const [accountingState, setAccountingState] = useState('legacy');
    const [documentType, setDocumentType] = useState<CommercialDocumentType>(initialDocumentType);
    const [linkedSourceDocumentId, setLinkedSourceDocumentId] = useState<string | null>(sourceDocumentId || null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank');
    const [amountReceived, setAmountReceived] = useState('');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    const [workspaceRole, setWorkspaceRole] = useState('');
    const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
    const [customerSignatureRequested, setCustomerSignatureRequested] = useState(false);
    const [customerSignature, setCustomerSignature] = useState<string | null>(null);
    const [showCustomerSignaturePad, setShowCustomerSignaturePad] = useState(false);
    const [showProductPictures, setShowProductPictures] = useState(true);
    // Pickers
    const [showClientPicker, setShowClientPicker] = useState(false);
    const [showProductPicker, setShowProductPicker] = useState(false);
    const [scanningProduct, setScanningProduct] = useState(false);
    const [showLinkedDocumentPicker, setShowLinkedDocumentPicker] = useState(false);
    const [linkedDocuments, setLinkedDocuments] = useState<Array<Record<string, any>>>([]);
    const [loadingLinkedDocuments, setLoadingLinkedDocuments] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showDueDateOptions, setShowDueDateOptions] = useState(false);
    const [showPickupBranchPicker, setShowPickupBranchPicker] = useState(false);
    const [showDocumentTypePicker, setShowDocumentTypePicker] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'issue' | 'due'>('issue');
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [showInvoiceStamp, setShowInvoiceStamp] = useState(true);
    const [showInvoiceSignature, setShowInvoiceSignature] = useState(true);
    // Preview State
    const [showPreview, setShowPreview] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const bgColor = isDark ? '#0A0A0B' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#151517' : '#ffffff';
    const borderColor = isDark ? '#262629' : '#E4E9F0';
    const modalBackdropColor = isDark ? 'rgba(0,0,0,0.96)' : 'rgba(0,0,0,0.72)';
    const currency = profile?.currency || 'EUR';
    const canPermission = (permission: string) => platformAdmin || workspacePermissions.includes(permission);
    const isCompanyAdminUser = platformAdmin || workspaceRole === 'company_administrator';
    // Set after an administrator confirms correcting an invoice that issued stock; the next save uses that workflow.
    const stockCorrectionConfirmed = useRef(false);
    const canApplyDiscount = canPermission('invoice.apply_discount');
    const canChangeDates = canPermission('invoice.change_dates');
    const documentPermission = (typeOption: CommercialDocumentType) => typeOption === 'QUOTE' ? 'offer.create'
        : typeOption === 'PROFORMA' ? 'proforma.create'
            : typeOption === 'SALES_ORDER' ? 'order.create'
                : typeOption === 'DELIVERY_NOTE' ? 'delivery_note.create'
                    : typeOption === 'CREDIT_NOTE' ? 'invoice.credit'
                        : typeOption === 'DEBIT_NOTE' ? 'invoice.debit'
                            : 'invoice.create';
    const selectedCustomerIsWalkIn = !selectedClient || selectedClient.pos_walk_in_customer === true;
    const selectedCustomerName = selectedCustomerIsWalkIn ? t('walkInCustomer', language) : selectedClient?.name || t('walkInCustomer', language);
    const selectedPickupLocation = storeLocations.find((location) => location.id === pickupBranchId) || null;
    const selectedOperatingBranch = storeLocations.find((location) => location.id === invoiceBranchId) || null;
    const operatingBranchLabel = selectedOperatingBranch
        ? selectedOperatingBranch.code || ''
        : '';
    const resolvedDeliveryDetails = deliveryMethod === 'pickup'
        ? selectedPickupLocation
            ? [selectedPickupLocation.name, selectedPickupLocation.registered_address, selectedPickupLocation.municipality].filter(Boolean).join(', ')
            : deliveryDetails.trim()
        : deliveryDetails.trim();
    const replaceInvoiceDocument = Boolean(
        invoiceId
        && documentType === 'INVOICE'
        && (
            accountingState === 'posted'
            || !['DRAFT', 'SENT', 'VIEWED'].includes(String(commercialStatus || '').toUpperCase())
        )
    );
    useEffect(() => {
        void loadData();
    }, [user?.id]);
    // The customer form is opened on top of this screen. Refresh only the
    // customer collection when returning so a newly-created customer is
    // available without resetting the invoice draft.
    useFocusEffect(
        useCallback(() => {
            if (!user || loading) return;
            void refreshClients();
        }, [user?.id, loading])
    );
    // A customer created from this form's picker comes back as a route param: select it as soon as the list has it.
    useEffect(() => {
        const createdId = route.params?.createdClientId as string | undefined;
        if (!createdId) return;
        const created = clients.find((client) => client.id === createdId);
        if (!created) return;
        setSelectedClient(created);
        setLinkedSourceDocumentId(null);
        setDiscount(created.discount_percent ? (wholePercentageText(String(created.discount_percent)) || '0') : '0');
        navigation.setParams({ createdClientId: undefined });
    }, [clients, route.params?.createdClientId]);
    const refreshClients = async () => {
        if (!user) return;
        try {
            const store = await getDataStore(user.id);
            const { companyIds } = await getWorkspaceScope(user.id);
            const data = store.mode === 'local' ? await store.list('clients', { orderBy: 'name' }) : await listCustomers(supabase, { userId: user.id, companyIds });
            const clientRows = data as unknown as Client[];
            setClients(clientRows);
            if (store.mode === 'cloud') writeMobileCache(mobileCacheKey('customers', user.id, companyIds), clientRows);
        } catch (error) {
            console.error('Unable to refresh invoice customers:', error);
        }
    };
    const loadData = async () => {
        setLoading(true);
        if (!user) {
            setLoading(false);
            return;
        }
        // Load the workspace first because its company scope includes all
        // subdivisions when a main/group company is selected.
        const workspaceScope = await getWorkspaceScope(user.id);
        setWorkspacePermissions(workspaceScope.permissions);
        setPlatformAdmin(workspaceScope.platformAdmin);
        setWorkspaceRole(String(workspaceScope.roleCode || ''));
        const { profile: workspaceProfile, company: activeCompany } = workspaceScope;
        const companyIds = workspaceScope.companyIds;
        const productCompanyIds = getActiveProductCompanyIds(workspaceScope);
        const profileData = activeCompany ? { ...workspaceProfile, ...activeCompany } : workspaceProfile;
            const resolvedCompanyId = activeCompany?.id
            || workspaceProfile?.active_company_id
            || workspaceProfile?.company_id
            || null;
        setProfile(profileData);
        setActiveCompanyId(resolvedCompanyId);
        const queryScope = { userId: user.id, companyIds };
        const customersCacheKey = mobileCacheKey('customers', user.id, companyIds);
        const productsCacheKey = mobileCacheKey('products', user.id, productCompanyIds);
        const dataStore = await getDataStore(user.id);
        const isLocalStorage = dataStore.mode === 'local';
        const storeLocationsPromise = !isLocalStorage && resolvedCompanyId && typeof (supabase as any).from === 'function'
            ? listBranches(supabase, resolvedCompanyId)
            : Promise.resolve([] as StoreLocation[]);
        const [cachedClients, cachedProducts] = await Promise.all([
            readMobileCache<Client[]>(customersCacheKey),
            readMobileCache<Product[]>(productsCacheKey),
        ]);
        if (cachedClients) setClients(cachedClients);
        if (cachedProducts) setProducts(cachedProducts);
        const clientsPromise = (isLocalStorage ? dataStore.list('clients', { orderBy: 'name' }) : listCustomers(supabase, queryScope)).then((data) => ({ data, error: null }));
        const productsPromise = (isLocalStorage ? dataStore.list('products', { orderBy: 'name' }) : listProducts(supabase, { userId: user.id, companyIds: productCompanyIds })).then((data) => ({ data, error: null }));
        const invoicePromise = invoiceId
            ? (isLocalStorage
                ? dataStore.getInvoice(invoiceId)
                : getInvoice(supabase, invoiceId, queryScope, '*, client:clients(*), items:invoice_items(*, product:products(sku, name, image_url))')).then((data) => ({ data, error: null }))
            : Promise.resolve({ data: null, error: null });
        const walkInCustomerPromise = !invoiceId && !isPosFlow && resolvedCompanyId
            ? (isLocalStorage
                ? dataStore.list('clients', { where: { pos_walk_in_customer: true }, limit: 1 })
                    .then(async (existing) => ({ data: existing[0] ?? await dataStore.save('clients', { name: t('walkInCustomer', language), pos_walk_in_customer: true }), error: null }))
                : supabase.rpc('ensure_walk_in_customer', { p_company_id: resolvedCompanyId }))
            : Promise.resolve({ data: null, error: null } as any);
        const [clientsResult, productsResult, invoiceResult, walkInCustomerResult, storeLocationsResult] = await Promise.all([
            clientsPromise,
            productsPromise,
            invoicePromise,
            walkInCustomerPromise,
            storeLocationsPromise,
        ]);
        const clientsData = clientsResult.data;
        const productsData = productsResult.data;
        const storeRows = (storeLocationsResult || []) as unknown as StoreLocation[];
        setStoreLocations(storeRows);
        const clientRows = clientsData as unknown as Client[];
        const productRows = productsData as unknown as Product[];
        if (clientsData) {
            setClients(clientRows);
            if (!isLocalStorage) writeMobileCache(customersCacheKey, clientRows);
        }
        if (productsData) {
            setProducts(productRows);
            if (!isLocalStorage) writeMobileCache(productsCacheKey, productRows);
        }
        const existingWalkInCustomer = clientRows.find((client) => client.pos_walk_in_customer) || null;
        const ensuredWalkInCustomer = (walkInCustomerResult.data || existingWalkInCustomer) as Client | null;
        if (ensuredWalkInCustomer) setWalkInCustomer(ensuredWalkInCustomer);
        if (!invoiceId) {
            const preferredBranchId = !isLocalStorage && resolvedCompanyId && user?.id
                ? await getPreferredBranchId(supabase, user.id, resolvedCompanyId).catch(() => null)
                : null;
            const defaultBranchId = preferredBranchId && storeRows.some((row) => row.id === preferredBranchId)
                ? preferredBranchId
                : storeRows.length === 1 ? storeRows[0].id : null;
            if (defaultBranchId) {
                setInvoiceBranchId(defaultBranchId);
                setPickupBranchId(defaultBranchId);
                const branchStock = await listProductBranchStock(supabase, resolvedCompanyId!, defaultBranchId).catch(() => []);
                setBranchStockByProduct(Object.fromEntries(branchStock.map((row) => [row.product_id, Number(row.stock_quantity) || 0])));
            }
            const initialClientId = clientId || posCustomerId;
            if (initialClientId && clientsData) {
                const initialClient = clientRows.find((client) => client.id === initialClientId);
                if (initialClient) setSelectedClient(initialClient);
            } else if (!isPosFlow && ensuredWalkInCustomer) {
                setSelectedClient(ensuredWalkInCustomer);
            }
            if (Array.isArray(posCart)) {
                setItems(posCart.map((item: any) => ({
                    id: `pos-${item.productId ?? Crypto.randomUUID()}`,
                    product_id: item.productId,
                    description: item.name,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    tax_rate: item.taxRate || 0,
                    tax_included: Boolean(item.taxIncluded),
                    unit: item.unit || 'pcs',
                    sku: item.sku || '',
                    discount: 0,
                    amount: Number(item.unitPrice || 0) * Number(item.quantity || 0),
                })));
            }
            if (posPaymentMethod) {
                setPaymentMethod(posPaymentMethod === 'cash' ? 'cash' : posPaymentMethod === 'card' ? 'card' : 'bank');
            }
        }
        // Load the invoice and its line items in the same request when editing.
        if (invoiceId) {
            const invoice = invoiceResult.data as any;
            if (invoice) {
                const resolvedType = resolveCommercialDocumentType(invoice);
                setDocumentType(resolvedType);
                setLinkedSourceDocumentId(invoice.source_document_id || sourceDocumentId || null);
                setAccountingState(String(invoice.accounting_state || 'legacy').toLowerCase());
                setInvoiceNumber(invoice.invoice_number);
                setIssueDate(new Date(invoice.issue_date));
                if (invoice.due_date) {
                    setDueDate(new Date(invoice.due_date));
                    setDueDatePreset('custom');
                }
                setDeliveryMethod((invoice.delivery_method as DeliveryMethod | null) || null);
                setDeliveryDetails(invoice.delivery_details || '');
                setPostCod(Boolean(invoice.post_cod));
                setTaxReportingCategory(String(invoice.tax_reporting_category || ''));
                setPickupBranchId(invoice.pickup_branch_id || null);
                setInvoiceBranchId(invoice.branch_id || invoice.pickup_branch_id || null);
                if (invoice.branch_id && resolvedCompanyId) {
                    const branchStock = await listProductBranchStock(supabase, resolvedCompanyId, invoice.branch_id).catch(() => []);
                    setBranchStockByProduct(Object.fromEntries(branchStock.map((row) => [row.product_id, Number(row.stock_quantity) || 0])));
                }
                setNotes(invoice.notes || '');
                setStatus(invoice.status);
                setCommercialStatus(invoice.commercial_status || invoice.status?.toUpperCase() || 'DRAFT');
                setPaymentMethod(invoice.payment_method || 'bank');
                setAmountReceived(invoice.amount_received ? String(invoice.amount_received) : '');
                const invoiceClient = (invoice as any).client as Client | null;
                setSelectedClient(invoiceClient);
                if (invoiceClient?.pos_walk_in_customer) setWalkInCustomer(invoiceClient);
                setDiscount(wholePercentageText(String(invoice.discount_percent || 0)) || '0');
                setCustomerSignatureRequested(Boolean(invoice.customer_signature_requested));
                setCustomerSignature(invoice.buyer_signature_url || null);
                setShowProductPictures(Boolean(invoice.show_product_pictures));
                if (invoice.items) setItems(invoice.items.map((item: any) => ({
                    ...item,
                    id: item.id || Crypto.randomUUID(),
                    discount: wholePercentageValue(item.discount),
                    image_url: item.image_url || item.product?.image_url || undefined,
                })));
            }
        } else {
            // The number is reserved transactionally only when the document is
            // saved. Draft screens must never calculate a number from a list.
            setInvoiceNumber('');
        }
        setLoading(false);
    };

    const closeProductPicker = useCallback(() => {
        Keyboard.dismiss();
        setProductSearch('');
        setShowProductPicker(false);
    }, []);

    const openProductPicker = useCallback(() => {
        Keyboard.dismiss();
        setProductSearch('');
        setShowProductPicker(true);
    }, []);

    const closeClientPicker = useCallback(() => {
        Keyboard.dismiss();
        setClientSearch('');
        setShowClientPicker(false);
    }, []);

    const openClientPicker = useCallback(() => {
        Keyboard.dismiss();
        setShowClientPicker(true);
    }, []);

    // A scanned barcode adds the matching product to the invoice; with no match it is searched for instead.
    const handleProductScanned = (rawCode: string) => {
        setScanningProduct(false);
        const code = rawCode.trim().toLowerCase();
        const matches = products.filter((product) => [(product as any).barcode, (product as any).sku].some((value) => String(value ?? '').trim().toLowerCase() === code));
        if (matches.length === 1) { handleAddItem(matches[0]); return; }
        setProductSearch(rawCode);
        if (!matches.length) Alert.alert(t('scanBarcode', language), t('noProductForBarcode', language).replace('{code}', rawCode));
    };

    const handleAddItem = (product?: Product) => {
        // The same product is never added as a second line; its quantity goes up instead.
        const existingIndex = product?.id ? items.findIndex((line) => line.product_id === product.id) : -1;
        if (existingIndex >= 0) {
            handleUpdateItem(existingIndex, 'quantity', (Number(items[existingIndex].quantity) || 0) + 1);
            closeProductPicker();
            return;
        }
        const currentGlobalDiscount = wholePercentageValue(discount);
        const newItem: Partial<InvoiceItem> = {
            id: `temp-${Crypto.randomUUID()}`,
            description: product?.name || '',
            quantity: 1,
            unit_price: product?.unit_price || 0,
            amount: product?.unit_price || 0,
            product_id: product?.id,
            tax_rate: product?.tax_rate || 0,
            tax_included: Boolean(product?.tax_included),
            discount: currentGlobalDiscount,
            sku: (product as any)?.sku || '',
            image_url: product?.image_url,
        };

        // Calculate initial amount with discount
        const price = newItem.unit_price || 0;
        const subtotal = 1 * price;
        const discountAmount = subtotal * (currentGlobalDiscount / 100);
        newItem.amount = subtotal - discountAmount;

        setItems((currentItems) => [...currentItems, newItem]);
        closeProductPicker();
    };

    const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...items];
        const nextValue = field === 'discount' ? wholePercentageValue(value) : value;
        newItems[index] = { ...newItems[index], [field]: nextValue };

        // Recalculate amount including discount
        const qty = Number(newItems[index].quantity) || 0;
        const price = Number(newItems[index].unit_price) || 0;
        const discountPercent = wholePercentageValue(newItems[index].discount);

        // amount = (qty * price) - discount
        const subtotal = qty * price;
        const discountAmount = subtotal * (discountPercent / 100);
        newItems[index].amount = subtotal - discountAmount;

        setItems(newItems);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleDeliveryMethodChange = (method: DeliveryMethod) => {
        if (deliveryMethod === method) {
            setDeliveryMethod(null);
            setDeliveryDetails('');
            setPostCod(false);
            setPickupBranchId(null);
            return;
        }
        setDeliveryMethod(method);
        setDeliveryDetails('');
        if (method !== 'delivery') setPostCod(false);
        const defaultBranch = method === 'pickup' && storeLocations.length === 1 ? storeLocations[0].id : null;
        setPickupBranchId(defaultBranch);
        if (defaultBranch) setInvoiceBranchId(defaultBranch);
    };

    const loadLinkedDocuments = async () => {
        if (!user || !selectedClient?.id || selectedClient.pos_walk_in_customer) {
            Alert.alert(t('linkDocument', language), t('selectCustomerForLinking', language));
            return;
        }
        setLoadingLinkedDocuments(true);
        try {
            const linkStore = await getDataStore(user.id);
            const workspaceScope = await getWorkspaceScope(user.id);
            const rows = linkStore.mode === 'local' ? await linkStore.listInvoices({ clientId: selectedClient.id }) : await listInvoices(supabase, { userId: user.id, companyIds: workspaceScope.companyIds }, {
                select: 'id,invoice_number,client_id,issue_date,due_date,status,type,subtype,commercial_document_type,commercial_status,total_amount,discount_percent,notes,items:invoice_items(*)',
                clientId: selectedClient.id,
            });
            const sourceRows = (rows as Array<Record<string, any>>)
                .filter((row) => ['QUOTE', 'PROFORMA', 'SALES_ORDER'].includes(resolveCommercialDocumentType(row)));
            setLinkedDocuments(sourceRows);
            setShowLinkedDocumentPicker(true);
        } catch (error) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'unableToLoad'));
        } finally {
            setLoadingLinkedDocuments(false);
        }
    };

    const applyLinkedDocument = (source: Record<string, any>) => {
        const sourceItems = Array.isArray(source.items) ? source.items : [];
        setLinkedSourceDocumentId(String(source.id));
        setItems(sourceItems.map((item: any) => ({
            id: item.id || Crypto.randomUUID(),
            product_id: item.product_id || null,
            description: item.description || item.product?.name || '',
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            tax_rate: Number(item.tax_rate || 0),
            tax_included: Boolean(item.tax_included),
            unit: item.unit || 'pcs',
            sku: item.sku || item.product?.sku || '',
            discount: wholePercentageValue(item.discount),
            amount: Number(item.amount || 0),
        })));
        setNotes(source.notes || '');
        setDiscount(wholePercentageText(String(source.discount_percent || 0)) || '0');
        if (source.due_date) {
            setDueDate(new Date(source.due_date));
            setDueDatePreset('custom');
        }
        setShowLinkedDocumentPicker(false);
    };

    const calculateTotals = () => calculateInvoice({
        lines: items.map((item) => ({
            quantity: item.quantity || 0,
            unitPrice: item.unit_price || 0,
            discountPercent: wholePercentageValue(item.discount),
            taxRate: item.tax_rate || 0,
            taxIncluded: Boolean(item.tax_included),
        })),
        paidAmount: paymentMethod === 'cash' ? Number(amountReceived) || 0 : 0,
        currency: profile?.currency || 'EUR',
    });

    const handleSave = async () => {
        if (saveInFlight.current) return;
        if (!user) return;
        const workspaceScope = await getWorkspaceScope(user.id);
        const can = (permission: string) => hasWorkspacePermission(workspaceScope, permission);
        const documentCreatePermission = documentType === 'QUOTE' ? 'offer.create'
            : documentType === 'PROFORMA' ? 'proforma.create'
                : documentType === 'SALES_ORDER' ? 'order.create'
                    : documentType === 'DELIVERY_NOTE' ? 'delivery_note.create'
                        : documentType === 'CREDIT_NOTE' ? 'invoice.credit'
                            : documentType === 'DEBIT_NOTE' ? 'invoice.debit'
                                : 'invoice.create';
        const canCreateDocument = can(documentCreatePermission);
        // Company administrators can edit any invoice they can open; the database still enforces its own rules.
        const canEditExistingDocument = can('invoice.edit') || workspaceScope.platformAdmin || workspaceScope.roleCode === 'company_administrator';
        const canIssueDocument = documentType === 'INVOICE' && can('invoice.issue');
        if ((!invoiceId && !canCreateDocument) || (invoiceId && !canEditExistingDocument && !salesBookAmendmentId) || (salesBookAmendmentId && !can('sales_book.manage'))) {
            Alert.alert(t('error', language), t('permissionDenied', language));
            return;
        }
        if (items.length === 0) {
            Alert.alert(t('error', language), t('pleaseAddItem', language));
            return;
        }
        const productIds = items.map((line) => line.product_id).filter(Boolean);
        if (new Set(productIds).size !== productIds.length) {
            Alert.alert(t('error', language), language === 'sq' ? 'I njëjti produkt shfaqet më shumë se një herë. Bashkojini rreshtat dhe rritni sasinë.' : 'The same product appears more than once. Merge the lines and raise the quantity instead.');
            return;
        }
        if (storeLocations.length > 0 && !invoiceBranchId) {
            Alert.alert(t('error', language), language === 'sq' ? 'Zgjidhni degën e faturës.' : 'Select the invoice branch.');
            return;
        }
        if (documentType === 'INVOICE' && customerSignatureRequested && !customerSignature) {
            setShowCustomerSignaturePad(true);
            return;
        }
        if (deliveryMethod === 'pickup' && storeLocations.length > 0 && !pickupBranchId) {
            Alert.alert(t('error', language), t('selectPickupStore', language));
            return;
        }
        if (documentType === 'INVOICE' && paymentMethod === 'cash' && Number(amountReceived || 0) > 0 && !can('payment.create')) {
            Alert.alert(t('error', language), t('permissionDenied', language));
            return;
        }
        if (isPosFlow && (!can('invoice.issue') || !can('payment.create'))) {
            Alert.alert(t('error', language), t('permissionDenied', language));
            return;
        }
        saveInFlight.current = true;
        setSaving(true);
        try {
            const totals = calculateTotals();
            const companyId = activeCompanyId;
            if (!companyId || !user?.id) throw new Error(t('selectCompany', language));

            let customerForInvoice = selectedClient;
            const isLocalStorage = (await getDataStore(user.id)).mode === 'local';
            if (!isPosFlow && !customerForInvoice) {
                const { data: ensuredCustomer, error: customerError } = isLocalStorage
                    ? await (async () => {
                        const localStore = await getDataStore(user.id);
                        const existing = (await localStore.list('clients', { where: { pos_walk_in_customer: true }, limit: 1 }))[0];
                        return { data: existing ?? await localStore.save('clients', { name: t('walkInCustomer', language), pos_walk_in_customer: true }), error: null };
                    })()
                    : await supabase.rpc('ensure_walk_in_customer', { p_company_id: companyId });
                if (customerError) throw customerError;
                if (!ensuredCustomer) throw new Error(t('walkInCustomerUnavailable', language));
                customerForInvoice = ensuredCustomer as Client;
                setWalkInCustomer(customerForInvoice);
                setSelectedClient(customerForInvoice);
            }

            const issueDateOnly = issueDate.toISOString().split('T')[0];
            const dueDateOnly = dueDate ? dueDate.toISOString().split('T')[0] : null;
            const signatureRequested = documentType === 'INVOICE' && customerSignatureRequested;
            const amountPaid = documentType === 'INVOICE' && paymentMethod === 'cash'
                ? (isPosFlow ? totals.total : Number(amountReceived) || 0)
                : 0;
            const cashIsFullyPaid = documentType === 'INVOICE'
                && paymentMethod === 'cash'
                && toMinorCurrencyUnits(amountPaid) >= toMinorCurrencyUnits(totals.total);
            if (paymentMethod === 'cash' && !isCashPaymentAllowed(amountPaid)) {
                Alert.alert(t('cashLimitTitle', language), t('cashLimitError', language));
                return;
            }
            if (paymentMethod === 'cash' && toMinorCurrencyUnits(amountPaid) < toMinorCurrencyUnits(totals.total)) {
                Alert.alert(t('paymentAmountTitle', language), t('paymentAmountMustCover', language));
                return;
            }

            const domainDraft: InvoiceDraftInput = {
                userId: user.id,
                companyId,
                branchId: invoiceBranchId,
                clientId: customerForInvoice?.id || null,
                // Document numbers are always assigned by the tenant-scoped
                // allocator. Existing records retain their original number.
                invoiceNumber: invoiceId ? invoiceNumber : null,
                issueDate: issueDateOnly,
                dueDate: dueDateOnly,
                documentType,
                postCod: deliveryMethod === 'delivery' && postCod,
                taxReportingCategory: taxReportingCategory || null,
                status: status === 'paid' ? 'sent' : status,
                // A cash invoice filled with the exact amount is paid at the
                // point of creation. The payment ledger entry is registered
                // immediately after the invoice is posted below.
                commercialStatus: cashIsFullyPaid ? 'PAID' : (commercialStatus === 'DRAFT' ? 'DRAFT' : commercialStatus),
                paymentMethod,
                amountReceived: amountPaid,
                notes,
                currency: profile?.currency || 'EUR',
                sourceDocumentType: linkedSourceDocumentId || sourceDocumentId ? 'commercial_document' : null,
                sourceDocumentId: linkedSourceDocumentId || sourceDocumentId || null,
                buyerSignatureUrl: signatureRequested ? customerSignature : null,
                customerSignatureRequested: signatureRequested,
                customerSignatureStatus: signatureRequested ? (customerSignature ? 'signed' : 'pending') : 'not_requested',
                customerSignatureName: signatureRequested && customerForInvoice && !customerForInvoice.pos_walk_in_customer ? customerForInvoice.name : null,
                customerSignedAt: signatureRequested && customerSignature ? new Date().toISOString() : null,
                showProductPictures,
                lines: items.map((item) => ({
                    productId: item.product_id || null,
                    description: item.description || '',
                    quantity: item.quantity || 0,
                    unitPrice: item.unit_price || 0,
                    taxRate: item.tax_rate || 0,
                    discountPercent: wholePercentageValue(item.discount),
                    unit: item.unit || 'pcs',
                    sku: item.sku || null,
                    taxIncluded: Boolean(item.tax_included),
                })),
                idempotencyKey: posIdempotencyKey || Crypto.randomUUID(),
            };

            let savedInvoice: { id: string; invoice_number?: unknown; total_amount?: unknown; source_document_id?: unknown };
            if (salesBookAmendmentId) {
                if (!invoiceId || documentType !== 'INVOICE') throw new Error('A Sales Book amendment must target an ordinary invoice.');
                const amendmentPayload = buildSalesBookAmendmentPayload(domainDraft);
                const amended = await applySalesBookAmendment(
                    supabase,
                    salesBookAmendmentId,
                    amendmentPayload.invoice as unknown as Record<string, unknown>,
                    amendmentPayload.items as unknown as Record<string, unknown>[],
                    domainDraft.idempotencyKey,
                );
                savedInvoice = amended as typeof savedInvoice;
            } else if (isPosFlow && !invoiceId && !isLocalStorage && items.every((item) => item.product_id)) {
                const posPayment = posPaymentMethod === 'debt'
                    ? 'customer_credit'
                    : posPaymentMethod === 'other'
                        ? 'other'
                        : paymentMethod === 'online_payment' || paymentMethod === 'cheque'
                            ? 'other'
                            : paymentMethod === 'cash' || paymentMethod === 'card' || paymentMethod === 'bank'
                                ? paymentMethod
                                : 'bank';
                const posResult = await completePosSale(supabase, {
                    userId: user.id,
                    companyId,
                    branchId: invoiceBranchId,
                    customerId: customerForInvoice?.id || null,
                    lines: domainDraft.lines.map((line) => ({
                        productId: line.productId || '',
                        quantity: line.quantity,
                        unitPrice: line.unitPrice,
                        discountPercent: line.discountPercent,
                        description: line.description,
                        unit: line.unit || 'pcs',
                        sku: line.sku || null,
                    })),
                    payment: posPayment,
                    cashReceived: amountPaid,
                    notes,
                    currency: domainDraft.currency,
                    idempotencyKey: domainDraft.idempotencyKey || Crypto.randomUUID(),
                    customerSignature: {
                        requested: signatureRequested,
                        signatureUrl: signatureRequested ? customerSignature : null,
                        name: signatureRequested && customerForInvoice && !customerForInvoice.pos_walk_in_customer ? customerForInvoice.name : null,
                    },
                });
                savedInvoice = { id: posResult.invoiceId, invoice_number: posResult.invoiceNumber };
                if (posResult.paymentAllocationError) {
                    Alert.alert(t('paymentSaved', language), posResult.paymentAllocationError.message);
                }
            } else if (isLocalStorage) {
                const { userId: _userId, companyId: _companyId, lines: _lines, status: draftStatus, currency: draftCurrency, notes: draftNotes, paymentMethod: draftPaymentMethod, idempotencyKey: draftKey, issueDate: _issue, dueDate: _due, clientId: _client, documentType: _type, commercialStatus: _commercial, invoiceNumber: _number, ...extraFields } = domainDraft;
                const store = await getDataStore(user.id);
                const issuingNow = documentType === 'INVOICE' || (draftStatus !== undefined && draftStatus !== 'draft');
                const savedLocal = await store.saveInvoiceDocument({
                    id: invoiceId || undefined,
                    documentType,
                    clientId: customerForInvoice?.id || null,
                    issueDate: issueDateOnly,
                    dueDate: dueDateOnly,
                    currency: draftCurrency,
                    status: issuingNow ? 'issued' : 'draft',
                    lines: domainDraft.lines,
                    notes: draftNotes ?? undefined,
                    paymentMethod: draftPaymentMethod,
                    idempotencyKey: draftKey ?? undefined,
                    draft: extraFields,
                });
                savedInvoice = savedLocal as unknown as typeof savedInvoice;
                if (savedLocal.id && (invoiceId || deliveryMethod)) {
                    await store.save('invoices', { id: savedLocal.id, delivery_method: deliveryMethod, pickup_branch_id: pickupBranchId, delivery_details: resolvedDeliveryDetails, post_cod: deliveryMethod === 'delivery' && postCod });
                }
                if (issuingNow && !invoiceId && isPosFlow && documentType === 'INVOICE' && posPaymentMethod !== 'debt') {
                    // A POS sale is paid at the counter: record the full amount against the new invoice.
                    await store.recordCustomerPayment({
                        invoiceId: savedLocal.id,
                        amount: Number(savedLocal.total_amount),
                        paymentDate: issueDateOnly,
                        paymentMethod: posPaymentMethod === 'cash' || paymentMethod === 'cash' ? 'cash' : posPaymentMethod === 'card' || paymentMethod === 'card' ? 'card' : 'other',
                        notes: `POS sale ${String(savedLocal.invoice_number || '')}`.trim(),
                    });
                }
                if (issuingNow && !invoiceId && !isPosFlow && documentType === 'INVOICE' && paymentMethod === 'cash' && !postCod && customerForInvoice?.id && toMinorCurrencyUnits(amountPaid) >= toMinorCurrencyUnits(Number(savedLocal.total_amount))) {
                    await store.recordCustomerPayment({ invoiceId: savedLocal.id, amount: Number(savedLocal.total_amount), paymentDate: issueDateOnly, paymentMethod: 'cash', notes: `Cash payment for ${String(savedLocal.invoice_number || '')}`.trim() });
                }
            } else {
                const saved = await saveInvoiceDocument(supabase, {
                    draft: domainDraft,
                    existingInvoiceId: invoiceId,
                    // A mobile invoice save is the issue/finalize action. The
                    // backend validates and posts it atomically; non-invoice
                    // commercial documents remain drafts.
                    postInvoice: documentType === 'INVOICE' && canIssueDocument,
                    // A new finalized invoice is also an inventory issue when
                    // its lines reference stock-tracked products. The RPC
                    // ignores services/non-stock products and is idempotent.
                    stockCheckout: !invoiceId && documentType === 'INVOICE' && canIssueDocument,
                    replacePostedInvoice: replaceInvoiceDocument,
                    adminStockCorrectionReason: stockCorrectionConfirmed.current ? 'Corrected by an administrator in the mobile app' : undefined,
                    idempotencyKey: domainDraft.idempotencyKey,
                });
                savedInvoice = saved.invoice;

                // A replaced (posted) invoice keeps its branch and the database refuses direct changes to posted
                // records, so the separate branch update only runs for invoices that were not posted before.
                if (savedInvoice.id && invoiceBranchId && !replaceInvoiceDocument) {
                    await setInvoiceBranch(supabase, savedInvoice.id, invoiceBranchId);
                }

                // Ordinary invoices are posted by saveInvoiceDocument, but the
                // invoice's amount_received field is only a snapshot. When a
                // new invoice is fully settled in cash, also create the real
                // journal-backed customer payment and allocate it to the
                // invoice. POS sales already do this inside completePosSale.
                const persistedInvoiceTotal = Number(savedInvoice.total_amount);
                const cashPaymentAmount = Number.isFinite(persistedInvoiceTotal) && persistedInvoiceTotal > 0
                    ? persistedInvoiceTotal
                    : totals.total;
                // A POS sale with a custom item (no product) is saved like an ordinary invoice, so its cash payment is recorded here.
                const fullyPaidInCash = !invoiceId
                    && (!isPosFlow || !items.every((item) => item.product_id))
                    && documentType === 'INVOICE'
                    && paymentMethod === 'cash'
                    && !postCod
                    && Boolean(customerForInvoice?.id)
                    && Boolean(savedInvoice.id)
                    && cashPaymentAmount > 0
                    && toMinorCurrencyUnits(amountPaid) >= toMinorCurrencyUnits(cashPaymentAmount);

                if (fullyPaidInCash) {
                    const savedCashPayment = await saveCustomerPayment(supabase, {
                        userId: user.id,
                        companyId,
                        customerId: customerForInvoice!.id,
                        invoiceId: savedInvoice.id,
                        amount: cashPaymentAmount,
                        paymentDate: issueDateOnly,
                        paymentMethod: 'cash',
                        notes: `Cash payment for ${String(savedInvoice.invoice_number || domainDraft.invoiceNumber || '')}`.trim(),
                        currency: domainDraft.currency,
                        idempotencyKey: domainDraft.idempotencyKey,
                    });
                    if (savedCashPayment.allocationError) throw savedCashPayment.allocationError;
                }
            }

            if (!isLocalStorage && !invoiceId && documentType === 'INVOICE' && savedInvoice.id) {
                void notifyInvoiceCreated(savedInvoice.id, companyId).catch((notificationError) => {
                    console.warn('Invoice push notification could not be sent:', notificationError);
                });
            }

            if (!isLocalStorage) await setInvoiceProductPictures(supabase, savedInvoice.id, showProductPictures);

            if (!isLocalStorage && savedInvoice.id && (invoiceId || deliveryMethod)) {
                await setInvoiceDeliveryDetails(supabase, {
                    invoiceId: savedInvoice.id,
                    deliveryMethod,
                    pickupBranchId,
                    deliveryDetails: resolvedDeliveryDetails,
                    postCod: deliveryMethod === 'delivery' && postCod,
                });
            }

            if (!isLocalStorage && documentType === 'DELIVERY_NOTE' && (linkedSourceDocumentId || savedInvoice.source_document_id)) {
                const { error: fulfillmentError } = await supabase.rpc('apply_delivery_fulfillment', { p_delivery_id: savedInvoice.id });
                if (fulfillmentError) throw fulfillmentError;
            }

            if (!invoiceId && savedInvoice.invoice_number) setInvoiceNumber(String(savedInvoice.invoice_number));
            const savedDocumentLabel = documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en');
            // Keep the home-screen widget in step with what was just saved.
            if (user?.id) void refreshDailySalesWidget(user.id, { force: true });
            setSavedPopup({ invoiceId: savedInvoice.id, message: t('documentSaved', language).replace('{document}', savedDocumentLabel) });

        } catch (error: unknown) {
            const errorRecord = error && typeof error === 'object' ? error as { code?: string; message?: string } : {};
            if (replaceInvoiceDocument && isCompanyAdminUser && !stockCorrectionConfirmed.current
                && String(errorRecord.message || '').includes('must be corrected with a stock return')) {
                // An administrator can correct it: return the old stock, replace the invoice, issue the new stock.
                Alert.alert(t('adminStockCorrectionTitle', language), t('adminStockCorrectionMessage', language), [
                    { text: t('cancel', language), style: 'cancel' },
                    { text: t('adminStockCorrectionAction', language), onPress: () => { stockCorrectionConfirmed.current = true; void handleSave(); } },
                ]);
                return;
            }
            // A validation message (blank line description, bad quantity...) is for the user, not a crash.
            if (errorRecord.code !== '42501' && (error as { name?: string } | null)?.name !== 'DomainValidationError') console.error('Save error:', error);
            const message = errorRecord.code === '23505' && String(errorRecord.message || '').includes('invoices_company_number_unique')
                ? t('invoiceNumberUnavailable', language)
                : getLocalizedErrorMessage(error, language, 'saveError');
            Alert.alert(t('error', language), message);
        } finally {
            stockCorrectionConfirmed.current = false;
            saveInFlight.current = false;
            setSaving(false);
        }
    };

    const openDatePicker = (mode: 'issue' | 'due') => {
        if (invoiceId && !canChangeDates) return;
        setDatePickerMode(mode);
        const currentDate = mode === 'issue' ? issueDate : (dueDate || new Date());
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: currentDate,
                mode: 'date',
                display: 'calendar',
                onChange: (event, selectedDate) => onDateChange(event, selectedDate),
            });
            return;
        }
        setShowDatePicker(true);
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        if (event?.type === 'dismissed') {
            setShowDatePicker(false);
            return;
        }
        if (selectedDate) {
            if (datePickerMode === 'issue') setIssueDate(selectedDate);
            else {
                setDueDate(selectedDate);
                setDueDatePreset('custom');
            }
        }
        if (Platform.OS === 'android') setShowDatePicker(false);
    };

    const selectDueDatePreset = (preset: DueDatePreset) => {
        setShowDueDateOptions(false);
        setDueDatePreset(preset);
        if (preset === 'custom') {
            setTimeout(() => openDatePicker('due'), 0);
            return;
        }
        // Same rule as the web app: shared helper in @invoice-monorepo/api/domain.
        const pad = (value: number) => String(value).padStart(2, '0');
        const issueIso = `${issueDate.getFullYear()}-${pad(issueDate.getMonth() + 1)}-${pad(issueDate.getDate())}`;
        const [year, month, day] = dueDateForPreset(issueIso, preset).split('-').map(Number);
        const nextDate = new Date(issueDate);
        nextDate.setFullYear(year, month - 1, day);
        setDueDate(nextDate);
    };

    const handlePreview = async () => {
        const totals = calculateTotals();
        const companyId = activeCompanyId;
        const profileRecord = profile as (Profile & { first_name?: string | null; last_name?: string | null }) | null;
        const agentName = [profileRecord?.first_name, profileRecord?.last_name].filter(Boolean).join(' ').trim()
            || String((user as any)?.user_metadata?.full_name || '').trim()
            || [String((user as any)?.user_metadata?.first_name || ''), String((user as any)?.user_metadata?.last_name || '')].filter(Boolean).join(' ').trim();

        // The agent's own signature signs the document; the company signature is the fallback.
        let agentSignature: string | null = null;
        if (companyId && user?.id) {
            try { agentSignature = await getAgentSignature(supabase, companyId, user.id); } catch { agentSignature = null; }
        }

        // Mock invoice data for preview
        const invoiceData: any = {
            company: {
                name: profile?.company_name || t('company', language),
                address: profile?.address || '',
                city: profile?.city || '',
                country: profile?.country || '',
                email: profile?.email || '',
                phone: profile?.phone || '',
                signatureUrl: agentSignature || profile?.signature_url,
                stampUrl: profile?.stamp_url,
                logoUrl: profile?.logo_url,
                bankName: profile?.bank_name,
                bankAccount: profile?.bank_account,
                bankIban: profile?.bank_iban,
                bankSwift: profile?.bank_swift,
                primaryColor: normalizeBrandColor(profile?.primary_color),
            },
            client: {
                name: selectedCustomerName,
                address: selectedCustomerIsWalkIn ? '' : selectedClient?.address || '',
                city: selectedCustomerIsWalkIn ? '' : selectedClient?.city || '',
                country: selectedCustomerIsWalkIn ? '' : selectedClient?.country || '',
                email: selectedCustomerIsWalkIn ? '' : selectedClient?.email || '',
                phone: selectedCustomerIsWalkIn ? '' : selectedClient?.phone || '',
                taxId: selectedCustomerIsWalkIn ? undefined : selectedClient?.tax_id,
            },
            details: {
                number: invoiceNumber,
                issueDate: issueDate.toISOString().split('T')[0],
                dueDate: dueDate ? dueDate.toISOString().split('T')[0] : '',
                deliveryMethod: deliveryMethod
                    ? `${t(deliveryMethod, language)}${resolvedDeliveryDetails ? ` — ${resolvedDeliveryDetails}` : ''}`
                    : '',
                currency: 'EUR',
                language,
                notes: notes,
                department: operatingBranchLabel || profile?.company_name || '',
                type: type,
                commercialDocumentType: documentType,
                documentTypeLabel: documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en'),
                status: 'draft',
                agent: agentName,
                reference: agentName,
                yourReference: paymentTypeLabel(paymentMethod, language === 'sq' ? 'sq' : 'en'),
                buyerSignatureUrl: customerSignatureRequested ? customerSignature || undefined : undefined,
                showStampOnInvoice: showInvoiceStamp,
            },
            items: items.map((item, index) => ({
                description: item.description || '',
                quantity: item.quantity || 0,
                price: item.unit_price || 0,
                total: totals.lines[index]?.total || 0,
                taxable: totals.lines[index]?.taxable || 0,
                tax: totals.lines[index]?.tax || 0,
                taxIncluded: Boolean(item.tax_included),
                taxRate: item.tax_rate || 0,
                unit: item.unit || 'pcs',
                imageUrl: item.image_url || (item as any).product?.image_url,
            })),
            summary: {
                subtotal: totals.subtotal,
                tax: totals.tax,
                discount: totals.discount,
                total: totals.total,
                discountPercent: wholePercentageValue(discount),
            },
            config: {
                showSignature: showInvoiceSignature,
                showStamp: showInvoiceStamp,
                showProductPictures,
                labels: { department: t('branch', language), reference: t('agent', language), yourReference: t('paymentType', language) },
            },
        };

        const html = generateInvoiceHtml(invoiceData, 'corporate');
        // Keep the preview on the same fixed A4 canvas used by print/PDF.
        // The default device viewport activates the compact mobile CSS and
        // makes the invoice look different from the printed document.
        setPreviewHtml(html.replace('width=device-width, initial-scale=1', 'width=794, initial-scale=1'));
        setShowPreview(true);
    };

    const totals = calculateTotals();
    const openInvoiceContextHelp = () => {
        const documentationUrl = getHelpdeskArticleUrl('invoices/create-and-edit', language === 'sq' ? 'sq' : 'en');
        Alert.alert(
            documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en'),
            t(documentTypeHelpKeys[documentType], language),
            [
                { text: language === 'sq' ? 'Mbyll' : 'Close', style: 'cancel' },
                ...(documentationUrl ? [{ text: language === 'sq' ? 'Hap Help Center' : 'Open Help Center', onPress: () => void openExternalLink(documentationUrl, language === 'sq' ? 'Help Center' : 'Help Center') }] : []),
            ],
        );
    };

    return (
        <View
            testID="invoice-form-screen"
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity testID="invoice-form-back-button" accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>
                        {invoiceId
                            ? t('editDocument', language)
                            : t('newDocument', language).replace('{document}', documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en'))}
                    </Text>
                    <Text style={[styles.title, { color: textColor }]}>
                        {invoiceId ? invoiceNumber : documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en')}
                    </Text>
                </View>
                <TouchableOpacity
                    testID="invoice-help-button"
                    accessibilityRole="button"
                    accessibilityLabel={`${documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en')} - ${t('documentTypeHelp', language)}`}
                    onPress={openInvoiceContextHelp}
                    style={[styles.contextHelpButton, { backgroundColor: cardBg, borderColor }]}
                >
                    <CircleHelp color={primaryColor} size={20} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={{ color: mutedColor }}>{t('loadingInvoiceWorkspace', language)}</Text>
                </View>
            ) : <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                >
                    {!invoiceId && !isPosFlow && (
                        <View style={styles.documentTypeSelector}>
                            <Text style={[styles.sectionTitle, { color: textColor, marginTop: 0 }]}>{t('documentType', language)}</Text>
                            <TouchableOpacity
                                testID="invoice-document-type-selector"
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showDocumentTypePicker }}
                                onPress={() => setShowDocumentTypePicker((current) => !current)}
                                style={[styles.documentTypeButton, { backgroundColor: cardBg, borderColor }]}
                            >
                                <View style={styles.documentTypeButtonCopy}>
                                    <Text style={[styles.documentTypeButtonLabel, { color: textColor }]}>
                                        {documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en')}
                                    </Text>
                                    <Text style={[styles.documentTypeButtonHint, { color: mutedColor }]}>
                                        {DOCUMENT_DEFINITIONS[documentType].prefix}
                                    </Text>
                                </View>
                                <ChevronDown color={primaryColor} size={20} />
                            </TouchableOpacity>
                            {showDocumentTypePicker && (
                                <View style={[styles.documentTypeOptions, { backgroundColor: cardBg, borderColor }]}>
                                    {COMMERCIAL_DOCUMENT_TYPES.filter((typeOption) => canPermission(documentPermission(typeOption))).map((typeOption) => {
                                        const selected = documentType === typeOption;
                                        return (
                                            <View
                                                key={typeOption}
                                                style={[styles.documentTypeOption, selected && { backgroundColor: `${primaryColor}18` }]}
                                            >
                                                <TouchableOpacity
                                                    testID={`invoice-document-type-option-${typeOption}`}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ selected }}
                                                    onPress={() => {
                                                        setDocumentType(typeOption);
                                                        setCommercialStatus(DOCUMENT_DEFINITIONS[typeOption].statuses[0] || 'DRAFT');
                                                        setStatus('draft');
                                                        setShowDocumentTypePicker(false);
                                                    }}
                                                    style={styles.documentTypeOptionSelect}
                                                >
                                                    <View style={styles.documentTypeOptionCopy}>
                                                        <Text style={[styles.documentTypeOptionTitle, { color: selected ? primaryColor : textColor }]}>
                                                            {documentTypeLabel(typeOption, language === 'sq' ? 'sq' : 'en')}
                                                        </Text>
                                                        <Text style={[styles.documentTypeOptionMeta, { color: mutedColor }]}>
                                                            {DOCUMENT_DEFINITIONS[typeOption].prefix} · {typeOption}
                                                        </Text>
                                                    </View>
                                                    {selected ? <Check color={primaryColor} size={18} /> : null}
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    )}
                    {/* General Info */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>{t('details', language)}</Text>
                    <Card style={styles.card}>
                        <View style={styles.row}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('issueDate', language)}</Text>
                                <TouchableOpacity
                                    testID="invoice-issue-date-button"
                                    accessibilityRole="button"
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                    disabled={Boolean(invoiceId) && !canChangeDates}
                                    onPress={() => openDatePicker('issue')}
                                >
                                    <Calendar color={mutedColor} size={18} />
                                    <Text style={[styles.dateText, { color: textColor }]}>
                                        {issueDate.toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        {showAdvancedOptions ? <>
                            <View style={{ marginTop: 14 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('linkDocument', language)}</Text>
                                <TouchableOpacity
                                    testID="invoice-link-document-button"
                                    accessibilityRole="button"
                                    onPress={() => void loadLinkedDocuments()}
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                >
                                    <FileText color={mutedColor} size={18} />
                                    <Text style={[styles.dateText, { color: linkedSourceDocumentId ? textColor : mutedColor, flex: 1 }]}>
                                        {linkedSourceDocumentId
                                            ? linkedDocuments.find((document) => document.id === linkedSourceDocumentId)?.invoice_number || t('linkedDocumentSelected', language)
                                            : t('selectSourceDocument', language)}
                                    </Text>
                                    <ChevronDown color={mutedColor} size={18} />
                                </TouchableOpacity>
                            </View>
                            <View style={{ marginTop: 14 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('taxReportingCategory', language)}</Text>
                                <TouchableOpacity
                                    testID="invoice-tax-treatment-button"
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: showTaxCategoryPicker }}
                                    onPress={() => setShowTaxCategoryPicker((current) => !current)}
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                >
                                    <FileText color={mutedColor} size={18} />
                                    <Text numberOfLines={2} style={[styles.dateText, { color: taxReportingCategory ? textColor : mutedColor, flex: 1 }]}>
                                        {taxReportingCategory ? taxReportingCategoryLabel(taxReportingCategory, language === 'sq' ? 'sq' : 'en') : t('taxReportingCategoryAuto', language)}
                                    </Text>
                                    <ChevronDown color={mutedColor} size={18} />
                                </TouchableOpacity>
                                {showTaxCategoryPicker ? (
                                    <View style={[styles.documentTypeOptions, { backgroundColor: cardBg, borderColor }]}>
                                        {[{ value: '', label: { en: t('taxReportingCategoryAuto', 'en'), sq: t('taxReportingCategoryAuto', 'sq') } }, ...TAX_REPORTING_CATEGORIES].map((option) => {
                                            const selected = taxReportingCategory === option.value;
                                            return (
                                                <View key={option.value || 'automatic'} style={[styles.documentTypeOption, selected && { backgroundColor: `${primaryColor}18` }]}>
                                                    <TouchableOpacity
                                                        testID={`invoice-tax-treatment-option-${option.value || 'automatic'}`}
                                                        accessibilityRole="button"
                                                        accessibilityState={{ selected }}
                                                        onPress={() => {
                                                            setTaxReportingCategory(option.value);
                                                            setShowTaxCategoryPicker(false);
                                                        }}
                                                        style={styles.documentTypeOptionSelect}
                                                    >
                                                        <View style={styles.documentTypeOptionCopy}>
                                                            <Text style={[styles.documentTypeOptionTitle, { color: selected ? primaryColor : textColor }]}>
                                                                {option.label[language === 'sq' ? 'sq' : 'en']}
                                                            </Text>
                                                        </View>
                                                        {selected ? <Check color={primaryColor} size={18} /> : null}
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : null}
                                <Text style={[styles.documentTypeButtonHint, { color: mutedColor, marginTop: 6 }]}>{t('taxReportingCategoryHelp', language)}</Text>
                            </View>
                            <View style={{ marginTop: 14 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('dueDate', language)}</Text>
                                <TouchableOpacity
                                    testID="invoice-due-date-button"
                                    accessibilityRole="button"
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                    onPress={() => setShowDueDateOptions(true)}
                                >
                                    <Calendar color={mutedColor} size={18} />
                                    <Text style={[styles.dateText, { color: textColor }]}>
                                        {dueDate ? dueDate.toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US') : t('setDueDate', language)}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.invoicePictureOption}>
                                <View style={styles.invoicePictureOptionText}>
                                    <Text style={[styles.invoicePictureOptionTitle, { color: textColor }]}>{t('showProductPictures', language)}</Text>
                                    <Text style={[styles.invoicePictureOptionDescription, { color: mutedColor }]}>{t('showProductPicturesDescription', language)}</Text>
                                </View>
                                <Switch
                                    testID="invoice-show-product-pictures-switch"
                                    accessibilityLabel={t('showProductPictures', language)}
                                    value={showProductPictures}
                                    onValueChange={setShowProductPictures}
                                    trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                                    thumbColor={showProductPictures ? primaryColor : '#f4f4f5'}
                                />
                            </View>
                            <View style={[styles.invoicePictureOption, { marginTop: 14 }]}>
                                <View style={styles.invoicePictureOptionText}>
                                    <Text style={[styles.invoicePictureOptionTitle, { color: textColor }]}>{t('showCompanyStamp', language)}</Text>
                                    <Text style={[styles.invoicePictureOptionDescription, { color: mutedColor }]}>{t('showCompanyStamp', language)}</Text>
                                </View>
                                <Switch
                                    testID="invoice-show-stamp-switch"
                                    accessibilityLabel={t('showCompanyStamp', language)}
                                    value={showInvoiceStamp}
                                    onValueChange={setShowInvoiceStamp}
                                    trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                                    thumbColor={showInvoiceStamp ? primaryColor : '#f4f4f5'}
                                />
                            </View>
                            <View style={[styles.invoicePictureOption, { marginTop: 10 }]}>
                                <View style={styles.invoicePictureOptionText}>
                                    <Text style={[styles.invoicePictureOptionTitle, { color: textColor }]}>{t('showSignature', language)}</Text>
                                    <Text style={[styles.invoicePictureOptionDescription, { color: mutedColor }]}>{t('showSignature', language)}</Text>
                                </View>
                                <Switch
                                    testID="invoice-show-signature-switch"
                                    accessibilityLabel={t('showSignature', language)}
                                    value={showInvoiceSignature}
                                    onValueChange={setShowInvoiceSignature}
                                    trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                                    thumbColor={showInvoiceSignature ? primaryColor : '#f4f4f5'}
                                />
                            </View>
                        </> : null}
                        <TouchableOpacity
                            testID="invoice-more-options-button"
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showAdvancedOptions }}
                            onPress={() => setShowAdvancedOptions((current) => !current)}
                            style={styles.advancedToggle}
                        >
                            <Text style={[styles.advancedToggleText, { color: primaryColor }]}>{showAdvancedOptions ? t('hideMoreOptions', language) : t('moreOptions', language)}</Text>
                            {showAdvancedOptions ? <ChevronUp color={primaryColor} size={17} /> : <ChevronDown color={primaryColor} size={17} />}
                        </TouchableOpacity>
                    </Card>
                    {/* Customer Selection */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>{t('customer', language)}</Text>
                    <Card style={styles.card}>
                        <View style={styles.selectedClient}>
                            <View style={[styles.clientIcon, { backgroundColor: 'rgba(0, 79, 254, 0.1)' }]}>
                                <User color="#004FFE" size={24} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.clientName, { color: textColor }]}>{selectedCustomerName}</Text>
                                <Text style={[styles.clientDetail, { color: mutedColor }]}>
                                    {selectedCustomerIsWalkIn ? t('customerOptional', language) : selectedClient?.email || selectedClient?.phone || t('noContactDetails', language)}
                                </Text>
                            </View>
                            <TouchableOpacity testID="invoice-customer-selector" onPress={openClientPicker} style={styles.changeClientButton} accessibilityRole="button" accessibilityLabel={t('chooseCustomer', language)}>
                                <Text style={[styles.changeClientText, { color: primaryColor }]}>{selectedCustomerIsWalkIn ? t('choose', language) : t('change', language)}</Text>
                                <ChevronDown color={primaryColor} size={16} />
                            </TouchableOpacity>
                        </View>
                    </Card>
                    {/* Items */}
                    <View style={styles.itemsHeader}>
                        <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>{t('items', language)}</Text>
                        <TouchableOpacity testID="invoice-add-item-inline-button" accessibilityRole="button" onPress={() => setShowProductPicker(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Plus color={primaryColor} size={16} />
                            <Text style={{ color: primaryColor, fontWeight: '600', marginLeft: 4 }}>{t('addItem', language)}</Text>
                        </TouchableOpacity>
                    </View>
                    <Card style={[styles.card, { padding: 0 }]}>
                        {items.length === 0 ? (
                            <View style={styles.emptyItems}>
                                <Text style={{ color: mutedColor }}>{t('noItemsAdded', language)}</Text>
                                <Button
                                    testID="invoice-empty-add-item-button"
                                    title={t('addFromProducts', language)}
                                    onPress={() => setShowProductPicker(true)}
                                    variant="outline"
                                    style={{ marginTop: 12, borderWidth: 0 }}
                                />
                            </View>
                        ) : (
                                items.map((item, index) => (
                                <View key={item.id} style={[styles.itemRow, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                                    <View style={styles.itemHeader}>
                                        <TextInput
                                            testID={`invoice-item-description-${index}`}
                                            style={[styles.itemDescInput, { color: textColor }]}
                                            value={item.description}
                                            onChangeText={(text) => handleUpdateItem(index, 'description', text)}
                                            placeholder={t('description', language)}
                                            placeholderTextColor={mutedColor}
                                        />
                                        <TouchableOpacity testID={`invoice-delete-item-${index}`} accessibilityRole="button" onPress={() => handleRemoveItem(index)}>
                                            <Trash2 color="#ef4444" size={18} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.itemInputs}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>{t('qty', language)}</Text>
                                            <DecimalInput
                                                testID={`invoice-item-quantity-${index}`}
                                                style={[styles.smallInput, { color: textColor, borderColor }]}
                                                value={item.quantity}
                                                onValueChange={(value) => handleUpdateItem(index, 'quantity', value)}
                                            />
                                        </View>
                                        <View style={{ flex: 2 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>{t('price', language)}</Text>
                                            <DecimalInput
                                                testID={`invoice-item-price-${index}`}
                                                style={[styles.smallInput, { color: textColor, borderColor }]}
                                                value={item.unit_price}
                                                onValueChange={(value) => handleUpdateItem(index, 'unit_price', value)}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>{t('rabat', language)}</Text>
                                            <TextInput
                                                testID={`invoice-item-discount-${index}`}
                                                editable={canApplyDiscount}
                                                style={[styles.smallInput, { color: textColor, borderColor, opacity: canApplyDiscount ? 1 : 0.5 }]}
                                                value={String(item.discount || '')}
                                                onChangeText={(text) => handleUpdateItem(index, 'discount', wholePercentageText(text))}
                                                keyboardType="number-pad"
                                                placeholder="0"
                                                placeholderTextColor={mutedColor}
                                            />
                                        </View>
                                        <View style={{ flex: 2 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor, textAlign: 'right' }]}>{t('total', language)}</Text>
                                            <Text style={[styles.itemRowTotal, { color: textColor }]}>
                                                {formatCurrency(totals.lines[index]?.total ?? Number(item.amount || 0))}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))
                        )}
                        {items.length > 0 && (
                            <View style={[styles.summaryFooter, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f9fafb', borderTopColor: borderColor }]}>
                                <View style={styles.summaryRow}>
                                    <Text style={{ color: mutedColor }}>{t('subtotal', language)}</Text>
                                    <Text style={{ color: textColor, fontWeight: '600' }}>{formatCurrency(totals.subtotal)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={{ color: mutedColor }}>{t('tax', language)}</Text>
                                    <Text style={{ color: textColor, fontWeight: '600' }}>{formatCurrency(totals.tax)}</Text>
                                </View>
                                <View style={[styles.summaryRow, { marginTop: 8 }]}>
                                    <Text style={{ color: primaryColor, fontWeight: '600', fontSize: 18 }}>{formatCurrency(totals.total)}</Text>
                                </View>
                                {items.length > 0 && (
                                    <View style={[styles.summaryRow, { marginTop: 12, alignItems: 'center' }]}>
                                        <Text style={{ color: mutedColor }}>{t('discount', language)} (%)</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', borderRadius: 8, borderWidth: 1, borderColor }}>
                                            <TextInput
                                                testID="invoice-document-discount-input"
                                                editable={canApplyDiscount}
                                                value={discount}
                                                onChangeText={(text) => {
                                                    const nextDiscount = wholePercentageText(text);
                                                    setDiscount(nextDiscount);
                                                    const newPercent = wholePercentageValue(nextDiscount);
                                                    const newItems = items.map(item => {
                                                        const qty = Number(item.quantity) || 0;
                                                        const price = Number(item.unit_price) || 0;
                                                        const subtotal = qty * price;
                                                        const discountAmount = subtotal * (newPercent / 100);
                                                        return {
                                                            ...item,
                                                            discount: newPercent,
                                                            amount: subtotal - discountAmount
                                                        };
                                                    });
                                                    setItems(newItems);
                                                }}
                                                keyboardType="number-pad"
                                                style={{ paddingVertical: 4, paddingHorizontal: 8, color: textColor, fontWeight: '600', minWidth: 60, textAlign: 'right' }}
                                            />
                                            <Text style={{ paddingRight: 8, color: mutedColor }}>%</Text>
                                        </View>
                                    </View>
                                )}
                                {totals.discount > 0 && (
                                    <View style={styles.summaryRow}>
                                        <Text style={{ color: '#ef4444' }}>{t('discountAmount', language)}</Text>
                                        <Text style={{ color: '#ef4444', fontWeight: '600' }}>-{formatCurrency(totals.discount)}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </Card>
                    {/* Payment */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>{t('payment', language)}</Text>
                    <Card style={[styles.card, { marginBottom: 18 }]}>
                        <Text style={{ color: mutedColor, marginBottom: 8 }}>{t('paymentMethod', language)}</Text>
                        <View style={styles.invoicePaymentMethodGrid}>
                            {([
                                ['cash', t('cash', language), Banknote, '#12B76A'],
                                ['bank', t('bankTransfer', language), Landmark, '#3388FF'],
                                ['card', t('card', language), CreditCard, '#7F56D9'],
                                ['online_payment', t('onlinePayment', language), Globe2, '#F79009'],
                                ['customer_credit', t('debt', language), Clock3, '#F04438'],
                                ['other', t('other', language), CircleHelp, '#98A2B3'],
                            ] as const).map(([key, label, Icon, activeColor]) => {
                                const cashDisabled = key === 'cash'
                                    && (!isCashPaymentAllowed(calculateTotals().total)
                                        || !isCashPaymentAllowed(Number(amountReceived) || 0));
                                const selected = paymentMethod === key;
                                return (
                                <TouchableOpacity
                                    testID={`invoice-payment-method-${key}`}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: paymentMethod === key, disabled: cashDisabled }}
                                    key={key}
                                    disabled={cashDisabled}
                                    onPress={() => setPaymentMethod(key)}
                                    style={[styles.invoicePaymentMethod, {
                                        borderColor: selected ? activeColor : borderColor,
                                        backgroundColor: selected ? `${activeColor}18` : cardBg,
                                        opacity: cashDisabled ? 0.4 : 1,
                                    }]}
                                >
                                    <View style={[styles.invoicePaymentMethodIcon, { backgroundColor: selected ? `${activeColor}22` : `${mutedColor}12` }]}>
                                        <Icon color={selected ? activeColor : mutedColor} size={19} />
                                    </View>
                                    <Text numberOfLines={2} style={[styles.invoicePaymentMethodText, { color: selected ? activeColor : mutedColor }]}>{label}</Text>
                                    {selected ? <View style={[styles.invoicePaymentMethodCheck, { backgroundColor: activeColor }]}><Check color="#fff" size={11} strokeWidth={3} /></View> : null}
                                </TouchableOpacity>
                                );
                            })}
                        </View>
                        {paymentMethod === 'cash' && (
                            <View style={styles.cashPaymentPanel}>
                                <View style={styles.paymentAmountHeader}>
                                    <View>
                                        <Text style={[styles.paymentAmountLabel, { color: textColor }]}>{t('amountPaid', language)}</Text>
                                        <Text style={[styles.paymentAmountHint, { color: mutedColor }]}>{currency || 'EUR'}</Text>
                                    </View>
                                    <TouchableOpacity testID="invoice-exact-amount-button" accessibilityRole="button" onPress={() => {
                                        setAmountReceived(calculateTotals().total.toFixed(2));
                                        setStatus('paid');
                                        setCommercialStatus('PAID');
                                    }} style={[styles.exactAmountButton, { backgroundColor: `${primaryColor}18`, borderColor: `${primaryColor}55` }]}>
                                        <Check color={primaryColor} size={15} strokeWidth={3} />
                                        <Text style={[styles.exactAmountText, { color: primaryColor }]}>{t('exactAmount', language)}</Text>
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    testID="invoice-amount-received-input"
                                    value={amountReceived}
                                    onChangeText={setAmountReceived}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                    placeholderTextColor={mutedColor}
                                    style={[styles.paymentAmountInput, { color: textColor, borderColor, backgroundColor: cardBg }]}
                                />
                                <View style={[styles.changeSummary, { backgroundColor: `${primaryColor}0D`, borderColor: `${primaryColor}30` }]}>
                                    <View style={styles.changeSummaryCopy}>
                                        <Text style={[styles.changeSummaryLabel, { color: textColor }]}>{t('change', language)}</Text>
                                        <Text style={[styles.changeSummaryHint, { color: mutedColor }]}>{language === 'sq' ? 'Shuma që i kthehet klientit' : 'Amount to return to the customer'}</Text>
                                    </View>
                                    <Text style={[styles.changeSummaryValue, { color: primaryColor }]}>
                                        {formatCurrency(Math.max(0, (Number(amountReceived) || 0) - calculateTotals().total))}
                                    </Text>
                                </View>
                                <View style={styles.paymentLimitHint}>
                                    <CircleHelp color={mutedColor} size={14} />
                                    <Text style={[styles.paymentLimitHintText, { color: mutedColor }]}>{t('cashPaymentBelowLimit', language)}</Text>
                                </View>
                            </View>
                        )}
                        <Text style={[styles.label, { color: mutedColor, marginTop: 18 }]}>{t('comments', language)}</Text>
                        <TextInput
                            testID="invoice-notes-input"
                            style={[styles.notesInput, { color: textColor, borderColor }]}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder={t('addPaymentTermsOrNotes', language)}
                            placeholderTextColor={mutedColor}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                        {storeLocations.length > 0 && deliveryMethod !== 'pickup' ? (
                            <>
                                <Text style={[styles.label, { color: mutedColor, marginTop: 18 }]}>{language === 'sq' ? 'Dega e faturës dhe stokut' : 'Invoice and stock branch'}</Text>
                                <TouchableOpacity
                                    testID="invoice-operating-branch-selector"
                                    accessibilityRole="button"
                                    onPress={() => setShowPickupBranchPicker(true)}
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                >
                                    <Text style={[styles.dateText, { color: invoiceBranchId ? textColor : mutedColor, flex: 1 }]}>
                                        {storeLocations.find((location) => location.id === invoiceBranchId)?.name || (language === 'sq' ? 'Zgjidhni degën' : 'Select branch')}
                                    </Text>
                                    <ChevronDown color={mutedColor} size={18} />
                                </TouchableOpacity>
                            </>
                        ) : null}
                        <Text style={[styles.label, { color: mutedColor, marginTop: 18 }]}>{t('deliveryMethod', language)}</Text>
                        <View style={styles.deliveryOptions}>
                            {(['pickup', 'delivery', 'bus', 'other'] as DeliveryMethod[]).map((method) => (
                                (() => {
                                    const selected = deliveryMethod === method;
                                    const DeliveryIcon = method === 'pickup' ? Store : method === 'delivery' ? Truck : method === 'bus' ? BusFront : CircleHelp;
                                    const activeColor = method === 'pickup' ? '#12B76A' : method === 'delivery' ? '#3388FF' : method === 'bus' ? '#7F56D9' : '#98A2B3';
                                    return (
                                        <TouchableOpacity
                                            key={method}
                                            testID={`invoice-delivery-method-${method}`}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected }}
                                            onPress={() => handleDeliveryMethodChange(method)}
                                            style={[styles.deliveryOption, { borderColor: selected ? activeColor : borderColor, backgroundColor: selected ? `${activeColor}18` : cardBg }]}
                                        >
                                            <View style={[styles.deliveryOptionIcon, { backgroundColor: selected ? `${activeColor}22` : `${mutedColor}12` }]}>
                                                <DeliveryIcon color={selected ? activeColor : mutedColor} size={18} />
                                            </View>
                                            <Text style={[styles.deliveryOptionText, { color: selected ? activeColor : mutedColor }]}>{t(method, language)}</Text>
                                            {selected ? <View style={[styles.deliveryOptionCheck, { backgroundColor: activeColor }]}><Check color="#fff" size={11} strokeWidth={3} /></View> : null}
                                        </TouchableOpacity>
                                    );
                                })()
                            ))}
                        </View>
                        {deliveryMethod === 'pickup' ? (
                            storeLocations.length > 0 ? (
                                <>
                                    <Text style={[styles.label, { color: mutedColor, marginTop: 14 }]}>{language === 'sq' ? 'Dega e marrjes në pikë' : 'Pickup branch'}</Text>
                                    <TouchableOpacity
                                        testID="invoice-pickup-store-selector"
                                        accessibilityRole="button"
                                        accessibilityLabel={t('pickupStore', language)}
                                        onPress={() => setShowPickupBranchPicker(true)}
                                        style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                    >
                                        <Text style={[styles.dateText, { color: selectedPickupLocation ? textColor : mutedColor, flex: 1 }]}>
                                            {selectedPickupLocation?.name || t('selectPickupStore', language)}
                                        </Text>
                                        <ChevronDown color={mutedColor} size={18} />
                                    </TouchableOpacity>
                                    {selectedPickupLocation?.registered_address || selectedPickupLocation?.municipality ? (
                                        <Text style={[styles.transportHint, { color: mutedColor }]}>
                                            {[selectedPickupLocation.registered_address, selectedPickupLocation.municipality].filter(Boolean).join(', ')}
                                        </Text>
                                    ) : null}
                                </>
                            ) : (
                                <View style={{ marginTop: 14 }}>
                                    <Text style={[styles.label, { color: mutedColor }]}>{t('pickupLocation', language)}</Text>
                                    <TextInput
                                        testID="invoice-pickup-location-input"
                                        value={deliveryDetails}
                                        onChangeText={setDeliveryDetails}
                                        placeholder={t('enterPickupLocation', language)}
                                        placeholderTextColor={mutedColor}
                                        style={[styles.transportInput, { color: textColor, borderColor }]}
                                    />
                                </View>
                            )
                        ) : null}
                        {deliveryMethod === 'delivery' ? (
                            <>
                                <View style={{ marginTop: 14 }}>
                                    <Text style={[styles.label, { color: mutedColor }]}>{t('deliveryLocation', language)}</Text>
                                    <TextInput
                                        testID="invoice-delivery-location-input"
                                        value={deliveryDetails}
                                        onChangeText={setDeliveryDetails}
                                        placeholder={t('enterDeliveryLocation', language)}
                                        placeholderTextColor={mutedColor}
                                        style={[styles.transportInput, { color: textColor, borderColor }]}
                                    />
                                </View>
                                <View style={[styles.invoicePictureOption, { marginTop: 10 }]}>
                                    <View style={styles.invoicePictureOptionText}>
                                        <Text style={[styles.invoicePictureOptionTitle, { color: textColor }]}>{t('postCod', language)}</Text>
                                        <Text style={[styles.invoicePictureOptionDescription, { color: mutedColor }]}>{t('postCodDescription', language)}</Text>
                                    </View>
                                    <Switch
                                        testID="invoice-post-cod-switch"
                                        accessibilityLabel={t('postCod', language)}
                                        value={postCod}
                                        onValueChange={setPostCod}
                                        trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                                        thumbColor={postCod ? primaryColor : '#f4f4f5'}
                                    />
                                </View>
                            </>
                        ) : null}
                        {deliveryMethod === 'bus' ? (
                            <View style={{ marginTop: 14 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('busLine', language)}</Text>
                                <TextInput
                                    testID="invoice-bus-line-input"
                                    value={deliveryDetails}
                                    onChangeText={setDeliveryDetails}
                                    placeholder={t('enterBusLine', language)}
                                    placeholderTextColor={mutedColor}
                                    style={[styles.transportInput, { color: textColor, borderColor }]}
                                />
                            </View>
                        ) : null}
                        {deliveryMethod === 'other' ? (
                            <View style={{ marginTop: 14 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('transportDetails', language)}</Text>
                                <TextInput
                                    testID="invoice-other-transport-input"
                                    value={deliveryDetails}
                                    onChangeText={setDeliveryDetails}
                                    placeholder={t('enterTransportDetails', language)}
                                    placeholderTextColor={mutedColor}
                                    multiline
                                    style={[styles.transportInput, styles.transportMultilineInput, { color: textColor, borderColor }]}
                                />
                            </View>
                        ) : null}
                    </Card>
                    {documentType === 'INVOICE' && (
                        <>
                            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('customerAcceptance', language)}</Text>
                            <Card style={[styles.card, { marginBottom: 18 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: textColor, fontSize: 15, fontWeight: '700' }}>{t('askCustomerToSign', language)}</Text>
                                        <Text style={{ color: mutedColor, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{t('customerSignatureDescription', language)}</Text>
                                    </View>
                                    <Switch
                                        testID="invoice-customer-signature-switch"
                                        value={customerSignatureRequested}
                                        onValueChange={(requested) => {
                                            setCustomerSignatureRequested(requested);
                                            if (!requested) setCustomerSignature(null);
                                        }}
                                        trackColor={{ false: borderColor, true: primaryColor + '80' }}
                                        thumbColor={customerSignatureRequested ? primaryColor : '#98A2B3'}
                                        ios_backgroundColor={borderColor}
                                    />
                                </View>
                                {customerSignatureRequested && (
                                    <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: borderColor }}>
                                        <Text style={{ color: customerSignature ? '#12B76A' : '#B54708', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>
                                            {customerSignature ? t('customerSignatureCaptured', language) : t('signatureRequiredBeforeCreate', language)}
                                        </Text>
                                        <TouchableOpacity
                                            testID="invoice-capture-signature-button"
                                            accessibilityRole="button"
                                            onPress={() => setShowCustomerSignaturePad(true)}
                                            style={{ borderWidth: 1, borderColor: primaryColor, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                                        >
                                            <Text style={{ color: primaryColor, fontWeight: '700' }}>{customerSignature ? t('replaceSignature', language) : t('handPhoneToCustomer', language)}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </Card>
                        </>
                    )}
                    <View style={{ height: 120 }} />
                </ScrollView>
            </KeyboardAvoidingView>}
            {/* Sticky Actions Footer */}
            <View style={[styles.footer, { backgroundColor: isDark ? '#151517' : '#fff', borderTopColor: borderColor }]}>
                <TouchableOpacity
                    testID="invoice-preview-button"
                    accessibilityRole="button"
                    accessibilityLabel={t('preview', language)}
                    style={[styles.previewButton, { borderColor: primaryColor }]}
                    onPress={() => {
                        Keyboard.dismiss();
                        void handlePreview();
                    }}
                >
                    <Eye color={primaryColor} size={19} />
                </TouchableOpacity>
                <TouchableOpacity
                    testID="invoice-add-item-button"
                    accessibilityRole="button"
                    accessibilityLabel={t('addItem', language)}
                    style={[styles.addItemButton, { backgroundColor: primaryColor + '15', borderColor: primaryColor }]}
                    onPress={openProductPicker}
                >
                    <Plus color={primaryColor} size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                    testID="invoice-save-button"
                    accessibilityRole="button"
                    style={[styles.saveButtonFull, { backgroundColor: primaryColor }]}
                    onPress={() => {
                        Keyboard.dismiss();
                        void handleSave();
                    }}
                    disabled={saving || workspacePermissions.length === 0 || Boolean(invoiceId && !(workspacePermissions.includes('invoice.edit') || platformAdmin || workspaceRole === 'company_administrator') && !salesBookAmendmentId)}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Save color="#fff" size={20} />
                            <Text numberOfLines={1} style={styles.saveText}>{invoiceId ? t('update', language) : t('create', language)} {documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en')}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
            {/* Preview Modal */}
            <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
                <View style={[styles.previewContainer, { backgroundColor: bgColor }]}>
                    <View style={[styles.previewHeader, { borderBottomColor: borderColor, backgroundColor: cardBg }]}>
                        <TouchableOpacity testID="invoice-close-preview-button" accessibilityRole="button" onPress={() => setShowPreview(false)} style={styles.closePreview}>
                            <X color={textColor} size={24} />
                            <Text style={[styles.closePreviewText, { color: textColor }]}>{t('closePreview', language)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            testID="invoice-save-from-preview-button"
                            accessibilityRole="button"
                            style={[styles.headerSaveButton, { backgroundColor: primaryColor }]}
                            onPress={() => { setShowPreview(false); handleSave(); }}
                        >
                            <Save color="#fff" size={16} />
                            <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>{t('save', language)}</Text>
                        </TouchableOpacity>
                    </View>
                    <WebView
                        source={{ html: previewHtml }}
                        style={{ flex: 1 }}
                        originWhitelist={['*']}
                    />
                </View>
            </Modal>
            {/* Client Picker Modal */}
            <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={closeClientPicker}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: modalBackdropColor }]}><ModalBackdrop onPress={closeClientPicker} />
                                        <View style={[styles.modalContent, styles.modalContentTall, { backgroundColor: isDark ? '#151517' : '#fff' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>{t('selectCustomer', language)}</Text>
                            <TouchableOpacity testID="invoice-close-customer-picker-button" accessibilityRole="button" onPress={closeClientPicker}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>{t('close', language)}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 12, paddingBottom: 64 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={{ paddingBottom: 12 }}>
                                <Input
                                    placeholder={t('searchCustomers', language)}
                                    testID="invoice-customer-search-input"
                                    value={clientSearch}
                                    onChangeText={setClientSearch}
                                />
                            </View>
                            <TouchableOpacity
                                testID="invoice-create-customer-button"
                                accessibilityRole="button"
                                style={[styles.modalAddNew, { borderColor: primaryColor, marginTop: 0, marginBottom: 10 }]}
                                onPress={() => {
                                    closeClientPicker();
                                    navigation.navigate('ClientForm', { returnTo: 'InvoiceForm' });
                                }}
                            >
                                <Plus color={primaryColor} size={20} />
                                <Text style={{ color: primaryColor, fontWeight: '600', marginLeft: 8 }}>{t('createNewCustomer', language)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID="invoice-walk-in-customer-option"
                                style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                onPress={() => {
                                    setSelectedClient(walkInCustomer);
                                    setLinkedSourceDocumentId(null);
                                    setDiscount('0');
                                    closeClientPicker();
                                }}
                            >
                                <View style={[styles.modalIcon, { backgroundColor: '#e0e7ff' }]}>
                                    <User color="#4338ca" size={19} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalItemTitle, { color: textColor }]}>{t('walkInCustomer', language)}</Text>
                                    <Text style={{ color: mutedColor, fontSize: 12 }}>{t('customerOptional', language)}</Text>
                                </View>
                                {selectedCustomerIsWalkIn && <Check color={primaryColor} size={20} />}
                            </TouchableOpacity>
                            {clients.filter(c => !c.pos_walk_in_customer && c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(client => (
                                <TouchableOpacity
                                    testID={`invoice-customer-option-${client.id}`}
                                    key={client.id}
                                    style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                    onPress={() => {
                                        setSelectedClient(client);
                                        setLinkedSourceDocumentId(null);
                                        // Auto-apply client discount if available
                                        if (client.discount_percent) {
                                            setDiscount(wholePercentageText(String(client.discount_percent)) || '0');
                                        } else {
                                            setDiscount('0');
                                        }
                                        closeClientPicker();
                                    }}
                                >
                                    <View style={[styles.modalIcon, { backgroundColor: '#e0e7ff' }]}>
                                        <Text style={{ color: '#4338ca', fontWeight: '600' }}>{client.name.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.modalItemTitle, { color: textColor }]}>{client.name}</Text>
                                        <Text style={{ color: mutedColor, fontSize: 12 }}>{client.email || t('noEmail', language)}</Text>
                                    </View>
                                    {selectedClient?.id === client.id && <Check color={primaryColor} size={20} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            {/* Store pickup location picker */}
            <Modal visible={showPickupBranchPicker} animationType="slide" transparent onRequestClose={() => setShowPickupBranchPicker(false)}>
                <View style={[styles.modalOverlay, { backgroundColor: modalBackdropColor }]}><ModalBackdrop onPress={() => setShowPickupBranchPicker(false)} />
                    <View style={[styles.modalContent, styles.branchPickerContent, { backgroundColor: isDark ? '#151517' : '#fff' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                        <Text style={[styles.modalTitle, { color: textColor }]}>{language === 'sq' ? 'Zgjidhni degën' : 'Select branch'}</Text>
                            <TouchableOpacity testID="invoice-close-pickup-store-picker-button" accessibilityRole="button" onPress={() => setShowPickupBranchPicker(false)}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>{t('close', language)}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12 }}>
                            {storeLocations.map((location) => {
                                const address = [location.registered_address, location.municipality].filter(Boolean).join(', ');
                                return (
                                    <TouchableOpacity
                                        key={location.id}
                                        testID={`invoice-pickup-store-option-${location.id}`}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected: (invoiceBranchId || pickupBranchId) === location.id }}
                                        style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                        onPress={() => {
                                            setPickupBranchId(location.id);
                                            setInvoiceBranchId(location.id);
                                            if (activeCompanyId) void listProductBranchStock(supabase, activeCompanyId, location.id).then((rows) => setBranchStockByProduct(Object.fromEntries(rows.map((row) => [row.product_id, Number(row.stock_quantity) || 0])))).catch(() => setBranchStockByProduct({}));
                                            setDeliveryDetails('');
                                            setShowPickupBranchPicker(false);
                                        }}
                                    >
                                        <View style={[styles.modalIcon, { backgroundColor: `${primaryColor}18` }]}>
                                            <Text style={{ color: primaryColor, fontWeight: '700' }}>{location.name.charAt(0)}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.modalItemTitle, { color: textColor }]}>{location.name}</Text>
                                            {address ? <Text style={{ color: mutedColor, fontSize: 12 }}>{address}</Text> : null}
                                        </View>
                                        {(invoiceBranchId || pickupBranchId) === location.id ? <Check color={primaryColor} size={20} /> : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            {/* Related commercial document picker */}
            <Modal visible={showLinkedDocumentPicker} animationType="slide" transparent onRequestClose={() => setShowLinkedDocumentPicker(false)}>
                <View style={[styles.modalOverlay, { backgroundColor: modalBackdropColor }]}><ModalBackdrop onPress={() => setShowLinkedDocumentPicker(false)} />
                    <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                            <View>
                                <Text style={[styles.modalTitle, { color: textColor }]}>{t('linkDocument', language)}</Text>
                                <Text style={{ color: mutedColor, fontSize: 12 }}>{selectedClient?.name}</Text>
                            </View>
                            <TouchableOpacity testID="invoice-close-linked-document-picker-button" accessibilityRole="button" onPress={() => setShowLinkedDocumentPicker(false)}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>{t('close', language)}</Text>
                            </TouchableOpacity>
                        </View>
                        {loadingLinkedDocuments ? <ActivityIndicator style={{ marginTop: 28 }} color={primaryColor} /> : (
                            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12 }}>
                                {linkedDocuments.length ? linkedDocuments.map((document) => {
                                    const linkedType = resolveCommercialDocumentType(document);
                                    return (
                                        <TouchableOpacity
                                            key={document.id}
                                            testID={`invoice-linked-document-option-${document.id}`}
                                            accessibilityRole="button"
                                            onPress={() => applyLinkedDocument(document)}
                                            style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                        >
                                            <View style={[styles.modalIcon, { backgroundColor: `${primaryColor}18` }]}>
                                                <FileText color={primaryColor} size={19} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.modalItemTitle, { color: textColor }]}>{documentTypeLabel(linkedType, language === 'sq' ? 'sq' : 'en')} · {document.invoice_number}</Text>
                                                <Text style={{ color: mutedColor, fontSize: 12 }}>{document.issue_date} · {formatCurrency(Number(document.total_amount || 0))}</Text>
                                            </View>
                                            <ChevronRight color={mutedColor} size={18} />
                                        </TouchableOpacity>
                                    );
                                }) : <View style={styles.emptyItems}><Text style={{ color: mutedColor }}>{t('noLinkedDocuments', language)}</Text></View>}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
            {/* Product Picker Modal */}
            <BarcodeScannerModal visible={scanningProduct} onScanned={handleProductScanned} onClose={() => setScanningProduct(false)} />
            <Modal visible={showProductPicker && !scanningProduct} animationType="slide" transparent onRequestClose={closeProductPicker}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: modalBackdropColor }]}><ModalBackdrop onPress={closeProductPicker} />
                                        <View style={[styles.modalContent, styles.modalContentTall, { backgroundColor: isDark ? '#151517' : '#fff' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>{t('addItem', language)}</Text>
                            <TouchableOpacity testID="invoice-close-product-picker-button" accessibilityRole="button" onPress={closeProductPicker}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>{t('close', language)}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 12, paddingBottom: 64 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            <View style={{ paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <Input
                                        placeholder={t('searchProducts', language)}
                                        testID="invoice-product-search-input"
                                        value={productSearch}
                                        onChangeText={setProductSearch}
                                    />
                                </View>
                                <TouchableOpacity
                                    testID="invoice-product-scan-button"
                                    accessibilityRole="button"
                                    accessibilityLabel={t('scanBarcode', language)}
                                    onPress={() => { Keyboard.dismiss(); setScanningProduct(true); }}
                                    style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: primaryColor }}
                                >
                                    <ScanLine color="#fff" size={22} />
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                testID="invoice-custom-item-option"
                                style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                onPress={() => handleAddItem()}
                            >
                                <View style={[styles.modalIcon, { backgroundColor: '#ecfdf5' }]}>
                                    <Plus color="#12B76A" size={20} />
                                </View>
                                <Text style={[styles.modalItemTitle, { color: textColor }]}>{t('customItem', language)}</Text>
                            </TouchableOpacity>
                            {products.filter(p => [p.name, (p as any).sku, (p as any).barcode].filter(Boolean).join(' ').toLowerCase().includes(productSearch.toLowerCase())).map(product => (
                                <TouchableOpacity
                                    testID={`invoice-product-option-${product.id}`}
                                    key={product.id}
                                    style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                    onPress={() => handleAddItem(product)}
                                >
                                    <View style={[styles.modalIcon, { backgroundColor: '#f3f4f6' }]}>
                                        <Text style={{ color: '#4b5563', fontWeight: '600' }}>{product.name.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.modalItemTitle, { color: textColor }]}>{product.name}</Text>
                                        <Text style={{ color: mutedColor, fontSize: 12 }}>
                                            {formatCurrency(product.tax_included
                                                ? Number(product.unit_price || 0)
                                                : Number(product.unit_price || 0) * (1 + (Number(product.tax_rate) || 0) / 100)
                                            )}
                                            {product.track_stock && invoiceBranchId ? ` · ${language === 'sq' ? 'Stok' : 'Stock'}: ${branchStockByProduct[product.id] ?? Number(product.stock_quantity || 0)}` : ''}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <Modal visible={Boolean(savedPopup)} transparent animationType="fade" onRequestClose={() => undefined}>
                <View testID="invoice-saved-popup" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <View style={{ width: '100%', maxWidth: 360, borderRadius: 20, padding: 24, alignItems: 'center', backgroundColor: cardBg }}>
                        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#12B76A22', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                            <Check color="#12B76A" size={30} />
                        </View>
                        <Text style={{ color: textColor, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>{t('success', language)}</Text>
                        <Text style={{ color: textColor, fontSize: 15, textAlign: 'center', marginBottom: 20 }}>{savedPopup?.message}</Text>
                        <TouchableOpacity
                            testID="invoice-saved-popup-done-button"
                            accessibilityRole="button"
                            style={{ alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: primaryColor }}
                            onPress={() => {
                                const popup = savedPopup;
                                setSavedPopup(null);
                                if (popup) navigation.replace('InvoiceDetail', { invoiceId: popup.invoiceId, autoPreview: true, showStampOnInvoice: showInvoiceStamp, showSignatureOnInvoice: showInvoiceSignature });
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('done', language)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            <SignaturePadModal
                visible={showCustomerSignaturePad}
                primaryColor={primaryColor}
                title={t('customerSignatureTitle', language)}
                description={t('signatureForCustomerDescription', language).replace('{customer}', selectedClient?.name || t('theCustomer', language))}
                onClose={() => setShowCustomerSignaturePad(false)}
                onSave={(signature) => {
                    setCustomerSignatureRequested(true);
                    setCustomerSignature(signature);
                }}
            />
            {showDueDateOptions ? (
                <Modal visible transparent animationType="fade" onRequestClose={() => setShowDueDateOptions(false)}>
                    <View style={[styles.dueDateOptionsOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.45)' }]}><ModalBackdrop onPress={() => setShowDueDateOptions(false)} />
                        <View style={[styles.dueDateOptionsCard, { backgroundColor: cardBg }]}>
                            <Text style={[styles.datePickerTitle, { color: textColor }]}>{t('dueDate', language)}</Text>
                            {(['one_week', 'two_weeks', 'one_month', 'two_months', 'three_months', 'custom'] as DueDatePreset[]).map((preset) => (
                                <TouchableOpacity
                                    key={preset}
                                    testID={`invoice-due-date-option-${preset}`}
                                    accessibilityRole="button"
                                    onPress={() => selectDueDatePreset(preset)}
                                    style={[styles.dueDateOption, { borderColor: dueDatePreset === preset ? primaryColor : borderColor, backgroundColor: dueDatePreset === preset ? `${primaryColor}18` : cardBg }]}
                                >
                                    <Text style={[styles.dueDateOptionText, { color: dueDatePreset === preset ? primaryColor : textColor }]}>{t(preset, language)}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity testID="invoice-due-date-options-cancel" onPress={() => setShowDueDateOptions(false)} style={styles.dueDateOptionsCancel}>
                                <Text style={[styles.datePickerAction, { color: mutedColor }]}>{t('cancel', language)}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            ) : null}
            {showDatePicker && Platform.OS === 'ios' ? (
                <Modal visible transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
                    <View style={[styles.datePickerOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.45)' }]}><ModalBackdrop onPress={() => setShowDatePicker(false)} />
                        <View style={[styles.datePickerCard, { backgroundColor: cardBg }]}>
                            <View style={[styles.datePickerHeader, { borderBottomColor: borderColor }]}>
                                <TouchableOpacity testID="invoice-date-picker-cancel" onPress={() => setShowDatePicker(false)}>
                                    <Text style={[styles.datePickerAction, { color: mutedColor }]}>{t('cancel', language)}</Text>
                                </TouchableOpacity>
                                <Text style={[styles.datePickerTitle, { color: textColor }]}>{datePickerMode === 'due' ? t('dueDate', language) : t('issueDate', language)}</Text>
                                <TouchableOpacity testID="invoice-date-picker-done" onPress={() => setShowDatePicker(false)}>
                                    <Text style={[styles.datePickerAction, { color: primaryColor }]}>{t('done', language)}</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                testID="invoice-date-picker"
                                value={datePickerMode === 'issue' ? issueDate : (dueDate || new Date())}
                                mode="date"
                                display="spinner"
                                onChange={onDateChange}
                            />
                        </View>
                    </View>
                </Modal>
            ) : null}
        </View>
    );
}
const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    backButton: { marginRight: 16 },
    title: { fontSize: 28, fontWeight: '800' },
    subtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
    saveButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
    contextHelpButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 16 },
    card: { padding: 16, borderRadius: 16, marginBottom: 8 },
    invoicePaymentMethodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    invoicePaymentMethod: { width: '31.5%', minHeight: 84, position: 'relative', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6, paddingVertical: 11, borderRadius: 16, borderWidth: 1.2 },
    invoicePaymentMethodIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    invoicePaymentMethodCheck: { position: 'absolute', top: 7, right: 7, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    invoicePaymentMethodText: { width: '100%', textAlign: 'center', fontWeight: '700', fontSize: 11.5, lineHeight: 15 },
    cashPaymentPanel: { marginTop: 16, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(127, 145, 170, 0.25)', backgroundColor: 'rgba(127, 145, 170, 0.06)' },
    paymentAmountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 },
    paymentAmountLabel: { fontSize: 14, fontWeight: '700' },
    paymentAmountHint: { fontSize: 11, marginTop: 2, letterSpacing: 0.4 },
    exactAmountButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1 },
    exactAmountText: { fontSize: 11.5, fontWeight: '800' },
    paymentAmountInput: { height: 52, minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 17, fontWeight: '700' },
    changeSummary: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, borderWidth: 1 },
    changeSummaryCopy: { flex: 1, minWidth: 0 },
    changeSummaryLabel: { fontSize: 13, fontWeight: '700' },
    changeSummaryHint: { fontSize: 10.5, marginTop: 2 },
    changeSummaryValue: { fontSize: 16, fontWeight: '800' },
    paymentLimitHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
    paymentLimitHintText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
    documentTypeSelector: { marginBottom: 4 },
    documentTypeButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
    documentTypeButtonCopy: { flex: 1, minWidth: 0 },
    documentTypeButtonLabel: { fontSize: 15, fontWeight: '700' },
    documentTypeButtonHint: { fontSize: 11, marginTop: 3, letterSpacing: 0.4 },
    documentTypeOptions: { marginTop: 8, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
    documentTypeOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(127, 145, 170, 0.24)' },
    documentTypeOptionSelect: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    documentTypeOptionCopy: { flex: 1, minWidth: 0 },
    documentTypeOptionTitle: { fontSize: 14, fontWeight: '600' },
    documentTypeOptionMeta: { fontSize: 10, marginTop: 3, letterSpacing: 0.3 },
    row: { flexDirection: 'row' },
    label: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
    dateButton: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
    dateText: { fontSize: 14, fontWeight: '500' },
    datePickerOverlay: { flex: 1, justifyContent: 'center', padding: 20 },
    datePickerCard: { borderRadius: 18, overflow: 'hidden', paddingBottom: 12 },
    datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
    datePickerAction: { fontSize: 14, fontWeight: '700' },
    datePickerTitle: { fontSize: 16, fontWeight: '700' },
    dueDateOptionsOverlay: { flex: 1, justifyContent: 'flex-end' },
    dueDateOptionsCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
    dueDateOption: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginTop: 9 },
    dueDateOptionText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
    dueDateOptionsCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
    advancedToggle: { minHeight: 44, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    advancedToggleText: { fontSize: 13, fontWeight: '700' },
    invoicePictureOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingVertical: 4 },
    invoicePictureOptionText: { flex: 1, minWidth: 0 },
    invoicePictureOptionTitle: { fontSize: 14, fontWeight: '700' },
    invoicePictureOptionDescription: { fontSize: 12, lineHeight: 17, marginTop: 2 },
    // Client
    selectedClient: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    clientIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    clientName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    clientDetail: { fontSize: 13 },
    changeClientButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 8 },
    changeClientText: { fontSize: 12, fontWeight: '700' },
    removeClient: { padding: 8 },
    addClientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 1, borderRadius: 12, gap: 8 },
    addClientText: { fontSize: 15, fontWeight: '600' },
    // Items
    itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 12 },
    emptyItems: { padding: 30, alignItems: 'center', justifyContent: 'center' },
    itemRow: { padding: 16 },
    itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    itemDescInput: { flex: 1, fontSize: 15, fontWeight: '600', padding: 0 },
    itemInputs: { flexDirection: 'row', gap: 12 },
    smallInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 14, marginTop: 4 },
    inputLabel: { fontSize: 11, textTransform: 'uppercase' },
    itemRowTotal: { fontSize: 15, fontWeight: '700', textAlign: 'right', marginTop: 12 },
    summaryFooter: { padding: 16, borderTopWidth: 1 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    // Notes
    notesInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 100 },
    deliveryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    deliveryOption: { minWidth: '46%', flexGrow: 1, minHeight: 58, flexDirection: 'row', justifyContent: 'flex-start', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1.2, alignItems: 'center' },
    deliveryOptionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    deliveryOptionText: { flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: '700' },
    deliveryOptionCheck: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    transportInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, minHeight: 48 },
    transportMultilineInput: { minHeight: 88, textAlignVertical: 'top' },
    transportHint: { fontSize: 12, marginTop: 6 },
    // Modals
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    // Pickers with a search box need a real height (a flex ScrollView inside a
    // content-sized sheet collapses to minHeight) so results stay visible.
    // The sheet extends 24px past the keyboard edge so the keyboard's rounded top
    // corners overlap the sheet color instead of exposing the dark backdrop.
    modalContentTall: { height: '80%', paddingBottom: 0, marginBottom: -24 },
    modalContent: { width: '100%', alignSelf: 'stretch', borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 260, maxHeight: '80%', paddingBottom: 40, overflow: 'hidden' },
    branchPickerContent: { height: 'auto', minHeight: 250, maxHeight: '58%', paddingBottom: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, borderBottomWidth: 1 },
    modalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    modalItemTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    modalAddNew: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 12, borderWidth: 1, borderRadius: 12, borderStyle: 'dashed' },
    // Footer & Preview
    footer: {
        flexDirection: 'row',
        alignItems: 'stretch',
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        borderTopWidth: 1,
        gap: 12,
        backgroundColor: '#fff',
    },
    previewButton: {
        width: 54,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    saveButtonFull: {
        flex: 2,
        flexBasis: 0,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
        borderRadius: 16,
        gap: 6,
        paddingHorizontal: 8,
    },
    saveText: { flexShrink: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    previewContainer: { flex: 1 },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: Platform.OS === 'ios' ? 16 : 16,
        borderBottomWidth: 1,
    },
    closePreview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    closePreviewText: { fontSize: 16, fontWeight: '600' },
    headerSaveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 10,
    },
    addItemButton: {
        width: 54,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        borderWidth: 1,
    },
});
