import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { QrCode, Server, X } from 'lucide-react-native';
import { parseConnectCode, type ServerConfig } from '@invoice-monorepo/api';
import { useTheme } from '@invoice-monorepo/hooks';
import { PlaceholderInput } from './PlaceholderInput';
import { BarcodeScannerModal } from '../mobile/BarcodeScannerModal';
import { brand, getPalette } from '../../theme/brand';
import { connectToServer, disconnectServer, getConnectedServer, lookUpServer } from '../../services/serverConnection';
import { ModalBackdrop } from '../mobile/ModalBackdrop';

const copy = {
    en: {
        title: 'Connect to your own server',
        intro: 'Running OperiX on your own server? Scan the QR code shown in the web app under Settings → Mobile app, or type the web address, then sign in with your account.',
        address: 'Server address',
        placeholder: 'https://invoices.yourcompany.com',
        scan: 'Scan QR code',
        connect: 'Connect',
        confirm: 'Connect to this server?',
        confirmText: 'You will sign in with an account on',
        use: 'Use this server',
        back: 'Back',
        connected: 'Connected to',
        cloud: 'Switch back to OperiX Cloud',
        invalidQr: 'That QR code is not an OperiX server code.',
        close: 'Close',
    },
    sq: {
        title: 'Lidhu me serverin tënd',
        intro: 'E ekzekuton OperiX në serverin tënd? Skano kodin QR në aplikacionin web te Cilësimet → Aplikacioni mobil, ose shkruaj adresën e uebit, pastaj hyr me llogarinë tënde.',
        address: 'Adresa e serverit',
        placeholder: 'https://faturat.kompania-juaj.com',
        scan: 'Skano kodin QR',
        connect: 'Lidhu',
        confirm: 'Të lidhesh me këtë server?',
        confirmText: 'Do të hysh me një llogari në',
        use: 'Përdor këtë server',
        back: 'Kthehu',
        connected: 'I lidhur me',
        cloud: 'Kthehu te OperiX Cloud',
        invalidQr: 'Ky kod QR nuk është kod serveri OperiX.',
        close: 'Mbyll',
    },
} as const;

export function useServerCopy() {
    const { language } = useTheme();
    return language === 'sq' ? copy.sq : copy.en;
}

/** Lets someone running OperiX on their own server point the app at it (QR code or typed address). */
export function ServerConnectModal({ visible, initialAddress, onClose }: { visible: boolean; initialAddress?: string; onClose: () => void }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getPalette(isDark);
    const text = useServerCopy();
    const [address, setAddress] = useState('');
    const [found, setFound] = useState<ServerConfig | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);

    const search = async (value: string) => {
        setBusy(true);
        setError('');
        try { setFound(await lookUpServer(value)); }
        catch (lookupError) { setError((lookupError as Error).message); }
        finally { setBusy(false); }
    };

    useEffect(() => {
        if (!visible) return;
        setFound(null);
        setError('');
        setAddress(initialAddress || '');
        if (initialAddress) void search(initialAddress);
    }, [visible, initialAddress]);

    const confirm = async () => {
        if (!found) return;
        setBusy(true);
        await connectToServer(found);
        setBusy(false);
        onClose();
    };

    return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><ModalBackdrop onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.header}>
                    <Server color={primaryColor} size={20} />
                    <Text style={[styles.title, { color: palette.text }]}>{text.title}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={text.close} onPress={onClose}><X color={palette.muted} size={22} /></TouchableOpacity>
                </View>
                {found ? <>
                    <Text style={[styles.confirmTitle, { color: palette.text }]}>{text.confirm}</Text>
                    <Text style={[styles.intro, { color: palette.muted }]}>{text.confirmText}</Text>
                    <View style={[styles.serverBox, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
                        <Text style={[styles.serverName, { color: palette.text }]}>{found.name}</Text>
                        <Text style={{ color: palette.muted, fontSize: 12 }}>{found.webUrl}</Text>
                    </View>
                    <TouchableOpacity testID="server-use" accessibilityRole="button" style={[styles.primary, { backgroundColor: primaryColor }]} onPress={confirm} disabled={busy}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{text.use}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => setFound(null)}><Text style={{ color: primaryColor, fontWeight: '700' }}>{text.back}</Text></TouchableOpacity>
                </> : <>
                    <Text style={[styles.intro, { color: palette.muted }]}>{text.intro}</Text>
                    <TouchableOpacity testID="server-scan" accessibilityRole="button" style={[styles.primary, { backgroundColor: primaryColor }]} onPress={() => setScanning(true)}>
                        <QrCode color="#fff" size={18} /><Text style={styles.primaryText}>{text.scan}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.label, { color: palette.textSecondary }]}>{text.address}</Text>
                    <PlaceholderInput testID="server-address" style={[styles.input, { borderColor: palette.border, color: palette.text }]} value={address} onChangeText={setAddress} placeholder={text.placeholder} placeholderTextColor={palette.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <TouchableOpacity testID="server-connect" accessibilityRole="button" style={[styles.outline, { borderColor: primaryColor }, busy && { opacity: 0.6 }]} onPress={() => search(address)} disabled={busy || !address.trim()}>
                        {busy ? <ActivityIndicator color={primaryColor} /> : <Text style={{ color: primaryColor, fontWeight: '800' }}>{text.connect}</Text>}
                    </TouchableOpacity>
                </>}
            </View>
        </KeyboardAvoidingView>
        <BarcodeScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={(code) => {
            setScanning(false);
            const parsed = parseConnectCode(code);
            if (!parsed) { setError(text.invalidQr); return; }
            setAddress(parsed);
            void search(parsed);
        }} />
    </Modal>;
}

/** Small status line for the sign-in screen: which server the app talks to, with a way back to the cloud. */
export function ServerStatus({ version, onChange }: { version: number; onChange: () => void }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getPalette(isDark);
    const text = useServerCopy();
    const server = getConnectedServer();
    void version;
    if (!server) return null;
    return <View style={[styles.status, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
        <Text style={{ color: palette.text, fontSize: 12 }}>{text.connected} <Text style={{ fontWeight: '800' }}>{server.name}</Text></Text>
        <TouchableOpacity accessibilityRole="button" onPress={async () => { await disconnectServer(); onChange(); }}><Text style={{ color: primaryColor, fontSize: 12, fontWeight: '800' }}>{text.cloud}</Text></TouchableOpacity>
    </View>;
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,16,32,0.55)' },
    sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    title: { flex: 1, fontSize: 18, fontWeight: '900' },
    intro: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
    label: { marginTop: 14, marginBottom: 7, fontSize: 12, fontWeight: '700' },
    input: { height: 48, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, fontSize: 14 },
    error: { marginTop: 8, color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    primary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13 },
    primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    outline: { minHeight: 48, marginTop: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 13 },
    secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    confirmTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    serverBox: { padding: 14, marginBottom: 14, borderWidth: 1, borderRadius: 12, gap: 3 },
    serverName: { fontSize: 15, fontWeight: '800' },
    status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, padding: 10, borderWidth: 1, borderRadius: 12 },
});
