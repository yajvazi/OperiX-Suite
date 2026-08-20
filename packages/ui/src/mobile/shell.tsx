import React, { ReactNode } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, UserRound } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { getOperixPalette, operixMobileTokens } from './tokens';
import { OperixBottomSheet, OperixIconButton, OperixListItem, OperixIcon } from './primitives';

export type OperixProduct = 'invoice' | 'hr' | 'booking' | 'desk' | 'scanner' | 'tracker' | (string & {});

export function OperixMobileAppShell({ product, children, style }: { product: OperixProduct; children: ReactNode; style?: StyleProp<ViewStyle> }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getOperixPalette(isDark, primaryColor);
    return <View accessibilityLabel={`OperiX ${product} mobile`} style={[styles.appShell, { backgroundColor: palette.background }, style]}>{children}</View>;
}

export function OperixHeader({ title, subtitle, product, onBack, showBack = Boolean(onBack), right, style, onTitleLongPress, titleTestID }: { title: string; subtitle?: string; product?: string; onBack?: () => void; showBack?: boolean; right?: ReactNode; style?: StyleProp<ViewStyle>; onTitleLongPress?: () => void; titleTestID?: string }) {
    const { isDark, language, primaryColor } = useTheme();
    const palette = getOperixPalette(isDark, primaryColor);
    const navigation = useNavigation<any>();
    const handleBack = () => { if (onBack) onBack(); else navigation.goBack(); };
    const titleText = <Text style={[styles.headerTitle, { color: palette.text }]}>{title}</Text>;
    return <View style={[styles.header, style]}><View style={styles.headerLeading}>{showBack ? <OperixIconButton label={t('back', language)} onPress={handleBack} variant="ghost" style={styles.headerBack}><ArrowLeft color={palette.text} size={21} /></OperixIconButton> : null}<View style={styles.headerCopy}>{product ? <Text style={[styles.headerProduct, { color: palette.muted }]}>{product}</Text> : null}{subtitle ? <Text style={[styles.headerSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}{onTitleLongPress ? <Pressable testID={titleTestID} onLongPress={onTitleLongPress} delayLongPress={500} accessibilityRole="button">{titleText}</Pressable> : titleText}</View></View>{right ? <View style={styles.headerRight}>{right}</View> : null}</View>;
}

export function OperixScreen({ children, style, edges = ['top'], testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; edges?: Array<'top' | 'right' | 'bottom' | 'left'>; testID?: string }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getOperixPalette(isDark, primaryColor);
    return <SafeAreaView testID={testID} edges={edges} style={[styles.screen, { backgroundColor: palette.background }, style]}>{children}</SafeAreaView>;
}

export function OperixScrollableScreen({ children, style, contentContainerStyle, refreshing, onRefresh, keyboardShouldPersistTaps = 'always', showsVerticalScrollIndicator = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle>; refreshing?: boolean; onRefresh?: () => void; keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'; showsVerticalScrollIndicator?: boolean }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getOperixPalette(isDark, primaryColor);
    return <OperixScreen style={style}><ScrollView style={styles.flex} contentContainerStyle={[styles.scrollContent, contentContainerStyle]} showsVerticalScrollIndicator={showsVerticalScrollIndicator} keyboardShouldPersistTaps={keyboardShouldPersistTaps} refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={palette.primary} /> : undefined}>{children}</ScrollView></OperixScreen>;
}

export function OperixFormScreen({ children, footer, style, contentContainerStyle }: { children: ReactNode; footer?: ReactNode; style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle> }) {
    return <OperixScreen edges={['top', 'bottom']} style={style}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}><ScrollView style={styles.flex} contentContainerStyle={[styles.formContent, contentContainerStyle]} keyboardShouldPersistTaps="always" keyboardDismissMode="none">{children}</ScrollView>{footer ? <View style={styles.formFooter}>{footer}</View> : null}</KeyboardAvoidingView></OperixScreen>;
}

export function OperixListScreen({ title, subtitle, onBack, right, search, filters, children, action, refreshing, onRefresh, contentContainerStyle }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; search?: ReactNode; filters?: ReactNode; children: ReactNode; action?: ReactNode; refreshing?: boolean; onRefresh?: () => void; contentContainerStyle?: StyleProp<ViewStyle> }) {
    return <OperixScreen><View style={styles.flex}><OperixHeader title={title} subtitle={subtitle} onBack={onBack} right={right} /><ScrollView style={styles.flex} contentContainerStyle={[styles.listContent, contentContainerStyle]} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}>{search ? <View style={styles.listSearch}>{search}</View> : null}{filters ? <View style={styles.listFilters}>{filters}</View> : null}{children}</ScrollView>{action ? <View pointerEvents="box-none" style={styles.floatingDock}>{action}</View> : null}</View></OperixScreen>;
}

