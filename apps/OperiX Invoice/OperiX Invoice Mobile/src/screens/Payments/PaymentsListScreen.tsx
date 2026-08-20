import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  ArrowLeft,
  Plus,
  DollarSign,
  User,
  FileText,
  Banknote,
  Building,
  Share2,
  Printer,
  MoreVertical,
  Edit2,
} from "lucide-react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@invoice-monorepo/api";
import { useAuth } from "@invoice-monorepo/hooks";
import { useTheme } from "@invoice-monorepo/hooks";
import { Card } from "@invoice-monorepo/ui";
import { Payment } from "@invoice-monorepo/types";
import { formatCurrency, formatDate as formatLocalizedDate, getLocalizedErrorMessage, t } from "@invoice-monorepo/i18n";
import {
  renderTransactionReportHtml,
  type TransactionReportCompany,
} from "@invoice-monorepo/report-templates";
import { getWorkspaceScope } from '../../services/workspace';
import { deleteCustomerPayment, listPayments } from '@invoice-monorepo/api/repositories';
import { namePdfFile, reportPdfFileName } from '../../services/pdf/fileNaming';

export function PaymentsListScreen({ navigation }: any) {
  const { user } = useAuth();
  const { isDark, language, primaryColor } = useTheme();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [totalReceived, setTotalReceived] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [company, setCompany] = useState<TransactionReportCompany>();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const generatePaymentsHtml = () =>
    renderTransactionReportHtml({
      template: "income-payment",
      title: t('incomingPayments', language),
      company,
      rows: payments as unknown as Record<string, unknown>[],
    });

  const generatePaymentsPdfUri = async () => {
    const { uri } = await Print.printToFileAsync({ html: generatePaymentsHtml(), base64: false });
    return namePdfFile(uri, reportPdfFileName(company?.name || t('company', language), t('incomingPayments', language)));
  };

  const handlePrintPdf = async () => {
    if (payments.length === 0) {
      Alert.alert(t('info', language), t('noPaymentsToExport', language));
      return;
    }
    setExporting(true);
    try {
      const uri = await generatePaymentsPdfUri();
      await Print.printAsync({ uri });
    } catch (error: any) {
      if (!error.message?.includes("cancelled")) {
        Alert.alert(t('error', language), `${t('printingFailed', language)}: ${getLocalizedErrorMessage(error, language, 'printingFailed')}`);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleSharePdf = async () => {
    if (payments.length === 0) {
      Alert.alert(t('info', language), t('noPaymentsToExport', language));
      return;
    }
    setExporting(true);
    try {
      const uri = await generatePaymentsPdfUri();

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('error', language), t('sharingUnavailable', language));
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: t('shareIncomingPayments', language),
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      Alert.alert(t('error', language), `${t('exportFailed', language)}: ${getLocalizedErrorMessage(error, language, 'exportFailed')}`);
    } finally {
      setExporting(false);
    }
  };

  const bgColor = isDark ? "#0D1B2A" : "#F7F9FC";
  const textColor = isDark ? "#fff" : "#111827";
  const cardBg = isDark ? "#14243A" : "#ffffff";
  const mutedColor = isDark ? "#98A2B3" : "#667085";

  useFocusEffect(
    useCallback(() => {
      fetchPayments();
    }, [language, user]),
  );

  const fetchPayments = async () => {
    if (!user) return;

    const { profile, company, companyIds } = await getWorkspaceScope(user.id);
    const tenant = company as any;
    if (profile) {
      setCompany({
        name: tenant?.company_name || tenant?.name || profile.company_name,
        email: tenant?.email || profile.email,
        phone: tenant?.phone || profile.phone,
        address: tenant?.address || tenant?.registered_address || profile.address,
        city: tenant?.city || tenant?.municipality || profile.city,
        country: tenant?.country || profile.country,
        website: tenant?.website || profile.website,
        taxId: tenant?.tax_id || tenant?.unique_business_number || profile.tax_id,
        bankName: tenant?.bank_name || profile.bank_name,
        bankAccount: tenant?.bank_account || profile.bank_account,
        iban: tenant?.bank_iban || profile.bank_iban,
        swift: tenant?.bank_swift || profile.bank_swift,
        signatureUrl: tenant?.signature_url || profile.signature_url,
        stampUrl: tenant?.stamp_url || profile.stamp_url,
        showSignature: true,
        showStamp: true,
      });
    }

    const data = await listPayments(supabase, { userId: user.id, companyIds });
    const paymentRows = data as unknown as Payment[];
    setPayments(paymentRows);
    const total = paymentRows.reduce((sum, p) => sum + Number(p.amount), 0);
    setTotalReceived(total);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPayments();
    setRefreshing(false);
  };

  const handleDelete = (payment: Payment) => {
    Alert.alert(
      t('delete', language),
      t('deletePaymentConfirmation', language).replace('{number}', payment.payment_number),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('delete', language),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user) throw new Error('Your session has expired.');
              const { companyIds } = await getWorkspaceScope(user.id);
              await deleteCustomerPayment(supabase, payment.id, { userId: user.id, companyIds });
              await fetchPayments();
            } catch (error) {
              Alert.alert(
                t('error', language),
                error instanceof Error ? error.message : t('failedToDeletePayment', language),
              );
            }
          },
        },
      ],
    );
  };

  const getMethodIcon = (method: string) => {
    return method === "bank" ? Building : Banknote;
  };

  const getMethodColor = (method: string) => {
    return method === "bank" ? "#3388FF" : "#12B76A";
  };

  const formatDate = (dateStr: string) => {
    return formatLocalizedDate(dateStr, language);
  };

  const renderPayment = ({ item }: { item: Payment }) => {
    // Keep legacy card records inside the supported cash/bank display model.
    const displayMethod = item.payment_method === 'cash' ? 'cash' : 'bank';
    const MethodIcon = getMethodIcon(displayMethod);
    const methodColor = getMethodColor(displayMethod);

    return (
      <TouchableOpacity
        testID={`payment-row-${item.id}`}
        activeOpacity={0.85}
        onPress={() =>
          navigation.navigate("PaymentForm", { paymentId: item.id })
        }
      >
        <Card style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <View
              style={[
                styles.methodBadge,
                { backgroundColor: `${methodColor}15` },
              ]}
            >
              <MethodIcon color={methodColor} size={20} />
            </View>

            <View style={styles.paymentInfo}>
              <Text style={[styles.paymentNumber, { color: textColor }]}>
                {item.payment_number}
              </Text>
              <View style={styles.paymentMeta}>
                <User color={mutedColor} size={12} />
                <Text style={[styles.paymentMetaText, { color: mutedColor }]}>
                  {item.client?.name || t('noClient', language)}
                </Text>
              </View>
              {item.invoice && (
                <View style={styles.paymentMeta}>
                  <FileText color={mutedColor} size={12} />
                  <Text style={[styles.paymentMetaText, { color: mutedColor }]}>
                    {item.invoice.invoice_number}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.paymentRight}>
              <Text style={[styles.paymentAmount, { color: "#12B76A" }]}>
                +{formatCurrency(Number(item.amount), 'EUR', language)}
              </Text>
              <Text style={[styles.paymentDate, { color: mutedColor }]}>
                {formatDate(item.payment_date)}
              </Text>
              <TouchableOpacity
                testID={`payment-menu-${item.id}`}
                style={styles.menuButton}
                onPress={() => setActiveMenu(activeMenu === item.id ? null : item.id)}
              >
                <MoreVertical color={mutedColor} size={18} />
              </TouchableOpacity>
            </View>
          </View>
          {activeMenu === item.id && (
            <View style={[styles.dropdownMenu, { backgroundColor: cardBg, borderColor: isDark ? '#263A55' : '#E4E9F0' }]}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setActiveMenu(null);
                  navigation.navigate('PaymentForm', { paymentId: item.id });
                }}
              >
                <Edit2 color="#12B76A" size={18} />
                <Text style={[styles.menuText, { color: textColor }]}>{t('edit', language)}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View testID="payments-list-screen" style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="payments-list-back-button"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeft color={textColor} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>{t('incomingPayments', language)}</Text>
        <TouchableOpacity
          testID="payment-list-add-button"
          style={[styles.addButton, { backgroundColor: primaryColor }]}
          onPress={() => navigation.navigate("PaymentForm")}
        >
          <Plus color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryIcon, { backgroundColor: "#12B76A15" }]}>
            <DollarSign color="#12B76A" size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryLabel, { color: mutedColor }]}>
              {t('totalReceived', language)}
            </Text>
            <Text style={[styles.summaryValue, { color: "#12B76A" }]}>
              {formatCurrency(totalReceived, 'EUR', language)}
            </Text>
          </View>
          {/* Fix #5b: PDF Export Actions */}
          <View style={styles.exportActions}>
            <TouchableOpacity
              style={[
                styles.exportButton,
                { backgroundColor: `${primaryColor}15` },
              ]}
              testID="payment-export-print-button"
              onPress={handlePrintPdf}
              disabled={exporting}
            >
              <Printer color={primaryColor} size={18} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportButton, { backgroundColor: "#12B76A15" }]}
              testID="payment-export-share-button"
              onPress={handleSharePdf}
              disabled={exporting}
            >
              <Share2 color="#12B76A" size={18} />
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* Payments List */}
      <FlatList
        data={payments}
        renderItem={renderPayment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <DollarSign color={mutedColor} size={48} />
            <Text style={[styles.emptyText, { color: mutedColor }]}>
              {t('noRecordedPayments', language)}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backButton: { marginRight: 16, padding: 4 },
  title: { fontSize: 22, fontWeight: "bold", flex: 1 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: { fontSize: 13, marginBottom: 2 },
  summaryValue: { fontSize: 24, fontWeight: "bold" },
  listContent: { padding: 16, paddingTop: 0 },
  paymentCard: { padding: 14, marginBottom: 12 },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  methodBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  paymentInfo: { flex: 1 },
  paymentNumber: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  paymentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  paymentMetaText: { fontSize: 12 },
  paymentRight: { alignItems: "flex-end" },
  menuButton: { padding: 4, marginTop: 2 },
  dropdownMenu: { marginTop: 12, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  menuText: { fontSize: 14, fontWeight: '600' },
  paymentAmount: { fontSize: 16, fontWeight: "bold" },
  paymentDate: { fontSize: 12, marginTop: 2 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 15 },
  exportActions: {
    flexDirection: "row",
    gap: 8,
  },
  exportButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
