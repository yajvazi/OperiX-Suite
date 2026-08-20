import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
    Modal,
} from 'react-native';
import { ArrowLeft, Edit2, Trash2, FileText, User, Calendar, CheckCircle, XCircle, Eye, Printer, Mail, Share2, X } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { Card, Button, StatusBadge } from '@invoice-monorepo/ui';
import { Contract, Client, Profile } from '@invoice-monorepo/types';
import { SvgXml } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { generateContractHTML } from '../../services/pdf/contractTemplates';
import { documentPdfFileName, namePdfFile } from '../../services/pdf/fileNaming';
import { formatDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { getWorkspaceScope } from '../../services/workspace';

interface ContractDetailScreenProps {
    navigation: any;
    route: any;
}

export function ContractDetailScreen({ navigation, route }: ContractDetailScreenProps) {
    const { contractId } = route.params;
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const [contract, setContract] = useState<Contract | null>(null);
    const [client, setClient] = useState<Client | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [showPreview, setShowPreview] = useState(false);
    const [htmlContent, setHtmlContent] = useState('');

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const mutedColor = isDark ? '#98A2B3' : '#667085';

    useEffect(() => {
        fetchContract();
        fetchProfile();
    }, [contractId]);

    const fetchProfile = async () => {
        if (!user) return;
        const { profile: workspaceProfile, company } = await getWorkspaceScope(user.id);
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
            setProfile({
                ...data,
                company_name: (company as any)?.company_name || (company as any)?.name || workspaceProfile.company_name || data.company_name,
            });
        }
    };

    const fetchContract = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('contracts')
            .select('*, client:clients(*)')
            .eq('id', contractId)
            .single();

        if (error) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        } else if (data) {
            setContract(data);
            setClient(data.client);
        }
        setLoading(false);
    };

    const handleDelete = () => {
        Alert.alert(
            t('deleteContract', language),
            t('deleteContractConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('contracts').delete().eq('id', contractId);
                        if (error) Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
                        else navigation.goBack();
                    },
                },
            ]
        );
    };

    const generateHTML = () => {
        if (!contract || !profile) return '';
        return generateContractHTML({ contract, client, profile, language: language === 'sq' ? 'sq' : 'en' });
    };

    const handlePreview = () => {
        const html = generateHTML();
        setHtmlContent(html);
        setShowPreview(true);
    };

    const handlePrint = async () => {
        const html = generateHTML();
        try {
            const { uri } = await Print.printToFileAsync({ html, base64: false });
            const namedUri = await namePdfFile(uri, documentPdfFileName(profile?.company_name || t('company', language), contract?.contract_number || contract?.id || t('contract', language), client?.name || t('client', language)));
            await Print.printAsync({ uri: namedUri });
        } catch (error: any) {
            // Ignore cancellation errors
            if (error.message?.includes('Printing did not complete') || error.message?.includes('cancelled')) {
                return;
            }
            Alert.alert(t('error', language), t('failedToPrintContract', language));
        }
    };

    const handleShare = async () => {
        const html = generateHTML();
        try {
            const { uri } = await Print.printToFileAsync({ html });
            const namedUri = await namePdfFile(uri, documentPdfFileName(profile?.company_name || t('company', language), contract?.contract_number || contract?.id || t('contract', language), client?.name || t('client', language)));
            await Sharing.shareAsync(namedUri, { mimeType: 'application/pdf', dialogTitle: t('shareContract', language) });
        } catch (error) {
            Alert.alert(t('error', language), t('failedToShareContract', language));
        }
    };

    const renderSignature = (label: string, signatureUrl: string | undefined) => (
        <View style={styles.signatureSection}>
            <Text style={[styles.signatureLabel, { color: textColor }]}>{label}</Text>
            {signatureUrl ? (
                <View style={[styles.signatureBox, { backgroundColor: isDark ? '#0D1B2A' : '#F4F7FB' }]}>
                    {signatureUrl.startsWith('data:image/svg+xml') ? (
                        <SvgXml xml={decodeURIComponent(signatureUrl.split(',')[1])} width="100%" height="100%" />
                    ) : (
                        <Image source={{ uri: signatureUrl }} style={styles.signatureImage} resizeMode="contain" />
                    )}
                </View>
            ) : (
                <View style={[styles.signatureBox, styles.signatureMissing, { backgroundColor: isDark ? '#0D1B2A' : '#F4F7FB' }]}>
                    <XCircle color="#ef4444" size={24} />
                    <Text style={{ color: '#ef4444', marginTop: 4 }}>{t('notSigned', language)}</Text>
                </View>
            )}
        </View>
    );

    if (loading) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: bgColor }]}>
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    if (!contract) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: bgColor }]}>
                <Text style={{ color: textColor }}>{t('contractNotFound', language)}</Text>
            </View>
        );
    }

    const contractContent = contract.content || {};

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>{t('contractDetails', language)}</Text>
                <TouchableOpacity onPress={handleDelete}>
                    <Trash2 color="#ef4444" size={24} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Header Card */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.headerCard}>
                        <View style={[styles.iconCircle, { backgroundColor: primaryColor + '20' }]}>
                            <FileText color={primaryColor} size={32} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={[styles.contractTitle, { color: textColor }]}>{contract.title}</Text>
                            {contract.contract_number ? <Text style={[styles.contractType, { color: primaryColor }]}>{contract.contract_number}</Text> : null}
                            <Text style={[styles.contractType, { color: mutedColor }]}>
                                {contractTypeLabel(contract.type, language)}
                            </Text>
                        </View>
                        <StatusBadge status={contract.status} />
                    </View>
                </Card>

                {contract.parties?.length ? <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}><User color={primaryColor} size={20} /><Text style={[styles.sectionTitle, { color: textColor }]}>{t('parties', language)}</Text></View>
                    {contract.parties.map((party) => <View key={party.id} style={styles.detailRow}><Text style={[styles.detailLabel, { color: mutedColor }]}>{party.role}</Text><Text style={[styles.detailValue, { color: textColor }]}>{party.name || party.source}{party.email ? ` · ${party.email}` : ''}</Text></View>)}
                </Card> : null}

                {contract.financial_terms && Object.keys(contract.financial_terms).length ? <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}><FileText color={primaryColor} size={20} /><Text style={[styles.sectionTitle, { color: textColor }]}>{t('financialTerms', language)}</Text></View>
                    {Object.entries(contract.financial_terms).map(([key, value]) => <View key={key} style={styles.detailRow}><Text style={[styles.detailLabel, { color: mutedColor }]}>{key.replace(/_/g, ' ')}</Text><Text style={[styles.detailValue, { color: textColor }]}>{String(value)}</Text></View>)}
                </Card> : null}

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: primaryColor }]} onPress={handlePreview}>
                        <Eye color="#fff" size={20} />
                        <Text style={styles.actionBtnText}>{t('preview', language)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#12B76A' }]} onPress={handlePrint}>
                        <Printer color="#fff" size={20} />
                        <Text style={styles.actionBtnText}>{t('print', language)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f59e0b' }]} onPress={handleShare}>
                        <Share2 color="#fff" size={20} />
                        <Text style={styles.actionBtnText}>{t('share', language)}</Text>
                    </TouchableOpacity>
                </View>

                {/* Client Info */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <User color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('client', language)}</Text>
                    </View>
                    {client ? (
                        <View>
                            <Text style={[styles.clientName, { color: textColor }]}>{client.name}</Text>
                            {client.email && <Text style={{ color: mutedColor }}>{client.email}</Text>}
                            {client.address && <Text style={{ color: mutedColor }}>{client.address}</Text>}
                        </View>
                    ) : (
                        <Text style={{ color: mutedColor }}>{t('noClientAssigned', language)}</Text>
                    )}
                </Card>

                {/* Contract Details */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <FileText color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('contractDetails', language)}</Text>
                    </View>

                    {Object.entries(contractContent).map(([key, value]) => (
                        <View key={key} style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: mutedColor }]}
                        >
                                {contractDetailLabel(key, language)}
                            </Text>
                            <Text style={[styles.detailValue, { color: textColor }]}>{String(value)}</Text>
                        </View>
                    ))}

                    {Object.keys(contractContent).length === 0 && (
                        <Text style={{ color: mutedColor }}>{t('noDetailsProvided', language)}</Text>
                    )}
                </Card>

                {/* Dates */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <Calendar color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('timeline', language)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: mutedColor }]}>{t('created', language)}</Text>
                        <Text style={[styles.detailValue, { color: textColor }]}>
                            {formatDate(contract.created_at, language)}
                        </Text>
                    </View>
                    {contract.updated_at && (
                        <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: mutedColor }]}>{t('lastUpdated', language)}</Text>
                            <Text style={[styles.detailValue, { color: textColor }]}>
                                {formatDate(contract.updated_at, language)}
                            </Text>
                        </View>
                    )}
                </Card>

                {/* Signatures */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <CheckCircle color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('signatures', language)}</Text>
                    </View>

                    <View style={styles.signaturesRow}>
                        {renderSignature(t('providerSignature', language), contract.signature_url)}
                        {renderSignature(t('clientSignatureCounterparty', language), contract.counterparty_signature_url)}
                    </View>
                </Card>

                {/* Actions */}
                <Button
                    title={t('editContract', language)}
                    icon={Edit2}
                    onPress={() => navigation.navigate('ContractForm', { contractId: contract.id })}
                    style={{ marginBottom: 16 }}
                />
            </ScrollView>

            {/* Preview Modal */}
            <Modal visible={showPreview} animationType="slide">
                <View style={[styles.previewContainer, { backgroundColor: bgColor }]}>
                    <View style={styles.previewHeader}>
                        <TouchableOpacity onPress={() => setShowPreview(false)}>
                            <X color={textColor} size={24} />
                        </TouchableOpacity>
                        <Text style={[styles.previewTitle, { color: textColor }]}>{t('contractPreview', language)}</Text>
                        <TouchableOpacity onPress={handlePrint}>
                            <Printer color={primaryColor} size={24} />
                        </TouchableOpacity>
                    </View>
                    <WebView
                        source={{ html: htmlContent }}
                        style={styles.webview}
                        originWhitelist={['*']}
                    />
                </View>
            </Modal>
        </View>
    );
}

