import React from 'react';
import { Asset } from 'expo-asset';
import { StyleSheet, View } from 'react-native';
import { SvgUri } from 'react-native-svg';

type OperixLogoProps = {
    width?: number;
    reversed?: boolean;
    markOnly?: boolean;
};

const invoiceBlue = require('../../assets/operix-invoice-logo-blue.svg');
const invoiceWhite = require('../../assets/operix-invoice-logo-white.svg');
const markBlue = require('../../assets/operix-x-blue.svg');
const markWhite = require('../../assets/operix-x-white.svg');

export function OperixLogo({ width = 210, reversed = false, markOnly = false }: OperixLogoProps) {
    const source = markOnly
        ? (reversed ? markWhite : markBlue)
        : (reversed ? invoiceWhite : invoiceBlue);
    const uri = Asset.fromModule(source).uri;
    const height = markOnly ? Math.round(width * 0.6) : Math.round(width * 0.48);

    return (
        <View style={[styles.frame, { width, height }]} accessibilityRole="image" accessibilityLabel="OperiX Invoice">
            <SvgUri uri={uri} width="100%" height="100%" />
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
});
