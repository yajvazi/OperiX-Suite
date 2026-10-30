import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adminDeleteInvoice, supabase } from '@invoice-monorepo/api';
import { useTheme } from '@invoice-monorepo/hooks';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { getPalette } from '../../theme/brand';

/**
 * Company administrators only: deletes an invoice that was already posted. A written reason is required; the
 * database reverses the accounting entries and keeps an audit record.
 */
export function AdminDeleteInvoiceModal({ invoiceId, invoiceNumber, onClose, onDeleted }: {
    invoiceId: string | null;
    invoiceNumber?: string | null;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (invoiceId) { setReason(''); setError(''); setBusy(false); } }, [invoiceId]);

    const submit = async () => {
        if (!invoiceId) return;
        if (reason.trim().length < 3) { setError(t('adminDeleteReasonRequired', language)); return; }
        setBusy(true);
        setError('');
        try {
            await adminDeleteInvoice(supabase, invoiceId, reason.trim());
            onDeleted();
        } catch (caught) {
            setError(getLocalizedErrorMessage(caught, language, 'failedToDeleteInvoice'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal visible={Boolean(invoiceId)} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.title, { color: palette.text }]}>{t('adminDeletePostedTitle', language)}{invoiceNumber ? ` · ${invoiceNumber}` : ''}</Text>
                    <Text style={[styles.message, { color: palette.muted }]}>{t('adminDeletePostedMessage', language)}</Text>
                    <Text style={[styles.label, { color: palette.text }]}>{t('adminDeleteReasonLabel', language)}</Text>
                    <TextInput
                        testID="invoice-delete-reason-input"
                        value={reason}
                        onChangeText={setReason}
                        placeholder={t('adminDeleteReasonPlaceholder', language)}
                        placeholderTextColor={palette.muted}
                        multiline
                        style={[styles.input, { borderColor: palette.border, color: palette.text }]}
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <View style={styles.row}>
                        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.button, { borderColor: palette.border, borderWidth: 1 }]}>
                            <Text style={{ color: palette.text, fontWeight: '700' }}>{t('cancel', language)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity testID="invoice-delete-confirm-button" accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.button, { backgroundColor: '#B42318', opacity: busy ? 0.6 : 1 }]}>
                            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{t('adminDeleteAction', language)}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(8,16,32,0.55)' },
    sheet: { padding: 20, borderRadius: 20, borderWidth: 1 },
    title: { fontSize: 17, fontWeight: '900' },
    message: { marginTop: 8, fontSize: 12, lineHeight: 18 },
    label: { marginTop: 14, fontSize: 12, fontWeight: '700' },
    input: { minHeight: 72, marginTop: 8, padding: 12, borderWidth: 1, borderRadius: 12, textAlignVertical: 'top' },
    error: { marginTop: 8, color: '#B42318', fontSize: 12, lineHeight: 17 },
    row: { flexDirection: 'row', gap: 10, marginTop: 16 },
    button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
});
