import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Alert,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useFocusEffect } from '@react-navigation/native';
import { Plus, FileText, ChevronRight, Trash2 } from 'lucide-react-native';
import { FAB, Card } from '@invoice-monorepo/ui';
import { ContractTemplate } from '@invoice-monorepo/types';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { getWorkspaceScope } from '../../../services/workspace';
import { activeLocalStore } from '../../../services/localMode';
import { brand, getPalette } from '../../../theme/brand';
import { EmptyState, MobileHeader, MobileScreen, MobileStatusBadge } from '../../../components/mobile/MobileUI';

interface ContractTemplatesScreenProps {
    navigation: any;
}

function fieldCountLabel(count: number, language: string): string {
    return `${count} ${count === 1 ? t('field', language) : t('fields', language)}`;
}

export function ContractTemplatesScreen({ navigation }: ContractTemplatesScreenProps) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [canManageContracts, setCanManageContracts] = useState(false);

    const palette = getPalette(isDark);
    const textColor = palette.text;
    const mutedColor = palette.muted;

    useFocusEffect(
        useCallback(() => {
            fetchTemplates();
        }, [language, user])
    );

    const fetchTemplates = async () => {
        if (!user) return;
        setLoading(true);
        const workspace = await getWorkspaceScope(user.id).catch(() => null);
        const allowed = Boolean(workspace?.platformAdmin || workspace?.permissions.includes('contracts.manage'));
        setCanManageContracts(allowed);
        if (!allowed) {
            setTemplates([]);
            setLoading(false);
            return;
        }
        const localStore = await activeLocalStore();
        if (localStore) {
            setTemplates((await localStore.list('contract_templates')) as any);
            setLoading(false);
            return;
        }
        const { data, error } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        else setTemplates(data || []);

        setLoading(false);
    };

    const handleDelete = (id: string) => {
        Alert.alert(
            t('deleteTemplate', language),
            t('deleteTemplateConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        const localStore = await activeLocalStore();
                        if (localStore) { await localStore.remove('contract_templates', id); fetchTemplates(); return; }
                        const { error } = await supabase.from('contract_templates').delete().eq('id', id);
                        if (error) Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
                        else fetchTemplates();
                    }
                }
            ]
        );
    };

    const renderItem = ({ item }: { item: ContractTemplate }) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('ContractTemplateEditor', { templateId: item.id })}
        >
            <Card style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: palette.iconSurface }]}>
                        <FileText color={primaryColor} size={22} />
                    </View>
                    <View style={styles.cardContent}>
                        <Text numberOfLines={1} style={[styles.cardTitle, { color: textColor }]}>{item.name}</Text>
                        {item.description ? (
                            <Text numberOfLines={2} style={[styles.cardDesc, { color: mutedColor }]}>{item.description}</Text>
                        ) : null}
                        <View style={styles.cardMeta}>
                            <MobileStatusBadge tone="neutral" label={fieldCountLabel(item.fields?.length || 0, language)} compact />
                        </View>
                    </View>
                    {canManageContracts ? <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('delete', language)}
                        style={[styles.deleteButton, { backgroundColor: palette.errorSoft }]}
                        onPress={() => handleDelete(item.id)}
                    >
                        <Trash2 color={palette.error} size={18} />
                    </TouchableOpacity> : null}
                    <ChevronRight color={mutedColor} size={20} />
                </View>
            </Card>
        </TouchableOpacity>
    );

    return (
        <MobileScreen>
            <MobileHeader title={t('contractTemplates', language)} onBack={() => navigation.goBack()} />

            {loading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={primaryColor} />
                </View>
            ) : (
                <FlatList keyboardShouldPersistTaps="handled"
                    data={templates}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState title={t('contractTemplates', language)} description={t('noTemplatesCreateOne', language)} icon={FileText} />
                    }
                />
            )}

            {canManageContracts ? <FAB
                onPress={() => navigation.navigate('ContractTemplateEditor')}
                icon={Plus}
                color={primaryColor}
            /> : null}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },
    card: { marginBottom: 12 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconContainer: { width: 48, height: 48, borderRadius: brand.radius.control, alignItems: 'center', justifyContent: 'center' },
    cardContent: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: 15, fontFamily: brand.fonts.semibold, marginBottom: 2 },
    cardDesc: { fontSize: 13, fontFamily: brand.fonts.regular, marginBottom: 6 },
    cardMeta: { flexDirection: 'row', marginTop: 4 },
    deleteButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
