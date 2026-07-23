import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InvoiceStatus } from '@invoice-monorepo/types';

interface StatusBadgeProps {
    status: string;
}

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: '#F1F3F5', text: '#4B5565' },
    sent: { bg: '#EAF2FF', text: '#075BD8' },
    paid: { bg: '#E9F9F0', text: '#087443' },
    overdue: { bg: '#FFF0EF', text: '#D92D20' },
    // Contract statuses
    signed: { bg: '#E9F9F0', text: '#087443' },
    active: { bg: '#EAF2FF', text: '#075BD8' },
    terminated: { bg: '#FFF0EF', text: '#D92D20' },
};

const defaultColor = { bg: '#F1F3F5', text: '#4B5565' };

export function StatusBadge({ status }: StatusBadgeProps) {
    const colors = statusColors[status] || defaultColor;

    return (
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.text, { color: colors.text }]}>
                {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
});

