import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Eye, Mail, Printer, Share2, X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { t, type AppLocale } from '@invoice-monorepo/i18n';

type ActionProps = {
    primaryColor: string;
    language: AppLocale;
    onPreview: () => void;
    onPrint: () => void;
    onEmail: () => void;
    onShare: () => void;
};

export function TransactionDocumentActions({ primaryColor, language, onPreview, onPrint, onEmail, onShare }: ActionProps) {
    const actions = [
        { testID: 'transaction-preview-button', label: t('preview', language), icon: Eye, onPress: onPreview },
        { testID: 'transaction-print-button', label: t('print', language), icon: Printer, onPress: onPrint },
        { testID: 'transaction-email-button', label: t('email', language), icon: Mail, onPress: onEmail },
        { testID: 'transaction-share-button', label: t('share', language), icon: Share2, onPress: onShare },
    ];

    return (
        <View style={styles.grid}>
            {actions.map(({ testID, label, icon: Icon, onPress }) => (
                <TouchableOpacity
                    key={testID}
                    testID={testID}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={onPress}
                    style={[styles.button, { backgroundColor: primaryColor, borderColor: primaryColor }]}
                >
                    <Icon color="#fff" size={17} />
                    <Text style={styles.buttonText}>{label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

type PreviewProps = {
    visible: boolean;
    html: string;
    title: string;
    language: AppLocale;
    textColor: string;
    bgColor: string;
    primaryColor: string;
    onClose: () => void;
    onPrint: () => void;
};

export function TransactionPreviewModal({ visible, html, title, language, textColor, bgColor, primaryColor, onClose, onPrint }: PreviewProps) {
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[styles.preview, { backgroundColor: bgColor }]}>
                <View style={styles.previewHeader}>
                    <TouchableOpacity testID="transaction-preview-close-button" accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={onClose}>
                        <X color={textColor} size={23} />
                    </TouchableOpacity>
                    <Text style={[styles.previewTitle, { color: textColor }]}>{title}</Text>
                    <TouchableOpacity testID="transaction-preview-print-button" accessibilityRole="button" accessibilityLabel={t('print', language)} onPress={onPrint}>
                        <Printer color={primaryColor} size={22} />
                    </TouchableOpacity>
                </View>
                <WebView
                    testID="transaction-preview-webview"
                    source={{ html }}
                    style={styles.webview}
                    originWhitelist={['*']}
                    // Use the same fixed desktop/A4 layout as expo-print instead of
                    // letting the WebView reflow the document for the phone screen.
                    contentMode="desktop"
                    scalesPageToFit
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    button: { minHeight: 46, width: '48%', borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    buttonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    preview: { flex: 1 },
    previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    previewTitle: { fontSize: 18, fontWeight: '600' },
    webview: { flex: 1 },
});
