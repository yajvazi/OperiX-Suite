import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    BarChart3,
    Bell,
    BookOpen,
    Building2,
    CircleHelp,
    CreditCard,
    FileCheck2,
    FileText,
    Globe2,
    Landmark,
    LayoutDashboard,
    Package,
    PackageCheck,
    ShieldCheck,
    ShoppingCart,
    SlidersHorizontal,
    Users,
    WalletCards,
} from 'lucide-react-native';
import { brand, getPalette } from '../../theme/brand';
import { useTheme } from '@invoice-monorepo/hooks';
import { MOBILE_DOC_CATEGORIES, type MobileDocArticle, type MobileDocCategory } from '../../generated/mobileDocs';
import type { DocumentationLanguage } from '../../services/helpDocumentation';

type HelpIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

export const HELP_CATEGORY_ICONS: Record<string, HelpIcon> = {
    BookOpen,
    LayoutDashboard,
    FileText,
    Users,
    Package,
    CreditCard,
    WalletCards,
    PackageCheck,
    ShoppingCart,
    FileCheck2,
    BarChart3,
    Landmark,
    ShieldCheck,
    SlidersHorizontal,
    Building2,
    Globe2,
    Bell,
    CircleHelp,
};

const STATUS_LABELS: Record<DocumentationLanguage, Record<string, string>> = {
    en: {
        partial: 'Partial',
        experimental: 'Experimental',
        development: 'In development',
        internal: 'Internal',
        disabled: 'Disabled',
        broken: 'Unavailable',
    },
    sq: {
        partial: 'Pjesërisht',
        experimental: 'Eksperimentale',
        development: 'Në zhvillim',
        internal: 'E brendshme',
        disabled: 'E çaktivizuar',
        broken: 'E padisponueshme',
    },
};

export function HelpLanguageToggle({ language, onChange }: { language: DocumentationLanguage; onChange: (language: DocumentationLanguage) => void }) {
    const { isDark } = useTheme();
    const palette = getPalette(isDark);
    return (
        <View style={[styles.languageToggle, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} accessibilityRole="tablist">
            {(['en', 'sq'] as const).map((option) => {
                const selected = language === option;
                return (
                    <TouchableOpacity
                        key={option}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={option === 'en' ? 'English' : 'Shqip'}
                        onPress={() => onChange(option)}
                        style={[styles.languageOption, selected && { backgroundColor: brand.colors.primary }]}
                    >
                        <Text style={[styles.languageText, { color: selected ? '#FFFFFF' : palette.muted }]}>{option === 'en' ? 'EN' : 'SQ'}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export function HelpCategoryCard({ category, language, articleCount, onPress }: { category: MobileDocCategory; language: DocumentationLanguage; articleCount: number; onPress: () => void }) {
    const { isDark } = useTheme();
    const palette = getPalette(isDark);
    const Icon = HELP_CATEGORY_ICONS[category.icon] || CircleHelp;
    const articleLabel = language === 'sq' ? (articleCount === 1 ? 'artikull' : 'artikuj') : (articleCount === 1 ? 'article' : 'articles');
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={category.title[language]}
            onPress={onPress}
            style={[styles.categoryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
            <View style={[styles.categoryIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={21} /></View>
            <Text style={[styles.categoryTitle, { color: palette.text }]} numberOfLines={2}>{category.title[language]}</Text>
            <Text style={[styles.categoryCount, { color: palette.muted }]}>{articleCount} {articleLabel}</Text>
        </TouchableOpacity>
    );
}

export function HelpArticleCard({ article, language, onPress }: { article: MobileDocArticle; language: DocumentationLanguage; onPress: () => void }) {
    const { isDark } = useTheme();
    const palette = getPalette(isDark);
    const categoryIcon = MOBILE_DOC_CATEGORIES.find((category) => category.id === article.category)?.icon;
    const Icon = (categoryIcon && HELP_CATEGORY_ICONS[categoryIcon]) || FileText;
    const statusLabel = STATUS_LABELS[language][article.status];
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={article.title}
            onPress={onPress}
            style={[styles.articleCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
            <View style={[styles.articleIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={19} /></View>
            <View style={styles.articleCopy}>
                <Text style={[styles.articleTitle, { color: palette.text }]}>{article.title}</Text>
                <Text style={[styles.articleDescription, { color: palette.muted }]} numberOfLines={2}>{article.description}</Text>
                {statusLabel ? <View style={[styles.statusBadge, { backgroundColor: article.status === 'disabled' ? '#FFF0EF' : '#FFF6D9' }]}><Text style={[styles.statusText, { color: article.status === 'disabled' ? brand.colors.error : brand.colors.warning }]}>{statusLabel}</Text></View> : null}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    languageToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 2 },
    languageOption: { minWidth: 34, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    languageText: { fontSize: 10, fontFamily: brand.fonts.semibold },
    categoryCard: { width: '48.5%', minHeight: 126, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 10, ...brand.shadow.card },
    categoryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    categoryTitle: { fontSize: 13, lineHeight: 18, fontFamily: brand.fonts.semibold },
    categoryCount: { fontSize: 10, lineHeight: 15, fontFamily: brand.fonts.regular, marginTop: 4 },
    articleCard: { minHeight: 82, borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, ...brand.shadow.card },
    articleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
    articleCopy: { flex: 1 },
    articleTitle: { fontSize: 13, lineHeight: 19, fontFamily: brand.fonts.semibold },
    articleDescription: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 3 },
    statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 7 },
    statusText: { fontSize: 9, fontFamily: brand.fonts.semibold },
});
