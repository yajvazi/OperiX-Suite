import React, { useEffect, useState } from 'react';
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
import { ArrowLeft, Tag, DollarSign, Calendar, FileText, Camera, ArrowDown, ArrowUp } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';
import { ExpenseCategory } from '@invoice-monorepo/types';
import { shareTransactionPdf } from '../../services/pdf/transactionPdf';

export function ExpenseFormScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const expenseId = route.params?.expenseId;
    const isEditing = !!expenseId;

    const [formData, setFormData] = useState({
        amount: '',
        category: 'Other',
        description: '',
        date: new Date().toISOString().split('T')[0],
        receipt_url: '',
        type: 'expense' as 'expense' | 'income',
    });
    const [loading, setLoading] = useState(false);
    const [showCategories, setShowCategories] = useState(false);

    const defaultCategories = ['Travel', 'Supplies', 'Marketing', 'Software', 'Rent', 'Utilities', 'Other'];
    const incomeCategories = ['Sales', 'Refund', 'Grant', 'Investment', 'Other'];

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const mutedColor = isDark ? '#98A2B3' : '#667085';

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
                // If the AI returns a vendor name, we can put it in description for now or match it if we had a vendor field
                description: scan.vendor_name ? `From ${scan.vendor_name}` : '',
                type: 'expense'
            }));
        }
        fetchCategories();
    }, [expenseId, route.params?.scannedData]);

    const fetchCategories = async () => {
        // Fetch distinct categories from database
        const { data } = await supabase.from('expenses').select('category');
        if (data) {
            const unique = Array.from(new Set(data.map((item: any) => item.category).filter(Boolean)));
            setDynamicCategories(unique as string[]);
        }
    };

    const fetchExpense = async () => {
        const { data } = await supabase.from('expenses').select('*').eq('id', expenseId).single();
        if (data) {
            setFormData({
                amount: String(data.amount),
                category: data.category,
                description: data.description || '',
                date: data.date,
                receipt_url: data.receipt_url || '',
                type: data.type || 'expense',
            });
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

    const handleSave = async () => {
        if (!formData.amount || Number(formData.amount) <= 0) {
            Alert.alert('Error', 'Please enter a valid amount');
            return;
        }

        setLoading(true);
        try {
            const dataToSave = {
                ...formData,
                amount: Number(formData.amount),
                user_id: user?.id,
            };

            if (isEditing) {
                const { error } = await supabase.from('expenses').update(dataToSave).eq('id', expenseId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('expenses').insert(dataToSave);
                if (error) throw error;
                try {
                    await shareTransactionPdf({ title: formData.type === 'income' ? 'Income receipt' : 'Expense receipt', amount: Number(formData.amount), date: formData.date, description: formData.description, category: formData.category });
                } catch (pdfError) {
                    console.error('Record saved, PDF generation failed:', pdfError);
                    Alert.alert('Record saved', 'The record was saved, but the PDF could not be generated.');
                }
            }
            navigation.goBack();
        } catch (error) {
            Alert.alert('Error', 'Failed to save expense');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {isEditing ? (t('edit', language) || 'Edit') + ' ' + (t('expense', language) || 'Expense') : (t('createNew', language) || 'New') + ' ' + (t('expense', language) || 'Expense')}
                </Text>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                {/* Card 1: Details */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <FileText color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Transaction Details</Text>
                    </View>

                    <Input
                        label="Date"
                        value={formData.date}
                        onChangeText={(text) => setFormData({ ...formData, date: text })}
                        placeholder="YYYY-MM-DD"
                    />

                    <Input
                        label="Description"
                        value={formData.description}
                        onChangeText={(text) => setFormData({ ...formData, description: text })}
                        placeholder="What was this for?"
                        multiline
                    />
                </Card>

                {/* Card 2: Amount & Type */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <DollarSign color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Amount & Type</Text>
                    </View>

                    <View style={styles.typeToggle}>
                        <TouchableOpacity
                            style={[styles.typeOption, formData.type === 'expense' && { backgroundColor: '#ef4444' }]}
                            onPress={() => setFormData({ ...formData, type: 'expense' })}
                        >
                            <ArrowUp color={formData.type === 'expense' ? '#fff' : mutedColor} size={20} />
                            <Text style={[styles.typeText, { color: formData.type === 'expense' ? '#fff' : mutedColor }]}>Expense</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.typeOption, formData.type === 'income' && { backgroundColor: '#12B76A' }]}
                            onPress={() => setFormData({ ...formData, type: 'income' })}
                        >
                            <ArrowDown color={formData.type === 'income' ? '#fff' : mutedColor} size={20} />
                            <Text style={[styles.typeText, { color: formData.type === 'income' ? '#fff' : mutedColor }]}>Income</Text>
                        </TouchableOpacity>
                    </View>

                    <Input
                        label="Amount *"
                        value={formData.amount}
                        onChangeText={(text) => setFormData({ ...formData, amount: text })}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                    />

                    <Text style={[styles.label, { color: textColor }]}>Category</Text>
                    <Input
                        value={formData.category}
                        onChangeText={(text) => setFormData({ ...formData, category: text })}
                        placeholder="Type category"
                    />

                    <View style={styles.categoryGrid}>
                        {Array.from(new Set([...(formData.type === 'expense' ? defaultCategories : incomeCategories), ...dynamicCategories]))
                            .slice(0, 12)
                            .map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[
                                        styles.categoryOption,
                                        { backgroundColor: isDark ? '#263A55' : '#F4F7FB' },
                                        formData.category === cat && (formData.type === 'expense' ? styles.activeCategoryExpense : styles.activeCategoryIncome)
                                    ]}
                                    onPress={() => setFormData({ ...formData, category: cat })}
                                >
                                    <Text style={[
                                        styles.categoryText,
                                        { color: isDark ? '#98A2B3' : '#667085' },
                                        formData.category === cat && styles.activeCategoryText
                                    ]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                    </View>
                </Card>

                {/* Card 3: Receipt */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Camera color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>Receipt / Proof</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.receiptUpload, { backgroundColor: isDark ? '#263A55' : '#F4F7FB' }]}
                        onPress={pickImage}
                    >
                        {formData.receipt_url ? (
                            <Text style={{ color: '#12B76A', fontWeight: '600' }}>✓ Receipt Uploaded</Text>
                        ) : (
                            <>
                                <Camera color={isDark ? '#98A2B3' : '#667085'} size={32} />
                                <Text style={[styles.uploadText, { color: isDark ? '#98A2B3' : '#667085' }]}>Capture or attach receipt</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </Card>

                <Button
                    title={isEditing ? 'Update Expense' : 'Log Expense'}
                    onPress={handleSave}
                    loading={loading}
                    variant="primary"
                    style={styles.saveButton}
                />
            </ScrollView>
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
    typeToggle: { flexDirection: 'row', marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4 },
    typeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10 },
    typeText: { fontWeight: 'bold' },
});





