import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ArrowUpRight, CheckCircle2, FileText, Package, Receipt, UserRound } from 'lucide-react-native';
import { OperixButton, OperixCard } from '@invoice-monorepo/ui';
import { formatCurrency, formatDate, t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../../theme/brand';
import type { AICard } from '../../../services/ai/operixAi';

type CardProps = {
    card: AICard;
    language: string;
    isDark: boolean;
    confirmingActionId?: string | null;
    completedActionIds?: Set<string>;
    onConfirm?: (actionId: string) => void;
    onEdit?: (card: AICard) => void;
    onNavigate?: (kind: 'invoice' | 'customer' | 'product' | 'expense' | 'invoices' | 'overdue' | 'inventory', id?: string) => void;
    onSelect?: (choice: Record<string, unknown>, entity: string) => void;
};

function value(data: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) if (data[key] !== undefined && data[key] !== null) return data[key];
    return undefined;
}

function text(data: Record<string, unknown>, ...keys: string[]) {
    const result = value(data, ...keys);
    return result === undefined ? '' : String(result);
}

function amount(data: Record<string, unknown>, ...keys: string[]) {
    const result = Number(value(data, ...keys) || 0);
    return Number.isFinite(result) ? result : 0;
}

function CardTitle({ title, icon: Icon = FileText, palette }: { title: string; icon?: React.ComponentType<{ color?: string; size?: number }>; palette: ReturnType<typeof getPalette> }) {
    return <View style={styles.cardTitleRow}><View style={[styles.cardIcon, { backgroundColor: palette.iconSurface }]}><Icon color={palette.primary} size={17} /></View><Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>{title}</Text></View>;
}

function Metric({ label, value: metricValue, palette, strong = false }: { label: string; value: string; palette: ReturnType<typeof getPalette>; strong?: boolean }) {
    return <View style={styles.metric}><Text style={[styles.metricLabel, { color: palette.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: palette.text }, strong && styles.metricStrong]} numberOfLines={1}>{metricValue}</Text></View>;
}

function ActionButton({ title, actionId, props, variant = 'primary' }: { title: string; actionId?: string; props: CardProps; variant?: 'primary' | 'outline' | 'secondary' }) {
    if (!actionId || !props.onConfirm) return null;
    if (props.completedActionIds?.has(actionId)) return <View style={styles.completed}><CheckCircle2 color={getPalette(props.isDark).success} size={15} /><Text style={[styles.completedText, { color: getPalette(props.isDark).success }]}>{t('confirmed', props.language)}</Text></View>;
    return <OperixButton testID={`ai-confirm-${actionId}`} title={title} variant={variant} size="small" loading={props.confirmingActionId === actionId} onPress={() => props.onConfirm?.(actionId)} />;
}

function NavigationButton({ title, kind, id, props }: { title: string; kind: 'invoice' | 'customer' | 'product' | 'expense' | 'invoices' | 'overdue' | 'inventory'; id?: string; props: CardProps }) {
    if (!props.onNavigate) return null;
    return <TouchableOpacity accessibilityRole="button" onPress={() => props.onNavigate?.(kind, id)} style={styles.linkButton}><Text style={[styles.linkText, { color: getPalette(props.isDark).primary }]}>{title}</Text><ArrowUpRight color={getPalette(props.isDark).primary} size={15} /></TouchableOpacity>;
}

function EditButton({ card, props }: { card: AICard; props: CardProps }) {
    if (!props.onEdit) return null;
    return <TouchableOpacity accessibilityRole="button" onPress={() => props.onEdit?.(card)} style={styles.linkButton}><Text style={[styles.linkText, { color: getPalette(props.isDark).primary }]}>{t('operixAiEdit', props.language)}</Text><ArrowUpRight color={getPalette(props.isDark).primary} size={15} /></TouchableOpacity>;
}

