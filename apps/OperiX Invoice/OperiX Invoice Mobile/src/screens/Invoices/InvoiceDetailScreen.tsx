import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as MailComposer from 'expo-mail-composer';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    StyleSheet,
    Linking,
    Modal,
} from 'react-native';
import { ArrowLeft, Edit, Share2, FileText, Trash2, Eye, RefreshCw, Mail, Zap, CreditCard, Download, Printer, Receipt, X, MoreHorizontal, HandCoins, ChevronRight, UserRound } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '@invoice-monorepo/api';
import { deleteInvoice, getInvoice, listCompanyAgents, listInvoicePayments, postCreditNote, transitionInvoiceStatus } from '@invoice-monorepo/api/repositories';
import { calculateInvoice } from '@invoice-monorepo/money';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, StatusBadge } from '@invoice-monorepo/ui';
import { CompanyAgent, Invoice, InvoiceItem, TemplateType, InvoiceData, Profile } from '@invoice-monorepo/types';
import { generatePdf, sharePdf, printPdf } from '../../services/pdf/pdfService';
import { generateInvoiceHtml } from '../../services/pdf/TemplateFactory';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { brand, normalizeBrandColor } from '../../theme/brand';
import { ErrorState, LoadingState, MobileHeader, MobileScreen, MobileStatusBadge, ShortcutRow } from '../../components/mobile/MobileUI';
import { getWorkspaceScope, hasWorkspacePermission } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';
import type { CommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import {
    documentTypeLabel,
    isImmutableCommercialStatus,
    resolveCommercialDocumentType,
} from '@invoice-monorepo/commercial-documents';

interface InvoiceDetailScreenProps {
    navigation: any;
    route: any;
}

function agentDisplayName(agent: CompanyAgent | null | undefined) {
    if (!agent) return '';
    const name = [agent.first_name, agent.last_name].filter(Boolean).join(' ').trim();
    return name;
}

function profileDisplayName(profile: Record<string, any> | null | undefined) {
    if (!profile) return '';
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
        || String(profile.full_name || '').trim();
}

function paymentTypeLabel(value: unknown, language: 'en' | 'sq') {
    switch (String(value || '').toLowerCase()) {
        case 'cash': return t('cash', language);
        case 'bank': return t('bankTransfer', language);
        case 'card': return t('card', language);
        case 'online_payment': return t('onlinePayment', language);
        case 'cheque': return t('cheque', language);
        case 'other': return t('other', language);
        case 'customer_credit': return t('debt', language);
        default: return String(value || '');
    }
}

const invoiceStatusOptions = [
    { key: 'draft', commercialStatus: 'DRAFT' },
    { key: 'sent', commercialStatus: 'SENT' },
    { key: 'paid', commercialStatus: 'PAID' },
    { key: 'overdue', commercialStatus: 'OVERDUE' },
    { key: 'cancelled', commercialStatus: 'CANCELLED' },
] as const;

type InvoiceStatusOption = typeof invoiceStatusOptions[number];

function transitionCommercialStatus(invoice: Invoice, status: InvoiceStatusOption['key']) {
    const documentType = resolveCommercialDocumentType(invoice as any);
    const financialDocument = ['INVOICE', 'ADVANCE_INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE'].includes(documentType);

    // Invoices use ISSUED as their canonical equivalent of the legacy
    // "sent" label. Operational documents keep SENT.
    if (status === 'sent' && financialDocument) return 'ISSUED';
    return invoiceStatusOptions.find((option) => option.key === status)?.commercialStatus || 'DRAFT';
}

function isInvoiceStatusSelected(invoice: Invoice, option: InvoiceStatusOption) {
    const commercialStatus = String((invoice as any).commercial_status || '').toUpperCase();
    const legacyStatus = String(invoice.status || '').toLowerCase();
    if (commercialStatus) {
        return commercialStatus === option.commercialStatus
            || (option.key === 'sent' && commercialStatus === 'ISSUED');
    }
    return legacyStatus === option.key;
}

function canTransitionInvoiceStatus(invoice: Invoice, status: InvoiceStatusOption['key']) {
    const accountingState = String((invoice as any).accounting_state || '').toLowerCase();
    if (!['posted', 'reversed'].includes(accountingState)) return true;

    // Posted financial records can only move through payment/receivable
    // workflows. Correction documents must be created separately.
    return ['paid', 'overdue'].includes(status);
}

function permissionForInvoiceStatus(invoice: Invoice, status: InvoiceStatusOption['key']) {
    if (status === 'paid' || status === 'overdue') return 'payment.create';
    if (status === 'cancelled') return 'invoice.void';
    if (status === 'sent' && ['INVOICE', 'ADVANCE_INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE'].includes(resolveCommercialDocumentType(invoice as any))) return 'invoice.issue';
    return status === 'draft' ? 'invoice.edit' : 'invoice.issue';
}

function permissionForInvoiceConversion(targetType: CommercialDocumentType) {
    switch (targetType) {
        case 'QUOTE': return 'offer.create';
        case 'PROFORMA': return 'proforma.create';
        case 'SALES_ORDER': return 'order.create';
        case 'DELIVERY_NOTE': return 'delivery_note.create';
        case 'CREDIT_NOTE': return 'invoice.credit';
        case 'DEBIT_NOTE': return 'invoice.debit';
        default: return 'invoice.create';
    }
}



export function InvoiceDetailScreen({ navigation, route }: InvoiceDetailScreenProps) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const invoiceId = route.params?.invoiceId;
    const autoPreview = route.params?.autoPreview;
    const showStampOnInvoice = route.params?.showStampOnInvoice;
    const showSignatureOnInvoice = route.params?.showSignatureOnInvoice;

    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [generating, setGenerating] = useState(false);
    const [sending, setSending] = useState(false);
    const printInProgress = useRef(false);
    const [pdfUri, setPdfUri] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const [htmlContent, setHtmlContent] = useState('');
    const [payments, setPayments] = useState<Array<Record<string, any>>>([]);
    const [relatedDocuments, setRelatedDocuments] = useState<Array<Record<string, any>>>([]);
    const [events, setEvents] = useState<Array<Record<string, any>>>([]);
    const [salesBookPeriodStatus, setSalesBookPeriodStatus] = useState<string | null>(null);
    const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    const [invoiceAgent, setInvoiceAgent] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState<InvoiceStatusOption['key'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const bgColor = isDark ? '#0A0A0B' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#151517' : '#ffffff';
    const borderColor = isDark ? '#262629' : '#E4E9F0';
    const primaryColor = normalizeBrandColor(profile?.primary_color);

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [invoiceId])
    );

    const fetchData = async () => {
        if (!user || !invoiceId) return;
        setLoading(true);
        setLoadError(null);

        try {
        const workspaceScope = await getWorkspaceScope(user.id);
        setWorkspacePermissions(workspaceScope.permissions);
        setPlatformAdmin(workspaceScope.platformAdmin);
        const queryScope = { userId: user.id, companyIds: workspaceScope.companyIds };

        let { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();

        if (profileData?.active_company_id) {
            const { data: companyData } = await supabase
                .from('companies')
                .select('*')
                .eq('id', profileData.active_company_id)
                .single();

            if (companyData) {
                profileData = { ...profileData, ...companyData };
            }
        }

        if (profileData) setProfile(profileData);

        const invoiceData = await getInvoice(supabase, invoiceId, queryScope, '*, branch:branches!invoices_branch_id_fkey(id,code,name), client:clients(*), items:invoice_items(*, product:products(sku, name, image_url))');

        if (invoiceData) {
            setInvoice(invoiceData as unknown as Invoice);
        } else {
            setLoadError(t('invoiceUnavailable', language));
            setLoading(false);
            return;
        }

        const invoiceRow = invoiceData as unknown as Record<string, any>;
        const creatorUserId = String(invoiceRow.user_id || '');
        let creatorLabel = creatorUserId === user.id ? profileDisplayName(profileData) : '';
        try {
            const agents = await listCompanyAgents(supabase, String(invoiceRow.company_id || workspaceScope.companyId));
            creatorLabel = agentDisplayName(agents.find((agent) => agent.user_id === creatorUserId)) || creatorLabel;
        } catch (agentError) {
            console.warn('Invoice agent lookup unavailable:', agentError);
        }
        if (!creatorLabel && creatorUserId) {
            const { data: creatorProfile } = await supabase
                .from('profiles')
                .select('first_name,last_name')
                .eq('id', creatorUserId)
                .maybeSingle();
            creatorLabel = profileDisplayName(creatorProfile);
        }
        setInvoiceAgent(creatorLabel);
        if (invoiceRow.sales_book_period_id) {
            const { data: periodData } = await supabase
                .from('sales_book_periods')
                .select('status')
                .eq('id', invoiceRow.sales_book_period_id)
                .maybeSingle();
            setSalesBookPeriodStatus(periodData?.status ? String(periodData.status) : null);
        } else {
            setSalesBookPeriodStatus(null);
        }
        const itemsData = Array.isArray(invoiceRow.items) ? invoiceRow.items : [];
        setItems(itemsData as InvoiceItem[]);
        const paymentsData = await listInvoicePayments(supabase, queryScope, invoiceId);
        setPayments(paymentsData as Array<Record<string, any>>);
        const { data: linksData } = await supabase
            .from('document_source_links')
            .select('source_id,target_id,link_type,amount,metadata,created_at')
            .or(`source_id.eq.${invoiceId},target_id.eq.${invoiceId}`)
            .in('company_id', workspaceScope.companyIds)
            .order('created_at', { ascending: false });
        const relatedIds = (linksData || [])
            .flatMap((link: any) => [link.source_id, link.target_id])
            .filter((id: string, index: number, list: string[]) => id && id !== invoiceId && list.indexOf(id) === index);
        if (relatedIds.length) {
            const { data: linkedRows } = await supabase.from('invoices').select('id,invoice_number,commercial_document_type,commercial_status,status,total_amount,issue_date').in('id', relatedIds).in('company_id', workspaceScope.companyIds);
            setRelatedDocuments((linkedRows || []) as Array<Record<string, any>>);
        } else {
            setRelatedDocuments([]);
        }
        const { data: eventsData } = await supabase.from('commercial_document_events').select('id,event_type,from_status,to_status,payload,occurred_at').eq('document_id', invoiceId).in('company_id', workspaceScope.companyIds).order('occurred_at', { ascending: false }).limit(30);
        if (eventsData) setEvents(eventsData as Array<Record<string, any>>);
        setLoading(false);
        } catch (error) {
            setLoadError(getLocalizedErrorMessage(error, language, 'invoiceUnavailable'));
            setLoading(false);
        }
    };

    useEffect(() => {
        if (invoice && profile && items.length > 0 && autoPreview) {
            handlePrint();
        }
    }, [invoice, profile, items]);

    const buildInvoiceData = (): InvoiceData | null => {
        if (!invoice || !profile) return null;
        const client = (invoice as any).client;
        const calculated = calculateInvoice({
            lines: items.map((item) => ({
                quantity: item.quantity,
                unitPrice: item.unit_price,
                discountPercent: (item as any).discount || 0,
                taxRate: item.tax_rate || 0,
                taxIncluded: Boolean((item as any).tax_included),
            })),
            currency: String((invoice as any).currency || profile.currency || 'EUR'),
        });
        const calculatedLines = calculated.lines;
        const documentType = resolveCommercialDocumentType(invoice as any);
        const fiscalIdentifiersHidden = documentType === 'PROFORMA' || documentType === 'QUOTE' || documentType === 'SALES_ORDER' || documentType === 'DELIVERY_NOTE';
        const operatingBranch = (invoice as any).branch as { name?: string | null; code?: string | null } | null | undefined;
        const operatingBranchLabel = operatingBranch
            ? operatingBranch.code || ''
            : '';

        return {
            company: {
                name: profile.company_name || t('yourBusiness', language),
                address: profile.address || '',
                city: profile.city,
                country: profile.country,
                email: profile.email,
                phone: profile.phone,
                website: profile.website,
                taxId: profile.tax_id,
                logoUrl: profile.logo_url,
                signatureUrl: profile.signature_url,
                stampUrl: profile.stamp_url,
                bankName: profile.bank_name,
                bankAccount: profile.bank_account,
                bankIban: profile.bank_iban,
                bankSwift: profile.bank_swift,
                primaryColor: normalizeBrandColor(profile.primary_color),
                isGrayscale: profile.is_grayscale,
                paymentLinkStripe: profile.payment_link_stripe,
                paymentLinkPaypal: profile.payment_link_paypal,
            },
            client: {
                name: client?.name || t('client', language),
                address: [client?.address, client?.city, client?.zip_code, client?.country].filter(Boolean).join(', ') || '',
                email: client?.email || '',
                phone: client?.phone || '',
                taxId: client?.tax_id || '',
                nui: client?.nui || '',
                fiscalNumber: client?.fiscal_number || '',
                vatNumber: client?.vat_number || '',
            },
            details: {
                number: invoice.invoice_number,
                qrReference: (invoice as any).public_qr_token || undefined,
                qrBaseUrl: process.env.EXPO_PUBLIC_INVOICE_APP_URL?.trim() || 'https://invoice.operixsuite.com',
                issueDate: invoice.issue_date,
                dueDate: invoice.due_date || '',
                deliveryMethod: invoice.delivery_method
                    ? `${t(String(invoice.delivery_method) as any, language)}${(invoice as any).delivery_details ? ` — ${(invoice as any).delivery_details}` : ''}`
                    : '',
                currency: calculated.currency,
                language,
                notes: invoice.notes,
                department: operatingBranchLabel || profile.company_name || '',
                agent: invoiceAgent,
                reference: invoiceAgent,
                yourReference: paymentTypeLabel(invoice.payment_method, language === 'sq' ? 'sq' : 'en'),
                terms: profile.terms_conditions,
                status: invoice.status,
                paymentStatus: invoice.payment_status,
                buyerSignatureUrl: invoice.buyer_signature_url,
                showStampOnInvoice: showStampOnInvoice ?? true,
                paymentMethod: invoice.payment_method,
                amountReceived: Number(invoice.amount_received),
                changeAmount: Number(invoice.change_amount),
                type: invoice.type,
                subtype: (invoice as any).subtype || 'regular',
                commercialDocumentType: documentType,
                documentTypeLabel: documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en'),
            } as InvoiceData['details'] & { commercialDocumentType?: string; documentTypeLabel?: string },
            items: items.map((item, index) => ({
                description: item.description,
                quantity: Number(item.quantity),
                unit: item.unit,
                sku: (item as any).product?.sku || (item as any).sku,
                price: Number(item.unit_price),
                discount: (item as any).discount || 0,
                total: calculatedLines[index]?.total ?? Number(item.amount),
                taxable: calculatedLines[index]?.taxable ?? Number(item.amount),
                tax: calculatedLines[index]?.tax ?? 0,
                taxIncluded: Boolean((item as any).tax_included),
                taxRate: Number(item.tax_rate) || 0,
                imageUrl: (item as any).image_url || (item as any).product?.image_url,
            })),
            summary: {
                subtotal: calculated.subtotal,
                tax: calculated.tax,
                discount: calculated.discount,
                total: calculated.total,
                amountReceived: Number(invoice.amount_received),
                changeAmount: Number(invoice.change_amount),
                discountPercent: Number(invoice.discount_percent) || 0,
            },
            config: {
                showLogo: true,
                showBuyerSignature: true,
                showStamp: true,
                showNotes: true,
                showDiscount: true,
                showTax: true,
                showBankDetails: true,
                ...profile.template_config,
                labels: { ...(profile.template_config?.labels || {}), department: t('branch', language), reference: t('agent', language), yourReference: t('paymentType', language) },
                showSignature: showSignatureOnInvoice ?? profile.template_config?.showSignature ?? true,
                showProductPictures: Boolean((invoice as any).show_product_pictures),
                pageSize: invoice.paper_size || profile.template_config?.pageSize || 'A4',
                showQrCode: !fiscalIdentifiersHidden && Boolean(profile.template_config?.showQrCode ?? true),
                visibleColumns: {
                    rowNumber: true,
                    description: true,
                    quantity: true,
                    unit: true,
                    unitPrice: true,
                    lineTotal: true,
                    grossPrice: true,
                    ...profile.template_config?.visibleColumns,
                    taxRate: true,
                    discount: true,
                    sku: true
                }
            },
        };
    };

    const getInvoicePdfFileName = () => {
        const clientName = (invoice as any)?.client?.name || t('client', language);
        const companyName = profile?.company_name || t('yourBusiness', language);
        const invoiceNumber = invoice?.invoice_number || t('invoice', language);
        return `${companyName} - ${invoiceNumber} - ${clientName}`;
    };

    const handleGeneratePdf = async () => {
        if (!can('financial.export')) {
            Alert.alert(t('permissionDenied', language));
            return;
        }
        const data = buildInvoiceData();
        if (!data) { Alert.alert(t('error', language), t('failedToGeneratePdf', language)); return; }

        setGenerating(true);
        let templateToUse: TemplateType = 'corporate';
        const result = await generatePdf(data, templateToUse, getInvoicePdfFileName());
        setGenerating(false);

        if (result.success && result.uri) {
            // "Save to phone files" implies opening the share sheet or saving directly.
            // sharingAsync is the most reliable way to allow both on iOS/Android without complex perm setup for direct download folder access.
            await sharePdf(result.uri);
        } else {
            Alert.alert(t('error', language), result.error || t('failedToGeneratePdf', language));
        }
    };

    const handleSendEmail = async () => {
        if (!can('invoice.issue')) {
            Alert.alert(t('permissionDenied', language));
            return;
        }
        const clientEmail = (invoice as any).client?.email;
        if (!clientEmail) {
            Alert.alert(t('noClientEmail', language), t('clientHasNoEmail', language));
            return;
        }

        setSending(true);
        try {
            const isAvailable = await MailComposer.isAvailableAsync();
            if (!isAvailable) {
                Alert.alert(t('error', language), t('emailUnavailableOnDevice', language));
                return;
            }

            const data = buildInvoiceData();
            if (!data) return;

            let templateToUse: TemplateType = 'corporate';
            const pdfResult = await generatePdf(data, templateToUse, getInvoicePdfFileName());
            if (!pdfResult.success || !pdfResult.uri) throw new Error(t('failedToGeneratePdf', language));

            const status = await MailComposer.composeAsync({
                recipients: [clientEmail],
                subject: `${t('invoice', language)} ${invoice?.invoice_number} · ${profile?.company_name}`,
                body: `${t('invoice', language)} ${invoice?.invoice_number}\n\n${t('attachedInvoiceMessage', language)}\n\n${profile?.company_name}`,
                attachments: [pdfResult.uri],
                isHtml: false,
            });

            if (status.status === 'sent') {
                Alert.alert(t('success', language), t('emailMarkedSent', language));
            }
        } catch (error: any) {
            Alert.alert(t('error', language), `${t('failedToComposeEmail', language)}: ${getLocalizedErrorMessage(error, language, 'failedToComposeEmail')}`);
        } finally {
            setSending(false);
        }
    };

    const handleShare = async () => {
        if (!can('financial.export')) {
            Alert.alert(t('permissionDenied', language));
            return;
        }
        const data = buildInvoiceData();
        if (!data) return;

        let templateToUse: TemplateType = 'corporate';
        setGenerating(true);
        const result = await generatePdf(data, templateToUse, getInvoicePdfFileName());
        setGenerating(false);

        if (result.success && result.uri) {
            const success = await sharePdf(result.uri);
            if (!success) Alert.alert(t('error', language), t('failedToSharePdf', language));
        } else {
            Alert.alert(t('error', language), result.error || t('failedToGeneratePdfForSharing', language));
        }
    };

    const handlePrintWithTemplate = async (templateToUse: TemplateType) => {
        if (!can('financial.export')) {
            Alert.alert(t('permissionDenied', language));
            return;
        }
        if (printInProgress.current) return;
        const data = buildInvoiceData();
        if (!data) return;

        printInProgress.current = true;
        setGenerating(true);
        try {
            const printData = {
                ...data,
                config: {
                    ...data.config!,
                    pageSize: templateToUse === 'thermal' ? 'Receipt' as const : 'A4' as const,
                    style: templateToUse,
                },
            };
            const result = await printPdf(printData, templateToUse, getInvoicePdfFileName());
            if (!result.success && !result.canceled) {
                Alert.alert(t('error', language), result.error || t('preview', language));
            }
        } finally {
            printInProgress.current = false;
            setGenerating(false);
        }
    };

    const handlePrint = async () => handlePrintWithTemplate('corporate');
    const handleReceiptPrint = async () => handlePrintWithTemplate('thermal');

    const handlePreview = () => {
        const data = buildInvoiceData();
        if (!data) return;

        const previewData = {
            ...data,
            config: { ...data.config!, pageSize: 'A4' as const, style: 'corporate' as const },
        };
        const html = generateInvoiceHtml(previewData, 'corporate');
        setHtmlContent(html.replace('width=device-width, initial-scale=1', 'width=794, initial-scale=1'));
        setShowPreview(true);
    };

    const handleUpdateStatus = async (status: InvoiceStatusOption['key']) => {
        if (!invoice || updatingStatus || !can(permissionForInvoiceStatus(invoice, status))) return;
        const option = invoiceStatusOptions.find((candidate) => candidate.key === status);
        if (!option || !canTransitionInvoiceStatus(invoice, status)) return;

        const nextStatus = transitionCommercialStatus(invoice, status);
        if (isInvoiceStatusSelected(invoice, option)) return;

        setUpdatingStatus(status);
        try {
            const { data, error } = await transitionInvoiceStatus(supabase, invoice.id, nextStatus, `mobile_${status}`);
            if (error) {
                Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
                return;
            }
            if (data) {
                // Keep the legacy status in sync locally until the next detail
                // fetch. The RPC returns canonical commercial_status, while
                // older list/report surfaces still read status.
                setInvoice({ ...invoice, ...(data as any), status: status as any, commercial_status: nextStatus } as Invoice);
                const notificationType = nextStatus === 'PAID' ? 'invoice_paid' : nextStatus === 'CANCELLED' ? 'invoice_cancelled' : 'invoice_updated';
                void notifyBusinessEvent(notificationType, String(invoice.company_id), String(invoice.id)).catch((notificationError) => console.warn('Invoice status notification could not be sent:', notificationError));
            }
        } finally {
            setUpdatingStatus(null);
        }
    };

    const handleConvert = async (targetType: CommercialDocumentType, _language?: string) => {
        if (!invoice) return;
        const targetPermission = permissionForInvoiceConversion(targetType);
        const sourcePermission = targetType === 'CREDIT_NOTE' || targetType === 'DEBIT_NOTE' ? targetPermission : 'invoice.edit';
        if (!can(sourcePermission) || !can(targetPermission) || ((targetType === 'CREDIT_NOTE' || targetType === 'DEBIT_NOTE') && !can('invoice.issue'))) {
            Alert.alert(t('error', language), t('permissionDenied', language));
            return;
        }
        // iOS can drop an Alert presented during a sheet dismissal. Wait for
        // the actions sheet to finish closing before showing confirmation.
        if (showMore) {
            setShowMore(false);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        Alert.alert(
            `${t('create', language)} ${documentTypeLabel(targetType, language === 'sq' ? 'sq' : 'en')}`,
            `${t('sourceDocumentKept', language)} · ${invoice.invoice_number}`,
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('confirm', language),
                    onPress: async () => {
                        try {
                            const { data, error } = await supabase.rpc('convert_commercial_document', {
                                p_source_document_id: invoice.id,
                                p_target_document_type: targetType,
                            });
                            if (error || !data) {
                                Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'unableToLoad'));
                                return;
                            }
                            let createdDocument = data as any;
                            if (targetType === 'CREDIT_NOTE') {
                                createdDocument = await postCreditNote(supabase, String((data as any).id));
                            }
                            if (!createdDocument?.id) {
                                Alert.alert(t('error', language), t('unableToLoad', language));
                                return;
                            }
                            Alert.alert(t('success', language), `${documentTypeLabel(targetType, language === 'sq' ? 'sq' : 'en')} ${createdDocument.invoice_number || ''}`, [
                                { text: t('open', language), onPress: () => navigation.replace('InvoiceDetail', { invoiceId: createdDocument.id }) },
                            ]);
                        } catch (conversionError) {
                            Alert.alert(t('error', language), getLocalizedErrorMessage(conversionError, language, 'unableToLoad'));
                        }
                    }
                }
            ]
        );
    };

    const handleTransformToInvoice = async () => handleConvert('INVOICE');

    const handleDelete = async () => {
        if (!invoice || !can('invoice.delete_draft')) return;
        Alert.alert(
            t('deleteInvoice', language),
            t('deleteInvoiceConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteInvoice(supabase, invoice.id);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'failedToDeleteInvoice'));
                        }
                    }
                }
            ]
        );
    };

    const handleCopyInvoiceNumber = useCallback(async () => {
        if (!invoice?.invoice_number) return;
        try {
            await Clipboard.setStringAsync(invoice.invoice_number);
            Alert.alert(t('copied', language), t('invoiceNumberCopied', language));
        } catch (error) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'unableToLoad'));
        }
    }, [invoice?.invoice_number, language]);

    if (loading) {
        return <MobileScreen><LoadingState label={`${t('loading', language)} ${t('invoice', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}…`} /></MobileScreen>;
    }

    if (loadError || !invoice) {
        return <MobileScreen><MobileHeader title={t('invoice', language)} subtitle={t('invoiceDetails', language)} onBack={() => navigation.goBack()} /><ErrorState onRetry={() => void fetchData()} message={loadError || t('invoiceUnavailable', language)} /></MobileScreen>;
    }

    const invoiceClient = (invoice as any).client;
    const documentType = resolveCommercialDocumentType(invoice as any);
    const isCreditNote = documentType === 'CREDIT_NOTE';
    const signedAmount = (value: number) => isCreditNote ? -Math.abs(value) : value;
    const documentLabel = documentTypeLabel(documentType, language === 'sq' ? 'sq' : 'en');
    const editable = !isImmutableCommercialStatus((invoice as any).commercial_status || invoice.status) && (invoice as any).accounting_state !== 'posted';
    const can = (permission: string) => hasWorkspacePermission({ permissions: workspacePermissions, platformAdmin }, permission);
    const canManageInvoice = ['invoice.edit', 'invoice.issue', 'invoice.void', 'invoice.credit', 'invoice.debit', 'payment.create'].some(can);
    const salesBookPeriodLocked = ['DECLARED', 'AMENDED'].includes(String(salesBookPeriodStatus || '').toUpperCase());
    const canEditInvoice = can('invoice.edit') && !salesBookPeriodLocked && editable;
    const canDeleteInvoice = can('invoice.delete_draft') && !salesBookPeriodLocked && String((invoice as any).commercial_status || invoice.status || '').toUpperCase() === 'DRAFT';
    const canExportInvoice = can('financial.export');
    const canConvertTo = (targetType: CommercialDocumentType) => {
        const targetPermission = permissionForInvoiceConversion(targetType);
        const sourcePermission = targetType === 'CREDIT_NOTE' || targetType === 'DEBIT_NOTE' ? targetPermission : 'invoice.edit';
        return can(sourcePermission) && can(targetPermission) && ((targetType !== 'CREDIT_NOTE' && targetType !== 'DEBIT_NOTE') || can('invoice.issue'));
    };
    const paidTotal = payments.length
        ? payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
        : Number(invoice.amount_received || 0);
    const detailTotals = calculateInvoice({
        lines: items.map((item) => ({
            quantity: item.quantity,
            unitPrice: item.unit_price,
            discountPercent: (item as any).discount || 0,
            taxRate: item.tax_rate || 0,
            taxIncluded: Boolean((item as any).tax_included),
        })),
        currency: String((invoice as any).currency || profile?.currency || 'EUR'),
    });
    const outstandingTotal = calculateInvoice({
        lines: [{ quantity: 1, unitPrice: Number(invoice.total_amount || 0) }],
        paidAmount: paidTotal,
        currency: detailTotals.currency,
    }).remaining;
    const isFullyPaid = isCreditNote || outstandingTotal <= 0.005;
    const displayOutstanding = isCreditNote
        ? signedAmount(Number(invoice.total_amount || detailTotals.total))
        : outstandingTotal;
    // Payment allocations are the source of truth for what the customer has
    // settled. A posted invoice can retain the commercial label "ISSUED" in
    // older data, so the detail view must not show that stale label after the
    // invoice is fully paid.
    const displayCommercialStatus = isCreditNote
        ? (String(invoice.status || '').toUpperCase() === 'POSTED' ? 'POSTED' : ((invoice as any).commercial_status || invoice.status))
        : isFullyPaid
            ? 'PAID'
            : ((invoice as any).commercial_status || invoice.status);

    return (
        <MobileScreen testID="invoice-detail-screen">
            <MobileHeader
                title={invoice.invoice_number}
                subtitle={`${documentLabel} · ${invoiceClient?.name || t('noClientAssigned', language)}`}
                onBack={() => navigation.goBack()}
                onTitleLongPress={() => void handleCopyInvoiceNumber()}
                titleTestID="invoice-number-title"
                right={<TouchableOpacity testID="invoice-more-actions-button" accessibilityRole="button" accessibilityLabel={t('moreInvoiceActions', language)} onPress={() => setShowMore(true)} style={styles.mobileHeaderAction}><MoreHorizontal color={textColor} size={21} /></TouchableOpacity>}
            />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.mobileContent}>
                <View style={[styles.mobileHero, { backgroundColor: primaryColor }]}>
                    <View style={styles.mobileHeroTop}><View><Text style={styles.mobileHeroLabel}>{documentLabel} · {t('total', language)}</Text><Text style={styles.mobileHeroAmount}>{formatCurrency(signedAmount(Number(invoice.total_amount || 0)))}</Text></View><MobileStatusBadge status={displayCommercialStatus} /></View>
                    <View style={styles.mobileHeroDates}><View><Text style={styles.mobileHeroMetaLabel}>{t('invoiceDate', language)}</Text><Text style={styles.mobileHeroMeta}>{invoice.issue_date}</Text></View><View><Text style={styles.mobileHeroMetaLabel}>{t('dueDate', language)}</Text><Text style={styles.mobileHeroMeta}>{invoice.due_date || t('onReceipt', language)}</Text></View></View>
                </View>

                <View style={styles.mobilePrimaryActions}>{!isFullyPaid && can('payment.create') ? <TouchableOpacity testID="invoice-add-payment-button" accessibilityRole="button" accessibilityLabel={documentType === 'PROFORMA' ? t('registerAdvance', language) : t('registerPayment', language)} onPress={() => documentType === 'PROFORMA' ? navigation.navigate('InvoiceForm', { documentType: 'ADVANCE_INVOICE', sourceDocumentId: invoice.id }) : navigation.navigate('PaymentForm', { invoiceId: invoice.id })} style={[styles.mobilePrimaryAction, { backgroundColor: primaryColor }]}><HandCoins color="#fff" size={21} /></TouchableOpacity> : null}{can('invoice.issue') ? <TouchableOpacity testID="invoice-send-button" accessibilityRole="button" accessibilityLabel={t('send', language)} onPress={handleSendEmail} style={[styles.mobileSecondaryAction, { backgroundColor: cardBg, borderColor }]}><Mail color={textColor} size={21} /></TouchableOpacity> : null}{can('financial.export') ? <TouchableOpacity testID="invoice-share-button" accessibilityRole="button" accessibilityLabel={t('share', language)} onPress={handleShare} style={[styles.mobileSecondaryAction, { backgroundColor: cardBg, borderColor }]}><Share2 color={textColor} size={21} /></TouchableOpacity> : null}</View>
                <View style={styles.mobileDocumentActions}>{can('financial.export') ? <TouchableOpacity testID="invoice-print-button" accessibilityRole="button" accessibilityLabel={t('print', language)} onPress={handlePrint} style={[styles.mobileDocumentAction, { backgroundColor: primaryColor, borderColor: primaryColor }]}><Printer color="#fff" size={18} /><Text style={[styles.mobileDocumentActionText, { color: '#fff' }]}>{t('print', language)}</Text></TouchableOpacity> : null}<TouchableOpacity testID="invoice-preview-button" accessibilityRole="button" accessibilityLabel={t('preview', language)} onPress={handlePreview} style={[styles.mobileDocumentAction, { backgroundColor: primaryColor, borderColor: primaryColor }]}><Eye color="#fff" size={18} /><Text style={[styles.mobileDocumentActionText, { color: '#fff' }]}>{t('preview', language)}</Text></TouchableOpacity></View>

                <Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('customer', language)}</Text>
                <ShortcutRow testID="invoice-customer-detail-button" icon={UserRound} title={invoiceClient?.name || t('noClientAssigned', language)} description={invoiceClient?.email || invoiceClient?.phone || t('customerDetailsUnavailable', language)} onPress={() => invoiceClient?.id && navigation.navigate('CustomerDetail', { clientId: invoiceClient.id })} trailing={<ChevronRight color={mutedColor} size={18} />} />
                {invoiceAgent ? <View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor, marginTop: 12 }]}><Text style={[styles.mobileSectionTitle, { color: mutedColor, marginBottom: 4 }]}>{t('agent', language)}</Text><Text style={[styles.mobileItemName, { color: textColor }]}>{invoiceAgent}</Text></View> : null}

                <Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('items', language)} · {items.length}</Text>
                <View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor }]}>
                    {items.length ? items.map((item, index) => <View key={item.id} style={[styles.mobileItemRow, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                        <View style={styles.mobileItemCopy}>
                            <Text style={[styles.mobileItemName, { color: textColor }]}>{item.description}</Text>
                            <Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{item.quantity} × {formatCurrency(signedAmount(Number(item.unit_price || 0)))}</Text>
                        </View>
                        <Text style={[styles.mobileItemTotal, { color: textColor }]}>{formatCurrency(signedAmount(detailTotals.lines[index]?.total ?? Number(item.amount || 0)))}</Text>
                    </View>) : <Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{t('noLineItemsAvailable', language)}</Text>}
                    <View style={[styles.mobileTotals, { borderTopColor: borderColor }]}>
                        <View style={styles.mobileTotalRow}><Text style={[styles.mobileTotalLabel, { color: mutedColor }]}>{t('subtotal', language)}</Text><Text style={[styles.mobileTotalValue, { color: textColor }]}>{formatCurrency(signedAmount(detailTotals.subtotal))}</Text></View>
                        {detailTotals.discount > 0 ? <View style={styles.mobileTotalRow}><Text style={[styles.mobileTotalLabel, { color: mutedColor }]}>{t('discount', language)}</Text><Text style={[styles.mobileTotalValue, { color: brand.colors.success }]}>{isCreditNote ? formatCurrency(-Math.abs(detailTotals.discount)) : `-${formatCurrency(detailTotals.discount)}`}</Text></View> : null}
                        {detailTotals.tax > 0 ? <View style={styles.mobileTotalRow}><Text style={[styles.mobileTotalLabel, { color: mutedColor }]}>{t('tax', language)}</Text><Text style={[styles.mobileTotalValue, { color: textColor }]}>{formatCurrency(signedAmount(detailTotals.tax))}</Text></View> : null}
                        <View style={[styles.mobileTotalRow, { marginTop: 5 }]}><Text style={[styles.mobileTotalStrong, { color: textColor }]}>{t('total', language)}</Text><Text style={[styles.mobileTotalStrong, { color: primaryColor }]}>{formatCurrency(signedAmount(Number(invoice.total_amount || detailTotals.total)))}</Text></View>
                    </View>
                </View>

                <Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('incomePayments', language)}</Text>
                <View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor }]}>{payments.length ? payments.map((payment) => <View key={payment.id} style={styles.mobilePaymentRow}><View style={styles.mobilePaymentIcon}><HandCoins color={brand.colors.success} size={16} /></View><View style={styles.mobileItemCopy}><Text style={[styles.mobileItemName, { color: textColor }]}>{payment.payment_number || t('paymentReceived', language)}</Text><Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{payment.payment_date} · {payment.payment_method === 'cash' ? t('cash', language) : t('bank', language)}</Text></View><Text style={[styles.mobileItemTotal, { color: brand.colors.success }]}>+{formatCurrency(Number(payment.amount || 0))}</Text></View>) : <Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{t('noPaymentsRecordedYet', language)}</Text>}<View style={[styles.mobileOutstanding, { borderTopColor: borderColor }]}><Text style={[styles.mobileTotalLabel, { color: mutedColor }]}>{t('outstanding', language)}</Text><Text style={[styles.mobileTotalStrong, { color: displayOutstanding > 0 ? brand.colors.error : brand.colors.success }]}>{formatCurrency(displayOutstanding)}</Text></View></View>

                {relatedDocuments.length ? <><Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('relatedDocuments', language)}</Text><View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor }]}>{relatedDocuments.map((related) => { const relatedType = resolveCommercialDocumentType(related); return <TouchableOpacity key={related.id} accessibilityRole="button" onPress={() => navigation.push('InvoiceDetail', { invoiceId: related.id })} style={styles.mobileActivityRow}><View style={[styles.mobileActivityDot, { backgroundColor: primaryColor }]} /><View style={styles.mobileItemCopy}><Text style={[styles.mobileItemName, { color: textColor }]}>{documentTypeLabel(relatedType, language === 'sq' ? 'sq' : 'en')} · {related.invoice_number}</Text><Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{formatCurrency(relatedType === 'CREDIT_NOTE' ? -Math.abs(Number(related.total_amount || 0)) : Number(related.total_amount || 0))} · {related.commercial_status || related.status}</Text></View><ChevronRight color={mutedColor} size={17} /></TouchableOpacity>; })}</View></> : null}
                {invoice.notes ? <><Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('notes', language)}</Text><View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor }]}><Text style={[styles.mobileNotes, { color: textColor }]}>{invoice.notes}</Text></View></> : null}
                <Text style={[styles.mobileSectionTitle, { color: textColor }]}>{t('recentActivity', language)}</Text>
                <View style={[styles.mobileCard, { backgroundColor: cardBg, borderColor }]}>{(events.length ? events : [{ event_type: 'created', occurred_at: invoice.created_at || invoice.issue_date, to_status: (invoice as any).commercial_status || invoice.status }]).map((event, index) => <View key={event.id || `${event.event_type}-${index}`} style={styles.mobileActivityRow}><View style={[styles.mobileActivityDot, { backgroundColor: index === 0 ? primaryColor : brand.colors.success }]} /><View style={styles.mobileItemCopy}><Text style={[styles.mobileItemName, { color: textColor }]}>{event.event_type ? String(event.event_type).replace(/_/g, ' ') : t('created', language)}</Text><Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{event.occurred_at ? new Date(event.occurred_at).toLocaleString(language === 'sq' ? 'sq-XK' : 'en-US') : invoice.issue_date}{event.to_status ? ` · ${event.to_status}` : ''}</Text></View></View>)}</View>
                <View style={{ height: 28 }} />
            </ScrollView>

            <Modal visible={showMore} transparent animationType="slide" onRequestClose={() => setShowMore(false)}><View style={styles.mobileModalOverlay}><View style={[styles.mobileModalSheet, { backgroundColor: cardBg }]}><View style={styles.mobileSheetHandle} /><View style={styles.mobileSheetHeader}><View><Text style={[styles.mobileSheetTitle, { color: textColor }]}>{t('actions', language)}</Text><Text style={[styles.mobileItemMeta, { color: mutedColor }]}>{documentLabel} · {t('sourceDocumentKept', language)}</Text></View><TouchableOpacity accessibilityRole="button" onPress={() => setShowMore(false)}><X color={textColor} size={21} /></TouchableOpacity></View>{canEditInvoice ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); navigation.navigate('InvoiceForm', { invoiceId: invoice.id, documentType }); }} style={styles.mobileMoreRow}><Edit color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('editInvoice', language)}</Text></TouchableOpacity> : null}<TouchableOpacity testID="invoice-more-preview-button" accessibilityRole="button" onPress={() => { setShowMore(false); handlePreview(); }} style={styles.mobileMoreRow}><Eye color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('preview', language)}</Text></TouchableOpacity>{canExportInvoice ? <><TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleGeneratePdf(); }} style={styles.mobileMoreRow}><Download color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('share', language)} PDF</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handlePrint(); }} style={styles.mobileMoreRow}><Printer color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('print', language)}</Text></TouchableOpacity></> : null}{documentType === 'QUOTE' && canConvertTo('SALES_ORDER') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('SALES_ORDER'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('createOrder', language)}</Text></TouchableOpacity> : null}{documentType === 'QUOTE' && canConvertTo('INVOICE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('INVOICE'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('invoice', language)}</Text></TouchableOpacity> : null}{documentType === 'PROFORMA' && canConvertTo('ADVANCE_INVOICE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('ADVANCE_INVOICE'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('createAdvanceInvoice', language)}</Text></TouchableOpacity> : null}{documentType === 'PROFORMA' && canConvertTo('INVOICE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('INVOICE', language); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('invoice', language)}</Text></TouchableOpacity> : null}{documentType === 'SALES_ORDER' && canConvertTo('DELIVERY_NOTE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('DELIVERY_NOTE'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('deliveryNote', language)}</Text></TouchableOpacity> : null}{(documentType === 'SALES_ORDER' || documentType === 'DELIVERY_NOTE') && canConvertTo('INVOICE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('INVOICE'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('invoice', language)}</Text></TouchableOpacity> : null}{documentType === 'ADVANCE_INVOICE' && canConvertTo('FINAL_INVOICE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('FINAL_INVOICE'); }} style={styles.mobileMoreRow}><RefreshCw color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('createFinalInvoice', language)}</Text></TouchableOpacity> : null}{['INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE'].includes(documentType) && canConvertTo('CREDIT_NOTE') ? <TouchableOpacity testID="invoice-create-credit-note-button" accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('CREDIT_NOTE'); }} style={styles.mobileMoreRow}><Receipt color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('creditNote', language)}</Text></TouchableOpacity> : null}{['INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE'].includes(documentType) && canConvertTo('DEBIT_NOTE') ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleConvert('DEBIT_NOTE'); }} style={styles.mobileMoreRow}><Receipt color={primaryColor} size={18} /><Text style={[styles.mobileMoreText, { color: textColor }]}>{t('create', language)} {t('debitNote', language)}</Text></TouchableOpacity> : null}<Text style={[styles.mobileMoreLabel, { color: mutedColor }]}>{t('changeStatus', language)}</Text><View style={styles.mobileStatusOptions}>{invoiceStatusOptions.map((option) => { const disabled = Boolean(updatingStatus) || !canTransitionInvoiceStatus(invoice, option.key) || !can(permissionForInvoiceStatus(invoice, option.key)); const selected = isInvoiceStatusSelected(invoice, option); return <TouchableOpacity key={option.key} testID={`invoice-status-${option.key}-button`} accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={() => { setShowMore(false); void handleUpdateStatus(option.key); }} style={[styles.mobileStatusOption, { borderColor: selected ? primaryColor : borderColor, backgroundColor: selected ? `${primaryColor}14` : cardBg, opacity: disabled ? 0.45 : 1 }]}><Text style={[styles.mobileStatusOptionText, { color: selected ? primaryColor : mutedColor }]}>{option.key.charAt(0).toUpperCase() + option.key.slice(1)}</Text></TouchableOpacity>; })}</View>{canDeleteInvoice ? <TouchableOpacity accessibilityRole="button" onPress={() => { setShowMore(false); void handleDelete(); }} style={[styles.mobileMoreRow, { marginTop: 6 }]}><Trash2 color={brand.colors.error} size={18} /><Text style={[styles.mobileMoreText, { color: brand.colors.error }]}>{t('deleteInvoice', language)}</Text></TouchableOpacity> : null}</View></View></Modal>

            <Modal visible={showPreview} animationType="slide"><View style={{ flex: 1, backgroundColor: bgColor }}><View style={styles.mobilePreviewHeader}><TouchableOpacity testID="invoice-preview-close-button" accessibilityRole="button" onPress={() => setShowPreview(false)}><X color={textColor} size={23} /></TouchableOpacity><Text style={[styles.mobileSheetTitle, { color: textColor }]}>{t('invoicePreview', language)}</Text><TouchableOpacity testID="invoice-preview-print-button" accessibilityRole="button" onPress={handlePrint}><Printer color={primaryColor} size={22} /></TouchableOpacity></View><WebView testID="invoice-preview-webview" source={{ html: htmlContent }} style={{ flex: 1 }} originWhitelist={['*']} /></View></Modal>
        </MobileScreen>
    );

    if (!invoice) {
        return (
            <View style={[styles.loading, { backgroundColor: bgColor }]}>
                <ActivityIndicator size="large" color="#004FFE" />
            </View>
        );
    }

    return (
            <View testID="invoice-detail-screen" style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
                        <ArrowLeft color={textColor} size={24} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>{(invoice as any).client?.name || t('noClient', language)}</Text>
                        <Text style={[styles.title, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>{invoice.invoice_number}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    {invoice.type === 'offer' && canConvertTo('INVOICE') && (
                        <TouchableOpacity
                            style={[styles.smallActionBtn, { backgroundColor: primaryColor, marginRight: 8 }]}
                            onPress={handleTransformToInvoice}
                        >
                            <RefreshCw color="#fff" size={20} />
                        </TouchableOpacity>
                    )}
                    {canManageInvoice && (
                        <>
                            {canDeleteInvoice && <TouchableOpacity
                                style={[styles.smallActionBtn, { backgroundColor: '#fee2e2', marginRight: 8 }]}
                                onPress={handleDelete}
                            >
                                <Trash2 color="#ef4444" size={20} />
                            </TouchableOpacity>}
                            {canEditInvoice && <TouchableOpacity
                                style={[styles.smallActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
                                onPress={() => navigation.navigate('InvoiceForm', { invoiceId: invoice.id })}
                            >
                                <Edit color={textColor} size={20} />
                            </TouchableOpacity>}
                        </>
                    )}
                </View>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Status Card */}
                <Card style={styles.mainCard}>
                    <View style={styles.mainCardHeader}>
                        <View>
                            <Text style={[styles.amountLabel, { color: mutedColor }]}>{t('total', language)} {t('amount', language)}</Text>
                            <Text style={[styles.totalAmount, { color: primaryColor }]}>{formatCurrency(Number(invoice.total_amount))}</Text>
                        </View>
                        <StatusBadge status={isFullyPaid ? 'paid' : invoice.status} />
                    </View>

                    <View style={[styles.divider, { backgroundColor: borderColor }]} />

                    <View style={styles.datesRow}>
                        <View>
                            <Text style={[styles.dateLabel, { color: mutedColor }]}>{t('issued', language)}</Text>
                            <Text style={[styles.dateValue, { color: textColor }]}>{invoice.issue_date}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.dateLabel, { color: mutedColor }]}>{t('dueDate', language)}</Text>
                            <Text style={[styles.dateValue, { color: textColor }]}>{invoice.due_date || t('onReceipt', language)}</Text>
                        </View>
                    </View>
                </Card>

                {/* Status Selector */}
                {canManageInvoice ? <>
                    <Text style={[styles.sectionTitle, { color: textColor }]}>{t('statusUpdate', language)}</Text>
                    <View style={styles.statusScroll}>
                        {invoiceStatusOptions.map((option) => (
                            <TouchableOpacity
                                key={option.key}
                                testID={`invoice-status-${option.key}-legacy-button`}
                                disabled={Boolean(updatingStatus) || !canTransitionInvoiceStatus(invoice, option.key) || !can(permissionForInvoiceStatus(invoice, option.key))}
                                style={[
                                    styles.statusChip,
                                    { backgroundColor: cardBg, borderColor },
                                    isInvoiceStatusSelected(invoice, option) && { backgroundColor: primaryColor, borderColor: primaryColor },
                                    (!canTransitionInvoiceStatus(invoice, option.key) || updatingStatus) && { opacity: 0.45 },
                                ]}
                                onPress={() => handleUpdateStatus(option.key)}
                            >
                                <Text style={[styles.statusChipText, { color: isInvoiceStatusSelected(invoice, option) ? '#fff' : mutedColor }]}>
                                    {option.key.charAt(0).toUpperCase() + option.key.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </> : null}



                {/* Items */}
                <Text style={[styles.sectionTitle, { color: textColor }]}>{t('items', language)} ({items.length})</Text>
                <Card style={styles.itemsCard}>
                    {items.map((item, index) => (
                        <View key={item.id} style={[styles.itemRow, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                            <View style={styles.itemInfo}>
                                <Text style={[styles.itemName, { color: textColor }]}>{item.description}</Text>
                                <Text style={[styles.itemMeta, { color: mutedColor }]}>
                                    {item.quantity} x {formatCurrency(Number(item.unit_price))}
                                </Text>
                            </View>
                            <Text style={[styles.itemTotal, { color: textColor }]}>
                                {formatCurrency(detailTotals.lines[index]?.total ?? Number(item.amount || 0))}
                            </Text>
                        </View>
                    ))}

                    <View style={[styles.summarySection, { borderTopColor: borderColor }]}>
                        <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { color: mutedColor }]}>{t('subtotal', language)}</Text>
                            <Text style={[styles.summaryValue, { color: textColor }]}>
                                {formatCurrency(detailTotals.subtotal)}
                            </Text>
                        </View>
                        {detailTotals.tax > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: mutedColor }]}>{t('tax', language)}</Text>
                                <Text style={[styles.summaryValue, { color: textColor }]}>{formatCurrency(detailTotals.tax)}</Text>
                            </View>
                        )}
                        {detailTotals.discount > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={[styles.summaryLabel, { color: mutedColor }]}>{t('discount', language)}</Text>
                                <Text style={[styles.summaryValue, { color: '#12B76A' }]}>-{formatCurrency(detailTotals.discount)}</Text>
                            </View>
                        )}
                        <View style={[styles.summaryRow, { marginTop: 8 }]}>
                            <Text style={[styles.totalLabel, { color: textColor }]}>{t('total', language)}</Text>
                            <Text style={[styles.totalValue, { color: primaryColor }]}>{formatCurrency(Number(invoice.total_amount))}</Text>
                        </View>
                    </View>
                </Card>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                    <Button
                        title={generating ? `${t('loading', language)}…` : t('preview', language)}
                        onPress={handlePreview}
                        icon={Eye}
                        loading={generating}
                        style={{ marginBottom: 12 }}
                    />

                    <View style={styles.actionGrid}>
                        <Button
                            title={t('share', language)}
                            onPress={handleShare}
                            icon={Share2}
                            variant="secondary"
                            style={{ flex: 1 }}
                            disabled={!canExportInvoice}
                        />
                        <Button
                            title={t('email', language)}
                            onPress={handleSendEmail}
                            icon={Mail}
                            variant="secondary"
                            style={{ flex: 1 }}
                            loading={sending}
                            disabled={!can('invoice.issue')}
                        />
                    </View>

                    <View style={[styles.actionGrid, { marginTop: 12 }]}>
                        <Button
                            title={t('print', language)}
                            onPress={handlePrint}
                            icon={Printer}
                            variant="primary" // Changed to primary for visibility/differentiation logic or kept utility
                            style={{ flex: 1, backgroundColor: isDark ? '#262629' : '#E4E9F0' }}
                            textStyle={{ color: textColor }}
                            disabled={!canExportInvoice}
                        />
                        <Button
                            title={t('receiptPrint', language)}
                            onPress={handleReceiptPrint}
                            icon={Receipt}
                            variant="primary"
                            style={{ flex: 1, backgroundColor: isDark ? '#262629' : '#E4E9F0' }}
                            textStyle={{ color: textColor }}
                            disabled={!canExportInvoice}
                        />
                    </View>

                    <View style={[styles.actionGrid, { marginTop: 12 }]}> 
                        <Button
                            title={t('downloadPdf', language)}
                            onPress={handleGeneratePdf}
                            icon={Download}
                            variant="primary"
                            style={{ flex: 1, backgroundColor: isDark ? '#262629' : '#E4E9F0' }}
                            textStyle={{ color: textColor }}
                            disabled={!canExportInvoice}
                        />
                    </View>
                </View>

                {/* Online Payment Actions */}
                {(profile?.payment_link_stripe || profile?.payment_link_paypal) && (
                    <View style={{ marginTop: 24 }}>
                        <Text style={[styles.dateLabel, { color: mutedColor, marginBottom: 12, textTransform: 'uppercase' }]}>{t('onlinePaymentLinks', language)}</Text>
                        <View style={styles.actionGrid}>
                            {profile?.payment_link_stripe && (
                                <Button
                                    title={t('stripeLink', language)}
                                    onPress={() => profile.payment_link_stripe && Linking.openURL(profile.payment_link_stripe)}
                                    icon={Zap}
                                    style={{ flex: 1, backgroundColor: '#635bff', borderColor: '#635bff' }}
                                    textStyle={{ color: '#fff' }}
                                />
                            )}
                            {profile?.payment_link_paypal && (
                                <Button
                                    title={t('paypalLink', language)}
                                    onPress={() => profile.payment_link_paypal && Linking.openURL(profile.payment_link_paypal)}
                                    icon={CreditCard}
                                    style={{ flex: 1, backgroundColor: '#0070ba', borderColor: '#0070ba' }}
                                    textStyle={{ color: '#fff' }}
                                />
                            )}
                        </View>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <Modal visible={showPreview} animationType="slide">
                <View style={{ flex: 1, backgroundColor: bgColor }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 }}>
                        <TouchableOpacity onPress={() => setShowPreview(false)}>
                            <X color={textColor} size={24} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 18, fontWeight: '600', color: textColor }}>{t('invoicePreview', language)}</Text>
                        <TouchableOpacity onPress={handlePrint}>
                            <Printer color={primaryColor} size={24} />
                        </TouchableOpacity>
                    </View>
                    <WebView
                        source={{ html: htmlContent }}
                        style={{ flex: 1 }}
                        originWhitelist={['*']}
                    />
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },

    title: { fontSize: 22, fontWeight: '800' },
    subtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },

    smallActionBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },

    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },

    mainCard: { padding: 20, borderRadius: 20, marginBottom: 24 },
    mainCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    amountLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
    totalAmount: { fontSize: 32, fontWeight: '800' },

    divider: { height: 1, marginVertical: 16 },
    datesRow: { flexDirection: 'row', justifyContent: 'space-between' },
    dateLabel: { fontSize: 12, marginBottom: 4 },
    dateValue: { fontSize: 15, fontWeight: '600' },

    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 8 },

    statusScroll: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    statusChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    statusChipText: { fontSize: 13, fontWeight: '600' },

    itemsCard: { padding: 0, borderRadius: 20, marginBottom: 24, overflow: 'hidden' },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
    itemMeta: { fontSize: 13 },
    itemTotal: { fontSize: 15, fontWeight: '700' },

    summarySection: { padding: 16, backgroundColor: 'rgba(0,0,0,0.02)', borderTopWidth: 1 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { fontSize: 14 },
    summaryValue: { fontSize: 14, fontWeight: '600' },
    totalLabel: { fontSize: 16, fontWeight: 'bold' },
    totalValue: { fontSize: 18, fontWeight: '800' },

    actionsContainer: { gap: 0 },
    actionGrid: { flexDirection: 'row', gap: 12 },

    // Compact mobile-first detail presentation. The legacy styles below remain
    // available to the compatibility branch while the first return is used by
    // the new root navigation.
    mobileHeaderAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    mobileContent: { paddingHorizontal: 16, paddingBottom: 24 },
    mobileHero: { borderRadius: 22, padding: 18, marginBottom: 16 },
    mobileHeroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    mobileHeroLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600', marginBottom: 4 },
    mobileHeroAmount: { color: '#fff', fontSize: 30, fontWeight: '800' },
    mobileHeroDates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
    mobileHeroMetaLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 11, marginBottom: 3 },
    mobileHeroMeta: { color: '#fff', fontSize: 13, fontWeight: '600' },
    mobilePrimaryActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
    mobilePrimaryAction: { minHeight: 56, minWidth: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 },
    mobilePrimaryActionText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    mobileSecondaryAction: { minHeight: 56, minWidth: 56, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 },
    mobileSecondaryActionText: { fontSize: 12, fontWeight: '700' },
    mobileDocumentActions: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    mobileDocumentAction: { minHeight: 48, borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    mobileDocumentActionText: { fontSize: 13, fontWeight: '700' },
    mobileSectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 10 },
    mobileCard: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 8 },
    mobileItemRow: { minHeight: 62, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    mobileItemCopy: { flex: 1, minWidth: 0 },
    mobileItemName: { fontSize: 14, fontWeight: '700' },
    mobileItemMeta: { fontSize: 12, lineHeight: 18 },
    mobileItemTotal: { fontSize: 14, fontWeight: '800' },
    mobileTotals: { borderTopWidth: 1, marginTop: 8, paddingTop: 12 },
    mobileTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
    mobileTotalLabel: { fontSize: 13 },
    mobileTotalValue: { fontSize: 13, fontWeight: '600' },
    mobileTotalStrong: { fontSize: 16, fontWeight: '800' },
    mobilePaymentRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
    mobilePaymentIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECFDF3' },
    mobileOutstanding: { borderTopWidth: 1, marginTop: 10, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    mobileNotes: { fontSize: 14, lineHeight: 21 },
    mobileActivityRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
    mobileActivityDot: { width: 9, height: 9, borderRadius: 5 },
    mobileModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
    mobileModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 30, maxHeight: '84%' },
    mobileSheetHandle: { width: 38, height: 4, borderRadius: 4, alignSelf: 'center', backgroundColor: '#CBD5E1', marginBottom: 16 },
    mobileSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12 },
    mobileSheetTitle: { fontSize: 17, fontWeight: '800' },
    mobileMoreRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E9F0' },
    mobileMoreText: { fontSize: 14, fontWeight: '700' },
    mobileMoreLabel: { fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    mobileStatusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
    mobileStatusOption: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    mobileStatusOptionText: { fontSize: 12, fontWeight: '700' },
    mobilePreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
});
