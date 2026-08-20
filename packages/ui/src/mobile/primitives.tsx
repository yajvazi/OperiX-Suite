import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleProp,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TextInputProps,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import {
    AlertCircle,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronRight,
    CircleCheck,
    Info,
    Plus,
    Search,
    X,
} from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import {
    getOperixPalette,
    operixMobileTokens,
    OperixMobilePalette,
    OperixStatusTone,
    statusToneFor,
    toneColors,
} from './tokens';

export type OperixIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type ThemeState = {
    isDark: boolean;
    language: string;
    primaryColor: string;
    palette: OperixMobilePalette;
};

function useMobileTheme(): ThemeState {
    const { isDark, language, primaryColor } = useTheme();
    return {
        isDark,
        language,
        primaryColor,
        palette: getOperixPalette(isDark, primaryColor),
    };
}

function pressableStyle(pressed: boolean): ViewStyle | undefined {
    return pressed ? { opacity: 0.82 } : undefined;
}

export type OperixButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'success' | 'shortcut';

export interface OperixButtonProps {
    title: string;
    onPress: () => void;
    testID?: string;
    variant?: OperixButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    size?: 'small' | 'medium' | 'large';
    icon?: OperixIcon;
    fullWidth?: boolean;
    chevron?: boolean;
    accessibilityLabel?: string;
}

export function OperixButton({
    title,
    onPress,
    testID,
    variant = 'primary',
    loading = false,
    disabled = false,
    style,
    textStyle,
    size = 'medium',
    icon: Icon,
    fullWidth = true,
    chevron = false,
    accessibilityLabel,
}: OperixButtonProps) {
    const { palette } = useMobileTheme();
    const isSolid = variant === 'primary' || variant === 'danger' || variant === 'success';
    const backgroundColor = variant === 'primary' ? palette.primary : variant === 'danger' ? palette.error : variant === 'success' ? palette.success : variant === 'secondary' ? palette.iconSurface : variant === 'shortcut' ? palette.surfaceMuted : 'transparent';
    const foregroundColor = isSolid ? palette.onPrimary : variant === 'outline' || variant === 'ghost' || variant === 'secondary' || variant === 'shortcut' ? palette.primary : palette.text;
    const height = size === 'small' ? 40 : size === 'large' ? 60 : 52;
    const iconSize = size === 'small' ? 16 : size === 'large' ? 21 : 18;

    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel || title}
            accessibilityState={{ disabled: disabled || loading, busy: loading }}
            disabled={disabled || loading}
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                { minHeight: height, backgroundColor },
                variant === 'outline' && { borderColor: palette.borderStrong, borderWidth: 1 },
                variant === 'shortcut' && { borderColor: palette.border, borderWidth: 1, justifyContent: 'flex-start' },
                variant === 'ghost' && { backgroundColor: 'transparent' },
                !fullWidth && { alignSelf: 'flex-start' },
                (disabled || loading) && styles.disabled,
                pressableStyle(pressed),
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={foregroundColor} size="small" /> : (
                <View style={[styles.buttonContent, variant === 'shortcut' && styles.shortcutContent]}>
                    <View style={styles.buttonContent}>
                        {Icon ? <Icon color={variant === 'shortcut' ? palette.primary : foregroundColor} size={iconSize} /> : null}
                        <Text style={[styles.buttonText, { color: foregroundColor, fontSize: size === 'small' ? 13 : size === 'large' ? 17 : 15 }, variant === 'shortcut' && { textAlign: 'left' }, textStyle]}>{title}</Text>
                    </View>
                    {(chevron || variant === 'shortcut') ? <ChevronRight color={variant === 'shortcut' ? palette.primary : foregroundColor} size={18} /> : null}
                </View>
            )}
        </Pressable>
    );
}

export interface OperixIconButtonProps {
    label: string;
    onPress: () => void;
    testID?: string;
    children?: ReactNode;
    icon?: OperixIcon;
    size?: number;
    style?: StyleProp<ViewStyle>;
    variant?: 'surface' | 'ghost' | 'primary';
    disabled?: boolean;
}

export function OperixIconButton({ label, onPress, testID, children, icon: Icon, size = operixMobileTokens.touchTarget, style, variant = 'surface', disabled = false }: OperixIconButtonProps) {
    const { palette } = useMobileTheme();
    const backgroundColor = variant === 'primary' ? palette.primary : variant === 'surface' ? palette.surface : 'transparent';
    const iconColor = variant === 'primary' ? palette.onPrimary : palette.text;
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            hitSlop={6}
            style={({ pressed }) => [styles.iconButton, { width: size, height: size, borderRadius: operixMobileTokens.radii.control, backgroundColor }, variant === 'surface' && operixMobileTokens.shadow.card, disabled && styles.disabled, pressableStyle(pressed), style]}
        >
            {children || (Icon ? <Icon color={iconColor} size={operixMobileTokens.icon.md} /> : null)}
        </Pressable>
    );
}

