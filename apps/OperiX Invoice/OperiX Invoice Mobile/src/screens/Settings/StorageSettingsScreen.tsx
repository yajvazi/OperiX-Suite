import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Cloud, Download, HardDrive, Upload } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { BackupFile, StorageMode } from '@invoice-monorepo/data-store';
import { brand, getPalette } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { getLocalStore, getStorageMode, setStorageMode } from '../../services/dataStore';

/**
 * Where business data lives. "On this device" is free and keeps everything in a database on the phone;
 * "OperiX cloud" is the shared database used by web, teams and backups.
 */
export function StorageSettingsScreen({ navigation }: any) {
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const sq = language === 'sq';
    const [mode, setMode] = useState<StorageMode | null>(null);
    const [busy, setBusy] = useState(false);
    const [deviceCode, setDeviceCode] = useState('');
    const [message, setMessage] = useState('');

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
                {message ? <Text style={[styles.text, { color: palette.text }]}>{message}</Text> : null}
            </>}
        </ScrollView>
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
