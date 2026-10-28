import React, { useEffect, useRef, useState } from 'react';
import * as MailComposer from 'expo-mail-composer';
import {
    View,
    Text,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    Alert,
    StyleSheet,
    Switch,
    ActivityIndicator,
} from 'react-native';
import { ArrowLeft, DollarSign, User, FileText, Building, Banknote, Trash2, ChevronDown } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { isCashPaymentAllowed } from '@invoice-monorepo/api/domain';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { Client, Invoice, CompanyBankAccount } from '@invoice-monorepo/types';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { generateTransactionPdf, generateTransactionPdfHtml, printTransactionPdf, shareTransactionPdf } from '../../services/pdf/transactionPdf';
import { getWorkspaceScope } from '../../services/workspace';
import { getDataStore } from '../../services/dataStore';
import { notifyBusinessEvent } from '../../services/pushNotifications';
import { TransactionDocumentActions, TransactionPreviewModal } from '../../components/mobile/TransactionDocumentActions';
import { SearchField } from '../../components/mobile/MobileUI';
import { documentPdfFileName } from '../../services/pdf/fileNaming';
import { buildCustomerLedger } from '@invoice-monorepo/report-templates';
import {
    getPayment,
    getInvoice,
    listCustomers,
    listCustomerInvoices,
    listCustomerPayments,
    listOpenCustomerInvoices,
    listCompanyBankAccounts,
    listFinancialAccountBalances,
    saveCustomerPayment,
    deleteCustomerPayment,
} from '@invoice-monorepo/api/repositories';
import * as Crypto from 'expo-crypto';