export function OperixDetailScreen({ title, subtitle, onBack, right, status, children, action, contentContainerStyle }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode; status?: ReactNode; children: ReactNode; action?: ReactNode; contentContainerStyle?: StyleProp<ViewStyle> }) {
    return <OperixScreen><View style={styles.flex}><OperixHeader title={title} subtitle={subtitle} onBack={onBack} right={right} /><ScrollView style={styles.flex} contentContainerStyle={[styles.detailContent, contentContainerStyle]}>{status ? <View style={styles.detailStatus}>{status}</View> : null}{children}</ScrollView>{action ? <View pointerEvents="box-none" style={styles.floatingDock}>{action}</View> : null}</View></OperixScreen>;
}

export function OperixSettingsScreen({ title = 'Settings', subtitle, onBack, children }: { title?: string; subtitle?: string; onBack?: () => void; children: ReactNode }) {
    return <OperixScreen><View style={styles.flex}><OperixHeader title={title} subtitle={subtitle} onBack={onBack} /><ScrollView style={styles.flex} contentContainerStyle={styles.settingsContent} keyboardShouldPersistTaps="handled">{children}</ScrollView></View></OperixScreen>;
}

export interface OperixAccountMenuItem {
    id: string;
    title: string;
    subtitle?: string;
    onPress: () => void;
}

export interface OperixProductOption {
    id: string;
    label: string;
    subtitle?: string;
    icon?: OperixIcon;
    onPress: () => void;
}

/** Product switching surface. Callers pass only products the current user may access. */
export function OperixProductSwitcher({ visible, onClose, products, title = 'Switch product' }: { visible: boolean; onClose: () => void; products: OperixProductOption[]; title?: string }) {
    return <OperixBottomSheet visible={visible} onClose={onClose} title={title}>{products.map((product) => <OperixListItem key={product.id} title={product.label} subtitle={product.subtitle} icon={product.icon} onPress={() => { onClose(); product.onPress(); }} showChevron />)}</OperixBottomSheet>;
}

export function OperixAccountMenu({ name, email, items, onSignOut, signOutLabel = 'Sign out' }: { name: string; email?: string; items: OperixAccountMenuItem[]; onSignOut?: () => void; signOutLabel?: string }) {
    const { isDark, primaryColor } = useTheme();
    const palette = getOperixPalette(isDark, primaryColor);
    return <View><View style={[styles.accountHeader, { backgroundColor: palette.primary }]}><View style={[styles.accountAvatar, { backgroundColor: palette.iconSurface }]}><UserRound color={palette.primary} size={22} /></View><View style={styles.accountCopy}><Text style={styles.accountName}>{name}</Text>{email ? <Text style={styles.accountEmail}>{email}</Text> : null}</View></View>{items.length ? <View style={[styles.accountList, { backgroundColor: palette.surface, borderColor: palette.border }]}>{items.map((item, index) => <OperixListItem key={item.id} title={item.title} subtitle={item.subtitle} onPress={item.onPress} showChevron divider={index < items.length - 1} />)}</View> : null}{onSignOut ? <TouchableOpacity accessibilityRole="button" onPress={onSignOut} style={[styles.accountSignOut, { borderColor: palette.error, backgroundColor: palette.errorSoft }]}><Text style={[styles.accountSignOutText, { color: palette.error }]}>{signOutLabel}</Text><ChevronRight color={palette.error} size={17} /></TouchableOpacity> : null}</View>;
}