export function AICardView(props: CardProps) {
    const { card, language, isDark } = props;
    const palette = getPalette(isDark);
    const data = card.data || {};
    const title = card.title || '';

    if (card.type === 'error') return <OperixCard variant="soft" style={[styles.card, { borderColor: palette.error }]}><Text style={[styles.errorTitle, { color: palette.error }]}>{title || t('error', language)}</Text><Text style={[styles.body, { color: palette.text }]}>{text(data, 'message')}</Text></OperixCard>;

    if (card.type === 'selection') {
        const choices = Array.isArray(data.choices) ? data.choices.filter((choice): choice is Record<string, unknown> => Boolean(choice) && typeof choice === 'object') : [];
        return <OperixCard style={styles.card}><CardTitle title={title || t('selectClient', language)} icon={UserRound} palette={palette} /><Text style={[styles.body, { color: palette.muted }]}>{language === 'sq' ? 'Zgjidhni regjistrimin e saktë.' : 'Choose the exact record to continue.'}</Text>{choices.map((choice, index) => <TouchableOpacity key={String(choice.id || index)} accessibilityRole="button" onPress={() => props.onSelect?.(choice, String(data.entity || 'record'))} style={[styles.choice, { borderColor: palette.border }]}><View style={styles.choiceCopy}><Text style={[styles.choiceName, { color: palette.text }]}>{String(choice.name || 'Record')}</Text><Text style={[styles.choiceMeta, { color: palette.muted }]}>{String(choice.email || choice.sku || choice.phone || '')}</Text></View><ArrowUpRight color={palette.primary} size={16} /></TouchableOpacity>)}</OperixCard>;
    }

    if (card.type === 'invoice' || card.type === 'invoice_confirmation') {
        const invoiceId = text(data, 'invoiceId', 'id');
        const actionId = text(data, 'actionId');
        const customerValue = value(data, 'customerName');
        const customerObject = value(data, 'customer');
        const customerName = typeof customerValue === 'string'
            ? customerValue
            : customerObject && typeof customerObject === 'object'
                ? String((customerObject as Record<string, unknown>).name || '')
                : '';
        const total = amount(data, 'total');
        const outstanding = amount(data, 'outstanding');
        return <OperixCard style={styles.card} variant={card.type === 'invoice_confirmation' ? 'outlined' : 'default'}><CardTitle title={title || text(data, 'invoiceNumber') || t('invoice', language)} palette={palette} /><Text style={[styles.subline, { color: palette.muted }]}>{customerName || t('customer', language)}{text(data, 'issueDate') ? ` · ${formatDate(text(data, 'issueDate'), language)}` : ''}</Text><View style={styles.metrics}><Metric label={t('operixAiTotal', language)} value={formatCurrency(total, text(data, 'currency') || 'EUR', language)} palette={palette} strong /><Metric label={t('operixAiOutstanding', language)} value={formatCurrency(outstanding, text(data, 'currency') || 'EUR', language)} palette={palette} /></View>{text(data, 'dueDate') ? <Text style={[styles.meta, { color: palette.muted }]}>{t('operixAiDueDate', language)}: {formatDate(text(data, 'dueDate'), language)}{data.overdue ? ` · ${text(data, 'daysOverdue')} ${t('operixAiOverdue', language)}` : ''}</Text> : null}<View style={styles.actions}>{card.type === 'invoice_confirmation' ? <><ActionButton title={t('operixAiCreateInvoice', language)} actionId={actionId} props={props} /><EditButton card={card} props={props} /></> : <NavigationButton title={t('operixAiViewInvoice', language)} kind="invoice" id={invoiceId} props={props} />}</View></OperixCard>;
    }

    if (card.type === 'customer') {
        const customerId = text(data, 'customerId', 'id');
        return <OperixCard style={styles.card}><CardTitle title={title || text(data, 'name') || t('customer', language)} icon={UserRound} palette={palette} /><View style={styles.metrics}><Metric label={t('operixAiTotal', language)} value={formatCurrency(amount(data, 'lifetimeSales'), text(data, 'currency') || 'EUR', language)} palette={palette} strong /><Metric label={t('operixAiOutstanding', language)} value={formatCurrency(amount(data, 'outstanding'), text(data, 'currency') || 'EUR', language)} palette={palette} /></View>{text(data, 'averagePaymentDays') ? <Text style={[styles.meta, { color: palette.muted }]}>{language === 'sq' ? 'Mesatarja e pagesës' : 'Average payment'}: {text(data, 'averagePaymentDays')} days</Text> : null}{data.topProduct && typeof data.topProduct === 'object' ? <Text style={[styles.meta, { color: palette.muted }]}>{language === 'sq' ? 'Produkti kryesor' : 'Top product'}: {String((data.topProduct as Record<string, unknown>).name || '')}</Text> : null}<View style={styles.actions}><NavigationButton title={t('operixAiViewCustomer', language)} kind="customer" id={customerId} props={props} /></View></OperixCard>;
    }

    if (card.type === 'product') {
        const productId = text(data, 'productId', 'id');
        return <OperixCard style={styles.card}><CardTitle title={title || text(data, 'name') || t('products', language)} icon={Package} palette={palette} /><Text style={[styles.subline, { color: palette.muted }]}>{text(data, 'sku')}</Text><View style={styles.metrics}><Metric label={language === 'sq' ? 'Çmimi' : 'Price'} value={formatCurrency(amount(data, 'price'), 'EUR', language)} palette={palette} strong />{data.trackStock ? <Metric label={t('operixAiStockRemaining', language)} value={`${text(data, 'stock') || '0'} ${text(data, 'unit')}`} palette={palette} /> : null}</View><View style={styles.actions}><NavigationButton title={t('operixAiViewProduct', language)} kind="product" id={productId} props={props} /></View></OperixCard>;
    }

    if (card.type === 'inventory_alert') return <OperixCard variant="soft" style={styles.card}><CardTitle title={title || text(data, 'name') || t('inventory', language)} icon={Package} palette={palette} /><View style={styles.metrics}><Metric label={t('operixAiStockRemaining', language)} value={`${text(data, 'stockRemaining') || '0'} ${text(data, 'unit')}`} palette={palette} strong /><Metric label={t('operixAiAverageDailySales', language)} value={text(data, 'averageDailySales') || '—'} palette={palette} /></View><Text style={[styles.meta, { color: palette.warning }]}>{t('operixAiEstimate', language)}: {text(data, 'daysRemaining') ? `${text(data, 'daysRemaining')} ${language === 'sq' ? 'ditë' : 'days'}` : '—'} · {t('operixAiSuggestedReorder', language)}: {text(data, 'suggestedReorder') || '—'}</Text><View style={styles.actions}><NavigationButton title={t('operixAiViewProduct', language)} kind="product" id={text(data, 'productId', 'id')} props={props} /></View></OperixCard>;

    if (card.type === 'reminder') {
        const actionId = text(data, 'actionId');
        return <OperixCard style={styles.card}><CardTitle title={title || t('operixAiSendReminder', language)} icon={Receipt} palette={palette} /><Text style={[styles.body, { color: palette.text }]}>{text(data, 'count') || '0'} {language === 'sq' ? 'kujtesa të përgatitura' : 'reminders prepared'} · {formatCurrency(amount(data, 'totalOutstanding'), 'EUR', language)} {t('operixAiOutstanding', language).toLowerCase()}</Text><Text style={[styles.meta, { color: palette.muted }]}>{language === 'sq' ? 'Dërgimi kërkon konfirmim.' : 'Sending requires your confirmation.'}</Text><View style={styles.actions}><ActionButton title={t('operixAiSendReminder', language)} actionId={actionId} props={props} variant="outline" /><NavigationButton title={t('operixAiReview', language)} kind="overdue" props={props} /></View></OperixCard>;
    }

    if (card.type === 'receipt') {
        const actionId = text(data, 'actionId');
        return <OperixCard style={styles.card} variant="soft">
            <CardTitle title={title || t('operixAiReceiptScanned', language)} icon={Receipt} palette={palette} />
            <Text style={[styles.subline, { color: palette.muted }]}>{text(data, 'supplier') || (language === 'sq' ? 'Furnitor i panjohur' : 'Unknown supplier')}{text(data, 'date') ? ` · ${formatDate(text(data, 'date'), language)}` : ''}</Text>
            {text(data, 'supplierBusinessId') || text(data, 'invoiceNumber') ? <Text style={[styles.meta, { color: palette.muted }]}>{text(data, 'supplierBusinessId') ? `${t('operixAiSupplierId', language)}: ${text(data, 'supplierBusinessId')}` : ''}{text(data, 'supplierBusinessId') && text(data, 'invoiceNumber') ? ' · ' : ''}{text(data, 'invoiceNumber') ? `${t('operixAiInvoiceNumber', language)}: ${text(data, 'invoiceNumber')}` : ''}</Text> : null}
            <View style={styles.metrics}><Metric label={t('operixAiSubtotal', language)} value={formatCurrency(amount(data, 'subtotal'), text(data, 'currency') || 'EUR', language)} palette={palette} /><Metric label={t('operixAiTotal', language)} value={formatCurrency(amount(data, 'total'), text(data, 'currency') || 'EUR', language)} palette={palette} strong /></View>
            <Text style={[styles.meta, { color: palette.muted }]}>{t('operixAiVat', language)}: {formatCurrency(amount(data, 'vat'), text(data, 'currency') || 'EUR', language)} · {t('operixAiDetectedItems', language)}: {text(data, 'itemCount') || '0'}{text(data, 'paymentMethod') ? ` · ${t('operixAiPaymentMethod', language)}: ${text(data, 'paymentMethod')}` : ''}</Text>
            {Array.isArray(data.warnings) && data.warnings.length ? <Text style={[styles.warning, { color: palette.warning }]}>{(data.warnings as unknown[]).join(' ')}</Text> : null}
            <View style={styles.actions}><ActionButton title={t('operixAiCreateExpense', language)} actionId={actionId} props={props} variant="outline" /></View>
        </OperixCard>;
    }

    if (card.type === 'daily_briefing') {
        return <OperixCard style={styles.card} variant="soft"><CardTitle title={title || t('operixAiDailyBriefing', language)} icon={CheckCircle2} palette={palette} /><View style={styles.briefGrid}><Metric label={language === 'sq' ? 'Të ardhura' : 'Revenue'} value={formatCurrency(amount(data, 'revenue'), 'EUR', language)} palette={palette} strong /><Metric label={language === 'sq' ? 'Fatura' : 'Invoices'} value={text(data, 'invoicesIssued') || '0'} palette={palette} /><Metric label={language === 'sq' ? 'Pagesa' : 'Payments'} value={formatCurrency(amount(data, 'paymentsReceived'), 'EUR', language)} palette={palette} /><Metric label={t('operixAiOverdue', language)} value={`${text(data, 'overdueInvoices') || '0'} · ${formatCurrency(amount(data, 'overdueValue'), 'EUR', language)}`} palette={palette} /></View>{data.topProduct && typeof data.topProduct === 'object' ? <Text style={[styles.meta, { color: palette.text }]}>{language === 'sq' ? 'Produkti kryesor' : 'Top product'}: {String((data.topProduct as Record<string, unknown>).name || '')} · {String((data.topProduct as Record<string, unknown>).units || 0)} {language === 'sq' ? 'copë' : 'units'}</Text> : null}<Text style={[styles.meta, { color: palette.muted }]}>{String(data.lowStockCount || 0)} {language === 'sq' ? 'produkte kërkojnë vëmendje' : 'products need inventory attention'}.</Text><View style={styles.actions}><NavigationButton title={t('operixAiViewInvoices', language)} kind="invoices" props={props} /><NavigationButton title={t('operixAiViewOverdue', language)} kind="overdue" props={props} /><NavigationButton title={t('operixAiViewInventory', language)} kind="inventory" props={props} /></View></OperixCard>;
    }

    if (card.type === 'confirmation') {
        const isExpense = text(data, 'actionType') === 'create_expense';
        return <OperixCard style={styles.card} variant="soft"><CardTitle title={title || t('success', language)} icon={CheckCircle2} palette={palette} /><Text style={[styles.body, { color: palette.text }]}>{text(data, 'confirmed') ? (language === 'sq' ? 'Veprimi u konfirmua me sukses.' : 'The action was confirmed successfully.') : text(data, 'message')}</Text>{text(data, 'invoiceId') || text(data, 'id') ? <NavigationButton title={isExpense ? t('expenses', language) : t('operixAiViewInvoice', language)} kind={isExpense ? 'expense' : 'invoice'} id={text(data, 'invoiceId', 'id')} props={props} /> : null}</OperixCard>;
    }

    return <OperixCard style={styles.card}><CardTitle title={title || t('operixAiAssistantSection', language)} palette={palette} /><Text style={[styles.body, { color: palette.text }]}>{text(data, 'message') || JSON.stringify(data)}</Text></OperixCard>;
}

