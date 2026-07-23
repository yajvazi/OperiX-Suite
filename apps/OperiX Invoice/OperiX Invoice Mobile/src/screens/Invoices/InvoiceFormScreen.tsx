import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Modal,
    TextInput
} from 'react-native';
import {
    ArrowLeft,
    Save,
    Calendar,
    User,
    Plus,
    Trash2,
    FileText,
    CreditCard,
    Check,
    Search,
    ChevronDown,
    ChevronUp,
    Hash,
    AlignLeft,
    Eye,
    X
} from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { generateInvoiceHtml } from '../../services/pdf/TemplateFactory';
import { useAuth } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { Invoice, InvoiceItem, Client, Product, Profile } from '@invoice-monorepo/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { t } from '@invoice-monorepo/i18n';
import { normalizeBrandColor } from '../../theme/brand';

interface InvoiceFormScreenProps {
    navigation: any;
    route: any;
}

export function InvoiceFormScreen({ navigation, route }: InvoiceFormScreenProps) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const { invoiceId, type = 'invoice', subtype = 'regular', documentKey } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [clients, setClients] = useState<Client[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // Form State
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [issueDate, setIssueDate] = useState(new Date());
    const [dueDate, setDueDate] = useState<Date | null>(null);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [items, setItems] = useState<Partial<InvoiceItem>[]>([]);
    const [notes, setNotes] = useState('');
    const [discount, setDiscount] = useState<string>('0'); // Persist as string for input
    const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue'>('draft');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'card'>('bank_transfer');
    const [amountReceived, setAmountReceived] = useState('');
    const [profile, setProfile] = useState<Profile | null>(null);

    // Pickers
    const [showClientPicker, setShowClientPicker] = useState(false);
    const [showProductPicker, setShowProductPicker] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'issue' | 'due'>('issue');

    // Preview State
    const [showPreview, setShowPreview] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    useEffect(() => {
        void loadData();
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        if (!user) {
            setLoading(false);
            return;
        }

        // Load the workspace first because its company id scopes the remaining queries.
        let { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData?.active_company_id) {
            const { data: companyData } = await supabase
                .from('companies')
                .select('*')
                .eq('id', profileData.active_company_id)
                .single();
            if (companyData) profileData = { ...profileData, ...companyData };
        }
        setProfile(profileData);

        const companyId = profileData.active_company_id || profileData.company_id || user.id;

        const clientsPromise = supabase
            .from('clients')
            .select('*')
            .or(`user_id.eq.${user.id},company_id.eq.${companyId}`)
            .order('name');
        const productsPromise = supabase
            .from('products')
            .select('*')
            .or(`user_id.eq.${user.id},company_id.eq.${companyId}`)
            .order('name');
        const invoicePromise = invoiceId
            ? supabase.from('invoices').select(`*, client:clients(*), items:invoice_items(*)`).eq('id', invoiceId).single()
            : supabase.from('invoices').select('*', { count: 'exact', head: true }).or(`user_id.eq.${user.id},company_id.eq.${companyId}`).eq('type', type);

        const [{ data: clientsData }, { data: productsData }, invoiceResult] = await Promise.all([
            clientsPromise,
            productsPromise,
            invoicePromise,
        ]);
        if (clientsData) setClients(clientsData);
        if (productsData) setProducts(productsData);

        // Load the invoice and its line items in the same request when editing.
        if (invoiceId) {
            const invoice = invoiceResult.data as any;

            if (invoice) {
                setInvoiceNumber(invoice.invoice_number);
                setIssueDate(new Date(invoice.issue_date));
                if (invoice.due_date) setDueDate(new Date(invoice.due_date));
                setNotes(invoice.notes || '');
                setStatus(invoice.status);
                setPaymentMethod(invoice.payment_method || 'bank_transfer');
                setAmountReceived(invoice.amount_received ? String(invoice.amount_received) : '');
                setSelectedClient((invoice as any).client);
                setDiscount(String(invoice.discount_percent || 0));

                if (invoice.items) setItems(invoice.items);
            }
        } else {
            const { count } = invoiceResult;
            const nextNum = (count || 0) + 1;
            const prefix = type === 'offer' ? 'OFF' : 'INV';
            const year = new Date().getFullYear();
            setInvoiceNumber(`${prefix}-${year}-${String(nextNum).padStart(4, '0')}`);
        }
        setLoading(false);
    };

    const handleAddItem = (product?: Product) => {
        const currentGlobalDiscount = parseFloat(discount) || 0;
        const newItem: Partial<InvoiceItem> = {
            id: `temp-${Date.now()}`,
            description: product?.name || '',
            quantity: 1,
            unit_price: product?.unit_price || 0,
            amount: product?.unit_price || 0,
            product_id: product?.id,
            tax_rate: product?.tax_rate || 0,
            discount: currentGlobalDiscount,
            sku: (product as any)?.sku || '',
        };

        // Calculate initial amount with discount
        const price = newItem.unit_price || 0;
        const subtotal = 1 * price;
        const discountAmount = subtotal * (currentGlobalDiscount / 100);
        newItem.amount = subtotal - discountAmount;

        setItems([...items, newItem]);
        setShowProductPicker(false);
    };

    const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };

        // Recalculate amount including discount
        const qty = Number(newItems[index].quantity) || 0;
        const price = Number(newItems[index].unit_price) || 0;
        const discountPercent = Number(newItems[index].discount) || 0;

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

    const calculateTotals = () => {
        const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        // Sum of all item discounts (calculated as original_price * qty * discount_percent)
        // item.amount is already discounted. 
        // We need to trace back or sum up differently if we want to show Total Discount amount.
        // item.amount = (qty * price) * (1 - discount/100)
        // discountAmount = (qty * price) * (discount/100)
        const totalDiscount = items.reduce((sum, item) => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.unit_price) || 0;
            const discPercent = Number(item.discount) || 0;
            const itemSubtotal = qty * price;
            return sum + (itemSubtotal * (discPercent / 100));
        }, 0);

        const tax = items.reduce((sum, item) => {
            const amount = Number(item.amount) || 0;
            const rate = Number(item.tax_rate) || 0;
            return sum + (amount * (rate / 100));
        }, 0);

        // The 'subtotal' variable here is actually the "Net Total after Discount" based on item.amount sum.
        // But usually Subtotal means "Before Discount".
        // Let's adjust to standard meanings for the summary object if needed.
        // However, existing logic seemed to treat 'subtotal' as sum of amounts.
        // If we want to show "Gross Subtotal" (before discount), we should calculate it:
        const grossSubtotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);

        // Current implementation seems to expect:
        // subtotal: Sum of item amounts (Net of discount? Or Gross?) 
        // Looking at generateInvoiceHtml, it uses subtotal - discount.
        // So let's stick to:
        // Subtotal = Gross Sum
        // Discount = Total Discount
        // Tax = Tax on Net
        // Total = Net + Tax

        return {
            subtotal: grossSubtotal,
            tax,
            discount: totalDiscount,
            total: (grossSubtotal - totalDiscount) + tax
        };
    };

    const handleSave = async () => {
        if (!selectedClient) {
            Alert.alert('Error', 'Please select a client');
            return;
        }
        if (items.length === 0) {
            Alert.alert('Error', 'Please add at least one item');
            return;
        }

        setSaving(true);
        try {
            const totals = calculateTotals();
            const companyId = profile?.active_company_id || profile?.company_id || user?.id;

            const amountPaid = paymentMethod === 'cash' ? Number(amountReceived) || 0 : 0;
            const changeAmount = paymentMethod === 'cash' ? Math.max(0, amountPaid - totals.total) : 0;
            if (paymentMethod === 'cash' && totals.total >= 300) {
                Alert.alert('Cash limit', 'Cash payments are available only for invoices below €300.');
                setSaving(false);
                return;
            }
            if (paymentMethod === 'cash' && amountPaid < totals.total) {
                Alert.alert('Payment amount', 'The amount paid must cover the invoice total.');
                setSaving(false);
                return;
            }

            const invoiceData = {
                user_id: user?.id,
                company_id: companyId,
                client_id: selectedClient.id,
                invoice_number: invoiceNumber,
                issue_date: issueDate.toISOString().split('T')[0],
                due_date: dueDate ? dueDate.toISOString().split('T')[0] : null,
                notes,
                status,
                type,
                subtype,
                tax_amount: totals.tax,
                discount_amount: totals.discount,
                discount_percent: parseFloat(discount) || 0,
                total_amount: totals.total,
                amount_received: amountPaid,
                payment_method: paymentMethod,
                change_amount: changeAmount,
            };

            let savedInvoice;

            if (invoiceId) {
                // Update
                const { data, error } = await supabase
                    .from('invoices')
                    .update(invoiceData)
                    .eq('id', invoiceId)
                    .select()
                    .single();
                if (error) throw error;
                savedInvoice = data;

                // Delete existing items and re-insert (simplest strategy)
                await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
            } else {
                // Insert
                const { data, error } = await supabase
                    .from('invoices')
                    .insert(invoiceData)
                    .select()
                    .single();
                if (error) throw error;
                savedInvoice = data;
            }

            // Insert Items
            const itemsToInsert = items.map(item => ({
                invoice_id: savedInvoice.id,
                product_id: item.product_id,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit || 'pcs',
                unit_price: item.unit_price,
                tax_rate: item.tax_rate,
                discount: item.discount || 0,
                sku: item.sku || '',
                amount: item.amount
            }));

            const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);
            if (itemsError) throw itemsError;

            Alert.alert('Success', 'Invoice saved successfully', [
                { text: 'OK', onPress: () => navigation.replace('InvoiceDetail', { invoiceId: savedInvoice.id, autoPreview: true }) }
            ]);

        } catch (error: any) {
            console.error('Save error:', error);
            Alert.alert('Error', error.message || 'Failed to save invoice');
        } finally {
            setSaving(false);
        }
    };

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            if (datePickerMode === 'issue') setIssueDate(selectedDate);
            else setDueDate(selectedDate);
        }
    };

    const handlePreview = async () => {
        if (!selectedClient) {
            Alert.alert('Error', 'Please select a client to preview');
            return;
        }

        const totals = calculateTotals();
        const companyId = profile?.active_company_id || profile?.company_id || user?.id;

        // Mock invoice data for preview
        const invoiceData: any = {
            company: {
                name: profile?.company_name || 'My Company',
                address: profile?.address || '',
                city: profile?.city || '',
                country: profile?.country || '',
                email: profile?.email || '',
                phone: profile?.phone || '',
                logoUrl: profile?.logo_url,
                bankName: profile?.bank_name,
                bankAccount: profile?.bank_account,
                bankIban: profile?.bank_iban,
                bankSwift: profile?.bank_swift,
                primaryColor: normalizeBrandColor(profile?.primary_color),
            },
            client: {
                name: selectedClient.name,
                address: selectedClient.address || '',
                city: selectedClient.city || '',
                country: selectedClient.country || '',
                email: selectedClient.email || '',
                phone: selectedClient.phone || '',
                taxId: selectedClient.tax_id,
            },
            details: {
                number: invoiceNumber,
                issueDate: issueDate.toISOString().split('T')[0],
                dueDate: dueDate ? dueDate.toISOString().split('T')[0] : '',
                currency: 'EUR',
                notes: notes,
                type: type,
                status: 'draft',
            },
            items: items.map(item => ({
                description: item.description || '',
                quantity: item.quantity || 0,
                price: item.unit_price || 0,
                total: item.amount || 0,
                unit: item.unit || 'pcs'
            })),
            summary: {
                subtotal: totals.subtotal,
                tax: totals.tax,
                discount: totals.discount,
                total: totals.total,
                discountPercent: parseFloat(discount) || 0,
            }
        };

        const html = generateInvoiceHtml(invoiceData, 'corporate');
        setPreviewHtml(html);
        setShowPreview(true);
    };

    const totals = calculateTotals();

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.navigate('InvoicesList')} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>
                        {invoiceId ? 'Edit Document' : `New ${type === 'offer' ? 'Offer' : 'Invoice'}`}
                    </Text>
                    <Text style={[styles.title, { color: textColor }]}>
                        {invoiceId ? invoiceNumber : 'Create New'}
                    </Text>
                </View>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={{ color: mutedColor }}>Loading your invoice workspace…</Text>
                </View>
            ) : <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                    {/* General Info */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>Details</Text>
                    <Card style={styles.card}>
                        <Input
                            label="Document Number"
                            value={invoiceNumber}
                            onChangeText={setInvoiceNumber}
                            placeholder="INV-2024-001"
                            containerStyle={{ marginBottom: 12 }}
                        />

                        <View style={styles.row}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>Issue Date</Text>
                                <TouchableOpacity
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                    onPress={() => { setDatePickerMode('issue'); setShowDatePicker(true); }}
                                >
                                    <Calendar color={mutedColor} size={18} />
                                    <Text style={[styles.dateText, { color: textColor }]}>
                                        {issueDate.toLocaleDateString()}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={[styles.label, { color: mutedColor }]}>Due Date</Text>
                                <TouchableOpacity
                                    style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
                                    onPress={() => { setDatePickerMode('due'); setShowDatePicker(true); }}
                                >
                                    <Calendar color={mutedColor} size={18} />
                                    <Text style={[styles.dateText, { color: textColor }]}>
                                        {dueDate ? dueDate.toLocaleDateString() : 'Set Due Date'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Card>

                    {/* Client Selection */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>Client</Text>
                    <Card style={styles.card}>
                        {selectedClient ? (
                            <View style={styles.selectedClient}>
                                <View style={[styles.clientIcon, { backgroundColor: 'rgba(0, 79, 254, 0.1)' }]}>
                                    <User color="#004FFE" size={24} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.clientName, { color: textColor }]}>{selectedClient.name}</Text>
                                    <Text style={[styles.clientDetail, { color: mutedColor }]}>{selectedClient.email || 'No email'}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setSelectedClient(null)} style={styles.removeClient}>
                                    <Trash2 color="#ef4444" size={18} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={[styles.addClientButton, { borderColor, borderStyle: 'dashed' }]}
                                onPress={() => setShowClientPicker(true)}
                            >
                                <Plus color={primaryColor} size={20} />
                                <Text style={[styles.addClientText, { color: textColor }]}>Select Client</Text>
                            </TouchableOpacity>
                        )}
                    </Card>

                    {/* Items */}
                    <View style={styles.itemsHeader}>
                        <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 0 }]}>Items</Text>
                        <TouchableOpacity onPress={() => setShowProductPicker(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Plus color={primaryColor} size={16} />
                            <Text style={{ color: primaryColor, fontWeight: '600', marginLeft: 4 }}>Add Item</Text>
                        </TouchableOpacity>
                    </View>

                    <Card style={[styles.card, { padding: 0 }]}>
                        {items.length === 0 ? (
                            <View style={styles.emptyItems}>
                                <Text style={{ color: mutedColor }}>No items added yet</Text>
                                <Button
                                    title="Add from Products"
                                    onPress={() => setShowProductPicker(true)}
                                    variant="outline"
                                    style={{ marginTop: 12, borderWidth: 0 }}
                                />
                            </View>
                        ) : (
                            items.map((item, index) => (
                                <View key={index} style={[styles.itemRow, index < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                                    <View style={styles.itemHeader}>
                                        <TextInput
                                            style={[styles.itemDescInput, { color: textColor }]}
                                            value={item.description}
                                            onChangeText={(text) => handleUpdateItem(index, 'description', text)}
                                            placeholder="Description"
                                            placeholderTextColor={mutedColor}
                                        />
                                        <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                                            <Trash2 color="#ef4444" size={18} />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.itemInputs}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>Qty</Text>
                                            <TextInput
                                                style={[styles.smallInput, { color: textColor, borderColor }]}
                                                value={String(item.quantity || '')}
                                                onChangeText={(text) => handleUpdateItem(index, 'quantity', Number(text))}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                        <View style={{ flex: 2 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>Price</Text>
                                            <TextInput
                                                style={[styles.smallInput, { color: textColor, borderColor }]}
                                                value={String(item.unit_price || '')}
                                                onChangeText={(text) => handleUpdateItem(index, 'unit_price', Number(text))}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor }]}>Rabat %</Text>
                                            <TextInput
                                                style={[styles.smallInput, { color: textColor, borderColor }]}
                                                value={String(item.discount || '')}
                                                onChangeText={(text) => handleUpdateItem(index, 'discount', Number(text))}
                                                keyboardType="numeric"
                                                placeholder="0"
                                                placeholderTextColor={mutedColor}
                                            />
                                        </View>
                                        <View style={{ flex: 2 }}>
                                            <Text style={[styles.inputLabel, { color: mutedColor, textAlign: 'right' }]}>Total</Text>
                                            <Text style={[styles.itemRowTotal, { color: textColor }]}>
                                                {formatCurrency(Number(item.amount) * (1 + (item.tax_rate || 0) / 100))}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ))
                        )}

                        {items.length > 0 && (
                            <View style={[styles.summaryFooter, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f9fafb', borderTopColor: borderColor }]}>
                                <View style={styles.summaryRow}>
                                    <Text style={{ color: mutedColor }}>Subtotal</Text>
                                    <Text style={{ color: textColor, fontWeight: '600' }}>{formatCurrency(totals.subtotal)}</Text>
                                </View>
                                <View style={styles.summaryRow}>
                                    <Text style={{ color: mutedColor }}>Tax</Text>
                                    <Text style={{ color: textColor, fontWeight: '600' }}>{formatCurrency(totals.tax)}</Text>
                                </View>
                                <View style={[styles.summaryRow, { marginTop: 8 }]}>
                                    <Text style={{ color: primaryColor, fontWeight: '600', fontSize: 18 }}>{formatCurrency(totals.total)}</Text>
                                </View>

                                {items.length > 0 && (
                                    <View style={[styles.summaryRow, { marginTop: 12, alignItems: 'center' }]}>
                                        <Text style={{ color: mutedColor }}>Rabat (%)</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#fff', borderRadius: 8, borderWidth: 1, borderColor }}>
                                            <TextInput
                                                value={discount}
                                                onChangeText={(text) => {
                                                    setDiscount(text);
                                                    const newPercent = parseFloat(text) || 0;
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
                                                keyboardType="numeric"
                                                style={{ paddingVertical: 4, paddingHorizontal: 8, color: textColor, fontWeight: '600', minWidth: 60, textAlign: 'right' }}
                                            />
                                            <Text style={{ paddingRight: 8, color: mutedColor }}>%</Text>
                                        </View>
                                    </View>
                                )}
                                {totals.discount > 0 && (
                                    <View style={styles.summaryRow}>
                                        <Text style={{ color: '#ef4444' }}>Discount Amount</Text>
                                        <Text style={{ color: '#ef4444', fontWeight: '600' }}>-{formatCurrency(totals.discount)}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </Card>

                    {/* Payment */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>Payment</Text>
                    <Card style={[styles.card, { marginBottom: 18 }]}>
                        <Text style={{ color: mutedColor, marginBottom: 8 }}>Payment method</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {([
                                ['bank_transfer', 'Bank transfer'],
                                ['cash', 'Cash'],
                                ['card', 'Card'],
                            ] as const).map(([key, label]) => {
                                const cashDisabled = key === 'cash' && calculateTotals().total >= 300;
                                return (
                                <TouchableOpacity
                                    key={key}
                                    disabled={cashDisabled}
                                    onPress={() => setPaymentMethod(key)}
                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: paymentMethod === key ? primaryColor : borderColor, backgroundColor: paymentMethod === key ? primaryColor + '18' : 'transparent', alignItems: 'center', opacity: cashDisabled ? 0.4 : 1 }}
                                >
                                    <Text style={{ color: paymentMethod === key ? primaryColor : mutedColor, fontWeight: '600', fontSize: 12 }}>{label}</Text>
                                </TouchableOpacity>
                                );
                            })}
                        </View>
                        {paymentMethod === 'cash' && (
                            <View style={{ marginTop: 14 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ color: mutedColor, marginBottom: 6 }}>Amount paid (€)</Text>
                                    <TouchableOpacity onPress={() => setAmountReceived(calculateTotals().total.toFixed(2))}>
                                        <Text style={{ color: primaryColor, fontWeight: '700', fontSize: 12 }}>Exact amount</Text>
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    value={amountReceived}
                                    onChangeText={setAmountReceived}
                                    keyboardType="decimal-pad"
                                    placeholder="0.00"
                                    placeholderTextColor={mutedColor}
                                    style={[styles.notesInput, { height: 48, minHeight: 48, color: textColor, borderColor }]}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                                    <Text style={{ color: mutedColor }}>Change</Text>
                                    <Text style={{ color: primaryColor, fontWeight: '700' }}>
                                        {formatCurrency(Math.max(0, (Number(amountReceived) || 0) - calculateTotals().total))}
                                    </Text>
                                </View>
                                <Text style={{ color: mutedColor, fontSize: 11, marginTop: 6 }}>Cash payment is available below €300.</Text>
                            </View>
                        )}
                    </Card>

                    {/* Notes */}
                    <Text style={[styles.sectionTitle, { color: textColor }]}>Notes</Text>
                    <Card style={[styles.card, { marginBottom: 120 }]}>
                        <TextInput
                            style={[styles.notesInput, { color: textColor, borderColor }]}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Add payment terms or notes..."
                            placeholderTextColor={mutedColor}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </Card>

                </ScrollView>
            </KeyboardAvoidingView>}

            {/* Sticky Actions Footer */}
            <View style={[styles.footer, { backgroundColor: isDark ? '#14243A' : '#fff', borderTopColor: borderColor }]}>
                <TouchableOpacity
                    style={[styles.addItemButton, { backgroundColor: primaryColor + '15', borderColor: primaryColor }]}
                    onPress={() => setShowProductPicker(true)}
                >
                    <Plus color={primaryColor} size={20} />
                    <Text style={[styles.addItemText, { color: primaryColor }]}>{t('addItem', language)}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.saveButtonFull, { backgroundColor: primaryColor }]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Save color="#fff" size={20} />
                            <Text style={styles.saveText}>{invoiceId ? 'Update' : 'Create'} {type === 'offer' ? 'Offer' : 'Invoice'}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Preview Modal */}
            <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
                <View style={[styles.previewContainer, { backgroundColor: bgColor }]}>
                    <View style={[styles.previewHeader, { borderBottomColor: borderColor, backgroundColor: cardBg }]}>
                        <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.closePreview}>
                            <X color={textColor} size={24} />
                            <Text style={[styles.closePreviewText, { color: textColor }]}>Close Preview</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.headerSaveButton, { backgroundColor: primaryColor }]}
                            onPress={() => { setShowPreview(false); handleSave(); }}
                        >
                            <Save color="#fff" size={16} />
                            <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Save</Text>
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
            <Modal visible={showClientPicker} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#14243A' : '#fff' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>Select Client</Text>
                            <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={{ padding: 12 }}>
                            <Input
                                placeholder="Search clients..."
                                value={clientSearch}
                                onChangeText={setClientSearch}
                            />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 12 }}>
                            {clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(client => (
                                <TouchableOpacity
                                    key={client.id}
                                    style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                    onPress={() => {
                                        setSelectedClient(client);
                                        // Auto-apply client discount if available
                                        if (client.discount_percent) {
                                            setDiscount(String(client.discount_percent));
                                        } else {
                                            setDiscount('0');
                                        }
                                        setShowClientPicker(false);
                                    }}
                                >
                                    <View style={[styles.modalIcon, { backgroundColor: '#e0e7ff' }]}>
                                        <Text style={{ color: '#4338ca', fontWeight: '600' }}>{client.name.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.modalItemTitle, { color: textColor }]}>{client.name}</Text>
                                        <Text style={{ color: mutedColor, fontSize: 12 }}>{client.email || 'No email'}</Text>
                                    </View>
                                    {selectedClient?.id === client.id && <Check color={primaryColor} size={20} />}
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                style={[styles.modalAddNew, { borderColor: primaryColor }]}
                                onPress={() => {
                                    setShowClientPicker(false);
                                    navigation.navigate('ManagementTab', { screen: 'ClientForm' });
                                }}
                            >
                                <Plus color={primaryColor} size={20} />
                                <Text style={{ color: primaryColor, fontWeight: '600', marginLeft: 8 }}>Create New Client</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Product Picker Modal */}
            <Modal visible={showProductPicker} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)' }]}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#14243A' : '#fff' }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>Add Item</Text>
                            <TouchableOpacity onPress={() => setShowProductPicker(false)}>
                                <Text style={{ color: primaryColor, fontSize: 16 }}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={{ padding: 12 }}>
                            <Input
                                placeholder="Search products..."
                                value={productSearch}
                                onChangeText={setProductSearch}
                            />
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 12 }}>
                            <TouchableOpacity
                                style={[styles.modalItem, { borderBottomColor: borderColor }]}
                                onPress={() => handleAddItem()}
                            >
                                <View style={[styles.modalIcon, { backgroundColor: '#ecfdf5' }]}>
                                    <Plus color="#12B76A" size={20} />
                                </View>
                                <Text style={[styles.modalItemTitle, { color: textColor }]}>Custom Item</Text>
                            </TouchableOpacity>

                            {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(product => (
                                <TouchableOpacity
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
                                            {formatCurrency(Number(product.unit_price) * (1 + (product.tax_rate || 0) / 100))}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {showDatePicker && (
                <DateTimePicker
                    value={datePickerMode === 'issue' ? issueDate : (dueDate || new Date())}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                />
            )}
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

    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 40 },

    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 16 },
    card: { padding: 16, borderRadius: 16, marginBottom: 8 },

    row: { flexDirection: 'row' },
    label: { fontSize: 12, fontWeight: '500', marginBottom: 6 },

    dateButton: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
    dateText: { fontSize: 14, fontWeight: '500' },

    // Client
    selectedClient: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    clientIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    clientName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    clientDetail: { fontSize: 13 },
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

    // Modals
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '80%', paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: '700' },
    modalItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, borderBottomWidth: 1 },
    modalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    modalItemTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
    modalAddNew: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 12, borderWidth: 1, borderRadius: 12, borderStyle: 'dashed' },

    // Footer & Preview
    footer: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        borderTopWidth: 1,
        gap: 12,
        backgroundColor: '#fff',
    },
    previewButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: 'transparent',
        gap: 8,
    },
    previewText: { fontSize: 16, fontWeight: '600' },
    saveButtonFull: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
        borderRadius: 16,
        gap: 8,
    },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },

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
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 54,
        borderRadius: 16,
        borderWidth: 1,
        gap: 8,
    },
    addItemText: { fontSize: 16, fontWeight: '600' }
});


