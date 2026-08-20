import React from 'react';
import { ReceiptText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

type OperixLogoProps = {
    width?: number;
    reversed?: boolean;
    markOnly?: boolean;
};

export function OperixLogo({ width = 210, reversed = false, markOnly = false }: OperixLogoProps) {
    const markSize = Math.min(34, Math.max(30, Math.round(width * 0.16)));

    return (
        <View style={[styles.frame, { width, height: markSize }]} accessibilityRole="image" accessibilityLabel="OperiX Invoice">
            <View style={[styles.mark, { width: markSize, height: markSize, backgroundColor: reversed ? '#003DC9' : '#004FFE' }]}>
                <ReceiptText color="#fff" size={Math.round(markSize * 0.52)} strokeWidth={2.1} />
            </View>
            {!markOnly ? <Text style={[styles.copy, { color: reversed ? '#fff' : '#111827', fontSize: markSize >= 34 ? 18 : 16 }]}><Text style={styles.copyStrong}>OperiX</Text><Text style={{ color: reversed ? '#BFDBFE' : '#004FFE' }}> Invoice</Text></Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    mark: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 9,
        borderRadius: 9,
    },
    copy: {
        letterSpacing: -0.35,
    },
    copyStrong: {
        fontWeight: '700',
    },
});
