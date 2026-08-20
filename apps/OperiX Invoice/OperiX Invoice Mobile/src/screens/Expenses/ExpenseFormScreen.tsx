import React, { useEffect, useRef, useState } from 'react';
import * as MailComposer from 'expo-mail-composer';
import * as Crypto from 'expo-crypto';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    Switch,
} from 'react-native';
import { ArrowLeft, Tag, DollarSign, FileText, Camera, ChevronDown, ChevronUp, Trash2, Banknote, Building } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@invoice-monorepo/api';
import { listCompanyBankAccounts } from '@invoice-monorepo/api/repositories';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';
import type { CompanyBankAccount } from '@invoice-monorepo/types';
import { generateTransactionPdf, generateTransactionPdfHtml, printTransactionPdf, shareTransactionPdf } from '../../services/pdf/transactionPdf';
import { getWorkspaceScope } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';
import { TransactionDocumentActions, TransactionPreviewModal } from '../../components/mobile/TransactionDocumentActions';
import { documentPdfFileName } from '../../services/pdf/fileNaming';
import { deleteExpense, getExpense, listExpenses, saveExpense } from '@invoice-monorepo/api/repositories';

async function generateExpenseIdempotencyKey(): Promise<string> {
    const nativeUuid = Crypto.randomUUID?.();
    if (nativeUuid) return nativeUuid;

    const bytes = await Crypto.getRandomBytesAsync(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function ExpenseFormScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const expenseId = route.params?.expenseId;
    const isEditing = !!expenseId;

    const [formData, setFormData] = useState({
        amount: '',
        category: 'Other',
        vendor_name: '',
        invoice_number: '',
        description: '',
        bank_reference: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
        receipt_url: '',
        payment_method: 'cash' as 'cash' | 'bank',
        company_bank_account_id: '',
    });
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [accountingState, setAccountingState] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const saveInFlight = useRef(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const [showExpenseSignature, setShowExpenseSignature] = useState(true);
    const [showExpenseStamp, setShowExpenseStamp] = useState(true);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [showBankPicker, setShowBankPicker] = useState(false);

    const defaultCategories = ['Travel', 'Supplies', 'Marketing', 'Software', 'Rent', 'Utilities', 'Other'];
    const categoryLabel = (category: string) => ({
        Travel: t('travelCategory', language),
        Supplies: t('suppliesCategory', language),
        Marketing: t('marketingCategory', language),
        Software: t('softwareCategory', language),
        Rent: t('rentCategory', language),
        Utilities: t('utilitiesCategory', language),
        Other: t('other', language),
    } as Record<string, string>)[category] || category;

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);

    useEffect(() => {
        if (isEditing) {
            fetchExpense();
        } else if (route.params?.scannedData) {
            const scan = route.params.scannedData;
            setFormData(prev => ({
                ...prev,
                amount: scan.total_amount ? String(scan.total_amount) : '',
                date: scan.date || new Date().toISOString().split('T')[0],
                vendor_name: scan.vendor_name ? String(scan.vendor_name) : '',
                invoice_number: (scan.invoice_number || scan.bill_number) ? String(scan.invoice_number || scan.bill_number) : '',
            }));
        }
        fetchCategories();
        fetchBankAccounts();
    }, [expenseId, route.params?.scannedData]);

    const fetchCategories = async () => {
        if (!user) return;
        const scope = await getWorkspaceScope(user.id);
        const data = await listExpenses(supabase, { userId: user.id, companyIds: scope.companyIds });
        if (data) {
            const unique = Array.from(new Set(data
                .filter((item: any) => item.type !== 'income')
                .map((item: any) => item.category)
                .filter(Boolean)));
            setDynamicCategories(unique as string[]);
        }
    };

    const fetchBankAccounts = async () => {
        if (!user) return;
        try {
            const { companyId } = await getWorkspaceScope(user.id);
            const data = await listCompanyBankAccounts(supabase, companyId);
            setBankAccounts(data as unknown as CompanyBankAccount[]);
            if (!isEditing && data.length && formData.payment_method === 'bank' && !formData.company_bank_account_id) {
                const primary = data.find((account: any) => account.is_primary) || data[0];
                setFormData(prev => ({ ...prev, company_bank_account_id: String(primary.id) }));
            }
        } catch (error) {
            console.warn('Expense bank account load error:', error);
        }
    };

    const fetchExpense = async () => {
        if (!user || !expenseId) return;
        const scope = await getWorkspaceScope(user.id);
        const data = await getExpense(supabase, expenseId, { userId: user.id, companyIds: scope.companyIds });
        if (data) {
            setFormData({
                amount: String(data.amount),
                category: String(data.category || 'Other'),
                vendor_name: data.vendor_name ? String(data.vendor_name) : '',
                invoice_number: data.invoice_number ? String(data.invoice_number) : '',
                description: data.description ? String(data.description) : '',
                bank_reference: data.bank_reference ? String(data.bank_reference) : '',
                notes: data.notes ? String(data.notes) : '',
                date: String(data.date || new Date().toISOString().split('T')[0]),
                receipt_url: data.receipt_url ? String(data.receipt_url) : '',
                payment_method: data.payment_method === 'bank' ? 'bank' : 'cash',
                company_bank_account_id: data.company_bank_account_id ? String(data.company_bank_account_id) : '',
            });
            setAccountingState(data.accounting_state ? String(data.accounting_state) : null);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled && result.assets[0].base64) {
            setFormData({ ...formData, receipt_url: `data:image/jpeg;base64,${result.assets[0].base64}` });
        }
    };

    const buildExpensePdfInput = async (recordId = expenseId) => {
        if (!user) throw new Error(t('signInSaveExpense', language));
        const { profile, company } = await getWorkspaceScope(user.id);
        const tenant = company as any;
        const selectedBankAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
        const expenseNumber = recordId ? `EXP-${String(recordId).slice(0, 8).toUpperCase()}` : t('expense', language);
        const tenantName = tenant?.company_name || tenant?.name || profile.company_name || t('yourBusiness', language);
        return {
            title: t('expense', language),
            fileName: documentPdfFileName(tenantName, expenseNumber, t('client', language)),
            number: recordId ? expenseNumber : undefined,
            barcodeValue: recordId ? `EXPENSE:${recordId}` : undefined,
            transactionType: 'expense' as const,
            documentStatusLabel: t('expense', language),
            amount: Number(formData.amount),
            date: formData.date,
            method: formData.payment_method,
            counterparty: formData.vendor_name || undefined,
            counterpartyType: formData.vendor_name ? 'vendor' as const : undefined,
            relatedDocumentNumber: formData.invoice_number || undefined,
            relatedDocumentLabel: t('invoiceNumber', language),
            description: formData.description,
            category: categoryLabel(formData.category),
            reference: formData.bank_reference || undefined,
            notes: formData.notes || undefined,
            showClientSignature: true,
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
                showSignature: showExpenseSignature,
                showStamp: showExpenseStamp,
            },
        };
    };

    const handlePreview = async () => {
        try {
            const data = await buildExpensePdfInput();
            setPreviewHtml(generateTransactionPdfHtml(data));
            setShowPreview(true);
        } catch {
            Alert.alert(t('error', language), t('failedToGeneratePdf', language));
        }
    };

    const handlePrint = async () => {
        try {
            const result = await printTransactionPdf(await buildExpensePdfInput());
            if (!result.success && !result.canceled) Alert.alert(t('error', language), t('failedToPrint', language));
        } catch {
            Alert.alert(t('error', language), t('failedToPrint', language));
        }
    };

    const handleShare = async () => {
        try {
            await shareTransactionPdf(await buildExpensePdfInput());
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
            const data = await buildExpensePdfInput();
            const uri = await generateTransactionPdf(data);
            const result = await MailComposer.composeAsync({
                recipients: data.company?.email ? [data.company.email] : [],
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

    const handleDelete = () => {
        if (!expenseId) return;
        Alert.alert(
            t('delete', language),
            t('deleteExpenseConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (!user) throw new Error('Your session has expired.');
                            setDeleting(true);
                            const { companyId } = await getWorkspaceScope(user.id);
                            await deleteExpense(supabase, expenseId, companyId, user.id);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert(
                                t('error', language),
                                error instanceof Error ? error.message : t('failedToDeleteExpense', language),
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
            Alert.alert(t('error', language), t('validAmount', language));
            return;
        }
        if (formData.payment_method === 'bank' && !formData.company_bank_account_id) {
            Alert.alert(t('error', language), t('selectBankAccountRequired', language));
            return;
        }

        saveInFlight.current = true;
        setLoading(true);
        try {
            if (!user) throw new Error(t('signInSaveExpense', language));
            const { companyId } = await getWorkspaceScope(user.id);
            const dataToSave = {
                ...formData,
                amount: Number(formData.amount),
                vendor_name: formData.vendor_name.trim() || null,
                invoice_number: formData.invoice_number.trim() || null,
                bank_reference: formData.bank_reference.trim() || null,
                notes: formData.notes.trim() || null,
                company_bank_account_id: formData.payment_method === 'bank' ? formData.company_bank_account_id || null : null,
                type: 'expense' as const,
                user_id: user.id,
                company_id: companyId,
            };
            const correctPostedExpense = isEditing && accountingState === 'posted';
            const expenseIdempotencyKey = (!isEditing || correctPostedExpense)
                ? await generateExpenseIdempotencyKey()
                : null;

            const savedExpense = await saveExpense(supabase, dataToSave, isEditing ? expenseId : null, {
                postExpense: !isEditing,
                correctPostedExpense,
                idempotencyKey: expenseIdempotencyKey,
            });
            if (!isEditing || correctPostedExpense) {
                void notifyBusinessEvent(correctPostedExpense ? 'expense_approved' : 'expense_created', companyId, String(savedExpense.id)).catch((notificationError) => console.warn('Expense notification could not be sent:', notificationError));
                const selectedBankAccount = bankAccounts.find((account) => account.id === formData.company_bank_account_id);
                if (formData.payment_method === 'bank' && selectedBankAccount?.is_shared) {
                    void notifyBusinessEvent('shared_bank_activity', companyId, String(savedExpense.id), {
                        entityType: 'expense',
                        amount: Number(formData.amount),
                        currency: 'EUR',
                    }).catch((notificationError) => console.warn('Shared bank notification could not be sent:', notificationError));
                }
            }
            if (!isEditing) {
                try {
                    await shareTransactionPdf(await buildExpensePdfInput(String(savedExpense.id)));
                } catch (pdfError) {
                    console.error('Record saved, PDF generation failed:', pdfError);
                    Alert.alert(t('recordSaved', language), t('recordSavedPdfError', language));
                }
            }
            navigation.goBack();
        } catch (error) {
            console.warn('Expense save error:', error);
            Alert.alert(t('error', language), t('failedToSaveExpense', language));
        } finally {
            saveInFlight.current = false;
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            testID="expense-form-screen"
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity
                    testID="expense-form-back-button"
                    accessibilityRole="button"
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {isEditing ? t('updateExpense', language) : t('addExpense', language)}
                </Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                {isEditing ? <TransactionDocumentActions primaryColor={primaryColor} language={language === 'sq' ? 'sq' : 'en'} onPreview={() => { void handlePreview(); }} onPrint={() => { void handlePrint(); }} onEmail={() => { void handleEmail(); }} onShare={() => { void handleShare(); }} /> : null}

                {/* Card 1: Details */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <FileText color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('transactionDetails', language)}</Text>
                    </View>

                    <Input
                        label={t('date', language)}
                        value={formData.date}
                        onChangeText={(text) => setFormData({ ...formData, date: text })}
                        placeholder="YYYY-MM-DD"
                    />

                    <Input
                        label={t('vendor', language)}
                        value={formData.vendor_name}
                        onChangeText={(text) => setFormData({ ...formData, vendor_name: text })}
                        placeholder={t('vendorNamePlaceholder', language)}
                    />

                    <Input
                        label={t('invoiceNumber', language)}
                        value={formData.invoice_number}
                        onChangeText={(text) => setFormData({ ...formData, invoice_number: text })}
                        placeholder={t('invoiceNumberPlaceholder', language)}
                    />

                    <Input
                        label={t('description', language)}
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        placeholder={t('whatWasThisFor', language)}
                        multiline
                    />
                </Card>

                {/* Card 2: Amount & payment method */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <DollarSign color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('amountAndMethod', language)}</Text>
                    </View>

                    <Input
                        testID="expense-amount-input"
                        label={t('amountRequired', language)}
                        value={formData.amount}
                        onChangeText={(text) => setFormData({ ...formData, amount: text })}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                    />

                    <Text style={[styles.label, { color: textColor }]}>{t('paymentMethod', language)}</Text>
                    <View style={styles.typeGrid}>
                        {([
                            { key: 'cash', label: t('cash', language), icon: Banknote, color: '#12B76A' },
                            { key: 'bank', label: t('bank', language), icon: Building, color: '#3388FF' },
                        ] as const).map(({ key, label, icon: Icon, color }) => {
                            const selected = formData.payment_method === key;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    testID={`expense-payment-${key}-button`}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    style={[styles.typeOption, { backgroundColor: selected ? color : (isDark ? '#263A55' : '#F4F7FB') }]}
                                    onPress={() => {
                                        const primaryBank = bankAccounts.find((account) => account.is_primary) || bankAccounts[0];
                                        setFormData(prev => ({
                                            ...prev,
                                            payment_method: key,
                                            company_bank_account_id: key === 'bank'
                                                ? prev.company_bank_account_id || primaryBank?.id || ''
                                                : '',
                                        }));
                                        setShowBankPicker(key === 'bank');
                                    }}
                                >
                                    <Icon color={selected ? '#fff' : mutedColor} size={18} />
                                    <Text numberOfLines={2} style={[styles.typeText, { color: selected ? '#fff' : mutedColor }]}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {formData.payment_method === 'bank' ? (
                        <View style={styles.bankSelection}>
                            <Text style={[styles.label, { color: textColor }]}>{t('paidFrom', language)}</Text>
                            <TouchableOpacity
                                testID="expense-bank-account-selector"
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showBankPicker }}
                                style={[styles.pickerButton, { backgroundColor: isDark ? '#102038' : '#F4F7FB', borderColor }]}
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
                                <View style={[styles.pickerList, { backgroundColor: isDark ? '#14243A' : '#fff', borderColor }]}>
                                    {bankAccounts.length ? bankAccounts.map((account) => (
                                        <TouchableOpacity
                                            key={account.id}
                                            testID={`expense-bank-account-option-${account.id}`}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: formData.company_bank_account_id === account.id }}
                                            style={[styles.pickerItem, formData.company_bank_account_id === account.id && styles.pickerItemActive]}
                                            onPress={() => {
                                                setFormData(prev => ({ ...prev, company_bank_account_id: account.id }));
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
                            <Text style={[styles.bankHint, { color: mutedColor }]}>{t('bankAccountExpenseHint', language)}</Text>
                            <Input
                                testID="expense-bank-reference-input"
                                label={t('bankReference', language)}
                                value={formData.bank_reference}
                                onChangeText={(text) => setFormData({ ...formData, bank_reference: text })}
                                placeholder={t('bankTransferReference', language)}
                            />
                        </View>
                    ) : null}

                    <Input
                        testID="expense-notes-input"
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
                            testID="expense-show-signature-switch"
                            accessibilityLabel={t('showSignature', language)}
                            value={showExpenseSignature}
                            onValueChange={setShowExpenseSignature}
                            trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                            thumbColor={showExpenseSignature ? primaryColor : '#f4f4f5'}
                        />
                    </View>
                    <View style={styles.optionRow}>
                        <View style={styles.optionCopy}>
                            <Text style={[styles.optionTitle, { color: textColor }]}>{t('showCompanyStamp', language)}</Text>
                            <Text style={[styles.optionDescription, { color: mutedColor }]}>{t('showCompanyStamp', language)}</Text>
                        </View>
                        <Switch
                            testID="expense-show-stamp-switch"
                            accessibilityLabel={t('showCompanyStamp', language)}
                            value={showExpenseStamp}
                            onValueChange={setShowExpenseStamp}
                            trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                            thumbColor={showExpenseStamp ? primaryColor : '#f4f4f5'}
                        />
                    </View>
                </Card>

                {/* Card 3: Category */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Tag color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('category', language)}</Text>
                    </View>

                    <Text style={[styles.label, { color: textColor }]}>{t('category', language)}</Text>
                    <Input
                        value={formData.category}
                        onChangeText={(text) => setFormData({ ...formData, category: text })}
                        placeholder={t('typeCategory', language)}
                    />

                    <View style={styles.categoryGrid}>
                        {Array.from(new Set([...defaultCategories, ...dynamicCategories]))
                            .slice(0, 12)
                            .map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[
                                        styles.categoryOption,
                                        { backgroundColor: isDark ? '#263A55' : '#F4F7FB' },
                                        formData.category === cat && styles.activeCategoryExpense
                                    ]}
                                    onPress={() => setFormData({ ...formData, category: cat })}
                                >
                                    <Text style={[
                                        styles.categoryText,
                                        { color: isDark ? '#98A2B3' : '#667085' },
                                        formData.category === cat && styles.activeCategoryText
                                    ]}>{categoryLabel(cat)}</Text>
                                </TouchableOpacity>
                            ))}
                    </View>
                </Card>

                <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showAdvanced }} onPress={() => setShowAdvanced((current) => !current)} style={styles.advancedToggle}>
                    <Text style={[styles.advancedText, { color: '#004FFE' }]}>{showAdvanced ? t('hideReceiptOptions', language) : t('addReceiptProof', language)}</Text>
                    {showAdvanced ? <ChevronUp color="#004FFE" size={17} /> : <ChevronDown color="#004FFE" size={17} />}
                </TouchableOpacity>

                {/* Card 3: Receipt */}
                {showAdvanced ? <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Camera color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('receiptProof', language)}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.receiptUpload, { backgroundColor: isDark ? '#263A55' : '#F4F7FB' }]}
                        onPress={pickImage}
                    >
                        {formData.receipt_url ? (
                            <Text style={{ color: '#12B76A', fontWeight: '600' }}>{t('receiptUploaded', language)}</Text>
                        ) : (
                            <>
                                <Camera color={isDark ? '#98A2B3' : '#667085'} size={32} />
                                <Text style={[styles.uploadText, { color: isDark ? '#98A2B3' : '#667085' }]}>{t('captureAttachReceipt', language)}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </Card> : null}

                <Button
                    testID="expense-save-button"
                    title={isEditing ? t('updateExpense', language) : t('logExpense', language)}
                    onPress={handleSave}
                    loading={loading}
                    variant="primary"
                    style={styles.saveButton}
                />
                {isEditing ? (
                    <Button
                        testID="expense-delete-button"
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
            <TransactionPreviewModal visible={showPreview} html={previewHtml} title={t('preview', language)} language={language === 'sq' ? 'sq' : 'en'} textColor={textColor} bgColor={bgColor} primaryColor={primaryColor} onClose={() => setShowPreview(false)} onPrint={() => { void handlePrint(); }} />
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
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    categoryOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    activeCategoryExpense: { backgroundColor: '#ef4444' },
    activeCategoryIncome: { backgroundColor: '#12B76A' },
    categoryText: { fontSize: 13, fontWeight: '500' },
    activeCategoryText: { color: '#fff' },
    receiptUpload: { height: 120, borderRadius: 12, borderStyle: 'dashed', borderWidth: 2, borderColor: '#263A55', alignItems: 'center', justifyContent: 'center', gap: 8 },
    uploadText: { fontSize: 13 },
    saveButton: { marginTop: 8 },
    deleteButton: { marginTop: 12 },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E9F0' },
    optionCopy: { flex: 1, paddingRight: 12 },
    optionTitle: { fontSize: 14, fontWeight: '600' },
    optionDescription: { fontSize: 11, marginTop: 3 },
    typeGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    typeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, paddingHorizontal: 4, paddingVertical: 14, borderRadius: 12 },
    typeText: { flexShrink: 1, textAlign: 'center', fontWeight: '600', fontSize: 12, lineHeight: 15 },
    bankSelection: { marginTop: -4 },
    pickerButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pickerButtonText: { flex: 1, fontSize: 14, fontWeight: '600' },
    pickerList: { marginTop: 8, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
    pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    pickerItemActive: { backgroundColor: 'rgba(0, 79, 254, 0.1)' },
    pickerItemText: { fontSize: 14, fontWeight: '600' },
    pickerItemSubtext: { fontSize: 12, marginTop: 3 },
    noItems: { padding: 14, textAlign: 'center' },
    bankHint: { fontSize: 11, lineHeight: 16, marginTop: 8 },
    advancedToggle: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    advancedText: { fontSize: 13, fontWeight: '700' },
});