const styles = StyleSheet.create({
    card: { marginBottom: 12, padding: 15 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
    cardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { flex: 1, fontSize: 14, fontFamily: brand.fonts.semibold },
    subline: { fontSize: 12, marginBottom: 12, fontFamily: brand.fonts.regular },
    body: { fontSize: 13, lineHeight: 19, fontFamily: brand.fonts.regular },
    meta: { fontSize: 11, lineHeight: 17, marginTop: 8, fontFamily: brand.fonts.regular },
    warning: { fontSize: 11, lineHeight: 17, marginTop: 8, fontFamily: brand.fonts.medium },
    errorTitle: { fontSize: 13, fontFamily: brand.fonts.semibold, marginBottom: 5 },
    metrics: { flexDirection: 'row', gap: 12 },
    metric: { flex: 1, minWidth: 0 },
    metricLabel: { fontSize: 10, marginBottom: 3, fontFamily: brand.fonts.regular },
    metricValue: { fontSize: 13, fontFamily: brand.fonts.medium },
    metricStrong: { fontFamily: brand.fonts.semibold, fontSize: 15 },
    briefGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 13 },
    linkButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    linkText: { fontSize: 12, fontFamily: brand.fonts.semibold },
    choice: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    choiceCopy: { flex: 1 },
    choiceName: { fontSize: 13, fontFamily: brand.fonts.medium },
    choiceMeta: { fontSize: 11, marginTop: 2, fontFamily: brand.fonts.regular },
    completed: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
    completedText: { fontSize: 12, fontFamily: brand.fonts.semibold },
});