async function generatePaymentIdempotencyKey(): Promise<string> {
    const nativeUuid = Crypto.randomUUID?.();
    if (nativeUuid) return nativeUuid;

    // Some Expo runtimes expose secure random bytes but not randomUUID.
    // Build an RFC 4122 v4 UUID from those bytes instead of falling back to
    // Math.random for a key that protects against duplicate payments.
    const bytes = await Crypto.getRandomBytesAsync(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cashLimitReached(value: string | number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return false;
    return !isCashPaymentAllowed(normalized);
}

export function PaymentFormScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const paymentId = route.params?.paymentId;
    const preselectedInvoiceId = route.params?.invoiceId;
    const preselectedClientId = route.params?.clientId;
    const isEditing = !!paymentId;

    const [clients, setClients] = useState<Client[]>([]);
    const [unpaidInvoices, setUnpaidInvoices] = useState<Invoice[]>([]);
    const [clientDebt, setClientDebt] = useState<number | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [showClientPicker, setShowClientPicker] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [clientPickerLoading, setClientPickerLoading] = useState(false);
    const [showInvoicePicker, setShowInvoicePicker] = useState(false);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [financialAccounts, setFinancialAccounts] = useState<Record<string, unknown>[]>([]);
    const [showBankPicker, setShowBankPicker] = useState(false);

    const [formData, setFormData] = useState({
        payment_number: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash' as 'cash' | 'bank' | 'card' | 'online_payment' | 'cheque' | 'other',
        company_bank_account_id: '',
        fund_account_id: '',
        bank_reference: '',
        notes: '',
    });
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const saveInFlight = useRef(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [showPaymentSignature, setShowPaymentSignature] = useState(true);
    const [showPaymentStamp, setShowPaymentStamp] = useState(true);

    const bgColor = isDark ? '#0A0A0B' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const cardBg = isDark ? '#151517' : '#ffffff';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const borderColor = isDark ? '#262629' : '#E4E9F0';

    useEffect(() => {
        fetchClients();
        fetchBankAccounts();
        fetchFinancialAccounts();
        if (isEditing) fetchPayment();

        const focusSubscription = navigation.addListener?.('focus', fetchClients);
        return () => {
            if (typeof focusSubscription === 'function') {
                focusSubscription();
            } else {
                focusSubscription?.remove?.();
            }
        };
    }, [paymentId]);

    useEffect(() => {
        if (selectedClient) {
            setUnpaidInvoices([]);
            setClientDebt(null);
            void fetchUnpaidInvoices(selectedClient.id);
        } else {
            setUnpaidInvoices([]);
            setClientDebt(null);
        }
    }, [selectedClient]);

    useEffect(() => {
        if (preselectedInvoiceId) {
            fetchInvoiceAndClient(preselectedInvoiceId);
        }
    }, [preselectedInvoiceId]);

    const fetchClients = async () => {
        if (!user) return;
        const store = await getDataStore(user.id);
        const data = store.mode === 'local'
            ? await store.list('clients', { orderBy: 'name' })
            : await listCustomers(supabase, { userId: user.id, companyIds: (await getWorkspaceScope(user.id)).companyIds });
        if (data) {
            setClients(data as unknown as Client[]);
            if (preselectedClientId) {
                const initialClient = data.find((client) => client.id === preselectedClientId);
                if (initialClient) setSelectedClient(initialClient as unknown as Client);
            }
        }
    };

    const selectClient = (client: Client) => {
        setSelectedClient(client);
        setSelectedInvoice(null);
        setClientSearch('');
        setShowClientPicker(false);
    };

    const selectCitizen = async () => {
        if (clientPickerLoading) return;

        const existingCitizen = clients.find((client) => client.pos_walk_in_customer);
        if (existingCitizen) {
            selectClient(existingCitizen);
            return;
        }

        if (!user) return;
        setClientPickerLoading(true);
        try {
            const store = await getDataStore(user.id);
            let data: unknown;
            if (store.mode === 'local') {
                data = await store.save('clients', { name: t('walkInCustomer', language), pos_walk_in_customer: true });
            } else {
                const { companyId } = await getWorkspaceScope(user.id);
                if (!companyId) throw new Error(t('selectCompany', language));
                const result = await supabase.rpc('ensure_walk_in_customer', { p_company_id: companyId });
                if (result.error) throw result.error;
                data = result.data;
            }
            if (!data) throw new Error(t('walkInCustomerUnavailable', language));

            const citizen = data as unknown as Client;
            setClients((current) => current.some((client) => client.id === citizen.id) ? current : [...current, citizen]);
            selectClient(citizen);
        } catch (error) {
            Alert.alert(
                t('error', language),
                error instanceof Error ? error.message : t('walkInCustomerUnavailable', language),
            );
        } finally {
            setClientPickerLoading(false);
        }
    };

    const fetchBankAccounts = async () => {
        if (!user) return;
        try {
            if ((await getDataStore(user.id)).mode === 'local') return; // No bank-account records on the device.
            const { companyId } = await getWorkspaceScope(user.id);
            const data = await listCompanyBankAccounts(supabase, companyId);
            setBankAccounts(data as unknown as CompanyBankAccount[]);
            if (!isEditing && data.length) {
                const primary = data.find((account: any) => account.is_primary) || data[0];
                setFormData(prev => ({
                    ...prev,
                    company_bank_account_id: prev.company_bank_account_id || String(primary.id),
                }));
            }
        } catch (error) {
            console.warn('Payment bank account load error:', error);
        }
    };

    const fetchFinancialAccounts = async () => {
        if (!user || typeof listFinancialAccountBalances !== 'function') return;
        try {
            if ((await getDataStore(user.id)).mode === 'local') return; // Cash and bank funds are a cloud feature for now.
            const scope = await getWorkspaceScope(user.id);
            const data = await listFinancialAccountBalances(supabase, { userId: user.id, companyIds: scope.companyIds });
            setFinancialAccounts(data as Record<string, unknown>[]);
            if (!isEditing && data.length) {
                const cash = data.find((account: any) => account.account_type === 'cash' || account.fund_type === 'cash') || data[0];
                setFormData(prev => ({ ...prev, fund_account_id: prev.fund_account_id || String(cash.id) }));
            }
        } catch (error) {
            console.warn('Financial account load error:', error);
        }
    };

    const fetchUnpaidInvoices = async (clientId: string) => {
        if (!user) return;
        const store = await getDataStore(user.id);
        let openData: unknown[]; let invoiceData: unknown[]; let paymentData: unknown[];
        if (store.mode === 'local') {
            const clientInvoices = await store.listInvoices({ clientId });
            invoiceData = clientInvoices;
            openData = clientInvoices.filter((invoice) => ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE'].includes(String(invoice.commercial_document_type)) && !['draft', 'paid', 'cancelled', 'credited', 'reversed'].includes(String(invoice.status)));
            paymentData = await store.listPayments({ customerId: clientId });
        } else {
            const { companyIds } = await getWorkspaceScope(user.id);
            const scope = { userId: user.id, companyIds };
            [openData, invoiceData, paymentData] = await Promise.all([
                listOpenCustomerInvoices(supabase, scope, clientId),
                listCustomerInvoices(supabase, scope, clientId),
                listCustomerPayments(supabase, scope, clientId),
            ]);
        }
        if (openData) {
            const invoices = openData as unknown as Invoice[];
            setUnpaidInvoices(invoices);
            const ledger = buildCustomerLedger({
                invoices: invoiceData as any,
                payments: paymentData as any,
                from: '1900-01-01',
                to: '9999-12-31',
            });
            setClientDebt(ledger.closingBalance);
        } else {
            setClientDebt(0);
        }
    };

    const fetchInvoiceAndClient = async (invoiceId: string) => {
        if (!user) return;
        const store = await getDataStore(user.id);
        const invoice = store.mode === 'local'
            ? await store.getInvoice(invoiceId)
            : await getInvoice(supabase, invoiceId, { userId: user.id, companyIds: (await getWorkspaceScope(user.id)).companyIds });
        if (invoice) {
            const invoiceRecord = invoice as unknown as Invoice & { client?: Client | null };
            setSelectedInvoice(invoiceRecord);
            if (invoiceRecord.client) {
                setSelectedClient(invoiceRecord.client);
            }
            setFormData(prev => ({ ...prev, amount: String(invoiceRecord.total_amount || 0) }));
        }
    };

    const fetchPayment = async () => {
        if (!user || !paymentId) return;
        const store = await getDataStore(user.id);
        const data: any = store.mode === 'local'
            ? (await store.listPayments()).find((payment) => payment.id === paymentId)
            : await getPayment(supabase, paymentId, { userId: user.id, companyIds: (await getWorkspaceScope(user.id)).companyIds });
        if (data) {
            setSelectedClient(data.client as unknown as Client);
            setSelectedInvoice(data.invoice as unknown as Invoice);
            setFormData({
                payment_number: String(data.payment_number || ''),
                amount: String(data.amount || 0),
                payment_date: String(data.payment_date || ''),
                // Older records may contain card; customer payments now settle
                // only through cash or bank, so keep the edit flow valid.
                payment_method: data.payment_method === 'cash' ? 'cash' : (data.payment_method === 'card' || data.payment_method === 'online_payment' || data.payment_method === 'cheque' || data.payment_method === 'other' ? data.payment_method : 'bank'),
                company_bank_account_id: String(data.company_bank_account_id || ''),
                fund_account_id: String(data.fund_account_id || ''),
                bank_reference: String(data.bank_reference || ''),
                notes: String(data.notes || ''),
            });
        }
    };

    const buildPaymentPdfInput = async () => {
        if (!user) throw new Error(t('signInSavePayment', language));
        const { profile, company } = await getWorkspaceScope(user.id);
        const tenant = company as any;
        const selectedBankAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
        const tenantName = tenant?.company_name || tenant?.name || profile.company_name || t('yourBusiness', language);
        const clientName = selectedClient?.name || t('client', language);
        return {
            title: t('incomePayment', language),
            fileName: documentPdfFileName(tenantName, formData.payment_number || t('incomePayment', language), clientName),
            number: formData.payment_number,
            amount: Number(formData.amount),
            date: formData.payment_date,
            method: formData.payment_method,
            counterparty: selectedClient?.name,
            counterpartyEmail: selectedClient?.email,
            counterpartyPhone: selectedClient?.phone,
            counterpartyAddress: [selectedClient?.address, selectedClient?.city, selectedClient?.country].filter(Boolean).join(', '),
            counterpartyType: 'customer' as const,
            clientSignatureUrl: (selectedClient as any)?.signature_url,
            showClientSignature: true,
            relatedDocumentNumber: selectedInvoice?.invoice_number,
            relatedDocumentLabel: t('invoice', language),
            reference: formData.bank_reference,
            notes: formData.notes,
            language: language === 'sq' ? 'sq' as const : 'en' as const,
            company: {
                name: tenant?.company_name || tenant?.name || profile.company_name,
                email: tenant?.email || profile.email,
                phone: tenant?.phone || profile.phone,
                address: tenant?.address || tenant?.registered_address || profile.address,
                city: tenant?.city || tenant?.municipality || profile.city,
                country: tenant?.country || profile.country,
                website: tenant?.website || profile.website,
                taxId: tenant?.tax_id || tenant?.unique_business_number || profile.tax_id,
                bankName: selectedBankAccount?.bank_name || tenant?.bank_name || profile.bank_name,
                iban: selectedBankAccount?.iban || selectedBankAccount?.account_number || tenant?.bank_iban || profile.bank_iban,
                logoUrl: tenant?.logo_url,
                primaryColor: tenant?.primary_color || profile.primary_color,
                signatureUrl: tenant?.signature_url || profile.signature_url,
                stampUrl: tenant?.stamp_url || profile.stamp_url,
                showSignature: showPaymentSignature,
                showStamp: showPaymentStamp,
            },
        };
    };

    const handlePreview = async () => {
        try {
            const data = await buildPaymentPdfInput();
            setPreviewHtml(generateTransactionPdfHtml(data));
            setShowPreview(true);
        } catch {
            Alert.alert(t('error', language), t('failedToGeneratePdf', language));
        }
    };

    const handlePrint = async () => {
        try {
            const result = await printTransactionPdf(await buildPaymentPdfInput());
            if (!result.success && !result.canceled) Alert.alert(t('error', language), t('failedToPrint', language));
        } catch {
            Alert.alert(t('error', language), t('failedToPrint', language));
        }
    };

    const handleShare = async () => {
        try {
            await shareTransactionPdf(await buildPaymentPdfInput());
        } catch {
            Alert.alert(t('error', language), t('failedToSharePdf', language));
        }
    };

    const handleEmail = async () => {
        try {
            if (!(await MailComposer.isAvailableAsync())) {
                Alert.alert(t('error', language), t('emailUnavailableOnDevice', language));
                return;
            }
            const data = await buildPaymentPdfInput();
            const uri = await generateTransactionPdf(data);
            const result = await MailComposer.composeAsync({
                recipients: selectedClient?.email ? [selectedClient.email] : [],
                subject: `${t('paymentReceipt', language)} ${data.number || ''}`.trim(),
                body: `${t('incomePayment', language)}\n\n${data.company?.name || t('yourBusiness', language)}`,
                attachments: [uri],
                isHtml: false,
            });
            if (result.status === 'sent') Alert.alert(t('success', language), t('emailMarkedSent', language));
        } catch {
            Alert.alert(t('error', language), t('failedToComposeEmail', language));
        }
    };

    const handleDelete = () => {
        if (!paymentId) return;
        Alert.alert(
            t('delete', language),
            t('deletePaymentConfirmation', language).replace('{number}', formData.payment_number),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (!user) throw new Error('Your session has expired.');
                            setDeleting(true);
                            const store = await getDataStore(user.id);
                            if (store.mode === 'local') await store.reverseCustomerPayment(paymentId, 'Payment deleted by user');
                            else {
                                const { companyIds } = await getWorkspaceScope(user.id);
                                await deleteCustomerPayment(supabase, paymentId, { userId: user.id, companyIds });
                            }
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert(
                                t('error', language),
                                error instanceof Error ? error.message : t('failedToDeletePayment', language),
                            );
                        } finally {
                            setDeleting(false);
                        }
                    },
                },
            ],
        );
    };


    const handleSave = async () => {
        if (saveInFlight.current) return;
        if (!formData.amount || Number(formData.amount) <= 0) {
            Alert.alert(t('error', language), t('validPaymentAmount', language));
            return;
        }
        if (formData.payment_method === 'cash' && cashLimitReached(formData.amount)) {
            Alert.alert(t('cashLimitTitle', language), t('cashLimitError', language));
            return;
        }
        if (!selectedClient) {
            Alert.alert(t('error', language), t('selectCustomerRequired', language));
            return;
        }
        const isLocalStorage = (user ? (await getDataStore(user.id)).mode : 'cloud') === 'local';
        if (formData.payment_method === 'bank' && !formData.company_bank_account_id && !isLocalStorage) {
            Alert.alert(t('error', language), t('selectBankAccountForPaymentRequired', language));
            return;
        }

        saveInFlight.current = true;
        setLoading(true);
        let notificationCompanyId: string | null = null;
        try {
            if (!user) throw new Error(t('signInSavePayment', language));
            const { companyId, profile, company } = await getWorkspaceScope(user.id);
            if (!companyId) throw new Error(t('selectCompany', language));
            if (!isLocalStorage) notificationCompanyId = companyId;
            // The payment RPC requires an idempotency key for both new payments
            // and edits. The repository fallback relies on globalThis.crypto,
            // which is not available in every native Expo runtime.
            const paymentIdempotencyKey = await generatePaymentIdempotencyKey();
            let saved: Awaited<ReturnType<typeof saveCustomerPayment>>;
            if (isLocalStorage) {
                // On the device a payment is always recorded against one invoice; an edit reverses the old entry and records the corrected one.
                if (!selectedInvoice?.id) throw new Error('Choose the invoice this payment is for.');
                const store = await getDataStore(user.id);
                if (isEditing) await store.reverseCustomerPayment(String(paymentId), 'Payment edited by user');
                const payment = await store.recordCustomerPayment({
                    invoiceId: selectedInvoice.id,
                    amount: Number(formData.amount),
                    paymentDate: formData.payment_date,
                    paymentMethod: formData.payment_method as 'cash' | 'bank',
                    bankReference: formData.bank_reference || undefined,
                    notes: formData.notes || undefined,
                    paymentNumber: formData.payment_number || undefined,
                });
                saved = { payment } as unknown as Awaited<ReturnType<typeof saveCustomerPayment>>;
            } else saved = await saveCustomerPayment(supabase, {
                userId: user.id,
                companyId,
                customerId: selectedClient.id,
                invoiceId: selectedInvoice?.id || null,
                paymentNumber: formData.payment_number || null,
                amount: formData.amount,
                paymentDate: formData.payment_date,
                paymentMethod: formData.payment_method,
                companyBankAccountId: formData.payment_method === 'bank' ? formData.company_bank_account_id : null,
                fundAccountId: formData.fund_account_id || null,
                bankReference: formData.bank_reference || null,
                notes: formData.notes || null,
                currency: 'EUR',
                existingPaymentId: isEditing ? paymentId : null,
                idempotencyKey: paymentIdempotencyKey,
            });
            if (saved.allocationError) {
                Alert.alert(t('paymentSaved', language), saved.allocationError.message);
            }
            if (!isEditing) {
                if (!isLocalStorage) void notifyBusinessEvent('payment_received', companyId, String(saved.payment.id), {
                    invoiceId: selectedInvoice?.id || null,
                }).catch((notificationError) => console.warn('Payment notification could not be sent:', notificationError));
                const selectedBankAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
                if (!isLocalStorage && formData.payment_method === 'bank' && selectedBankAccount?.is_shared) {
                    void notifyBusinessEvent('shared_bank_activity', companyId, String(saved.payment.id), {
                        entityType: 'payment',
                        amount: Number(formData.amount),
                        currency: 'EUR',
                    }).catch((notificationError) => console.warn('Shared bank notification could not be sent:', notificationError));
                }
                const invoiceOutstanding = selectedInvoice
                    ? Number(selectedInvoice.total_amount || 0) - Number((selectedInvoice as any).amount_received || 0)
                    : 0;
                if (!isLocalStorage && selectedInvoice?.id && Number(formData.amount) >= Math.max(invoiceOutstanding, 0)) {
                    void notifyBusinessEvent('invoice_paid', companyId, String(selectedInvoice.id)).catch((notificationError) => console.warn('Paid invoice notification could not be sent:', notificationError));
                }
                try {
                    const tenant = company as any;
                    await shareTransactionPdf({
                        title: t('incomePayment', language),
                        fileName: documentPdfFileName(tenant?.company_name || tenant?.name || profile.company_name || t('yourBusiness', language), String(saved.payment.payment_number || formData.payment_number || t('incomePayment', language)), selectedClient.name || t('client', language)),
                        number: String(saved.payment.payment_number || formData.payment_number),
                        amount: Number(formData.amount),
                        date: formData.payment_date,
                        method: formData.payment_method,
                        counterparty: selectedClient.name,
                        counterpartyEmail: selectedClient.email,
                        counterpartyPhone: selectedClient.phone,
                        counterpartyAddress: [selectedClient.address, selectedClient.city, selectedClient.country].filter(Boolean).join(', '),
                        counterpartyType: 'customer',
                        clientSignatureUrl: (selectedClient as any)?.signature_url,
                        showClientSignature: true,
                        relatedDocumentNumber: selectedInvoice?.invoice_number,
                        relatedDocumentLabel: t('invoice', language),
                        reference: formData.bank_reference,
                        notes: formData.notes,
                        language: language === 'sq' ? 'sq' : 'en',
                        company: {
                            name: tenant?.company_name || tenant?.name || profile.company_name,
                            email: tenant?.email || profile.email,
                            phone: tenant?.phone || profile.phone,
                            address: tenant?.address || tenant?.registered_address || profile.address,
                            city: tenant?.city || tenant?.municipality || profile.city,
                            country: tenant?.country || profile.country,
                            website: tenant?.website || profile.website,
                            taxId: tenant?.tax_id || tenant?.unique_business_number || profile.tax_id,
                            bankName: selectedBankAccount?.bank_name || tenant?.bank_name || profile.bank_name,
                            iban: selectedBankAccount?.iban || selectedBankAccount?.account_number || tenant?.bank_iban || profile.bank_iban,
                            logoUrl: tenant?.logo_url,
                            primaryColor: tenant?.primary_color || profile.primary_color,
                            signatureUrl: tenant?.signature_url || profile.signature_url,
                            stampUrl: tenant?.stamp_url || profile.stamp_url,
                            showSignature: showPaymentSignature,
                            showStamp: showPaymentStamp,
                        },
                    });
                } catch (pdfError) {
                    console.error('Payment saved, PDF generation failed:', pdfError);
                    Alert.alert(t('paymentSaved', language), t('paymentSavedPdfError', language));
                }
            }

            navigation.goBack();
        } catch (error) {
            console.error('Payment save error:', error);
            if (notificationCompanyId) {
                void notifyBusinessEvent('payment_failed', notificationCompanyId, null, {
                    message: error instanceof Error ? error.message : t('paymentSaveFailed', language),
                }).catch((notificationError) => console.warn('Payment failure notification could not be sent:', notificationError));
            }
            Alert.alert(t('error', language), t('paymentSaveFailed', language));
        } finally {
            saveInFlight.current = false;
            setLoading(false);
        }
    };

    const paymentMethods = [
        { key: 'cash', label: t('cash', language), icon: Banknote, color: '#12B76A' },
        { key: 'bank', label: t('bank', language), icon: Building, color: '#3388FF' },
        { key: 'card', label: t('card', language), icon: Banknote, color: '#7F56D9' },
        { key: 'online_payment', label: t('onlinePayment', language), icon: DollarSign, color: '#F79009' },
        { key: 'cheque', label: t('cheque', language), icon: FileText, color: '#667085' },
        { key: 'other', label: t('other', language), icon: FileText, color: '#98A2B3' },
    ];
    const filteredClients = clients.filter((client) => {
        if (client.pos_walk_in_customer) return false;
        return client.name.toLocaleLowerCase().includes(clientSearch.trim().toLocaleLowerCase());
    });

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            testID="payment-form-screen"
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity testID="payment-form-back-button" accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {isEditing ? t('updateIncomePayment', language) : t('newIncomePayment', language)}
                </Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                {isEditing ? <TransactionDocumentActions primaryColor={primaryColor} language={language === 'sq' ? 'sq' : 'en'} onPreview={() => { void handlePreview(); }} onPrint={() => { void handlePrint(); }} onEmail={() => { void handleEmail(); }} onShare={() => { void handleShare(); }} /> : null}
                {/* Payment Number */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <FileText color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('paymentDetails', language)}</Text>
                    </View>

                    <Input
                        label={t('paymentNumber', language)}
                        value={formData.payment_number}
                        onChangeText={(text) => setFormData({ ...formData, payment_number: text })}
                        placeholder="PAY-0001"
                    />

                    <Input
                        label={t('paymentDate', language)}
                        value={formData.payment_date}
                        onChangeText={(text) => setFormData({ ...formData, payment_date: text })}
                        placeholder="YYYY-MM-DD"
                    />
                </Card>

                {/* Client Selection */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <User color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('client', language)}</Text>
                    </View>

                    <TouchableOpacity
                        testID="payment-customer-selector"
                        accessibilityRole="button"
                        style={[styles.pickerButton, { backgroundColor: cardBg, borderColor }]}
                        onPress={() => setShowClientPicker(!showClientPicker)}
                    >
                        <Text style={[styles.pickerButtonText, { color: selectedClient ? textColor : mutedColor }]}>
                            {selectedClient ? selectedClient.name : t('selectClient', language)}
                        </Text>
                    </TouchableOpacity>

                    {selectedClient && (
                        <View testID="payment-client-current-balance" style={[styles.clientBalance, { backgroundColor: isDark ? '#17352B' : '#F0FDF4', borderColor: isDark ? '#245B43' : '#BBE7CC' }]}>
                            <Text style={[styles.clientBalanceLabel, { color: mutedColor }]}>{t('currentBalance', language)} ({t('debt', language)})</Text>
                            <Text style={[styles.clientBalanceValue, { color: clientDebt && clientDebt > 0 ? '#EF4444' : '#12B76A' }]}>
                                {clientDebt === null ? '…' : formatCurrency(clientDebt, 'EUR', language)}
                            </Text>
                        </View>
                    )}

                    {showClientPicker && (
                        <View style={[styles.pickerList, { backgroundColor: cardBg, borderColor }]}>
                            <View style={styles.clientSearchContainer}>
                                <SearchField
                                    testID="payment-client-search-input"
                                    value={clientSearch}
                                    onChangeText={setClientSearch}
                                    placeholder={t('searchCustomers', language)}
                                    autoFocus
                                />
                            </View>
                            <TouchableOpacity
                                testID="payment-create-client-option"
                                accessibilityRole="button"
                                style={[styles.pickerItem, { borderBottomColor: borderColor }]}
                                onPress={() => {
                                    setClientSearch('');
                                    setShowClientPicker(false);
                                    navigation.navigate('ClientForm');
                                }}
                            >
                                <Text style={[styles.pickerItemText, { color: primaryColor }]}>{t('createNewCustomer', language)}</Text>
                                <Text style={[styles.pickerItemSubtext, { color: mutedColor }]}>{t('addCustomer', language)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                testID="payment-citizen-option"
                                accessibilityRole="button"
                                accessibilityState={{ disabled: clientPickerLoading, selected: selectedClient?.pos_walk_in_customer === true }}
                                disabled={clientPickerLoading}
                                style={[styles.pickerItem, selectedClient?.pos_walk_in_customer === true && styles.pickerItemActive, { borderBottomColor: borderColor }]}
                                onPress={() => { void selectCitizen(); }}
                            >
                                {clientPickerLoading ? <ActivityIndicator color={primaryColor} /> : <Text style={[styles.pickerItemText, { color: textColor }]}>{t('walkInCustomer', language)}</Text>}
                                <Text style={[styles.pickerItemSubtext, { color: mutedColor }]}>{t('customerOptional', language)}</Text>
                            </TouchableOpacity>
                            {filteredClients.length ? filteredClients.map(client => (
                                <TouchableOpacity
                                    testID={`payment-customer-option-${client.id}`}
                                    key={client.id}
                                    style={[styles.pickerItem, selectedClient?.id === client.id && styles.pickerItemActive]}
                                    onPress={() => selectClient(client)}
                                >
                                    <Text style={[styles.pickerItemText, { color: textColor }]}>{client.name}</Text>
                                </TouchableOpacity>
                            )) : <Text style={[styles.noItems, { color: mutedColor }]}>{t('noCustomersFound', language)}</Text>}
                        </View>
                    )}
                </Card>

                {/* Invoice Selection */}
                {selectedClient && (
                    <Card style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <FileText color="#f59e0b" size={20} />
                            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('invoice', language)} ({t('optional', language)})</Text>
                        </View>

                        <TouchableOpacity
                            testID="payment-invoice-selector"
                            accessibilityRole="button"
                            style={[styles.pickerButton, { backgroundColor: cardBg, borderColor }]}
                            onPress={() => setShowInvoicePicker(!showInvoicePicker)}
                        >
                            <Text style={[styles.pickerButtonText, { color: selectedInvoice ? textColor : mutedColor }]}>
                                {selectedInvoice ? `${selectedInvoice.invoice_number} - €${selectedInvoice.total_amount}` : `${t('selectInvoice', language)} (${t('optional', language)})`}
                            </Text>
                        </TouchableOpacity>

                        {showInvoicePicker && (
                            <View style={[styles.pickerList, { backgroundColor: cardBg, borderColor }]}>
                                {unpaidInvoices.length === 0 ? (
                                    <Text style={[styles.noItems, { color: mutedColor }]}>{t('noUnpaidInvoices', language)}</Text>
                                ) : (
                                    unpaidInvoices.map(invoice => (
                                        <TouchableOpacity
                                            testID={`payment-invoice-option-${invoice.id}`}
                                            key={invoice.id}
                                            style={[styles.pickerItem, selectedInvoice?.id === invoice.id && styles.pickerItemActive]}
                                            onPress={() => {
                                                setSelectedInvoice(invoice);
                                                setFormData({ ...formData, amount: String(invoice.total_amount) });
                                                setShowInvoicePicker(false);
                                            }}
                                        >
                                            <Text style={[styles.pickerItemText, { color: textColor }]}>
                                                {invoice.invoice_number}
                                            </Text>
                                            <Text style={[styles.pickerItemSubtext, { color: mutedColor }]}>
                                                €{invoice.total_amount} • {invoice.status}
                                            </Text>
                                        </TouchableOpacity>
                                    ))
                                )}
                            </View>
                        )}
                    </Card>
                )}

                {/* Amount & Method */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <DollarSign color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('amountAndMethod', language)}</Text>
                    </View>

                    <Input
                        testID="payment-amount-input"
                        label={`${t('paymentAmount', language)} *`}
                        value={formData.amount}
                        onChangeText={(text) => setFormData({ ...formData, amount: text })}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                    />

                    <Text style={[styles.label, { color: textColor }]}>{t('paymentMethod', language)}</Text>
                    <View style={styles.methodGrid}>
                        {paymentMethods.map(method => {
                            const Icon = method.icon;
                            const isActive = formData.payment_method === method.key;
                            const cashDisabled = method.key === 'cash' && cashLimitReached(formData.amount);
                            return (
                                <TouchableOpacity
                                    testID={`payment-method-${method.key}`}
                                    accessibilityRole="button"
                                    key={method.key}
                                    style={[
                                        styles.methodOption,
                                        {
                                            backgroundColor: isActive ? method.color : (isDark ? '#1F1F23' : '#F4F7FB'),
                                            borderColor: isActive ? method.color : (isDark ? '#333338' : '#D7E0EC'),
                                            opacity: cashDisabled ? 0.4 : 1,
                                        },
                                    ]}
                                    accessibilityState={{ selected: isActive, disabled: cashDisabled }}
                                    disabled={cashDisabled}
                                    onPress={() => {
                                        const primaryBank = bankAccounts.find((account) => account.is_primary) || bankAccounts[0];
                                        const paymentMethod = method.key as 'cash' | 'bank' | 'card' | 'online_payment' | 'cheque' | 'other';
                                        const selectedFund = financialAccounts.find((account: any) =>
                                            paymentMethod === 'cash'
                                                ? (account.account_type === 'cash' || account.fund_type === 'cash')
                                                : paymentMethod === 'bank'
                                                    ? String(account.company_bank_account_id || '') === String(formData.company_bank_account_id || primaryBank?.id || '')
                                                    : String(account.account_type || account.fund_type || '') === paymentMethod
                                        );
                                        setFormData(prev => ({
                                            ...prev,
                                            payment_method: paymentMethod,
                                            company_bank_account_id: paymentMethod === 'bank'
                                                ? prev.company_bank_account_id || primaryBank?.id || ''
                                                : '',
                                            fund_account_id: selectedFund?.id
                                                ? String(selectedFund.id)
                                                : paymentMethod === 'cash' ? prev.fund_account_id : '',
                                        }));
                                        setShowBankPicker(paymentMethod === 'bank');
                                    }}
                                >
                                    <Icon color={isActive ? '#fff' : mutedColor} size={18} />
                                    <Text
                                        numberOfLines={2}
                                        style={[styles.methodText, { color: isActive ? '#fff' : mutedColor }]}
                                    >
                                        {method.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {formData.payment_method === 'bank' && (
                        <>
                            <Text style={[styles.label, { color: textColor }]}>{t('paidFrom', language)}</Text>
                            <TouchableOpacity
                                testID="payment-bank-account-selector"
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showBankPicker }}
                                style={[styles.pickerButton, { backgroundColor: cardBg, borderColor }]}
                                onPress={() => setShowBankPicker(current => !current)}
                            >
                                <Text style={[styles.pickerButtonText, { color: formData.company_bank_account_id ? textColor : mutedColor }]} numberOfLines={1}>
                                    {(() => {
                                        const selectedAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
                                        return selectedAccount ? `${selectedAccount.bank_name}${selectedAccount.is_shared ? ` · ${t('sharedAccount', language)}` : ''}` : t('selectBankAccount', language);
                                    })()}
                                </Text>
                                <ChevronDown color={mutedColor} size={18} />
                            </TouchableOpacity>
                            {showBankPicker ? (
                                <View style={[styles.pickerList, { backgroundColor: cardBg, borderColor }]}>
                                    {bankAccounts.length ? bankAccounts.map((account) => (
                                        <TouchableOpacity
                                            key={account.id}
                                            testID={`payment-bank-account-option-${account.id}`}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: formData.company_bank_account_id === account.id }}
                                            style={[styles.pickerItem, formData.company_bank_account_id === account.id && styles.pickerItemActive]}
                                            onPress={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    company_bank_account_id: account.id,
                                                    fund_account_id: String(financialAccounts.find((fund: any) => String(fund.company_bank_account_id || '') === String(account.id))?.id || prev.fund_account_id),
                                                }));
                                                setShowBankPicker(false);
                                            }}
                                        >
                                            <Text style={[styles.pickerItemText, { color: textColor }]}>{account.bank_name}</Text>
                                            <Text style={[styles.pickerItemSubtext, { color: mutedColor }]}>
                                                {account.is_shared ? `${t('sharedAccount', language)} · ` : ''}{account.iban || account.account_number || account.account_name || account.currency}
                                            </Text>
                                        </TouchableOpacity>
                                    )) : (
                                        <Text style={[styles.noItems, { color: mutedColor }]}>{t('noBankAccounts', language)}</Text>
                                    )}
                                </View>
                            ) : null}
                            <Text style={[styles.pickerItemSubtext, { color: mutedColor }]}>{t('bankAccountPaymentHint', language)}</Text>
                            <Input
                                label={t('bankReference', language)}
                                value={formData.bank_reference}
                                onChangeText={(text) => setFormData({ ...formData, bank_reference: text })}
                                placeholder={t('bankTransferReference', language)}
                            />
                        </>
                    )}

                    <Input
                        label={t('notes', language)}
                        value={formData.notes}
                        onChangeText={(text) => setFormData({ ...formData, notes: text })}
                        placeholder={t('additionalNotes', language)}
                        multiline
                    />

                    <View style={styles.optionRow}>
                        <View style={styles.optionCopy}>
                            <Text style={[styles.optionTitle, { color: textColor }]}>{t('showSignature', language)}</Text>
                            <Text style={[styles.optionDescription, { color: mutedColor }]}>{t('showSignature', language)}</Text>
                        </View>
                        <Switch
                            testID="payment-show-signature-switch"
                            accessibilityLabel={t('showSignature', language)}
                            value={showPaymentSignature}
                            onValueChange={setShowPaymentSignature}
                            trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                            thumbColor={showPaymentSignature ? primaryColor : '#f4f4f5'}
                        />
                    </View>
                    <View style={[styles.optionRow, { marginTop: 10 }]}>
                        <View style={styles.optionCopy}>
                            <Text style={[styles.optionTitle, { color: textColor }]}>{t('showCompanyStamp', language)}</Text>
                            <Text style={[styles.optionDescription, { color: mutedColor }]}>{t('showCompanyStamp', language)}</Text>
                        </View>
                        <Switch
                            testID="payment-show-stamp-switch"
                            accessibilityLabel={t('showCompanyStamp', language)}
                            value={showPaymentStamp}
                            onValueChange={setShowPaymentStamp}
                            trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                            thumbColor={showPaymentStamp ? primaryColor : '#f4f4f5'}
                        />
                    </View>
                </Card>

                <Button
                    testID="payment-save-button"
                    title={isEditing ? t('updateIncomePayment', language) : t('recordIncomePayment', language)}
                    onPress={handleSave}
                    loading={loading}
                    variant="primary"
                    style={styles.saveButton}
                />
                {isEditing ? (
                    <Button
                        testID="payment-delete-button"
                        title={t('delete', language)}
                        onPress={handleDelete}
                        loading={deleting}
                        disabled={loading || deleting}
                        variant="danger"
                        icon={Trash2}
                        style={styles.deleteButton}
                    />
                ) : null}
            </ScrollView>
            <TransactionPreviewModal visible={showPreview} html={previewHtml} title={t('paymentReceipt', language)} language={language === 'sq' ? 'sq' : 'en'} textColor={textColor} bgColor={bgColor} primaryColor={primaryColor} onClose={() => setShowPreview(false)} onPrint={() => { void handlePrint(); }} />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    backButton: { marginRight: 16, padding: 4 },
    title: { fontSize: 22, fontWeight: 'bold' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    card: { padding: 16, marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600' },
    label: { fontSize: 14, fontWeight: '500', marginBottom: 8, marginTop: 12 },
    pickerButton: {
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
    },
    pickerButtonText: { fontSize: 15 },
    clientBalance: {
        marginTop: 10,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    clientBalanceLabel: { fontSize: 12, fontWeight: '500' },
    clientBalanceValue: { fontSize: 16, fontWeight: '700' },
    pickerList: {
        marginTop: 8,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    pickerItem: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    pickerItemActive: {
        backgroundColor: 'rgba(0, 79, 254, 0.1)',
    },
    pickerItemText: { fontSize: 15, fontWeight: '500' },
    pickerItemSubtext: { fontSize: 12, marginTop: 2 },
    noItems: { padding: 14, textAlign: 'center' },
    clientSearchContainer: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.05)' },
    methodGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    methodOption: {
        width: '31.5%',
        minHeight: 74,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minWidth: 0,
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    methodText: { width: '100%', textAlign: 'center', fontWeight: '600', fontSize: 12, lineHeight: 16 },
    saveButton: { marginTop: 8 },
    deleteButton: { marginTop: 12 },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E9F0' },
    optionCopy: { flex: 1, paddingRight: 12 },
    optionTitle: { fontSize: 14, fontWeight: '600' },
    optionDescription: { fontSize: 11, marginTop: 3 },
});
