import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Check, X } from 'lucide-react-native';
import { t } from '@invoice-monorepo/i18n';
import { useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';

interface StampGeneratorModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (stamp: string) => void;
    companyName: string;
    primaryColor: string;
}

const VIEW_SIZE = 280;
const CENTER = VIEW_SIZE / 2;
const CURVED_TEXT_RADIUS = 82;
const MAX_CURVED_TEXT_SPREAD = 112;

function escapeXml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function curvedLetterPositions(value: string, bottom = false) {
    const letters = Array.from(value.trim().toUpperCase());
    if (letters.length === 0) return [];

    const step = letters.length > 1
        ? Math.min(12, MAX_CURVED_TEXT_SPREAD / (letters.length - 1))
        : 0;
    const spread = step * Math.max(letters.length - 1, 0);

    return letters.map((letter, index) => {
        const angle = bottom
            ? 90 + spread / 2 - index * step
            : -90 - spread / 2 + index * step;
        const radians = angle * Math.PI / 180;
        const x = CENTER + CURVED_TEXT_RADIUS * Math.cos(radians);
        const y = CENTER + CURVED_TEXT_RADIUS * Math.sin(radians);

        return {
            letter,
            x,
            y,
            // Rotate each glyph along the tangent while keeping the text
            // upright on both the upper and lower half of the stamp.
            rotation: bottom ? angle - 90 : angle + 90,
        };
    });
}

function buildCurvedSvgText(value: string, bottom: boolean, color: string, fontSize: number) {
    return curvedLetterPositions(value, bottom)
        .map(({ letter, x, y, rotation }) => {
            const formattedX = x.toFixed(2);
            const formattedY = y.toFixed(2);
            return `<text x="${formattedX}" y="${formattedY}" transform="rotate(${rotation.toFixed(2)} ${formattedX} ${formattedY})" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(letter)}</text>`;
        })
        .join('');
}

function buildStampSvg(companyName: string, topText: string, bottomText: string, color: string) {
    const safeCompanyName = escapeXml(companyName.trim());
    const curvedTopText = buildCurvedSvgText(topText, false, color, 19);
    const curvedBottomText = buildCurvedSvgText(bottomText, true, color, 17);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_SIZE}" height="${VIEW_SIZE}" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}"><circle cx="${CENTER}" cy="${CENTER}" r="119" fill="none" stroke="${color}" stroke-width="5"/><circle cx="${CENTER}" cy="${CENTER}" r="103" fill="none" stroke="${color}" stroke-width="2"/>${curvedTopText}<text x="${CENTER}" y="${CENTER + 7}" fill="${color}" font-family="Arial, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${safeCompanyName}</text>${curvedBottomText}</svg>`;
}