export interface OperixCardProps {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    variant?: 'default' | 'elevated' | 'outlined' | 'soft';
    onPress?: () => void;
    accessibilityLabel?: string;
}

export function OperixCard({ children, style, variant = 'default', onPress, accessibilityLabel }: OperixCardProps) {
    const { palette } = useMobileTheme();
    const card = (
        <View style={[styles.card, { backgroundColor: variant === 'soft' ? palette.surfaceMuted : palette.surface, borderColor: palette.border }, variant === 'elevated' && operixMobileTokens.shadow.card, variant === 'outlined' && { backgroundColor: 'transparent', borderColor: palette.borderStrong }, style]}>
            {children}
        </View>
    );
    if (!onPress) return card;
    return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => pressableStyle(pressed)}>{card}</Pressable>;
}

export interface OperixInputProps extends TextInputProps {
    label?: string;
    required?: boolean;
    helperText?: string;
    error?: string;
    containerStyle?: StyleProp<ViewStyle>;
    left?: ReactNode;
    right?: ReactNode;
}

export function OperixInput({ label, required = false, helperText, error, containerStyle, style, left, right, onChangeText, keyboardType, ...props }: OperixInputProps) {
    const { palette } = useMobileTheme();
    const [focused, setFocused] = useState(false);
    const handleChangeText = (value: string) => {
        const normalized = keyboardType === 'numeric' || keyboardType === 'decimal-pad' ? value.replace(',', '.') : value;
        onChangeText?.(normalized);
    };
    return (
        <View style={[styles.fieldContainer, containerStyle]}>
            {label ? <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}{required ? <Text style={{ color: palette.error }}> *</Text> : null}</Text> : null}
            <View style={[styles.inputShell, { backgroundColor: palette.surface, borderColor: error ? palette.error : focused ? palette.primary : palette.border }, focused && styles.inputFocused]}>
                {left ? <View style={styles.inputAffix}>{left}</View> : null}
                <TextInput
                    {...props}
                    accessibilityLabel={props.accessibilityLabel || label}
                    // Keep the keyboard open while moving through a form. Individual
                    // screens can still opt into the native blur behavior explicitly.
                    blurOnSubmit={props.blurOnSubmit ?? false}
                    keyboardType={keyboardType}
                    onChangeText={handleChangeText}
                    onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
                    onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { color: palette.text }, left ? styles.inputWithoutLeftPadding : undefined, right ? styles.inputWithoutRightPadding : undefined, style]}
                />
                {right ? <View style={styles.inputAffix}>{right}</View> : null}
            </View>
            {error ? <Text accessibilityRole="text" style={[styles.fieldError, { color: palette.error }]}>{error}</Text> : helperText ? <Text style={[styles.fieldHelper, { color: palette.muted }]}>{helperText}</Text> : null}
        </View>
    );
}

export function OperixTextArea(props: OperixInputProps) {
    return <OperixInput {...props} multiline textAlignVertical="top" style={[styles.textArea, props.style]} />;
}

export interface OperixSelectOption {
    label: string;
    value: string;
}

export interface OperixSelectProps {
    label?: string;
    required?: boolean;
    value?: string;
    placeholder?: string;
    options?: OperixSelectOption[];
    onValueChange?: (value: string) => void;
    onPress?: () => void;
    error?: string;
    disabled?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
}

export function OperixSelect({ label, required, value, placeholder = 'Select an option', options = [], onValueChange, onPress, error, disabled = false, containerStyle }: OperixSelectProps) {
    const { palette } = useMobileTheme();
    const [visible, setVisible] = useState(false);
    const selected = options.find((option) => option.value === value)?.label || value;
    const open = () => { if (!disabled) { onPress?.(); if (options.length) setVisible(true); } };
    return (
        <View style={[styles.fieldContainer, containerStyle]}>
            {label ? <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}{required ? <Text style={{ color: palette.error }}> *</Text> : null}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={label || placeholder} accessibilityState={{ disabled, expanded: visible }} disabled={disabled} onPress={open} style={({ pressed }) => [styles.selectShell, { backgroundColor: palette.surface, borderColor: error ? palette.error : palette.border }, disabled && styles.disabled, pressableStyle(pressed)]}>
                <Text style={[styles.selectText, { color: selected ? palette.text : palette.muted }]}>{selected || placeholder}</Text>
                <ChevronDown color={palette.muted} size={operixMobileTokens.icon.sm} />
            </Pressable>
            {error ? <Text style={[styles.fieldError, { color: palette.error }]}>{error}</Text> : null}
            {options.length ? <OperixBottomSheet visible={visible} onClose={() => setVisible(false)} title={label || placeholder}>
                {options.map((option) => <OperixListItem key={option.value} title={option.label} onPress={() => { setVisible(false); onValueChange?.(option.value); }} trailing={option.value === value ? <Check color={palette.primary} size={operixMobileTokens.icon.sm} /> : undefined} />)}
            </OperixBottomSheet> : null}
        </View>
    );
}