function contractTypeLabel(type: string | undefined, language: string): string {
    if (!type) return '';
    const labels: Record<string, string> = {
        service_agreement: t('serviceAgreement', language),
        nda: t('nda', language),
        employment: t('employmentContract', language),
    };
    return labels[type] || type.replace(/_/g, ' ').toUpperCase();
}

function contractDetailLabel(key: string, language: string): string {
    const labels: Record<string, string> = {
        scopeOfServices: t('scopeOfServices', language),
        paymentTerms: t('paymentTerms', language),
        timeline: t('timeline', language),
        confidentialInfo: t('confidentialInformation', language),
        durationConfidentiality: t('durationConfidentiality', language),
        startDate: t('startDate', language),
        endDate: t('endDate', language),
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    title: { fontSize: 20, fontWeight: 'bold' },
    content: { padding: 16 },
    headerCard: { flexDirection: 'row', alignItems: 'center' },
    iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    contractTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
    contractType: { fontSize: 14 },
    quickActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
    actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold' },
    clientName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    detailRow: { marginBottom: 12 },
    detailLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
    detailValue: { fontSize: 16 },
    signaturesRow: { flexDirection: 'row', gap: 16 },
    signatureSection: { flex: 1 },
    signatureLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    signatureBox: { height: 100, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    signatureMissing: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#ef4444' },
    signatureImage: { width: '100%', height: '100%' },
    previewContainer: { flex: 1 },
    previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    previewTitle: { fontSize: 18, fontWeight: 'bold' },
    webview: { flex: 1 },
});
