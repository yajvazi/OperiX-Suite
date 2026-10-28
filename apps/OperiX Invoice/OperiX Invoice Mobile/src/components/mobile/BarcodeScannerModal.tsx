import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Flashlight, X } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';

/**
 * A camera popup that reads one QR code or barcode and returns it, without leaving the screen
 * underneath (so a half-filled invoice keeps its data).
 */
export function BarcodeScannerModal({ visible, onScanned, onClose }: { visible: boolean; onScanned: (code: string) => void; onClose: () => void }) {
    const { language } = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const [done, setDone] = useState(false);
    const [torch, setTorch] = useState(false);

    useEffect(() => { if (visible) { setDone(false); setTorch(false); if (permission && !permission.granted && permission.canAskAgain) void requestPermission(); } }, [visible]);

    return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
            {permission?.granted ? <CameraView
                style={StyleSheet.absoluteFill}
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={done ? undefined : ({ data }) => { setDone(true); onScanned(String(data).trim()); }}
            /> : <View style={styles.denied}><Text style={styles.deniedText}>{t('cameraPermissionRequired', language)}</Text></View>}
            <View style={styles.top}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={onClose} style={styles.round} testID="barcode-scanner-close"><X color="#fff" size={22} /></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" onPress={() => setTorch((on) => !on)} style={[styles.round, torch && styles.roundOn]}><Flashlight color="#fff" size={22} /></TouchableOpacity>
            </View>
            <View pointerEvents="none" style={styles.frameWrap}><View style={styles.frame} /></View>
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    top: { position: 'absolute', top: 56, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
    round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    roundOn: { backgroundColor: 'rgba(0,79,254,0.9)' },
    frameWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    frame: { width: 260, height: 180, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
    denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    deniedText: { color: '#fff', textAlign: 'center', fontSize: 15 },
});
