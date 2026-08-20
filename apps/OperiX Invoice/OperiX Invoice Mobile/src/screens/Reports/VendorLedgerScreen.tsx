import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
} from "react-native";
import {
  ArrowLeft,
  Download,
  Building,
  FileText,
  CreditCard,
  TrendingUp,
  Search,
  X,
} from "lucide-react-native";
import { useTheme } from "@invoice-monorepo/hooks";
import { supabase } from "@invoice-monorepo/api";
import { useAuth } from "@invoice-monorepo/hooks";
import { Button, Card } from "@invoice-monorepo/ui";
import { formatCurrency, getLocalizedErrorMessage, t } from "@invoice-monorepo/i18n";
import { Vendor, Profile } from "@invoice-monorepo/types";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { renderTransactionReportHtml } from "@invoice-monorepo/report-templates";
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import { namePdfFile, reportPdfFileName } from '../../services/pdf/fileNaming';

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  type: "purchase" | "payment";
}

export function VendorLedgerScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { isDark, language, primaryColor } = useTheme();
  const preselectedVendorId = route.params?.vendorId;

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filteredVendors, setFilteredVendors] = useState<Vendor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    preselectedVendorId || null,
  );
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, balance: 0 });
  const [vendorBills, setVendorBills] = useState<Record<string, unknown>[]>([]);

  const bgColor = isDark ? "#0D1B2A" : "#F7F9FC";
  const textColor = isDark ? "#fff" : "#111827";
  const mutedColor = isDark ? "#98A2B3" : "#667085";
  const cardBg = isDark ? "#14243A" : "#ffffff";
  const borderColor = isDark ? "#263A55" : "#E4E9F0";

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedVendorId) {
      fetchLedgerData();
    }
  }, [selectedVendorId]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.phone?.includes(searchQuery),
      );
      setFilteredVendors(filtered);
    } else {
      setFilteredVendors(vendors);
    }
  }, [searchQuery, vendors]);

  const fetchInitialData = async () => {
    if (!user) return;

    const { profile: workspaceProfile, company, companyIds } = await getWorkspaceScope(user.id);
    setProfile({ ...workspaceProfile, company_name: (company as any)?.company_name || (company as any)?.name || workspaceProfile.company_name });
    const scope = scopedResource(user.id, companyIds);

    const { data: vendorsData } = await supabase
      .from("vendors")
      .select("*")
      .or(scope)
      .order("name");
    if (vendorsData) {
      setVendors(vendorsData);
      setFilteredVendors(vendorsData);
    }
    setLoading(false);
  };

  const fetchLedgerData = async () => {
    if (!selectedVendorId || !user) return;
    setLoading(true);

    try {
      const { data: payments } = await supabase
        .from("vendor_payments")
        .select("*")
        .eq("vendor_id", selectedVendorId)
        .order("payment_date", { ascending: true });

      const { data: bills } = await supabase
        .from("supplier_bills")
        .select("*")
        .eq("vendor_id", selectedVendorId)
        .order("issue_date", { ascending: true });
      setVendorBills(
        (bills || []).map((bill) => ({
          ...bill,
          vendor: selectedVendor || { name: "—" },
        })),
      );

      const entries: LedgerEntry[] = [];

      bills?.forEach((bill) => {
        entries.push({
          id: bill.id,
          date: bill.issue_date,
          description: `${t('supplierBill', language)} #${bill.bill_number}`,
          debit: Number(bill.total_amount) || 0,
          credit: 0,
          balance: 0,
          type: "purchase",
        });
      });

      payments?.forEach((pmt) => {
        entries.push({
          id: pmt.id,
          date: pmt.payment_date,
          description: `${t('payment', language)} - ${pmt.payment_method}`,
          debit: 0,
          credit: Number(pmt.amount) || 0,
          balance: 0,
          type: "payment",
        });
      });

      entries.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      let runningBalance = 0;
      let totalDebit = 0;
      let totalCredit = 0;

      entries.forEach((entry) => {
        totalDebit += entry.debit;
        totalCredit += entry.credit;
        runningBalance = runningBalance + entry.debit - entry.credit;
        entry.balance = runningBalance;
      });

      setLedgerEntries(entries);
      setTotals({
        debit: totalDebit,
        credit: totalCredit,
        balance: runningBalance,
      });
    } catch (error) {
      console.error("Error fetching ledger data:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  const handleExportPDF = async () => {
    if (!selectedVendor || !profile) return;
    setExporting(true);
    try {
      const html = renderTransactionReportHtml({
        template: "vendor-ledger",
        title: `${t('supplierCard', language)} - ${selectedVendor.name}`,
        company: {
          name: profile.company_name,
          email: profile.email,
          phone: profile.phone,
          address: profile.address,
          city: profile.city,
          country: profile.country,
          website: profile.website,
          taxId: profile.tax_id,
          bankName: profile.bank_name,
          bankAccount: profile.bank_account,
          iban: profile.bank_iban,
          swift: profile.bank_swift,
          logoUrl: profile.logo_url,
        },
        rows: vendorBills,
      });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const namedUri = await namePdfFile(uri, reportPdfFileName(profile.company_name || t('company', language), t('supplierCard', language)));
      await Sharing.shareAsync(namedUri, {
        mimeType: "application/pdf",
        dialogTitle: `${t('supplierCard', language)} - ${selectedVendor.name}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      Alert.alert(
        t("error", language),
        `${t('failedToExportPdf', language)}: ${getLocalizedErrorMessage(error, language, 'failedToExportPdf')}`,
      );
    } finally {
      setExporting(false);
    }
  };

  const generateLedgerHTML = () => {
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString(language === 'sq' ? "sq-XK" : "en-US");
    };

    const formatMoney = (amount: number) => {
      return formatCurrency(amount, 'EUR', language);
    };

    const rows = ledgerEntries
      .map(
        (entry) => `
            <tr>
                <td>${formatDate(entry.date)}</td>
                <td>${entry.description}</td>
                <td class="debit">${entry.debit > 0 ? formatMoney(entry.debit) : "-"}</td>
                <td class="credit">${entry.credit > 0 ? formatMoney(entry.credit) : "-"}</td>
                <td class="balance">${formatMoney(entry.balance)}</td>
            </tr>
        `,
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; font-size: 11px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid ${primaryColor}; }
        .company-name { font-size: 18px; font-weight: bold; color: #111827; }
        .title { font-size: 20px; font-weight: bold; color: ${primaryColor}; text-align: right; }
        .client-section { background: #F7F9FC; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .client-name { font-size: 14px; font-weight: bold; color: #111827; margin-bottom: 5px; }
        .client-details { color: #667085; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: ${primaryColor}; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }
        th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
        td { padding: 8px; border-bottom: 1px solid #E4E9F0; }
        td.debit, td.credit, td.balance { text-align: right; font-family: monospace; }
        td.debit { color: #ef4444; }
        td.credit { color: #12B76A; }
        td.balance { font-weight: bold; }
        tr:nth-child(even) { background: #F7F9FC; }
        .totals { margin-top: 10px; padding: 15px; background: #111827; border-radius: 8px; color: white; }
        .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .totals-row:last-child { margin-bottom: 0; font-size: 14px; font-weight: bold; border-top: 1px solid #475569; padding-top: 8px; }
        .footer { margin-top: 30px; text-align: center; color: #98A2B3; font-size: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="company-name">${profile?.company_name || t('business', language)}</div>
            <div style="color: #667085; margin-top: 5px;">
                ${profile?.address || ""}<br/>
                ${profile?.phone || ""} | ${profile?.email || ""}
            </div>
        </div>
        <div>
            <div class="title">${t('supplierCard', language)}</div>
            <div style="color: #667085; text-align: right; margin-top: 5px;">
                ${t('dateLabel', language)}: ${new Date().toLocaleDateString(language === 'sq' ? "sq-XK" : "en-US")}
            </div>
        </div>
    </div>

    <div class="client-section">
        <div class="client-name">${selectedVendor?.name}</div>
        <div class="client-details">
            ${selectedVendor?.email ? `${t('email', language)}: ${selectedVendor.email}` : ""}
            ${selectedVendor?.phone ? ` | ${t('phone', language)}: ${selectedVendor.phone}` : ""}
            ${selectedVendor?.address ? `<br/>${t('address', language)}: ${selectedVendor.address}` : ""}
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 15%;">${t('dateLabel', language)}</th>
                <th style="width: 35%;">${t('description', language)}</th>
                <th style="width: 16%;">${t('debit', language)} (-)</th>
                <th style="width: 16%;">${t('credit', language)} (+)</th>
                <th style="width: 18%;">${t('balance', language)}</th>
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    </table>

    <div class="totals">
        <div class="totals-row">
            <span>${t('total', language)} ${t('debit', language)}:</span>
            <span>${formatMoney(totals.debit)}</span>
        </div>
        <div class="totals-row">
            <span>${t('total', language)} ${t('credit', language)}:</span>
            <span>${formatMoney(totals.credit)}</span>
        </div>
        <div class="totals-row">
            <span>${t('currentBalance', language)}:</span>
            <span>${formatMoney(totals.balance)}</span>
        </div>
    </div>

    <div class="footer">
        ${t('generatedByOperix', language)} • ${profile?.company_name || t('business', language)}
    </div>
</body>
</html>
        `;
  };

  if (!selectedVendorId) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={[styles.mainHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeft color={textColor} size={24} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.subtitle, { color: mutedColor }]}>
              {t("reports", language)}
            </Text>
            <Text style={[styles.mainTitle, { color: textColor }]}>
              {t("supplierCard", language)}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View
            style={[
              styles.searchContainer,
              { backgroundColor: cardBg, borderColor, borderWidth: 1 },
            ]}
          >
            <Search color={mutedColor} size={20} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder={t("search", language)}
              placeholderTextColor={mutedColor}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <X color={mutedColor} size={18} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator
              color={primaryColor}
              size="large"
              style={{ marginTop: 20 }}
            />
          ) : (
            <FlatList
              data={filteredVendors}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.clientListItem,
                    { backgroundColor: cardBg, borderColor, borderWidth: 1 },
                  ]}
                  onPress={() => setSelectedVendorId(item.id)}
                >
                  <View
                    style={[
                      styles.clientIcon,
                      { backgroundColor: `${primaryColor}15` },
                    ]}
                  >
                    <Building color={primaryColor} size={24} />
                  </View>
                  <View>
                    <Text
                      style={[styles.clientNameHeader, { color: textColor }]}
                    >
                      {item.name}
                    </Text>
                    {item.email && (
                      <Text style={{ color: mutedColor, fontSize: 13 }}>
                        {item.email}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 20, gap: 12 }}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: mutedColor }]}>
                  {t('noVendorsFound', language)}
                </Text>
              }
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.mainHeader, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => setSelectedVendorId(null)}
          style={styles.backButton}
        >
          <ArrowLeft color={textColor} size={24} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={[styles.subtitle, { color: mutedColor }]}>
            {t("supplierCard", language)}
          </Text>
          <Text
            style={[styles.mainTitle, { color: textColor, fontSize: 24 }]}
            numberOfLines={1}
          >
            {selectedVendor?.name}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: cardBg }]}
          onPress={handleExportPDF}
          disabled={exporting}
        >
          <Download color={exporting ? mutedColor : primaryColor} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
        {loading ? (
          <ActivityIndicator
            size="large"
            color={primaryColor}
            style={{ marginTop: 40 }}
          />
        ) : (
          <>
            <View style={styles.metricsRow}>
              <Card
                style={[
                  styles.metricCard,
                  { backgroundColor: cardBg, borderColor, borderWidth: 1 },
                ]}
              >
                <FileText color="#ef4444" size={20} />
                <View>
                  <Text style={[styles.metricLabel, { color: mutedColor }]}>
                    {t('debit', language).toUpperCase()}
                  </Text>
                  <Text style={[styles.metricValue, { color: "#ef4444" }]}>
                    {formatCurrency(totals.debit)}
                  </Text>
                </View>
              </Card>
              <Card
                style={[
                  styles.metricCard,
                  { backgroundColor: cardBg, borderColor, borderWidth: 1 },
                ]}
              >
                <CreditCard color="#12B76A" size={20} />
                <View>
                  <Text style={[styles.metricLabel, { color: mutedColor }]}>
                    {t('credit', language).toUpperCase()}
                  </Text>
                  <Text style={[styles.metricValue, { color: "#12B76A" }]}>
                    {formatCurrency(totals.credit)}
                  </Text>
                </View>
              </Card>
            </View>
            <Card
              style={[
                styles.metricCard,
                {
                  backgroundColor: cardBg,
                  borderColor,
                  borderWidth: 1,
                  marginBottom: 20,
                },
              ]}
            >
              <TrendingUp color={primaryColor} size={24} />
              <View>
                <Text style={[styles.metricLabel, { color: mutedColor }]}>
                  {t('balanceOwed', language).toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: primaryColor, fontSize: 24 },
                  ]}
                >
                  {formatCurrency(totals.balance)}
                </Text>
              </View>
            </Card>

            <Card
              style={[
                styles.tableCard,
                { backgroundColor: cardBg, borderColor, borderWidth: 1 },
              ]}
            >
              <View
                style={[styles.tableHeader, { backgroundColor: primaryColor }]}
              >
                <Text style={[styles.th, { flex: 1.2 }]}>{t('date', language).toUpperCase()}</Text>
                <Text style={[styles.th, { flex: 2.5 }]}>{t('description', language).toUpperCase()}</Text>
                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>
                  {t('debit', language).toUpperCase()}
                </Text>
                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>
                  {t('credit', language).toUpperCase()}
                </Text>
                <Text style={[styles.th, styles.thRight, { flex: 1.3 }]}>
                  {t('balance', language).toUpperCase()}
                </Text>
              </View>

              {ledgerEntries.length === 0 ? (
                <Text style={[styles.emptyText, { color: mutedColor }]}>
                  {t('noTransactionsFound', language)}
                </Text>
              ) : (
                ledgerEntries.map((entry, idx) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.tableRow,
                      {
                        backgroundColor:
                          idx % 2 === 0
                            ? "transparent"
                            : isDark
                              ? "rgba(30, 41, 59, 0.5)"
                              : "rgba(248, 250, 252, 0.5)",
                      },
                      {
                        borderBottomWidth:
                          idx === ledgerEntries.length - 1 ? 0 : 1,
                        borderBottomColor: borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.td, { flex: 1.2, color: mutedColor }]}>
                      {new Date(entry.date).toLocaleDateString(
                        language === "sq" ? "sq-AL" : "en-US",
                      )}
                    </Text>
                    <Text
                      style={[styles.td, { flex: 2.5, color: textColor }]}
                      numberOfLines={1}
                    >
                      {entry.description}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        styles.tdRight,
                        {
                          flex: 1.3,
                          color: entry.debit > 0 ? "#ef4444" : mutedColor,
                        },
                      ]}
                    >
                      {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        styles.tdRight,
                        {
                          flex: 1.3,
                          color: entry.credit > 0 ? "#12B76A" : mutedColor,
                        },
                      ]}
                    >
                      {entry.credit > 0 ? formatCurrency(entry.credit) : "-"}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        styles.tdRight,
                        { flex: 1.3, color: textColor, fontWeight: "700" },
                      ]}
                    >
                      {formatCurrency(entry.balance)}
                    </Text>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mainHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  mainTitle: { fontSize: 28, fontWeight: "800" },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  content: { padding: 20, paddingBottom: 40 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 12,
  },
  searchInput: { flex: 1, fontSize: 16, fontWeight: "500" },

  clientListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  clientIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  clientNameHeader: { fontSize: 16, fontWeight: "700", marginBottom: 2 },

  metricsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  metricCard: {
    flex: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    opacity: 0.7,
    marginBottom: 2,
  },
  metricValue: { fontSize: 16, fontWeight: "800" },

  tableCard: { borderRadius: 16, overflow: "hidden" },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  th: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  thRight: { textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  td: { fontSize: 12, fontWeight: "500" },
  tdRight: { textAlign: "right", fontFamily: "monospace" },

  emptyText: {
    padding: 40,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "500",
  },
});
