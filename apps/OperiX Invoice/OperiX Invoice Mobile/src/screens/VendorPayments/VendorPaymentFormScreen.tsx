import React, { useEffect, useState } from 'react';
import * as MailComposer from 'expo-mail-composer';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { ArrowLeft, Building2, CreditCard, Banknote, Calendar, FileText, Hash } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { CompanyBankAccount, Vendor } from '@invoice-monorepo/types';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { listCompanyBankAccounts } from '@invoice-monorepo/api/repositories';
import { generateTransactionPdf, generateTransactionPdfHtml, printTransactionPdf, shareTransactionPdf } from '../../services/pdf/transactionPdf';
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import { TransactionDocumentActions, TransactionPreviewModal } from '../../components/mobile/TransactionDocumentActions';
import { documentPdfFileName } from '../../services/pdf/fileNaming';
import * as Crypto from 'expo-crypto';

export function VendorPaymentFormScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const paymentId = route.params?.paymentId;
    const preselectedVendorId = route.params?.vendorId;
    const isEditing = !!paymentId;

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [unpaidBills, setUnpaidBills] = useState<any[]>([]);
    const [showVendorPicker, setShowVendorPicker] = useState(false);
    const [showBillPicker, setShowBillPicker] = useState(false);
    const [selectedBill, setSelectedBill] = useState<any | null>(null);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [showBankPicker, setShowBankPicker] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [formData, setFormData] = useState({
        vendor_id: preselectedVendorId || '',
        payment_number: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank' as 'cash' | 'bank',
        company_bank_account_id: '',
        bank_reference: '',
        description: '',
        notes: '',
    });

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    useEffect(() => {
        fetchVendors();
        fetchBankAccounts();
        if (isEditing) fetchPayment();
        else generatePaymentNumber();
    }, []);

    useEffect(() => {
        if (formData.vendor_id) {
            fetchUnpaidBills(formData.vendor_id);
        }
    }, [formData.vendor_id]);

    const fetchVendors = async () => {
        if (!user) return;
        const { companyIds } = await getWorkspaceScope(user.id);

        const { data } = await supabase
            .from('vendors')
            .select('*')
            .or(scopedResource(user.id, companyIds))
            .order('name');
        if (data) setVendors(data);
    };

    const fetchUnpaidBills = async (vendorId: string) => {
        const { data } = await supabase
            .from('supplier_bills')
            .select('*')
            .eq('vendor_id', vendorId)
            .neq('status', 'paid')
            .order('issue_date', { ascending: false });
        if (data) setUnpaidBills(data || []);
    };

    const fetchBankAccounts = async () => {
        if (!user) return;
        try {
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
            console.warn('Vendor payment bank account load error:', error);
        }
    };

    const fetchPayment = async () => {
        const { data } = await supabase.from('vendor_payments').select('*').eq('id', paymentId).single();
        if (data) {
            setFormData({
                vendor_id: data.vendor_id || '',
                payment_number: data.payment_number || '',
                amount: String(data.amount) || '',
                payment_date: data.payment_date || new Date().toISOString().split('T')[0],
                // Keep legacy card records editable without exposing card as a
                // supported supplier-payment method.
                payment_method: data.payment_method === 'cash' ? 'cash' : 'bank',
                company_bank_account_id: data.company_bank_account_id || '',
                bank_reference: data.bank_reference || '',
                description: data.description || '',
                notes: data.notes || '',
            });
        }
    };

    const generatePaymentNumber = async () => {
        if (!user) return;
        const { companyIds } = await getWorkspaceScope(user.id);

        const { count } = await supabase
            .from('vendor_payments')
            .select('*', { count: 'exact', head: true })
            .or(scopedResource(user.id, companyIds));

        const nextNumber = (count || 0) + 1;
        setFormData(prev => ({ ...prev, payment_number: `VP-${String(nextNumber).padStart(4, '0')}` }));
    };

    const buildVendorPaymentPdfInput = async () => {
        if (!user) throw new Error(t('signInSavePayment', language));
        const { profile, company } = await getWorkspaceScope(user.id);
        const tenant = company as any;
        const vendor = vendors.find((item) => item.id === formData.vendor_id);
        const tenantName = tenant?.company_name || tenant?.name || profile.company_name || t('yourBusiness', language);
        return {
            title: t('expensePayment', language),
            fileName: documentPdfFileName(tenantName, formData.payment_number || t('expensePayment', language), vendor?.name || t('vendor', language)),
            number: formData.payment_number,
            amount: Number(formData.amount),
            date: formData.payment_date,
            method: formData.payment_method,
            counterparty: vendor?.name,
            counterpartyType: 'vendor' as const,
            relatedDocumentNumber: selectedBill?.bill_number,
            relatedDocumentLabel: t('supplierBill', language),
            description: formData.description,
            notes: formData.notes,
            reference: formData.bank_reference,
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
                bankName: tenant?.bank_name || profile.bank_name,
                iban: tenant?.bank_iban || profile.bank_iban,
                logoUrl: tenant?.logo_url,
                primaryColor: tenant?.primary_color || profile.primary_color,
                signatureUrl: tenant?.signature_url || profile.signature_url,
                stampUrl: tenant?.stamp_url || profile.stamp_url,
                showSignature: tenant?.template_config?.showSignature ?? profile.template_config?.showSignature,
                showStamp: tenant?.template_config?.showStamp ?? profile.template_config?.showStamp,
            },
            recipientEmail: vendor?.email || profile.email,
        };
    };

    const handlePreview = async () => {
        try {
            const data = await buildVendorPaymentPdfInput();
            setPreviewHtml(generateTransactionPdfHtml(data));
            setShowPreview(true);
        } catch {
            Alert.alert(t('error', language), t('failedToGeneratePdf', language));
        }
    };

    const handlePrint = async () => {
        try {
            const result = await printTransactionPdf(await buildVendorPaymentPdfInput());
            if (!result.success && !result.canceled) Alert.alert(t('error', language), t('failedToPrint', language));
        } catch {
            Alert.alert(t('error', language), t('failedToPrint', language));
        }
    };

    const handleShare = async () => {
        try {
            await shareTransactionPdf(await buildVendorPaymentPdfInput());
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
            const data = await buildVendorPaymentPdfInput();
            const uri = await generateTransactionPdf(data);
            const result = await MailComposer.composeAsync({
                recipients: data.recipientEmail ? [data.recipientEmail] : [],
                subject: `${data.title} ${data.number || ''}`.trim(),
                body: `${data.title}\n\n${data.company?.name || t('yourBusiness', language)}`,
                attachments: [uri],
                isHtml: false,
            });
            if (result.status === 'sent') Alert.alert(t('success', language), t('emailMarkedSent', language));
        } catch {
            Alert.alert(t('error', language), t('failedToComposeEmail', language));
        }
    };

    const handleSave = async () => {
        if (!formData.vendor_id) {
            Alert.alert(t('error', language), t('selectVendorRequired', language));
            return;
        }
        if (!formData.amount || Number(formData.amount) <= 0) {
            Alert.alert(t('error', language), t('validAmount', language));
            return;
        }

        setLoading(true);
        try {
            const { companyId, profile, company } = await getWorkspaceScope(user!.id);
            if (formData.payment_method === 'bank' && !formData.company_bank_account_id) {
                throw new Error(t('selectBankAccount', language));
            }

            if (isEditing) {
                const paymentData = {
                    vendor_id: formData.vendor_id,
                    payment_number: formData.payment_number,
                    amount: Number(formData.amount),
                    payment_date: formData.payment_date,
                    payment_method: formData.payment_method,
                    company_bank_account_id: formData.payment_method === 'bank' ? formData.company_bank_account_id || null : null,
                    bank_reference: formData.bank_reference || null,
                    notes: formData.notes || null,
                };
                const { error } = await supabase.from('vendor_payments').update(paymentData).eq('id', paymentId);
                if (error) throw error;
            } else {
                const settlementCode = formData.payment_method === 'cash' ? '1010' : '1020';
                const { data: settlementAccount, error: settlementError } = await supabase
                    .from('chart_of_accounts')
                    .select('id')
                    .eq('company_id', companyId)
                    .eq('code', settlementCode)
                    .maybeSingle();
                if (settlementError) throw settlementError;
                if (!settlementAccount?.id) throw new Error(t('settlementAccountMissing', language).replace('{code}', settlementCode));

                const supplierPaymentArgs = {
                    p_company_id: companyId,
                    p_supplier_id: formData.vendor_id,
                    p_payment_date: formData.payment_date,
                    p_amount: Number(formData.amount),
                    p_payment_method: formData.payment_method,
                    p_settlement_account_id: settlementAccount.id,
                    p_reference: formData.bank_reference || null,
                    p_notes: formData.notes || formData.description || null,
                    p_branch_id: null,
                    p_currency: 'EUR',
                    p_idempotency_key: Crypto.randomUUID(),
                    p_company_bank_account_id: formData.payment_method === 'bank' ? formData.company_bank_account_id : null,
                };
                const { data: createdPayment, error } = await supabase.rpc(
                    formData.payment_method === 'bank' ? 'record_supplier_payment_with_bank_account' : 'record_supplier_payment',
                    formData.payment_method === 'bank' ? supplierPaymentArgs : {
                        p_company_id: supplierPaymentArgs.p_company_id,
                        p_supplier_id: supplierPaymentArgs.p_supplier_id,
                        p_payment_date: supplierPaymentArgs.p_payment_date,
                        p_amount: supplierPaymentArgs.p_amount,
                        p_payment_method: supplierPaymentArgs.p_payment_method,
                        p_settlement_account_id: supplierPaymentArgs.p_settlement_account_id,
                        p_reference: supplierPaymentArgs.p_reference,
                        p_notes: supplierPaymentArgs.p_notes,
                        p_branch_id: supplierPaymentArgs.p_branch_id,
                        p_currency: supplierPaymentArgs.p_currency,
                        p_idempotency_key: supplierPaymentArgs.p_idempotency_key,
                    },
                );
                if (error) throw error;
                try {
                    await shareTransactionPdf({
                        title: t('expensePayment', language),
                        fileName: documentPdfFileName((company as any)?.company_name || (company as any)?.name || profile.company_name || t('yourBusiness', language), String(createdPayment?.payment_number || formData.payment_number || t('expensePayment', language)), selectedVendor?.name || t('vendor', language)),
                        number: createdPayment?.payment_number || formData.payment_number,
                        amount: Number(formData.amount),
                        date: formData.payment_date,
                        method: formData.payment_method,
                        counterparty: selectedVendor?.name,
                        counterpartyType: 'vendor',
                        relatedDocumentNumber: selectedBill?.bill_number,
                        relatedDocumentLabel: t('supplierBill', language),
                        description: formData.description,
                        notes: formData.notes,
                        reference: formData.bank_reference,
                        language: language === 'sq' ? 'sq' : 'en',
                        company: {
                            name: (company as any)?.company_name || (company as any)?.name || profile.company_name,
                            email: (company as any)?.email || profile.email,
                            phone: (company as any)?.phone || profile.phone,
                            address: (company as any)?.address || (company as any)?.registered_address || profile.address,
                            city: (company as any)?.city || (company as any)?.municipality || profile.city,
                            country: (company as any)?.country || profile.country,
                            website: (company as any)?.website || profile.website,
                            taxId: (company as any)?.tax_id || (company as any)?.unique_business_number || profile.tax_id,
                            bankName: (company as any)?.bank_name || profile.bank_name,
                            iban: (company as any)?.bank_iban || profile.bank_iban,
                            logoUrl: (company as any)?.logo_url,
                            primaryColor: (company as any)?.primary_color || profile.primary_color,
                            signatureUrl: (company as any)?.signature_url || profile.signature_url,
                            stampUrl: (company as any)?.stamp_url || profile.stamp_url,
                            showSignature: (company as any)?.template_config?.showSignature ?? profile.template_config?.showSignature,
                            showStamp: (company as any)?.template_config?.showStamp ?? profile.template_config?.showStamp,
                        },
                    });
                } catch (pdfError) {
                    console.error('Payment saved, PDF generation failed:', pdfError);
                    Alert.alert(t('paymentSaved', language), t('paymentSavedPdfError', language));
                }
            }

            navigation.goBack();
        } catch (error: any) {
            console.error('Vendor payment save error:', error);
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'failedToSavePayment'));
        } finally {
            setLoading(false);
        }
    };

    const selectedVendor = vendors.find(v => v.id === formData.vendor_id);

    const paymentMethods = [
        { key: 'bank', label: t('bank', language), icon: Building2 },
        { key: 'cash', label: t('cash', language), icon: Banknote },
    ];

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {isEditing ? t('editPayment', language) : t('newPayment', language)}
                </Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                {isEditing ? <TransactionDocumentActions primaryColor={primaryColor} language={language === 'sq' ? 'sq' : 'en'} onPreview={() => { void handlePreview(); }} onPrint={() => { void handlePrint(); }} onEmail={() => { void handleEmail(); }} onShare={() => { void handleShare(); }} /> : null}
                {/* Vendor Selection */}
                <Card style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Building2 color="#0891b2" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('selectVendor', language)}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.picker, { backgroundColor: isDark ? '#0D1B2A' : '#F4F7FB', borderColor }]}
                        onPress={() => setShowVendorPicker(!showVendorPicker)}
                    >
                        <Text style={{ color: selectedVendor ? textColor : mutedColor }}>
                            {selectedVendor?.name || t('selectVendor', language)}
                        </Text>
                    </TouchableOpacity>
                    {showVendorPicker && (
                        <View style={[styles.pickerList, { borderColor, backgroundColor: cardBg }]}>
                            {vendors.map(v => (
                                <TouchableOpacity
                                    key={v.id}
                                    style={[styles.pickerItem, { borderBottomColor: borderColor }]}
                                    onPress={() => {
                                        setFormData({ ...formData, vendor_id: v.id });
                                        setShowVendorPicker(false);
                                    }}
                                >
                                    <Text style={{ color: textColor }}>{v.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </Card>

                {/* Bill Selection - Similar to Income Payment logic */}
                {formData.vendor_id ? (
                    <Card style={[styles.section, { backgroundColor: cardBg }]}>
                        <View style={styles.sectionHeader}>
                            <FileText color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('selectSupplierBillOptional', language)}</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.picker, { backgroundColor: isDark ? '#0D1B2A' : '#F4F7FB', borderColor }]}
                            onPress={() => setShowBillPicker(!showBillPicker)}
                        >
                            <Text style={{ color: selectedBill ? textColor : mutedColor }}>
                                {selectedBill ? `${selectedBill.bill_number} - ${formatCurrency(Number(selectedBill.total_amount), 'EUR', language)}` : t('selectBillToPay', language)}
                            </Text>
                        </TouchableOpacity>
                        {showBillPicker && (
                            <View style={[styles.pickerList, { borderColor, backgroundColor: cardBg }]}>
                                {unpaidBills.length === 0 ? (
                                    <Text style={{ padding: 12, textAlign: 'center', color: mutedColor }}>{t('noUnpaidBills', language)}</Text>
                                ) : (
                                    unpaidBills.map(bill => (
                                        <TouchableOpacity
                                            key={bill.id}
                                            style={[styles.pickerItem, { borderBottomColor: borderColor }]}
                                            onPress={() => {
                                                setSelectedBill(bill);
                                                setFormData({ ...formData, amount: String(bill.total_amount), description: t('paymentForSupplierBill', language).replace('{number}', bill.bill_number) });
                                                setShowBillPicker(false);
                                            }}
                                        >
                                            <View>
                                                <Text style={{ color: textColor, fontWeight: '500' }}>{bill.bill_number}</Text>
                                                <Text style={{ color: mutedColor, fontSize: 12 }}>{t('date', language)}: {bill.issue_date} • {formatCurrency(Number(bill.total_amount), 'EUR', language)}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))
                                )}
                            </View>
                        )}
                    </Card>
                ) : null}

                {/* Payment Details */}
                <Card style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Hash color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('paymentDetails', language)}</Text>
                    </View>
                    <Input
                        label={t('paymentNumber', language)}
                        value={formData.payment_number}
                        onChangeText={(text) => setFormData({ ...formData, payment_number: text })}
                        placeholder="VP-0001"
                    />
                    <Input
                        label={`${t('paymentAmount', language)} (€)`}
                        value={formData.amount}
                        onChangeText={(text) => setFormData({ ...formData, amount: text })}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                    />
                    <Input
                        label={t('paymentDate', language)}
                        value={formData.payment_date}
                        onChangeText={(text) => setFormData({ ...formData, payment_date: text })}
                        placeholder="YYYY-MM-DD"
                    />
                </Card>

                {/* Payment Method */}
                <Card style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <CreditCard color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('paymentMethod', language)}</Text>
                    </View>
                    <View style={styles.methodRow}>
                        {paymentMethods.map(method => (
                            <TouchableOpacity
                                key={method.key}
                                style={[
                                    styles.methodButton,
                                    { borderColor: formData.payment_method === method.key ? primaryColor : borderColor },
                                    formData.payment_method === method.key && { backgroundColor: `${primaryColor}15` }
                                ]}
                                onPress={() => setFormData({
                                    ...formData,
                                    payment_method: method.key as 'cash' | 'bank',
                                    company_bank_account_id: method.key === 'bank' ? formData.company_bank_account_id || bankAccounts[0]?.id || '' : '',
                                })}
                            >
                                <Text style={{ color: formData.payment_method === method.key ? primaryColor : mutedColor, fontWeight: '600' }}>
                                    {method.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {formData.payment_method === 'bank' && (
                        <>
                            <Text style={[styles.label, { color: textColor }]}>{t('paidFrom', language)}</Text>
                            <TouchableOpacity
                                testID="vendor-payment-bank-account-selector"
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showBankPicker }}
                                style={[styles.picker, { backgroundColor: isDark ? '#0D1B2A' : '#F4F7FB', borderColor }]}
                                onPress={() => setShowBankPicker(current => !current)}
                            >
                                <Text style={{ color: formData.company_bank_account_id ? textColor : mutedColor }} numberOfLines={1}>
                                    {(() => {
                                        const selectedAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
                                        return selectedAccount ? `${selectedAccount.bank_name}${selectedAccount.is_shared ? ` · ${t('sharedAccount', language)}` : ''}` : t('selectBankAccount', language);
                                    })()}
                                </Text>
                            </TouchableOpacity>
                            {showBankPicker ? <View style={[styles.pickerList, { borderColor, backgroundColor: cardBg }]}>
                                {bankAccounts.length ? bankAccounts.map((account) => (
                                    <TouchableOpacity
                                        key={account.id}
                                        testID={`vendor-payment-bank-account-option-${account.id}`}
                                        style={[styles.pickerItem, { borderBottomColor: borderColor }]}
                                        onPress={() => {
                                            setFormData({ ...formData, company_bank_account_id: account.id });
                                            setShowBankPicker(false);
                                        }}
                                    >
                                        <Text style={{ color: textColor }}>{account.bank_name}</Text>
                                        <Text style={{ color: mutedColor, fontSize: 12 }}>
                                            {account.is_shared ? `${t('sharedAccount', language)} · ` : ''}{account.iban || account.account_number || account.account_name || account.currency}
                                        </Text>
                                    </TouchableOpacity>
                                )) : <Text style={{ padding: 12, textAlign: 'center', color: mutedColor }}>{t('noBankAccounts', language)}</Text>}
                            </View> : null}
                            <Input
                                label={t('bankReference', language)}
                                value={formData.bank_reference}
                                onChangeText={(text) => setFormData({ ...formData, bank_reference: text })}
                                placeholder={t('transactionReference', language)}
                            />
                        </>
                    )}
                </Card>

                {/* Description & Notes */}
                <Card style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <FileText color="#3388FF" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('description', language)}</Text>
                    </View>
                    <Input
                        label={t('description', language)}
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        placeholder={t('supplierBillDescriptionPlaceholder', language)}
                    />
                    <Input
                        label={t('notes', language)}
                        value={formData.notes}
                        onChangeText={(text) => setFormData({ ...formData, notes: text })}
                        placeholder={t('additionalNotes', language)}
                        multiline
                        numberOfLines={3}
                    />
                </Card>

                <Button
                    title={isEditing ? t('updatePayment', language) : t('registerPayment', language)}
                    onPress={handleSave}
                    loading={loading}
                    style={styles.saveButton}
                />
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
    section: { borderRadius: 16, padding: 16, marginBottom: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600' },
    label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
    picker: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1 },
    pickerList: { marginTop: 8, borderWidth: 1, borderRadius: 8, maxHeight: 200 },
    pickerItem: { padding: 12, borderBottomWidth: 1 },
    methodRow: { flexDirection: 'row', gap: 10 },
    methodButton: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 2, alignItems: 'center' },
    saveButton: { marginTop: 8 },
});