export function OperixSwitch({ label, description, value, onValueChange, disabled = false, style }: { label?: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <View style={[styles.switchRow, style]}><View style={styles.switchCopy}>{label ? <Text style={[styles.switchLabel, { color: palette.text }]}>{label}</Text> : null}{description ? <Text style={[styles.switchDescription, { color: palette.muted }]}>{description}</Text> : null}</View><Switch accessibilityLabel={label} accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: palette.borderStrong, true: palette.primary }} thumbColor={Platform.OS === 'android' ? (value ? '#FFFFFF' : '#F8FAFC') : undefined} />;</View>;
}

export function OperixCheckbox({ label, value, onValueChange, disabled = false, style }: { label?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)} style={({ pressed }) => [styles.choiceRow, disabled && styles.disabled, pressableStyle(pressed), style]}><View style={[styles.checkbox, { borderColor: value ? palette.primary : palette.borderStrong, backgroundColor: value ? palette.primary : 'transparent' }]}>{value ? <Check color={palette.onPrimary} size={15} strokeWidth={3} /> : null}</View>{label ? <Text style={[styles.choiceLabel, { color: palette.text }]}>{label}</Text> : null}</Pressable>;
}

export function OperixRadio({ label, selected, onPress, disabled = false, style }: { label?: string; selected: boolean; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.choiceRow, disabled && styles.disabled, pressableStyle(pressed), style]}><View style={[styles.radio, { borderColor: selected ? palette.primary : palette.borderStrong }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: palette.primary }]} /> : null}</View>{label ? <Text style={[styles.choiceLabel, { color: palette.text }]}>{label}</Text> : null}</Pressable>;
}

export function OperixSearchInput({ value, onChangeText, placeholder, rightAccessory, ...props }: TextInputProps & { value: string; onChangeText: (value: string) => void; placeholder?: string; rightAccessory?: React.ReactNode }) {
    const { palette, language } = useMobileTheme();
    const resolvedPlaceholder = placeholder || t('search', language);
    const clearButton = value ? <OperixIconButton label={t('clear', language)} variant="ghost" size={28} onPress={() => onChangeText('')}><X color={palette.muted} size={17} /></OperixIconButton> : null;
    const rightContent = rightAccessory ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>{rightAccessory}{clearButton}</View> : clearButton;
    return <OperixInput {...props} value={value} onChangeText={onChangeText} placeholder={resolvedPlaceholder} accessibilityLabel={props.accessibilityLabel || resolvedPlaceholder} left={<Search color={palette.muted} size={operixMobileTokens.icon.md} strokeWidth={2.1} />} right={rightContent} containerStyle={styles.searchContainer} style={styles.searchInput} returnKeyType="search" />;
}

export function OperixDateInput({ label, value, placeholder = 'Select a date', onPress, error, required, disabled = false, containerStyle }: { label?: string; value?: string; placeholder?: string; onPress: () => void; error?: string; required?: boolean; disabled?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <View style={[styles.fieldContainer, containerStyle]}>{label ? <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}{required ? <Text style={{ color: palette.error }}> *</Text> : null}</Text> : null}<Pressable accessibilityRole="button" accessibilityLabel={label || placeholder} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.selectShell, { backgroundColor: palette.surface, borderColor: error ? palette.error : palette.border }, disabled && styles.disabled, pressableStyle(pressed)]}><CalendarDays color={palette.muted} size={operixMobileTokens.icon.sm} /><Text style={[styles.selectText, { color: value ? palette.text : palette.muted }]}>{value || placeholder}</Text></Pressable>{error ? <Text style={[styles.fieldError, { color: palette.error }]}>{error}</Text> : null}</View>;
}

export function OperixAmountInput({ label, value, onChangeText, currency = '€', ...props }: OperixInputProps & { currency?: string }) {
    const { palette } = useMobileTheme();
    return <OperixInput {...props} label={label} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" left={<Text style={[styles.amountPrefix, { color: palette.muted }]}>{currency}</Text>} />;
}

