import React from 'react';
import { UsersRound } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

type OperixLogoProps = {
    width?: number;
    reversed?: boolean;
};

export function OperixLogo({ width = 220, reversed = false }: OperixLogoProps) {
    const markSize = Math.min(34, Math.max(30, Math.round(width * 0.16)));
    return (
        <View style={[styles.frame, { width, height: markSize }]} accessibilityRole="image" accessibilityLabel="OperiX HR">
            <View style={[styles.mark, { width: markSize, height: markSize, backgroundColor: reversed ? '#003DC9' : '#004FFE' }]}>
                <UsersRound color="#fff" size={Math.round(markSize * 0.52)} strokeWidth={2.1} />
            </View>
            <Text style={[styles.copy, { color: reversed ? '#fff' : '#111827', fontSize: markSize >= 34 ? 18 : 16 }]}><Text style={styles.copyStrong}>OperiX</Text><Text style={{ color: reversed ? '#BFDBFE' : '#004FFE' }}> HR</Text></Text>
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
