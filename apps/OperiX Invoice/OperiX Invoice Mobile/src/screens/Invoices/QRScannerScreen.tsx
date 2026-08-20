import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Flashlight, QrCode } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Button } from '@invoice-monorepo/ui';
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import { t } from '@invoice-monorepo/i18n';

interface QRScannerScreenProps {
    navigation: any;
    route: any;
}

export function QRScannerScreen({ navigation, route }: QRScannerScreenProps) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [torchOn, setTorchOn] = useState(false);

    const mode = route.params?.mode || 'invoice'; // 'invoice' or 'generic'

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';

    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);

        if (mode === 'generic') {
            const returnTo = route.params?.returnTo;
            if (returnTo === 'ProductForm') {
                navigation.navigate('MainTabs', {
                    screen: 'Management',
                    params: {
                        screen: 'ProductForm',
                        params: {
                            scannedSKU: data,
                            restoredData: route.params?.currentData
                        },
                        merge: true,
                    },
                    merge: true,
                });
            } else {
                navigation.navigate(returnTo || 'MainTabs', {
                    scannedSKU: data,
                    restoredData: route.params?.currentData,
                    merge: true
                });
            }
            return;
        }

        const scannedValue = data.trim();
        if (mode === 'search') {
            const returnTo = route.params?.returnTo;
            if (returnTo === 'Business' || returnTo === 'GlobalSearch') {
                navigation.navigate(returnTo === 'Business' ? 'MainTabs' : 'GlobalSearch', returnTo === 'Business'
                    ? { screen: 'Business', params: { businessSearch: scannedValue }, merge: true }
                    : { scannedSearch: scannedValue });
                return;
            }
            if (returnTo !== 'POS' && user) {
                const decodedValue = (() => {
                    try { return decodeURIComponent(scannedValue); } catch { return scannedValue; }
                })();
                const qrToken = decodedValue.match(/\/qr\/([^/?#]+)/i)?.[1];
                const invoiceNumber = decodedValue.replace(/^INVOICE:/i, '').trim();
                const decodedToken = (() => {
                    try { return qrToken ? decodeURIComponent(qrToken) : ''; } catch { return qrToken || ''; }
                })();
                try {
                    const { companyIds } = await getWorkspaceScope(user.id);
                    const baseInvoiceQuery = () => supabase
                        .from('invoices')
                        .select('id')
                        .or(scopedResource(user.id, companyIds));
                    let invoice: { id: string } | null = null;
                    if (decodedToken) {
                        const tokenResult = await baseInvoiceQuery().eq('public_qr_token', decodedToken).maybeSingle();
                        invoice = tokenResult.data;
                    }
                    if (!invoice) {
                        const numberResult = await baseInvoiceQuery()
                            .eq('invoice_number', decodedToken || invoiceNumber)
                            .maybeSingle();
                        invoice = numberResult.data;
                    }
                    if (invoice) {
                        navigation.navigate('InvoiceDetail', { invoiceId: invoice.id });
                    } else {
                        Alert.alert(t('notFound', language), [t('invoice', language), invoiceNumber || decodedToken || decodedValue, t('notFoundLower', language)].join(' '), [
                            { text: t('scanAgain', language), onPress: () => setScanned(false) },
                        ]);
                    }
                } catch (lookupError) {
                    console.error('Invoice barcode lookup error:', lookupError);
                    Alert.alert(t('notFound', language), [t('invoice', language), t('notFoundLower', language)].join(' '), [
                        { text: t('scanAgain', language), onPress: () => setScanned(false) },
                    ]);
                }
                return;
            }
            navigation.navigate('MainTabs', {
                screen: returnTo === 'POS' ? 'POS' : 'Sales',
                params: { [returnTo === 'POS' ? 'barcodeSearch' : 'invoiceSearch']: scannedValue },
                merge: true,
            });
            return;
        }
        if (scannedValue.startsWith('EXPENSE:')) {
            const expenseId = scannedValue.replace(/^EXPENSE:/, '').trim();
            if (!user || !expenseId) {
                Alert.alert(t('invalidQrCode', language), t('notValidInvoiceQr', language), [
                    { text: t('scanAgain', language), onPress: () => setScanned(false) },
                ]);
                return;
            }

            const { companyIds } = await getWorkspaceScope(user.id);
            const { data: expense } = await supabase
                .from('expenses')
                .select('id')
                .or(scopedResource(user.id, companyIds))
                .eq('id', expenseId)
                .maybeSingle();
            if (expense) {
                navigation.navigate('ExpenseForm', { expenseId: expense.id });
                return;
            }

            Alert.alert(t('notFound', language), `${t('expense', language)} ${t('notFoundLower', language)}`, [
                { text: t('scanAgain', language), onPress: () => setScanned(false) },
            ]);
            return;
        }

        if (scannedValue.startsWith('PAYMENT:')) {
            const paymentNumber = scannedValue.replace(/^PAYMENT:/, '').trim();
            if (!user || !paymentNumber) {
                Alert.alert(t('invalidQrCode', language), t('notValidInvoiceQr', language), [
                    { text: t('scanAgain', language), onPress: () => setScanned(false) },
                ]);
                return;
            }

            const { companyIds } = await getWorkspaceScope(user.id);
            const { data: customerPayment } = await supabase
                .from('payments')
                .select('id')
                .or(scopedResource(user.id, companyIds))
                .eq('payment_number', paymentNumber)
                .maybeSingle();
            if (customerPayment) {
                navigation.navigate('PaymentForm', { paymentId: customerPayment.id });
                return;
            }

            const { data: vendorPayment } = await supabase
                .from('vendor_payments')
                .select('id')
                .or(scopedResource(user.id, companyIds))
                .eq('payment_number', paymentNumber)
                .maybeSingle();
            if (vendorPayment) {
                navigation.navigate('VendorPaymentForm', { paymentId: vendorPayment.id });
                return;
            }

            Alert.alert(t('notFound', language), `${t('payment', language)} ${paymentNumber} ${t('notFoundLower', language)}`, [
                { text: t('scanAgain', language), onPress: () => setScanned(false) },
            ]);
            return;
        }

        // Invoice QR codes use the INVOICE: prefix; printed invoice Code 128
        // barcodes contain the invoice number directly.
        const invoiceNumber = scannedValue.startsWith('INVOICE:') ? scannedValue.replace('INVOICE:', '') : scannedValue;
        if (invoiceNumber) {

            // Find invoice by number
            if (!user) return;
            const { companyIds } = await getWorkspaceScope(user.id);
            const { data: invoice, error } = await supabase
                .from('invoices')
                .select('id')
                .or(scopedResource(user.id, companyIds))
                .eq('invoice_number', invoiceNumber)
                .single();

            if (invoice) {
                navigation.navigate('MainTabs', {
                    screen: 'InvoicesTab',
                    params: {
                        screen: 'InvoiceDetail',
                        params: { invoiceId: invoice.id }
                    }
                });
            } else {
                Alert.alert(t('notFound', language), `${t('invoice', language)} ${invoiceNumber} ${t('notFoundLower', language)}`, [
                    { text: t('scanAgain', language), onPress: () => setScanned(false) },
                ]);
            }
        } else {
            Alert.alert(t('invalidQrCode', language), t('notValidInvoiceQr', language), [
                { text: t('scanAgain', language), onPress: () => setScanned(false) },
            ]);
        }
    };

    if (!permission) {
        return (
            <View style={[styles.container, { backgroundColor: bgColor }]}>
                <Text style={[styles.text, { color: textColor }]}>{t('requestingCameraPermission', language)}</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, { backgroundColor: bgColor }]}>
                <View style={styles.permissionBox}>
                    <View style={[styles.iconContainer, { backgroundColor: `${primaryColor}15` }]}>
                        <QrCode color={primaryColor} size={64} />
                    </View>
                    <Text style={[styles.title, { color: textColor }]}>{t('cameraAccessNeeded', language)}</Text>
                    <Text style={[styles.text, { color: mutedColor }]}>
                        {t('cameraScanDescription', language)}
                    </Text>
                    <Button title={t('grantPermission', language)} onPress={requestPermission} style={styles.button} />
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Text style={[styles.cancelText, { color: primaryColor }]}>{t('cancel', language)}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFillObject}
                enableTorch={torchOn}
                barcodeScannerSettings={{
                    barcodeTypes: mode === 'invoice' ? ['qr', 'code128', 'code39'] : ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e']
                }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />
            <View style={styles.overlay}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ArrowLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{mode === 'invoice' ? t('scanInvoiceQr', language) : t('scanBarcode', language)}</Text>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Toggle flashlight"
                        accessibilityState={{ checked: torchOn }}
                        onPress={() => setTorchOn((current) => !current)}
                        style={[styles.backButton, torchOn && { backgroundColor: primaryColor }]}
                    >
                        <Flashlight color="#fff" size={22} />
                    </TouchableOpacity>
                </View>
                <View style={styles.scanArea}>
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.cornerTL, { borderColor: primaryColor }]} />
                        <View style={[styles.corner, styles.cornerTR, { borderColor: primaryColor }]} />
                        <View style={[styles.corner, styles.cornerBL, { borderColor: primaryColor }]} />
                        <View style={[styles.corner, styles.cornerBR, { borderColor: primaryColor }]} />
                    </View>
                </View>
                <View style={styles.footer}>
                    <Text style={styles.instruction}>
                        {t('scanInstruction', language)}
                    </Text>
                    {scanned && (
                        <TouchableOpacity
                            style={[styles.rescanButton, { backgroundColor: primaryColor }]}
                            onPress={() => setScanned(false)}
                        >
                            <Text style={styles.rescanText}>{t('scanAgain', language)}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    // Permission
    permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    iconContainer: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    title: { fontSize: 24, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
    text: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
    button: { width: '100%', minHeight: 50 },
    cancelText: { marginTop: 24, fontSize: 16, fontWeight: '600' },

    // Camera Overlay
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
    backButton: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },
    headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

    scanArea: { alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 280, height: 280, position: 'relative' },
    corner: { position: 'absolute', width: 40, height: 40, borderWidth: 4, borderRadius: 2 },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

    footer: { alignItems: 'center', paddingBottom: 80, paddingHorizontal: 32 },
    instruction: { color: 'rgba(255,255,255,0.9)', fontSize: 16, textAlign: 'center', fontWeight: '500' },
    rescanButton: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
    rescanText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