export function OperixBadge({ status, label, tone, compact = false }: { status?: string | null; label?: string; tone?: OperixStatusTone; compact?: boolean }) {
    const { palette, language } = useMobileTheme();
    const resolvedTone = tone || statusToneFor(status);
    const colors = toneColors(palette, resolvedTone);
    const normalized = (status || '').toLowerCase().replace(/_/g, ' ');
    const translated = normalized ? ({ draft: t('draft', language), sent: t('sent', language), pending: t('pending', language), paid: t('paid', language), overdue: t('overdue', language), cancelled: t('cancelled', language), confirmed: t('confirmed', language), delivered: t('delivered', language), processing: t('processing', language) } as Record<string, string>)[normalized] : undefined;
    const resolvedLabel = label || translated || (status ? status.replace(/[_-]/g, ' ') : t('status', language));
    return <View accessible accessibilityLabel={`${t('status', language)}: ${resolvedLabel}`} style={[styles.badge, { backgroundColor: colors.background }, compact && styles.compactBadge]}><View style={[styles.badgeDot, { backgroundColor: colors.foreground }]} /><Text style={[styles.badgeText, { color: colors.foreground }, compact && styles.compactBadgeText]}>{resolvedLabel}</Text></View>;
}

export function OperixAvatar({ label, uri, onPress, size = 40 }: { label: string; uri?: string; onPress?: () => void; size?: number }) {
    const { palette } = useMobileTheme();
    const content = <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.primary }]}>{uri ? <Image accessibilityLabel={label} source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Text style={[styles.avatarText, { color: palette.onPrimary, fontSize: Math.max(12, size * 0.38) }]}>{label.slice(0, 1).toUpperCase()}</Text>}</View>;
    if (!onPress) return <View accessibilityRole="image" accessibilityLabel={label}>{content}</View>;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>{content}</Pressable>;
}

export function OperixDivider({ style, color }: { style?: StyleProp<ViewStyle>; color?: string }) {
    const { palette } = useMobileTheme();
    return <View style={[styles.divider, { backgroundColor: color || palette.border }, style]} />;
}

export function OperixAlert({ title, message, tone = 'info', actionLabel, onAction, style }: { title?: string; message: string; tone?: OperixStatusTone; actionLabel?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    const colors = toneColors(palette, tone);
    const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CircleCheck : tone === 'warning' ? AlertCircle : Info;
    return <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: colors.background, borderColor: colors.foreground }, style]}><Icon color={colors.foreground} size={operixMobileTokens.icon.sm} /><View style={styles.alertCopy}>{title ? <Text style={[styles.alertTitle, { color: colors.foreground }]}>{title}</Text> : null}<Text style={[styles.alertMessage, { color: palette.text }]}>{message}</Text>{actionLabel && onAction ? <TouchableOpacity accessibilityRole="button" onPress={onAction}><Text style={[styles.alertAction, { color: colors.foreground }]}>{actionLabel}</Text></TouchableOpacity> : null}</View></View>;
}

export function OperixToast({ visible, message, tone = 'info', actionLabel, onAction, onDismiss }: { visible: boolean; message: string; tone?: OperixStatusTone; actionLabel?: string; onAction?: () => void; onDismiss?: () => void }) {
    const { palette, language } = useMobileTheme();
    if (!visible) return null;
    const colors = toneColors(palette, tone);
    return <View accessibilityRole="alert" style={[styles.toast, { backgroundColor: palette.surface, borderColor: colors.foreground }, operixMobileTokens.shadow.floating]}><View style={[styles.toastIcon, { backgroundColor: colors.background }]}><Info color={colors.foreground} size={16} /></View><Text style={[styles.toastText, { color: palette.text }]}>{message}</Text>{actionLabel && onAction ? <TouchableOpacity accessibilityRole="button" onPress={onAction}><Text style={[styles.toastAction, { color: colors.foreground }]}>{actionLabel}</Text></TouchableOpacity> : null}{onDismiss ? <OperixIconButton label={t('close', language)} variant="ghost" size={32} onPress={onDismiss}><X color={palette.muted} size={16} /></OperixIconButton> : null}</View>;
}

export function OperixSkeleton({ width = '100%', height = 16, radius = operixMobileTokens.radii.control, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    const opacity = useRef(new Animated.Value(0.55)).current;

    useEffect(() => {
        const animation = Animated.loop(Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.55, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]));
        animation.start();
        return () => animation.stop();
    }, [opacity]);

    return <Animated.View accessible accessibilityLabel="Loading" style={[{ width, height, borderRadius: radius, backgroundColor: palette.surfaceMuted, opacity }, style]} />;
}

