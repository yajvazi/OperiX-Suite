import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { t } from '@invoice-monorepo/i18n';
import { useTheme } from '@invoice-monorepo/hooks';

/** A transparent layer behind a popup: tapping outside the popup closes it. Place it as the first child of the overlay. */
export function ModalBackdrop({ onPress }: { onPress: () => void }) {
    const { language } = useTheme();
    return <Pressable accessibilityRole="button" accessibilityLabel={t('close', language)} style={StyleSheet.absoluteFill} onPress={onPress} />;
}