export function OperixTabNavigation({ tabs, activeKey, onChange, style }: { tabs: Array<{ key: string; label: string }>; activeKey: string; onChange: (key: string) => void; style?: StyleProp<ViewStyle> }) {
    const { palette } = useMobileThemeForShell();
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabNavigation, style]}>{tabs.map((tab) => { const active = tab.key === activeKey; return <TouchableOpacity key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(tab.key)} style={[styles.tab, { backgroundColor: active ? palette.primary : palette.surface, borderColor: active ? palette.primary : palette.border }]}><Text style={[styles.tabText, { color: active ? '#FFFFFF' : palette.muted }]}>{tab.label}</Text></TouchableOpacity>; })}</ScrollView>;
}

function useMobileThemeForShell() {
    const { isDark, primaryColor } = useTheme();
    return { palette: getOperixPalette(isDark, primaryColor) };
}

const styles = StyleSheet.create({
    appShell: { flex: 1 },
    flex: { flex: 1 },
    screen: { flex: 1 },
    header: { minHeight: operixMobileTokens.layout.headerHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: operixMobileTokens.layout.screenPadding, paddingTop: 8, paddingBottom: 12 },
    headerLeading: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    headerBack: { marginRight: 6 },
    headerCopy: { flex: 1 },
    headerProduct: { marginBottom: 2, fontSize: 10, letterSpacing: 1.1, fontFamily: operixMobileTokens.typography.fontFamily.semibold, textTransform: 'uppercase' },
    headerSubtitle: { marginBottom: 2, fontSize: 12, fontFamily: operixMobileTokens.typography.fontFamily.medium },
    headerTitle: { fontSize: operixMobileTokens.typography.size.title, lineHeight: operixMobileTokens.typography.lineHeight.title, letterSpacing: -0.4, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    headerRight: { marginLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    scrollContent: { paddingHorizontal: operixMobileTokens.layout.screenPadding, paddingBottom: 112 },
    formContent: { padding: operixMobileTokens.layout.screenPadding, paddingBottom: 120 },
    formFooter: { padding: 16, borderTopWidth: 1, borderTopColor: operixMobileTokens.colors.border },
    listContent: { paddingHorizontal: operixMobileTokens.layout.screenPadding, paddingBottom: 124 },
    listSearch: { marginBottom: 4 },
    listFilters: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    detailContent: { paddingHorizontal: operixMobileTokens.layout.screenPadding, paddingBottom: 124 },
    detailStatus: { marginBottom: 16 },
    floatingDock: { position: 'absolute', left: 0, right: 0, bottom: 10, paddingHorizontal: operixMobileTokens.layout.screenPadding, alignItems: 'flex-end' },
    settingsContent: { paddingBottom: 48 },
    accountHeader: { minHeight: 90, borderRadius: operixMobileTokens.radii.panel, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
    accountAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    accountCopy: { flex: 1 },
    accountName: { color: operixMobileTokens.colors.white, fontSize: 16, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    accountEmail: { marginTop: 3, color: '#D9E6FF', fontSize: 11, fontFamily: operixMobileTokens.typography.fontFamily.regular },
    accountList: { marginTop: 16, paddingHorizontal: 14, borderWidth: 1, borderRadius: operixMobileTokens.radii.card },
    accountSignOut: { minHeight: 48, marginTop: 16, paddingHorizontal: 16, borderWidth: 1, borderRadius: operixMobileTokens.radii.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    accountSignOutText: { fontSize: 13, fontFamily: operixMobileTokens.typography.fontFamily.semibold },
    tabNavigation: { paddingVertical: 4, gap: 8 },
    tab: { minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: operixMobileTokens.radii.pill, alignItems: 'center', justifyContent: 'center' },
    tabText: { fontSize: 12, fontFamily: operixMobileTokens.typography.fontFamily.medium },
});
