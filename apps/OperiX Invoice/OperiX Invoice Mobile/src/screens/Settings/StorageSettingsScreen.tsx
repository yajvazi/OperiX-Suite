import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Cloud, Download, HardDrive, Upload } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { copyMasterData, type BackupFile, type StorageMode, type TransferResult } from '@invoice-monorepo/data-store';
import { brand, getPalette } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { getCloudStore, getLocalStore, getStorageMode, setStorageMode } from '../../services/dataStore';
import { PaywallView } from '../../components/billing/PaywallView';
import { checkWorkspacePaywall, type WorkspacePaywall } from '../../services/paywall';

/**
 * Where business data lives. "On this device" is free and keeps everything in a database on the phone;
 * "OperiX cloud" is the shared database used by web, teams and backups.
 */
export function StorageSettingsScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const sq = language === 'sq';
    const [mode, setMode] = useState<StorageMode | null>(null);
    const [busy, setBusy] = useState(false);
    const [deviceCode, setDeviceCode] = useState('');
    const [message, setMessage] = useState('');
    const [paywall, setPaywall] = useState<WorkspacePaywall | null>(null);

    const load = useCallback(async () => {
        const current = await getStorageMode();
        setMode(current);
        if (current === 'local') {
            try { setDeviceCode((await getLocalStore()).deviceCode); } catch { setDeviceCode(''); }
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    async function choose(next: StorageMode) {
        if (next === mode) return;
        const proceed = () => { void setStorageMode(next).then(load); };
        // OperiX Cloud is a paid service on the hosted app: offer the subscription before switching to it.
        if (next === 'cloud' && user?.id) {
            setBusy(true);
            const required = await checkWorkspacePaywall(user.id, { evenIfOnDevice: true });
            setBusy(false);
            if (required) { setPaywall(required); return; }
        }
        if (next === 'local') {
            Alert.alert(
                sq ? 'Ruaj në këtë pajisje' : 'Store data on this device',
                sq
                    ? 'Të dhënat e reja do të ruhen vetëm në këtë telefon. Të dhënat ekzistuese në cloud nuk fshihen, por nuk shfaqen këtu. Pa kopje rezervë, humbja e telefonit nënkupton humbjen e të dhënave.'
                    : 'New data will be stored only on this phone. Your existing cloud data is not deleted, but it is not shown here. Without a backup, losing the phone means losing the data.',
                [{ text: sq ? 'Anulo' : 'Cancel', style: 'cancel' }, { text: sq ? 'Vazhdo' : 'Continue', onPress: proceed }],
            );
        } else proceed();
    }

    async function exportBackup() {
        setBusy(true); setMessage('');
        try {
            const file = await (await getLocalStore()).exportBackup();
            const folder = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
            const uri = `${folder}operix-backup-${new Date().toISOString().slice(0, 10)}.json`;
            await FileSystem.writeAsStringAsync(uri, JSON.stringify(file));
            if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable on this device.');
            await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: sq ? 'Ruaj kopjen rezervë' : 'Save your backup' });
            setMessage(sq ? 'Kopja rezervë u krijua.' : 'Backup created. Keep it somewhere safe.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The backup could not be created.');
        } finally { setBusy(false); }
    }

    async function importBackup() {
        setBusy(true); setMessage('');
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
            if (picked.canceled || !picked.assets?.[0]?.uri) return;
            const file = JSON.parse(await FileSystem.readAsStringAsync(picked.assets[0].uri)) as BackupFile;
            const result = await (await getLocalStore()).importBackup(file);
            setMessage(sq
                ? `U importua: ${result.inserted} të reja, ${result.updated} të përditësuara, ${result.skipped} të anashkaluara.`
                : `Imported: ${result.inserted} new, ${result.updated} updated, ${result.skipped} skipped.`);
        } catch (error) {
            setMessage(error instanceof SyntaxError ? 'This file is not an OperiX backup.' : error instanceof Error ? error.message : 'The backup could not be imported.');
        } finally { setBusy(false); }
    }

    function summarize(result: TransferResult) {
        const copied = result.copied.clients + result.copied.products + result.copied.vendors;
        const skipped = result.skipped.clients + result.skipped.products + result.skipped.vendors;
        const base = sq
            ? `U kopjuan ${copied} regjistrime (${result.copied.clients} klientë, ${result.copied.products} produkte, ${result.copied.vendors} furnitorë). ${skipped} ekzistonin tashmë.`
            : `Copied ${copied} records (${result.copied.clients} customers, ${result.copied.products} products, ${result.copied.vendors} suppliers). ${skipped} already existed.`;
        return result.failed.length ? `${base} ${sq ? 'Dështuan' : 'Failed'}: ${result.failed.length} (${result.failed[0].name}: ${result.failed[0].message})` : base;
    }

    async function transfer(direction: 'toCloud' | 'toDevice') {
        if (!user) return;
        setBusy(true); setMessage('');
        try {
            const cloud = await getCloudStore(user.id);
            const device = await getLocalStore();
            const result = direction === 'toCloud' ? await copyMasterData(device, cloud) : await copyMasterData(cloud, device);
            setMessage(summarize(result));
        } catch (error) {
            setMessage(error instanceof Error ? error.message : (sq ? 'Kopjimi dështoi.' : 'The copy failed.'));
        } finally { setBusy(false); }
    }

    function confirmTransfer(direction: 'toCloud' | 'toDevice') {
        Alert.alert(
            direction === 'toCloud' ? (sq ? 'Kopjo në cloud' : 'Copy to the cloud') : (sq ? 'Kopjo në pajisje' : 'Copy to this device'),
            direction === 'toCloud'
                ? (sq ? 'Klientët, produktet dhe furnitorët nga ky telefon kopjohen në llogarinë tuaj cloud. Ekzistuesit anashkalohen. Faturat dhe pagesat nuk kopjohen; përdorni kopjen rezervë për to.' : 'Customers, products and suppliers on this phone are copied to your cloud account. Existing ones are skipped. Invoices and payments are not copied; use the backup file for them.')
                : (sq ? 'Klientët, produktet dhe furnitorët nga cloud kopjohen në këtë telefon. Ekzistuesit anashkalohen. Faturat dhe pagesat nuk kopjohen.' : 'Customers, products and suppliers from the cloud are copied to this phone. Existing ones are skipped. Invoices and payments are not copied.'),
            [{ text: sq ? 'Anulo' : 'Cancel', style: 'cancel' }, { text: sq ? 'Kopjo' : 'Copy', onPress: () => void transfer(direction) }],
        );
    }

    const option = (value: StorageMode, title: string, text: string, Icon: typeof Cloud) => <TouchableOpacity
        key={value} accessibilityRole="radio" accessibilityState={{ selected: mode === value }} onPress={() => void choose(value)} testID={`storage-mode-${value}`}
        style={[styles.card, { backgroundColor: palette.surface, borderColor: mode === value ? primaryColor : palette.border, borderWidth: mode === value ? 2 : 1 }]}>
        <View style={[styles.iconBox, { backgroundColor: palette.iconSurface }]}><Icon color={primaryColor} size={20} /></View>
        <View style={styles.copy}><Text style={[styles.title, { color: palette.text }]}>{title}</Text><Text style={[styles.text, { color: palette.muted }]}>{text}</Text></View>
    </TouchableOpacity>;

    return <MobileScreen testID="storage-settings-screen">
        <MobileHeader title={sq ? 'Ruajtja e të dhënave' : 'Data storage'} subtitle={sq ? 'Ku ruhen të dhënat e biznesit' : 'Where your business data lives'} onBack={() => navigation.goBack()} />
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
            {mode === null ? <ActivityIndicator color={primaryColor} /> : <>
                {option('local', sq ? 'Në këtë pajisje (falas)' : 'On this device (free)', sq ? 'Të gjitha të dhënat ruhen në telefon. Funksionon pa internet. Pa kopje rezervë në cloud.' : 'Everything is stored on the phone and works offline. No cloud backup.', HardDrive)}
                {option('cloud', sq ? 'Cloud OperiX' : 'OperiX cloud', sq ? 'Të dhënat ruhen në cloud: kopje rezervë, web, ekipi dhe lejet.' : 'Data is stored in the cloud: backups, the web app, teams and permissions.', Cloud)}
                {mode === 'local' ? <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.title, { color: palette.text }]}>{sq ? 'Kopja rezervë' : 'Backup file'}</Text>
                    <Text style={[styles.text, { color: palette.muted }]}>{sq ? 'Ruajeni skedarin diku të sigurt (Files, iCloud Drive). Mund ta importoni në një pajisje tjetër ose në aplikacionin web.' : 'Save the file somewhere safe (Files, iCloud Drive). You can import it on another device or in the web app.'}</Text>
                    <TouchableOpacity disabled={busy} onPress={() => void exportBackup()} style={[styles.button, { backgroundColor: primaryColor }]} testID="storage-export"><Download color="#fff" size={17} /><Text style={styles.buttonText}>{sq ? 'Eksporto kopjen rezervë' : 'Export backup'}</Text></TouchableOpacity>
                    <TouchableOpacity disabled={busy} onPress={() => void importBackup()} style={[styles.button, { backgroundColor: palette.iconSurface }]} testID="storage-import"><Upload color={primaryColor} size={17} /><Text style={[styles.buttonText, { color: primaryColor }]}>{sq ? 'Importo kopjen rezervë' : 'Import backup'}</Text></TouchableOpacity>
                    {deviceCode ? <Text style={[styles.text, { color: palette.muted }]}>{sq ? 'Kodi i pajisjes (në numrat e faturave)' : 'Device code (appears in invoice numbers)'}: {deviceCode}</Text> : null}
                    {busy ? <ActivityIndicator color={primaryColor} /> : null}
                </View> : null}
                <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.title, { color: palette.text }]}>{sq ? 'Kopjo të dhënat bazë' : 'Copy your basic data'}</Text>
                    <Text style={[styles.text, { color: palette.muted }]}>{sq ? 'Klientët, produktet dhe furnitorët mund të kopjohen mes pajisjes dhe cloud. Mund ta përsërisni pa rrezik dublikimi.' : 'Customers, products and suppliers can be copied between this device and the cloud. Repeating it is safe: nothing is duplicated.'}</Text>
                    <TouchableOpacity disabled={busy} onPress={() => confirmTransfer('toCloud')} style={[styles.button, { backgroundColor: palette.iconSurface }]} testID="storage-copy-to-cloud"><Cloud color={primaryColor} size={17} /><Text style={[styles.buttonText, { color: primaryColor }]}>{sq ? 'Nga pajisja në cloud' : 'Device to cloud'}</Text></TouchableOpacity>
                    <TouchableOpacity disabled={busy} onPress={() => confirmTransfer('toDevice')} style={[styles.button, { backgroundColor: palette.iconSurface }]} testID="storage-copy-to-device"><HardDrive color={primaryColor} size={17} /><Text style={[styles.buttonText, { color: primaryColor }]}>{sq ? 'Nga cloud në pajisje' : 'Cloud to device'}</Text></TouchableOpacity>
                </View>
                {message ? <Text style={[styles.text, { color: palette.text }]}>{message}</Text> : null}
            </>}
        </ScrollView>
    <Modal visible={Boolean(paywall)} animationType="slide" onRequestClose={() => setPaywall(null)}>
            {paywall ? <PaywallView
                title={sq ? 'OperiX Cloud është veçori me pagesë' : 'OperiX Cloud is a paid feature'}
                lead={sq ? 'Për t\'i mbajtur të dhënat në cloud, të sinkronizuara me uebin dhe ekipin, abonohuni te OperiX Cloud. Deri atëherë mund ta përdorni OperiX falas në këtë pajisje.' : 'To keep your data in the cloud, synced with the web app and your team, subscribe to OperiX Cloud. Until then you can keep using OperiX free on this device.'}
                companyId={paywall.companyId}
                canPay={paywall.canPay}
                freeLabel={sq ? 'Qëndro te ruajtja falas në pajisje' : 'Stay on free device storage'}
                onFree={() => setPaywall(null)}
                onClose={() => setPaywall(null)}
            /> : null}
        </Modal>
        </MobileScreen>;
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: 20, paddingBottom: 110, gap: 14 },
    card: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 16 },
    iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, minWidth: 0 },
    title: { fontSize: 15, fontFamily: brand.fonts.semibold },
    text: { fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: brand.fonts.regular },
    panel: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
    button: { minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
    buttonText: { color: '#fff', fontSize: 14, fontFamily: brand.fonts.semibold },
});