export function OperixEmptyState({ title, description, actionLabel, onAction, icon: Icon = Info, style }: { title: string; description?: string; actionLabel?: string; onAction?: () => void; icon?: OperixIcon; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <View style={[styles.stateContainer, style]}><View style={[styles.stateIcon, { backgroundColor: palette.iconSurface }]}><Icon color={palette.primary} size={operixMobileTokens.icon.lg} /></View><Text style={[styles.stateTitle, { color: palette.text }]}>{title}</Text>{description ? <Text style={[styles.stateDescription, { color: palette.muted }]}>{description}</Text> : null}{actionLabel && onAction ? <OperixButton title={actionLabel} onPress={onAction} fullWidth={false} size="small" style={styles.stateAction} /> : null}</View>;
}

export function OperixErrorState({ onRetry, message, title }: { onRetry: () => void; message?: string; title?: string }) {
    const { palette, language } = useMobileTheme();
    return <OperixEmptyState title={title || t('unableToLoad', language)} description={message || t('somethingWentWrong', language)} actionLabel={t('retry', language)} onAction={onRetry} icon={AlertCircle} style={styles.errorState} />;
}

export function OperixLoadingState({ label }: { label?: string }) {
    const { palette, language } = useMobileTheme();
    return <View accessibilityRole="progressbar" accessibilityLabel={label || t('loading', language)} style={styles.loadingState}>
        <View style={styles.loadingSkeletonHeader}>
            <OperixSkeleton width={52} height={52} radius={18} />
            <View style={styles.loadingSkeletonCopy}>
                <OperixSkeleton width="72%" height={14} />
                <OperixSkeleton width="46%" height={11} style={styles.loadingSkeletonGap} />
            </View>
        </View>
        <OperixSkeleton height={12} style={styles.loadingSkeletonLine} />
        <OperixSkeleton width="86%" height={12} style={styles.loadingSkeletonLine} />
        <OperixSkeleton height={72} radius={16} style={styles.loadingSkeletonCard} />
        <Text style={[styles.loadingLabel, { color: palette.muted }]}>{label || t('loading', language)}</Text>
    </View>;
}

export function OperixModal({ visible, onClose, title, subtitle, children, footer, variant = 'center' }: { visible: boolean; onClose: () => void; title?: string; subtitle?: string; children?: ReactNode; footer?: ReactNode; variant?: 'center' | 'bottom' }) {
    const { palette, language } = useMobileTheme();
    return <Modal visible={visible} transparent animationType={variant === 'bottom' ? 'slide' : 'fade'} onRequestClose={onClose}><View style={[styles.modalOverlay, variant === 'bottom' && styles.modalBottomOverlay]}><Pressable accessibilityLabel={t('close', language)} style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[styles.modalContent, { backgroundColor: palette.surface }, variant === 'bottom' && styles.modalBottomContent]}>{variant === 'bottom' ? <View style={styles.sheetHandle} /> : null}{title || subtitle ? <View style={styles.modalHeader}><View style={styles.modalHeaderCopy}>{title ? <Text style={[styles.modalTitle, { color: palette.text }]}>{title}</Text> : null}{subtitle ? <Text style={[styles.modalSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}</View><OperixIconButton label={t('close', language)} onPress={onClose} variant="ghost"><X color={palette.text} size={20} /></OperixIconButton></View> : null}<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>{children}</ScrollView>{footer ? <View style={styles.modalFooter}>{footer}</View> : null}</View></View></Modal>;
}

export function OperixBottomSheet({ visible, onClose, title, subtitle, children, footer, maxHeight = '82%' }: { visible: boolean; onClose: () => void; title?: string; subtitle?: string; children?: ReactNode; footer?: ReactNode; maxHeight?: `${number}%` | number }) {
    const { palette, language } = useMobileTheme();
    return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView style={styles.bottomSheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable accessibilityLabel={t('close', language)} style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[styles.bottomSheet, { backgroundColor: palette.surface, maxHeight }]}><View style={styles.sheetHandle} />{title || subtitle ? <View style={styles.modalHeader}><View style={styles.modalHeaderCopy}>{title ? <Text style={[styles.modalTitle, { color: palette.text }]}>{title}</Text> : null}{subtitle ? <Text style={[styles.modalSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}</View><OperixIconButton label={t('close', language)} onPress={onClose} variant="ghost"><X color={palette.text} size={20} /></OperixIconButton></View> : null}<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.bottomSheetBody}>{children}</ScrollView>{footer ? <View style={styles.modalFooter}>{footer}</View> : null}</View></KeyboardAvoidingView></Modal>;
}

export function OperixConfirmDialog({ visible, onCancel, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, loading = false }: { visible: boolean; onCancel: () => void; onConfirm: () => void; title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; loading?: boolean }) {
    const { palette } = useMobileTheme();
    return <OperixModal visible={visible} onClose={onCancel} title={title} footer={<View style={styles.confirmActions}><OperixButton title={cancelLabel} onPress={onCancel} variant="outline" fullWidth={false} style={styles.confirmButton} /><OperixButton title={confirmLabel} onPress={onConfirm} variant={destructive ? 'danger' : 'primary'} loading={loading} fullWidth={false} style={styles.confirmButton} /></View>}><Text style={[styles.confirmMessage, { color: palette.muted }]}>{message}</Text></OperixModal>;
}

export function OperixListItem({ title, subtitle, leading, icon: Icon, trailing, onPress, showChevron = false, divider = false, disabled = false, style, testID }: { title: string; subtitle?: string; leading?: ReactNode; icon?: OperixIcon; trailing?: ReactNode; onPress?: () => void; showChevron?: boolean; divider?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
    const { palette } = useMobileTheme();
    const content = <View style={[styles.listItem, style]}><View style={styles.listItemLeading}>{leading || (Icon ? <View style={[styles.listItemIcon, { backgroundColor: palette.iconSurface }]}><Icon color={palette.primary} size={operixMobileTokens.icon.sm} /></View> : null)}</View><View style={styles.listItemCopy}><Text numberOfLines={1} style={[styles.listItemTitle, { color: palette.text }]}>{title}</Text>{subtitle ? <Text numberOfLines={2} style={[styles.listItemSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}</View>{trailing || (showChevron ? <ChevronRight color={palette.subtle} size={operixMobileTokens.icon.sm} /> : null)}</View>;
    const wrapped = onPress ? <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => pressableStyle(pressed)}>{content}</Pressable> : content;
    return <>{wrapped}{divider ? <OperixDivider /> : null}</>;
}

export function OperixSection({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <View style={[styles.section, style]}><View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>{action ? <TouchableOpacity accessibilityRole="button" onPress={onAction} hitSlop={8}><Text style={[styles.sectionAction, { color: palette.primary }]}>{action}</Text></TouchableOpacity> : null}</View>{children}</View>;
}

export function OperixStatCard({ label, value, tone = 'neutral', icon: Icon, style, valueStyle }: { label: string; value: string | number; tone?: OperixStatusTone | 'danger'; icon?: OperixIcon; style?: StyleProp<ViewStyle>; valueStyle?: StyleProp<TextStyle> }) {
    const { palette } = useMobileTheme();
    const resolvedTone = tone === 'danger' ? 'error' : tone;
    const valueColor = resolvedTone === 'neutral' ? palette.text : toneColors(palette, resolvedTone).foreground;
    return <OperixCard style={[styles.statCard, style]}><View style={styles.statHeader}>{Icon ? <View style={[styles.statIcon, { backgroundColor: palette.iconSurface }]}><Icon color={palette.primary} size={operixMobileTokens.icon.sm} /></View> : null}<Text numberOfLines={2} style={[styles.statLabel, { color: palette.muted }]}>{label}</Text></View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={[styles.statValue, { color: valueColor }, valueStyle]}>{value}</Text></OperixCard>;
}

export function OperixFloatingActionButton({ onPress, label = 'Create', icon: Icon, extended = false, disabled = false, style, testID }: { onPress: () => void; label?: string; icon?: OperixIcon; extended?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
    const { palette } = useMobileTheme();
    return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.fab, { backgroundColor: palette.primary }, extended && styles.extendedFab, disabled && styles.disabled, operixMobileTokens.shadow.floating, pressableStyle(pressed), style]}>{Icon ? <Icon color={palette.onPrimary} size={operixMobileTokens.icon.lg} /> : <Plus color={palette.onPrimary} size={operixMobileTokens.icon.lg} />}{extended ? <Text style={[styles.fabLabel, { color: palette.onPrimary }]}>{label}</Text> : null}</Pressable>;
}

export function OperixRecordCard({ title, subtitle, status, metadata = [], onPress, leading, trailing, children, style }: { title: string; subtitle?: string; status?: string | null; metadata?: Array<string | ReactNode>; onPress?: () => void; leading?: ReactNode; trailing?: ReactNode; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileTheme();
    return <OperixCard onPress={onPress} style={style}><View style={styles.recordHeader}>{leading ? <View style={styles.recordLeading}>{leading}</View> : null}<View style={styles.recordCopy}><Text numberOfLines={1} style={[styles.recordTitle, { color: palette.text }]}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={[styles.recordSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}</View>{status ? <OperixBadge status={status} compact /> : trailing}</View>{metadata.length ? <View style={styles.recordMetadata}>{metadata.map((item, index) => typeof item === 'string' || typeof item === 'number' ? <Text key={index} numberOfLines={1} style={[styles.recordMeta, { color: palette.muted }]}>{item}</Text> : <View key={index} style={styles.recordMetaNode}>{item}</View>)}</View> : null}{children}</OperixCard>;
}

export function OperixFilterButton({ label = 'Filters', count = 0, onPress }: { label?: string; count?: number; onPress: () => void }) {
    const { palette } = useMobileTheme();
    return <Pressable accessibilityRole="button" accessibilityLabel={count ? `${label}, ${count} active` : label} onPress={onPress} style={({ pressed }) => [styles.filterButton, { borderColor: palette.border, backgroundColor: palette.surface }, pressableStyle(pressed)]}><Text style={[styles.filterLabel, { color: palette.text }]}>{label}</Text>{count > 0 ? <View style={[styles.filterCount, { backgroundColor: palette.primary }]}><Text style={styles.filterCountText}>{count}</Text></View> : null}<ChevronDown color={palette.muted} size={16} /></Pressable>;
}

export function OperixFilterSheet({ visible, onClose, title = 'Filters', children, onApply, applyLabel = 'Apply', onClear, clearLabel = 'Clear' }: { visible: boolean; onClose: () => void; title?: string; children?: ReactNode; onApply?: () => void; applyLabel?: string; onClear?: () => void; clearLabel?: string }) {
    const footer = onClear || onApply ? <View style={styles.filterSheetActions}>{onClear ? <OperixButton title={clearLabel} onPress={onClear} variant="ghost" size="small" fullWidth={false} /> : <View />}{onApply ? <OperixButton title={applyLabel} onPress={onApply} size="small" fullWidth={false} /> : null}</View> : undefined;
    return <OperixBottomSheet visible={visible} onClose={onClose} title={title} footer={footer}>{children}</OperixBottomSheet>;
}

export function OperixActiveFilters({ filters, onRemove }: { filters: Array<{ id: string; label: string }>; onRemove: (id: string) => void }) {
    const { palette } = useMobileTheme();
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>{filters.map((filter) => <Pressable key={filter.id} accessibilityRole="button" accessibilityLabel={`Remove ${filter.label}`} onPress={() => onRemove(filter.id)} style={[styles.activeFilter, { backgroundColor: palette.iconSurface }]}><Text style={[styles.activeFilterText, { color: palette.primary }]}>{filter.label}</Text><X color={palette.primary} size={13} /></Pressable>)}</ScrollView>;
}

const styles = StyleSheet.create({
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: operixMobileTokens.radii.control },
    buttonContent: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
    shortcutContent: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
    buttonText: { flexShrink: 1, textAlign: 'center', fontFamily: operixMobileTokens.typography.fontFamily.semibold, lineHeight: 20 },
    disabled: { opacity: 0.48 },
    iconButton: { alignItems: 'center', justifyContent: 'center' },
    card: { borderWidth: 1, borderRadius: operixMobileTokens.radii.card, padding: operixMobileTokens.layout.cardPadding },
    fieldContainer: { marginBottom: operixMobileTokens.spacing.lg },
    fieldLabel: { marginBottom: operixMobileTokens.spacing.sm, fontSize: operixMobileTokens.typography.size.bodySmall, lineHeight: operixMobileTokens.typography.lineHeight.bodySmall, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    inputShell: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: operixMobileTokens.radii.input },
    inputFocused: { shadowColor: operixMobileTokens.colors.primary, shadowOpacity: 0.12, shadowRadius: 8, elevation: 1 },
    input: { flex: 1, minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, fontSize: operixMobileTokens.typography.size.bodyLarge, lineHeight: operixMobileTokens.typography.lineHeight.bodyLarge, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    inputWithoutLeftPadding: { paddingLeft: 4 },
    inputWithoutRightPadding: { paddingRight: 4 },
    inputAffix: { paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    fieldHelper: { marginTop: 5, fontSize: operixMobileTokens.typography.size.bodySmall, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    fieldError: { marginTop: 5, fontSize: operixMobileTokens.typography.size.bodySmall, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    textArea: { minHeight: 120, paddingTop: 14 },
    selectShell: { minHeight: 52, borderWidth: 1, borderRadius: operixMobileTokens.radii.input, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    selectText: { flex: 1, fontSize: operixMobileTokens.typography.size.bodyLarge, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    switchRow: { minHeight: operixMobileTokens.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    switchCopy: { flex: 1 },
    switchLabel: { fontSize: operixMobileTokens.typography.size.body, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    switchDescription: { marginTop: 3, fontSize: operixMobileTokens.typography.size.bodySmall, lineHeight: operixMobileTokens.typography.lineHeight.bodySmall, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    choiceRow: { minHeight: operixMobileTokens.touchTarget, flexDirection: 'row', alignItems: 'center', gap: 10 },
    choiceLabel: { flex: 1, fontSize: operixMobileTokens.typography.size.body, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    searchContainer: { marginBottom: operixMobileTokens.spacing.md },
    searchInput: { minHeight: 58, fontSize: 17 },
    amountPrefix: { fontSize: operixMobileTokens.typography.size.bodyLarge, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    badge: { alignSelf: 'flex-start', minHeight: 26, borderRadius: operixMobileTokens.radii.pill, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
    compactBadge: { minHeight: 23, paddingHorizontal: 8, paddingVertical: 4 },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: operixMobileTokens.typography.size.label, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    compactBadgeText: { fontSize: 10 },
    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    divider: { height: 1, width: '100%' },
    alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderWidth: 1, borderRadius: operixMobileTokens.radii.control },
    alertCopy: { flex: 1, gap: 3 },
    alertTitle: { fontSize: 13, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    alertMessage: { fontSize: 12, lineHeight: 18, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    alertAction: { marginTop: 5, fontSize: 12, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    toast: { position: 'absolute', left: 16, right: 16, bottom: 20, zIndex: 100, minHeight: 56, borderWidth: 1, borderRadius: operixMobileTokens.radii.control, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
    toastIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    toastText: { flex: 1, fontSize: 13, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    toastAction: { fontSize: 12, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    stateContainer: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 56 },
    errorState: { paddingVertical: 40 },
    stateIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    stateTitle: { fontSize: 17, lineHeight: 23, fontFamily: operixMobileTokens.typography.fontFamily.semibold, textAlign: 'center' },
    stateDescription: { maxWidth: 290, marginTop: 7, fontSize: 13, lineHeight: 20, fontFamily: operixMobileTokens.typography.fontFamily.regular, textAlign: 'center' },
    stateAction: { alignSelf: 'center', marginTop: 18 },
    loadingState: { minHeight: 260, justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
    loadingSkeletonHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
    loadingSkeletonCopy: { flex: 1, gap: 8 },
    loadingSkeletonGap: { marginTop: 2 },
    loadingSkeletonLine: { marginTop: 4 },
    loadingSkeletonCard: { width: '100%', marginTop: 8 },
    loadingLabel: { fontSize: 13, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: operixMobileTokens.colors.overlay },
    modalBottomOverlay: { alignItems: 'stretch', justifyContent: 'flex-end', padding: 0 },
    modalContent: { width: '100%', maxHeight: '88%', borderRadius: operixMobileTokens.radii.modal, overflow: 'hidden' },
    modalBottomContent: { maxHeight: '88%', borderTopLeftRadius: operixMobileTokens.radii.bottomSheet, borderTopRightRadius: operixMobileTokens.radii.bottomSheet, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingTop: 10 },
    modalHeader: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    modalHeaderCopy: { flex: 1 },
    modalTitle: { fontSize: 21, lineHeight: 27, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    modalSubtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    modalBody: { padding: 20 },
    modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: operixMobileTokens.colors.border },
    bottomSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: operixMobileTokens.colors.overlay },
    bottomSheet: { borderTopLeftRadius: operixMobileTokens.radii.bottomSheet, borderTopRightRadius: operixMobileTokens.radii.bottomSheet, paddingTop: 10, paddingBottom: 24 },
    bottomSheetBody: { paddingHorizontal: 20, paddingBottom: 8 },
    sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 4, backgroundColor: '#CBD5E1', marginBottom: 10 },
    confirmMessage: { fontSize: 14, lineHeight: 21, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    confirmButton: { flex: 1 },
    listItem: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    listItemLeading: { minWidth: 0 },
    listItemIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    listItemCopy: { flex: 1, minWidth: 0 },
    listItemTitle: { fontSize: 14, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    listItemSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    section: { marginBottom: operixMobileTokens.layout.sectionSpacing },
    sectionHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sectionTitle: { fontSize: operixMobileTokens.typography.size.section, lineHeight: operixMobileTokens.typography.lineHeight.section, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    sectionAction: { fontSize: 15, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    statCard: { flex: 1, minHeight: 82 },
    statHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
    statIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    statLabel: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    statValue: { marginTop: 7, flexShrink: 1, fontSize: 21, lineHeight: 26, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    fab: { width: 56, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    extendedFab: { width: 'auto', minWidth: 56, paddingHorizontal: 18, borderRadius: 28 },
    fabLabel: { color: '#FFFFFF', fontSize: 14, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    recordHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 },
    recordLeading: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    recordCopy: { flex: 1, minWidth: 0 },
    recordTitle: { fontSize: 14, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    recordSubtitle: { marginTop: 3, fontSize: 11, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    recordMetadata: { marginTop: 12, gap: 5 },
    recordMeta: { fontSize: 12, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    recordMetaNode: { minHeight: 16 },
    filterButton: { minHeight: 44, paddingHorizontal: 13, borderWidth: 1, borderRadius: operixMobileTokens.radii.control, flexDirection: 'row', alignItems: 'center', gap: 7 },
    filterLabel: { fontSize: 13, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    filterCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    filterCountText: { color: '#FFFFFF', fontSize: 10, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    activeFilters: { paddingVertical: 2, gap: 8 },
    activeFilter: { minHeight: 30, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5 },
    activeFilterText: { fontSize: 11, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    filterSheetActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});

export const operixMobileStyles = styles;
