import React, { ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import {
    OperixAvatar,
    OperixBadge,
    OperixBottomSheet,
    OperixEmptyState,
    OperixErrorState,
    OperixFloatingActionButton,
    OperixIcon,
    OperixIconButton,
    OperixHeader,
    OperixListItem,
    OperixLoadingState,
    OperixSearchInput,
    OperixSection,
    OperixScreen,
    OperixStatCard,
    operixMobileStyles,
} from '@invoice-monorepo/ui';
import { useTheme as useInvoiceTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { BriefcaseBusiness, ClipboardList, FileCheck2, FileText, HandCoins, Package, PackageCheck, ReceiptText, UserPlus, WalletCards } from 'lucide-react-native';

/**
 * Invoice Mobile compatibility names. The implementation now lives in the
 * shared OperiX mobile package; product-specific create actions remain here.
 */
export const MobileScreen = OperixScreen;
export const MobileHeader = OperixHeader;
export const IconButton = OperixIconButton;
export const SearchField = OperixSearchInput;
export const MobileStatusBadge = OperixBadge;
export const EmptyState = OperixEmptyState;
export const LoadingState = OperixLoadingState;
export const ErrorState = OperixErrorState;
export const MetricCard = OperixStatCard;
export const Avatar = OperixAvatar;
export const mobileStyles = operixMobileStyles;

export function SectionTitle({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
    return <OperixSection title={title} action={action} onAction={onPress} />;
}

export function ShortcutRow({ icon: Icon = BriefcaseBusiness, title, description, onPress, trailing, testID }: { icon?: OperixIcon; title: string; description?: string; onPress: () => void; trailing?: ReactNode; testID?: string }) {
    return <OperixListItem testID={testID} title={title} subtitle={description} icon={Icon} onPress={onPress} trailing={trailing} showChevron style={{ marginBottom: 10 }} />;
}

type CreateAction = { id: string; label: string; description: string; icon: OperixIcon; onPress: () => void };

export function GlobalCreateButton({ inline = false }: { inline?: boolean }) {
    const { user } = useAuth();
    const { language } = useInvoiceTheme();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [open, setOpen] = useState(false);
    const [roleCode, setRoleCode] = useState<'super_administrator' | 'company_administrator' | 'manager' | 'employee'>('employee');

    useEffect(() => {
        let active = true;
        if (!user) return () => { active = false; };
        void getWorkspaceScope(user.id).then(({ roleCode: workspaceRoleCode }) => {
            if (active) setRoleCode(workspaceRoleCode);
        }).catch(() => {
            if (active) setRoleCode('employee');
        });
        return () => { active = false; };
    }, [user?.id]);

    const actions: CreateAction[] = [
        { id: 'invoice', label: t('invoice', language), description: t('newInvoice', language), icon: FileText, onPress: () => navigation.navigate('InvoiceForm', { documentType: 'INVOICE' }) },
        { id: 'proforma', label: t('proformaInvoice', language), description: t('proInvoice', language), icon: ReceiptText, onPress: () => navigation.navigate('InvoiceForm', { documentType: 'PROFORMA', type: 'invoice', subtype: 'pro_invoice' }) },
        { id: 'quote', label: t('quote', language), description: t('newOffer', language), icon: FileCheck2, onPress: () => navigation.navigate('InvoiceForm', { documentType: 'QUOTE', type: 'offer', subtype: 'offer' }) },
        { id: 'order', label: t('order', language), description: t('orders', language), icon: ClipboardList, onPress: () => navigation.navigate('InvoiceForm', { documentType: 'SALES_ORDER', type: 'offer', subtype: 'order' }) },
        { id: 'delivery-note', label: t('deliveryNoteTitle', language), description: t('deliveryNote', language), icon: PackageCheck, onPress: () => navigation.navigate('InvoiceForm', { documentType: 'DELIVERY_NOTE', subtype: 'delivery_note' }) },
        { id: 'client', label: t('client', language), description: t('addCustomer', language), icon: UserPlus, onPress: () => navigation.navigate('ClientForm') },
        { id: 'product', label: t('products', language), description: t('addProduct', language), icon: Package, onPress: () => navigation.navigate('ProductForm') },
        { id: 'expense', label: t('expense', language), description: t('addExpense', language), icon: WalletCards, onPress: () => navigation.navigate('ExpenseForm') },
        { id: 'payment', label: t('payment', language), description: t('registerPayment', language), icon: HandCoins, onPress: () => navigation.navigate('PaymentForm') },
    ];
    const visibleActions = roleCode === 'employee'
        ? actions.filter((action) => ['invoice', 'proforma', 'quote', 'order', 'delivery-note'].includes(action.id))
        : actions;

    return <>
        <View pointerEvents="box-none" style={inline ? { alignItems: 'flex-end', height: 68, justifyContent: 'center' } : undefined}>
            <OperixFloatingActionButton testID="global-create-button" onPress={() => setOpen(true)} label={t('create', language)} style={inline ? undefined : { position: 'absolute', right: 20, bottom: 18 }} />
        </View>
        <OperixBottomSheet visible={open} onClose={() => setOpen(false)} title={t('createNew', language)} subtitle={t('advancedToolsAndSettings', language)}>
            {visibleActions.map((action) => <OperixListItem testID={`global-create-${action.id}-action`} key={action.id} title={action.label} subtitle={action.description} icon={action.icon} onPress={() => { setOpen(false); action.onPress(); }} showChevron />)}
        </OperixBottomSheet>
    </>;
}
