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
import { getWorkspaceScope, hasWorkspacePermission } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { BriefcaseBusiness, ClipboardList, FileCheck2, FileSignature, FileText, HandCoins, Package, PackageCheck, ReceiptText, UserPlus, WalletCards } from 'lucide-react-native';
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
    const [permissions, setPermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);

    useEffect(() => {
        let active = true;
        if (!user) return () => { active = false; };
        void getWorkspaceScope(user.id).then((workspace) => {
            if (!active) return;
            setPermissions(workspace.permissions);
            setPlatformAdmin(workspace.platformAdmin);
        }).catch(() => {
            if (!active) return;
            setPermissions([]);
            setPlatformAdmin(false);
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
        { id: 'other-income', label: t('otherIncome', language), description: t('addOtherIncome', language), icon: HandCoins, onPress: () => navigation.navigate('OtherIncomeForm') },
        { id: 'contract', label: t('contracts', language), description: t('contractsAndAgreements', language), icon: FileSignature, onPress: () => navigation.navigate('ContractForm') },
    ];
    const actionPermissions: Record<string, string> = {
        invoice: 'invoice.create',
        proforma: 'proforma.create',
        quote: 'offer.create',
        order: 'order.create',
        'delivery-note': 'delivery_note.create',
        client: 'customer.create',
        product: 'product.create',
        expense: 'expense.create',
        payment: 'payment.create',
        'other-income': 'payment.create',
        contract: 'contracts.manage',
    };
    const visibleActions = actions.filter((action) => hasWorkspacePermission({ permissions, platformAdmin }, actionPermissions[action.id]));

    if (!visibleActions.length) return null;

    return <>
        <View pointerEvents="box-none" style={inline ? { alignItems: 'flex-end', height: 68, justifyContent: 'center' } : undefined}>
            <OperixFloatingActionButton testID="global-create-button" onPress={() => setOpen(true)} label={t('create', language)} style={inline ? undefined : { position: 'absolute', right: 20, bottom: 18 }} />
        </View>
        <OperixBottomSheet visible={open} onClose={() => setOpen(false)} title={t('createNew', language)} subtitle={t('advancedToolsAndSettings', language)}>
            {visibleActions.map((action) => <OperixListItem testID={`global-create-${action.id}-action`} key={action.id} title={action.label} subtitle={action.description} icon={action.icon} onPress={() => { setOpen(false); action.onPress(); }} showChevron />)}
        </OperixBottomSheet>
    </>;
}
