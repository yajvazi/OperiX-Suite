import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    StyleSheet,
    Image,
} from 'react-native';
import { ArrowLeft, ChevronRight, Check, FileText, User, PenTool, X } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { Button, Input, Card, SignaturePadModal } from '@invoice-monorepo/ui';
import { Client } from '@invoice-monorepo/types';
import { SvgXml } from 'react-native-svg';
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import { formatDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import type { ContractTemplate } from '@invoice-monorepo/types';
import { formatContractNumber, renderBlocks } from '../../services/contracts/contractBuilder';

interface ContractFormScreenProps {
    navigation: any;
    route: any;
}

export function ContractFormScreen({ navigation, route }: ContractFormScreenProps) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const contractTypes = [
        { id: 'service_agreement', label: t('serviceAgreement', language), description: t('serviceAgreementDescription', language) },
        { id: 'nda', label: t('nda', language), description: t('ndaDescription', language) },
    ];
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Form Data
    const [type, setType] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [clientId, setClientId] = useState<string | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [templates, setTemplates] = useState<ContractTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});

    // Signatures
    const [signature, setSignature] = useState<string | null>(null);
    const [counterpartySignature, setCounterpartySignature] = useState<string | null>(null);
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [signatureTarget, setSignatureTarget] = useState<'user' | 'counterparty'>('user');

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const inputBg = isDark ? '#0D1B2A' : '#F4F7FB';
    const mutedColor = isDark ? '#98A2B3' : '#667085';

    useEffect(() => {
        let cancelled = false;

        const loadFormData = async () => {
            const subtype = route?.params?.subtype;
            if (subtype) {
                const foundType = contractTypes.find(t => t.id === subtype || (subtype === 'employment' && t.id === 'employment') || (subtype === 'collaboration' && t.id === 'service_agreement'));
                if (foundType) {
                    setType(foundType.id);
                    setTitle(`${foundType.label} - ${formatDate(new Date().toISOString(), language)}`);
                    setStep(1);
                } else if (subtype === 'employment' || subtype === 'collaboration' || subtype === 'nda') {
                    const label = subtype === 'employment' ? t('employmentContract', language) : subtype === 'collaboration' ? t('collaborationContract', language) : t('nda', language);
                    const id = subtype === 'nda' ? 'nda' : subtype === 'employment' ? 'employment' : 'service_agreement';
                    setType(id);
                    setTitle(`${label} - ${formatDate(new Date().toISOString(), language)}`);
                    setStep(1);
                }
            }

            if (!user) return;

            try {
                let companyIds: string[] = [];
                try {
                    const workspace = await getWorkspaceScope(user.id);
                    companyIds = workspace.companyIds;
                } catch (workspaceError) {
                    // Older accounts can exist without an active company. Keep the
                    // user-owned contract flow usable while the workspace is repaired.
                    console.warn('Contract workspace scope unavailable:', workspaceError);
                }

                const clientsQuery = companyIds.length
                    ? supabase.from('clients').select('*').or(scopedResource(user.id, companyIds))
                    : supabase.from('clients').select('*').eq('user_id', user.id);
                const templatesQuery = companyIds.length
                    ? supabase.from('contract_templates').select('*').or(scopedResource(user.id, companyIds)).order('updated_at', { ascending: false })
                    : supabase.from('contract_templates').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });

                const [clientsResult, templatesResult] = await Promise.all([clientsQuery, templatesQuery]);
                if (cancelled) return;
                if (clientsResult.error) throw clientsResult.error;
                if (clientsResult.data) setClients(clientsResult.data);
                if (templatesResult.error) {
                    // Templates are optional: built-in contract types remain available
                    // even if the builder migration is not deployed yet.
                    console.warn('Contract templates could not be loaded:', templatesResult.error);
                } else if (templatesResult.data) {
                    setTemplates(templatesResult.data as ContractTemplate[]);
                }
            } catch (error) {
                if (!cancelled) Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
            }
        };

        void loadFormData();
        return () => { cancelled = true; };
    }, [user?.id, route?.params?.subtype, language]);

    const handleSave = async () => {
        if (!title || !clientId || !type) {
            Alert.alert(t('error', language), t('requiredFields', language));
            return;
        }

        setLoading(true);
        try {
            if (!user) throw new Error(t('signInCreateContract', language));
            let companyId: string | null = null;
            try {
                companyId = (await getWorkspaceScope(user.id)).companyId;
            } catch (workspaceError) {
                console.warn('Contract workspace scope unavailable while saving:', workspaceError);
            }
            const requiredFields = (selectedTemplate?.fields || []).filter((field) => field.required && !String(answers[field.key || field.id] || '').trim());
            if (requiredFields.length) {
                Alert.alert(t('error', language), `${t('requiredFields', language)}: ${requiredFields.map((field) => field.label).join(', ')}`);
                return;
            }
            const selectedClient = clients.find((client) => client.id === clientId);
            const templateVariables = {
                ...Object.fromEntries(Object.entries(answers).map(([key, value]) => [`custom.${key}`, value])),
                'customer.name': selectedClient?.name,
                'customer.email': selectedClient?.email,
                'contract.title': title,
            };
            const numbering = selectedTemplate?.numbering || {};
            const prefix = String(numbering.prefix || 'CTR');
            const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, '') || 'CTR';
            const year = new Date().getFullYear();
            const manualNumber = String(numbering.manual || numbering.manualNumber || numbering.manual_number || '').trim();
            let number = manualNumber || undefined;
            if (selectedTemplate && !number) {
                if (companyId) {
                    const { data: reservedNumber, error: numberingError } = await supabase.rpc('reserve_contract_number', {
                        p_company_id: companyId,
                        p_prefix: safePrefix,
                        p_year: year,
                        p_manual_number: null,
                    });
                    if (!numberingError && reservedNumber) number = String(reservedNumber);
                }
                if (!number && companyId) {
                    const { data: existingNumbers } = await supabase
                        .from('contracts')
                        .select('contract_number')
                        .eq('company_id', companyId)
                        .like('contract_number', `${safePrefix}-${year}-%`);
                    const nextSequence = (existingNumbers || []).reduce((highest, row) => {
                        const match = String(row.contract_number || '').match(/-(\d+)$/);
                        return Math.max(highest, match ? Number(match[1]) : 0);
                    }, 0) + 1;
                    number = formatContractNumber(safePrefix, year, nextSequence, Number(numbering.padding) || 4);
                }
                if (!number) number = formatContractNumber(safePrefix, year, 1, Number(numbering.padding) || 4);
            }
            if (number) templateVariables['contract.number'] = number;
            const rendered = selectedTemplate?.blocks?.length ? renderBlocks(selectedTemplate.blocks, templateVariables) : { html: '', missing: [] };
            const { data: created, error } = await supabase.from('contracts').insert({
                user_id: user.id,
                company_id: companyId,
                template_id: selectedTemplate?.id || null,
                contract_number: number,
                client_id: clientId,
                title,
                type,
                content: answers,
                variables: templateVariables,
                html_body: rendered.html || null,
                status: signature && counterpartySignature ? 'signed' : 'draft',
                signature_url: signature,
                counterparty_signature_url: counterpartySignature,
            }).select('id').single();

            if (error) throw error;
            if (created?.id && companyId) await supabase.from('contract_events').insert({ company_id: companyId, contract_id: created.id, actor_id: user.id, event_type: 'contract_created', metadata: { template_id: selectedTemplate?.id || null } });
            Alert.alert(t('success', language), t('contractCreated', language), [{ text: t('done', language), onPress: () => created?.id ? navigation.navigate('ContractDetail', { contractId: created.id }) : navigation.navigate('InvoicesList', { tab: 'contract' }) }]);
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        } finally {
            setLoading(false);
        }
    };

    const openSignaturePad = (target: 'user' | 'counterparty') => {
        setSignatureTarget(target);
        setShowSignaturePad(true);
    };

    const handleSignatureSave = (sig: string) => {
        if (signatureTarget === 'user') {
            setSignature(sig);
        } else {
            setCounterpartySignature(sig);
        }
        setShowSignaturePad(false);
    };

    const renderSignatureBox = (
        label: string,
        value: string | null,
        onSign: () => void,
        onClear: () => void
    ) => (
        <View style={styles.signatureBox}>
            <Text style={[styles.signatureLabel, { color: textColor }]}>{label}</Text>
            {value ? (
                <View style={[styles.signaturePreview, { backgroundColor: inputBg }]}>
                    {value.startsWith('data:image/svg+xml') ? (
                        <SvgXml xml={decodeURIComponent(value.split(',')[1])} width="100%" height="100%" />
                    ) : (
                        <Image source={{ uri: value }} style={styles.signatureImage} resizeMode="contain" />
                    )}
                    <TouchableOpacity style={styles.clearSignature} onPress={onClear}>
                        <X color="#fff" size={14} />
                    </TouchableOpacity>
                </View>
            ) : (
                <TouchableOpacity
                    style={[styles.signaturePlaceholder, { backgroundColor: inputBg, borderColor: primaryColor }]}
                    onPress={onSign}
                >
                    <PenTool color={primaryColor} size={24} />
                    <Text style={{ color: primaryColor, marginTop: 8, fontWeight: '600' }}>{t('tapToSign', language)}</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderTypeSelection = () => (
        <View>
            <Text style={[styles.stepTitle, { color: textColor }]}>{t('selectContractType', language)}</Text>
            {templates.length ? <><Text style={[styles.stepSubtitle, { color: mutedColor }]}>{t('contractTemplates', language)}</Text>{templates.map(template => <TouchableOpacity key={template.id} style={[styles.typeCard, { backgroundColor: cardBg }, selectedTemplate?.id === template.id && { borderColor: primaryColor, borderWidth: 2 }]} onPress={() => { setSelectedTemplate(template); setTitle(template.name); setType(template.category || 'service_agreement'); setAnswers(Object.fromEntries((template.fields || []).map(field => [field.key || field.id, field.defaultValue || '']))); setStep(1); }}><View style={styles.iconCircle}><FileText color={primaryColor} size={24} /></View><View style={{ flex: 1 }}><Text style={[styles.typeTitle, { color: textColor }]}>{template.name}</Text><Text style={[styles.typeDesc, { color: '#98A2B3' }]}>{template.description || t('contractBuilder', language)}</Text></View><ChevronRight color="#98A2B3" size={20} /></TouchableOpacity>)}</> : null}
            {contractTypes.map(contractType => (
                <TouchableOpacity
                    key={contractType.id}
                    style={[styles.typeCard, { backgroundColor: cardBg }, type === contractType.id && { borderColor: primaryColor, borderWidth: 2 }]}
                    onPress={() => {
                        setType(contractType.id);
                        setTitle(`${contractType.label} - ${new Date().toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US')}`);
                        setStep(1);
                    }}
                >
                    <View style={styles.iconCircle}>
                        <FileText color={primaryColor} size={24} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.typeTitle, { color: textColor }]}>{contractType.label}</Text>
                        <Text style={[styles.typeDesc, { color: '#98A2B3' }]}>{contractType.description}</Text>
                    </View>
                    <ChevronRight color="#98A2B3" size={20} />
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderBasicInfo = () => (
        <View>
            <Text style={[styles.stepTitle, { color: textColor }]}>{t('basicInformation', language)}</Text>

            <View style={[styles.section, { backgroundColor: cardBg }]}>
                <Input
                    label={t('contractTitle', language)}
                    value={title}
                    onChangeText={setTitle}
                    placeholder={t('contractTitlePlaceholder', language)}
                />

                <Text style={[styles.label, { color: textColor, marginTop: 16 }]}>{t('selectClient', language)}</Text>
                <ScrollView style={{ maxHeight: 200, marginTop: 8 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                    {clients.map(c => (
                        <TouchableOpacity
                            key={c.id}
                            style={[
                                styles.clientOption,
                                { backgroundColor: inputBg },
                                clientId === c.id && { borderColor: primaryColor, borderWidth: 1 }
                            ]}
                            onPress={() => setClientId(c.id)}
                        >
                            <User size={16} color={clientId === c.id ? primaryColor : '#98A2B3'} />
                            <Text style={{ color: textColor, marginLeft: 12 }}>{c.name}</Text>
                            {clientId === c.id && <Check size={16} color={primaryColor} style={{ marginLeft: 'auto' }} />}
                        </TouchableOpacity>
                    ))}
                    {clients.length === 0 && (
                        <Text style={{ color: '#98A2B3', padding: 8 }}>{t('noClientsAddFirst', language)}</Text>
                    )}
                </ScrollView>
            </View>

            <Button
                title={t('nextContractDetails', language)}
                onPress={() => {
                    if (!clientId) { Alert.alert(t('required', language), t('requiredSelectClient', language)); return; }
                    setStep(2);
                }}
                style={{ marginTop: 24 }}
            />
        </View>
    );

    const renderQuestions = () => (
        <View>
            <Text style={[styles.stepTitle, { color: textColor }]}>{t('contractDetails', language)}</Text>
            <Card style={{ backgroundColor: cardBg, padding: 16 }}>
                {selectedTemplate?.fields?.length ? selectedTemplate.fields.map(field => <Input key={field.id} label={field.label} placeholder={field.placeholder} value={answers[field.key || field.id] || ''} onChangeText={value => setAnswers({ ...answers, [field.key || field.id]: value })} multiline={field.type === 'textarea'} keyboardType={field.type === 'number' || field.type === 'currency' || field.type === 'percentage' ? 'decimal-pad' : field.type === 'phone' ? 'phone-pad' : field.type === 'email' ? 'email-address' : 'default'} />) : null}
                {!selectedTemplate && type === 'service_agreement' ? (
                    <>
                        <Input
                            label={t('scopeOfServices', language)}
                            placeholder={t('scopeOfServicesPlaceholder', language)}
                            value={answers.scope}
                            onChangeText={t => setAnswers({ ...answers, scope: t })}
                            multiline
                            numberOfLines={4}
                        />
                        <Input
                            label={t('paymentTerms', language)}
                            placeholder={t('paymentTermsPlaceholder', language)}
                            value={answers.paymentTerms}
                            onChangeText={t => setAnswers({ ...answers, paymentTerms: t })}
                        />
                        <Input
                            label={t('timelineDuration', language)}
                            placeholder={t('timelinePlaceholder', language)}
                            value={answers.timeline}
                            onChangeText={t => setAnswers({ ...answers, timeline: t })}
                        />
                    </>
                ) : !selectedTemplate ? (
                    <>
                        <Input
                            label={t('confidentialInfoDescription', language)}
                            placeholder={t('confidentialInfoPlaceholder', language)}
                            value={answers.confidentialInfo}
                            onChangeText={t => setAnswers({ ...answers, confidentialInfo: t })}
                            multiline
                        />
                        <Input
                            label={t('durationConfidentiality', language)}
                            placeholder={t('durationConfidentialityPlaceholder', language)}
                            value={answers.duration}
                            onChangeText={t => setAnswers({ ...answers, duration: t })}
                        />
                    </>
                ) : null}
            </Card>

            <Button
                title={t('nextSignatures', language)}
                onPress={() => setStep(3)}
                style={{ marginTop: 24 }}
            />
        </View>
    );

    const renderSignatures = () => (
        <View>
            <Text style={[styles.stepTitle, { color: textColor }]}>{t('signatures', language)}</Text>
            <Text style={[styles.stepSubtitle, { color: mutedColor }]}>
                {t('bothPartiesSign', language)}
            </Text>

            <Card style={{ backgroundColor: cardBg, padding: 16 }}>
                {renderSignatureBox(
                    t('providerSignature', language),
                    signature,
                    () => openSignaturePad('user'),
                    () => setSignature(null)
                )}

                <View style={styles.divider} />

                {renderSignatureBox(
                    t('clientSignatureCounterparty', language),
                    counterpartySignature,
                    () => openSignaturePad('counterparty'),
                    () => setCounterpartySignature(null)
                )}
            </Card>

            <View style={styles.signatureStatus}>
                <View style={[styles.statusBadge, { backgroundColor: signature ? '#12B76A20' : '#ef444420' }]}>
                    <Text style={{ color: signature ? '#12B76A' : '#ef4444', fontSize: 12, fontWeight: '600' }}>
                        {signature ? t('providerSigned', language) : t('awaitingProvider', language)}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: counterpartySignature ? '#12B76A20' : '#ef444420' }]}>
                    <Text style={{ color: counterpartySignature ? '#12B76A' : '#ef4444', fontSize: 12, fontWeight: '600' }}>
                        {counterpartySignature ? t('clientSigned', language) : t('awaitingClient', language)}
                    </Text>
                </View>
            </View>

            <Button
                title={signature && counterpartySignature ? t('finalizeContract', language) : t('saveAsDraft', language)}
                onPress={handleSave}
                loading={loading}
                style={{ marginTop: 24 }}
            />
        </View>
    );

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => step > 0 ? setStep(step - 1) : navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {step === 0 ? t('newContract', language) : step === 1 ? t('setup', language) : step === 2 ? t('details', language) : t('sign', language)}
                </Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                {step === 0 && renderTypeSelection()}
                {step === 1 && renderBasicInfo()}
                {step === 2 && renderQuestions()}
                {step === 3 && renderSignatures()}
            </ScrollView>

            <SignaturePadModal
                visible={showSignaturePad}
                onClose={() => setShowSignaturePad(false)}
                onSave={handleSignatureSave}
                primaryColor={primaryColor}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    backButton: {},
    title: { fontSize: 20, fontWeight: 'bold' },
    content: { padding: 16 },
    stepTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
    stepSubtitle: { fontSize: 14, marginBottom: 24 },
    typeCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 16, marginBottom: 16, gap: 16 },
    iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0, 79, 254, 0.1)', alignItems: 'center', justifyContent: 'center' },
    typeTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    typeDesc: { fontSize: 14 },
    section: { borderRadius: 16, padding: 16 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    clientOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8 },
    divider: { height: 1, backgroundColor: '#263A55', marginVertical: 20, opacity: 0.2 },
    signatureBox: { marginBottom: 16 },
    signatureLabel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
    signaturePreview: { height: 120, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    signatureImage: { width: '100%', height: '100%' },
    clearSignature: { position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444', borderRadius: 12, padding: 4 },
    signaturePlaceholder: { height: 120, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    signatureStatus: { flexDirection: 'row', gap: 12, marginTop: 16 },
    statusBadge: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
});
