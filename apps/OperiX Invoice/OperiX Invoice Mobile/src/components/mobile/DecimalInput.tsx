import React, { useEffect, useState } from 'react';
import { TextInput, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';

type DecimalInputProps = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'style'> & {
    value: number | undefined;
    /** Called only with a valid number (0 or more). An empty field reports 0. */
    onValueChange: (value: number) => void;
    style?: StyleProp<TextStyle>;
};

/**
 * A number field that lets you type "12.", "12,5" or "0.0" naturally. Converting to a number on every
 * keystroke (value={String(Number(text))}) deletes the decimal point as soon as it is typed.
 */
export function DecimalInput({ value, onValueChange, style, ...rest }: DecimalInputProps) {
    const [text, setText] = useState(value ? String(value) : '');
    useEffect(() => {
        // Follow outside changes (for example a product price filled in), but never overwrite what is being typed.
        setText((current) => Number(current.replace(',', '.') || 0) === Number(value || 0) ? current : value ? String(value) : '');
    }, [value]);
    return <TextInput
        {...rest}
        value={text}
        keyboardType="decimal-pad"
        style={style}
        onChangeText={(next) => {
            const cleaned = next.replace(',', '.').replace(/[^0-9.]/g, '').replace(/^(\d*\.\d*).*$/, '$1');
            setText(cleaned);
            const parsed = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned);
            if (Number.isFinite(parsed) && parsed >= 0) onValueChange(parsed);
        }}
    />;
}
