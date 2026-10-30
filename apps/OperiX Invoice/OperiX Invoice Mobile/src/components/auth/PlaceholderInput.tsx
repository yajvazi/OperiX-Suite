import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

/**
 * A text input that draws its own placeholder. On some iPhones the built-in placeholder of an email-style field is
 * drawn with wide gaps between the letters ("E n t e r  y o u r  e m a i l"); this draws it as ordinary text instead.
 */
export function PlaceholderInput({ placeholder, placeholderTextColor, style, value, ...rest }: TextInputProps) {
    const flat = StyleSheet.flatten(style) || {};
    // The wrapper takes over the sizing: a `flex: 1` input inside it could otherwise collapse to no height.
    const { flex: _flex, flexGrow: _grow, flexShrink: _shrink, flexBasis: _basis, ...inputStyle } = flat as Record<string, unknown>;
    const showPlaceholder = !value && Boolean(placeholder);
    return (
        <View style={styles.wrap}>
            <TextInput {...rest} value={value} style={[inputStyle, styles.fill]} />
            {showPlaceholder ? (
                <View pointerEvents="none" style={styles.overlay}>
                    <Text numberOfLines={1} style={{ color: placeholderTextColor || '#98A2B3', fontSize: flat.fontSize ?? 14, fontFamily: flat.fontFamily, letterSpacing: 0 }}>{placeholder}</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { flexGrow: 1, flexShrink: 1, minWidth: 0, justifyContent: 'center' },
    fill: { width: '100%' },
    overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
});