export function StampGeneratorModal({ visible, onClose, onSave, companyName: initialCompanyName, primaryColor }: StampGeneratorModalProps) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const [companyName, setCompanyName] = useState(initialCompanyName);
    const [topText, setTopText] = useState('OFFICIAL');
    const [bottomText, setBottomText] = useState('AUTHORIZED');

    useEffect(() => {
        if (visible) {
            setCompanyName(initialCompanyName);
            setTopText('OFFICIAL');
            setBottomText('AUTHORIZED');
        }
    }, [initialCompanyName, visible]);

    const svg = useMemo(
        () => buildStampSvg(companyName || t('company', language), topText, bottomText, primaryColor),
        [bottomText, companyName, language, primaryColor, topText],
    );

    const handleSave = () => {
        if (!companyName.trim()) {
            Alert.alert(t('error', language), t('stampCompanyNameRequired', language));
            return;
        }
        onSave(`data:image/svg+xml,${encodeURIComponent(svg)}`);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.5)' }]}> 
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                    style={styles.keyboardAvoidingView}
                >
                <View style={[styles.sheet, { backgroundColor: palette.surface }]}> 
                    <View style={[styles.header, { borderBottomColor: palette.border }]}>
                        <View style={styles.headerCopy}>
                            <Text style={[styles.title, { color: palette.text }]}>{t('stampGenerator', language)}</Text>
                            <Text style={[styles.description, { color: palette.muted }]}>{t('stampGeneratorDescription', language)}</Text>
                        </View>
                        <TouchableOpacity testID="stamp-generator-close-button" accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={onClose} style={styles.closeButton}>
                            <X color={palette.muted} size={21} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
                        <View style={[styles.previewCard, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}> 
                            <Svg width={240} height={240} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}>
                                <Circle cx={CENTER} cy={CENTER} r="119" fill="none" stroke={primaryColor} strokeWidth="5" />
                                <Circle cx={CENTER} cy={CENTER} r="103" fill="none" stroke={primaryColor} strokeWidth="2" />
                                {curvedLetterPositions(topText).map(({ letter, x, y, rotation }, index) => (
                                    <SvgText key={`stamp-top-${index}`} x={x} y={y} transform={`rotate(${rotation} ${x} ${y})`} fill={primaryColor} fontFamily="Arial" fontSize="19" fontWeight="700" textAnchor="middle" alignmentBaseline="middle">{letter}</SvgText>
                                ))}
                                <SvgText x={CENTER} y={CENTER + 7} fill={primaryColor} fontFamily="Arial" fontSize="22" fontWeight="700" textAnchor="middle">{companyName || t('company', language)}</SvgText>
                                {curvedLetterPositions(bottomText, true).map(({ letter, x, y, rotation }, index) => (
                                    <SvgText key={`stamp-bottom-${index}`} x={x} y={y} transform={`rotate(${rotation} ${x} ${y})`} fill={primaryColor} fontFamily="Arial" fontSize="17" fontWeight="700" textAnchor="middle" alignmentBaseline="middle">{letter}</SvgText>
                                ))}
                            </Svg>
                            <Text style={[styles.previewLabel, { color: palette.muted }]}>{t('stampPreview', language)}</Text>
                        </View>

                        <Text style={[styles.fieldLabel, { color: palette.text }]}>{t('stampCompanyName', language)}</Text>
                        <TextInput
                            testID="stamp-company-name-input"
                            value={companyName}
                            onChangeText={setCompanyName}
                            placeholder={t('companyName', language)}
                            placeholderTextColor={palette.muted}
                            style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
                        />
                        <Text style={[styles.fieldLabel, { color: palette.text }]}>{t('stampTopText', language)}</Text>
                        <TextInput
                            testID="stamp-top-text-input"
                            value={topText}
                            onChangeText={setTopText}
                            placeholder={t('stampTopText', language)}
                            placeholderTextColor={palette.muted}
                            style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
                        />
                        <Text style={[styles.fieldLabel, { color: palette.text }]}>{t('stampBottomText', language)}</Text>
                        <TextInput
                            testID="stamp-bottom-text-input"
                            value={bottomText}
                            onChangeText={setBottomText}
                            placeholder={t('stampBottomText', language)}
                            placeholderTextColor={palette.muted}
                            style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
                        />

                        <TouchableOpacity testID="stamp-generator-save-button" accessibilityRole="button" onPress={handleSave} style={[styles.saveButton, { backgroundColor: primaryColor }]}>
                            <Check color="#fff" size={19} />
                            <Text style={styles.saveText}>{t('saveStamp', language)}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    keyboardAvoidingView: { width: '100%' },
    sheet: { maxHeight: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
    header: { minHeight: 76, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
    headerCopy: { flex: 1, paddingRight: 12 },
    title: { fontSize: 19, fontFamily: brand.fonts.semibold },
    description: { fontSize: 12, lineHeight: 17, marginTop: 3, fontFamily: brand.fonts.regular },
    closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 36 },
    previewCard: { borderRadius: 18, borderWidth: 1, minHeight: 286, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    previewLabel: { fontSize: 11, fontFamily: brand.fonts.medium, marginTop: -2 },
    fieldLabel: { fontSize: 13, fontFamily: brand.fonts.semibold, marginBottom: 7, marginTop: 12 },
    input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14, fontFamily: brand.fonts.regular, textAlign: 'center' },
    saveButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 22 },
    saveText: { color: '#fff', fontSize: 14, fontFamily: brand.fonts.semibold },
});
