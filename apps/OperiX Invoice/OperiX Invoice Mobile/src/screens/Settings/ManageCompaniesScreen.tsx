import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
    ArrowLeft,
    Building,
    Building2,
    Check,
    Copy,
    Mail,
    Pencil,
    Plus,
    Trash2,
    Users,
    X,
} from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { Button, Card, Input } from '@invoice-monorepo/ui';
import { Company, Membership } from '@invoice-monorepo/types';
import { formatDate as formatLocalizedDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { invalidateWorkspaceScope } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';

type RoleOption = {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    company_id?: string | null;
    is_system?: boolean;
};

type CompanyMember = {
    membership_id: string;
    user_id: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    legacy_role: string | null;
    status: string | null;
    role_code: string;
    role_name: string;
};

type PendingInvitation = {
    id: string;
    email: string;
    role_code: string;
    status: string;
    expires_at: string;
    created_at: string;
};

type CompanyEditForm = {
    company_name: string;
    email: string;
    phone: string;
    address: string;
    website: string;
    tax_id: string;
};

export function ManageCompaniesScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [membershipRoles, setMembershipRoles] = useState<Record<string, Membership['role']>>({});
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [createMode, setCreateMode] = useState<'main' | 'subdivision' | 'groupExisting'>('main');
    const [parentCompanyId, setParentCompanyId] = useState<string | null>(null);
    const [companyToMoveId, setCompanyToMoveId] = useState<string | null>(null);

    const [managedCompanyId, setManagedCompanyId] = useState<string | null>(null);
    const [members, setMembers] = useState<CompanyMember[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
    const [managementLoading, setManagementLoading] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [rolePickerMemberId, setRolePickerMemberId] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRoleCode, setInviteRoleCode] = useState('employee');
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [editParentCompanyId, setEditParentCompanyId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<CompanyEditForm>({
        company_name: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        tax_id: '',
    });
    const switchInFlight = useRef(false);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';
    const inputBg = isDark ? '#0D1B2A' : '#F4F7FB';
    const managedCompany = companies.find((company) => company.id === managedCompanyId) || null;
    const selectableRoles = useMemo(
        () => roles.filter((role) => ['company_administrator', 'manager', 'employee'].includes(role.code)),
        [roles],
    );
    const rootCompanies = companies.filter((company) => !company.parent_company_id);

    useEffect(() => {
        void fetchData();
    }, []);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        setRefreshing(false);
        try {
            const [companyResponse, membershipResponse, profileResponse] = await Promise.all([
                supabase.from('companies').select('*').order('company_name'),
                supabase.from('memberships').select('company_id, role').eq('user_id', user.id),
                supabase.from('profiles').select('active_company_id, company_id').eq('id', user.id).single(),
            ]);

            if (companyResponse.error) throw companyResponse.error;
            if (membershipResponse.error) throw membershipResponse.error;

            const nextCompanies = (companyResponse.data || []) as Company[];
            setCompanies(nextCompanies);
            setMembershipRoles(Object.fromEntries(
                (membershipResponse.data || []).map((membership: Pick<Membership, 'company_id' | 'role'>) => [membership.company_id, membership.role]),
            ));

            const nextActiveCompanyId = profileResponse.data?.active_company_id || profileResponse.data?.company_id || null;
            setActiveCompanyId(nextActiveCompanyId);
            if (!parentCompanyId) {
                const firstMainCompany = nextCompanies.find((company) => !company.parent_company_id);
                if (firstMainCompany) setParentCompanyId(firstMainCompany.id);
            }

            if (managedCompanyId && nextCompanies.some((company) => company.id === managedCompanyId)) {
                await fetchCompanyManagement(managedCompanyId);
            }
        } catch (error: any) {
            console.error(error);
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'couldNotLoadCompanies'));
        } finally {
            setLoading(false);
        }
    };

    const refresh = async () => {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    };

    const handleSwitch = async (companyId: string) => {
        if (!user || switchInFlight.current || companyId === activeCompanyId) return;

        switchInFlight.current = true;
        setLoading(true);
        try {
            const { error } = await supabase.rpc('set_active_company', { p_company_id: companyId });
            if (error) throw error;
            invalidateWorkspaceScope(user.id);
            setActiveCompanyId(companyId);
            await fetchData();
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'couldNotSwitchCompany'));
        } finally {
            switchInFlight.current = false;
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (createMode !== 'groupExisting' && !newCompanyName.trim()) {
            Alert.alert(t('companyNameRequired', language), t('enterCompanyName', language));
            return;
        }

        setLoading(true);
        try {
            if (createMode === 'groupExisting') {
                if (!companyToMoveId || !parentCompanyId) {
                    Alert.alert(t('chooseCompanies', language), t('chooseExistingAndParent', language));
                    return;
                }

                const { error } = await supabase.rpc('set_company_parent', {
                    p_company_id: companyToMoveId,
                    p_parent_company_id: parentCompanyId,
                });
                if (error) throw error;
            } else {
                if (createMode === 'subdivision' && !parentCompanyId) {
                    Alert.alert(t('parentCompanyRequired', language), t('chooseMainCompany', language));
                    return;
                }

                const rpcName = createMode === 'subdivision' ? 'create_company_subdivision' : 'create_company_and_owner';
                const rpcArgs = createMode === 'subdivision'
                    ? { p_parent_company_id: parentCompanyId, p_company_name: newCompanyName.trim() }
                    : { p_company_name: newCompanyName.trim() };
                const { data, error } = await supabase.rpc(rpcName, rpcArgs);
                if (error) throw error;
                if (!data?.id) throw new Error(t('companyNotCreated', language));
                await handleSwitch(data.id);
            }

            setNewCompanyName('');
            setCompanyToMoveId(null);
            setShowCreate(false);
            setCreateMode('main');
            await fetchData();
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'couldNotSaveCompany'));
        } finally {
            setLoading(false);
        }
    };

    const fetchCompanyManagement = async (companyId: string) => {
        setManagementLoading(true);
        try {
            const [memberResponse, roleResponse, invitationResponse] = await Promise.all([
                supabase.rpc('list_company_members', { p_company_id: companyId }),
                supabase
                    .from('app_roles')
                    .select('id, code, name, description, company_id, is_system')
                    .or(`company_id.is.null,company_id.eq.${companyId}`)
                    .order('name'),
                supabase.rpc('list_company_invitations', { p_company_id: companyId }),
            ]);

            if (memberResponse.error) throw memberResponse.error;
            if (roleResponse.error) throw roleResponse.error;
            if (invitationResponse.error) throw invitationResponse.error;

            setMembers((memberResponse.data || []) as CompanyMember[]);
            setRoles((roleResponse.data || []) as RoleOption[]);
            setPendingInvitations((invitationResponse.data || []) as PendingInvitation[]);
        } catch (error: any) {
            setMembers([]);
            setRoles([]);
            setPendingInvitations([]);
            Alert.alert(t('teamAccessUnavailable', language), getLocalizedErrorMessage(error, language, 'noPermissionManageCompany'));
        } finally {
            setManagementLoading(false);
        }
    };

    const openCompanyManagement = async (company: Company) => {
        setManagedCompanyId(company.id);
        setShowEdit(false);
        setShowInvite(false);
        setInviteToken(null);
        setRolePickerMemberId(null);
        setEditParentCompanyId(company.parent_company_id || null);
        setEditForm({
            company_name: company.company_name || '',
            email: company.email || '',
            phone: company.phone || '',
            address: company.address || '',
            website: company.website || '',
            tax_id: company.tax_id || '',
        });
        await fetchCompanyManagement(company.id);
    };

    const handleEditCompany = async () => {
        if (!managedCompany || !editForm.company_name.trim()) {
            Alert.alert(t('companyNameRequired', language), t('enterCompanyName', language));
            return;
        }

        setManagementLoading(true);
        try {
            const { error: profileError } = await supabase.rpc('update_company_profile', {
                p_company_id: managedCompany.id,
                p_company_name: editForm.company_name.trim(),
                p_email: editForm.email,
                p_phone: editForm.phone,
                p_address: editForm.address,
                p_website: editForm.website,
                p_tax_id: editForm.tax_id,
            });
            if (profileError) throw profileError;

            if ((managedCompany.parent_company_id || null) !== editParentCompanyId) {
                const { error: hierarchyError } = await supabase.rpc('set_company_parent', {
                    p_company_id: managedCompany.id,
                    p_parent_company_id: editParentCompanyId,
                });
                if (hierarchyError) throw hierarchyError;
            }

            setShowEdit(false);
            await fetchData();
        } catch (error: any) {
            Alert.alert(t('couldNotSaveCompanyDetails', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const handleInvite = async () => {
        if (!managedCompany || !inviteEmail.trim()) {
            Alert.alert(t('emailRequired', language), t('enterUserEmail', language));
            return;
        }

        setManagementLoading(true);
        try {
            const { data, error } = await supabase.rpc('create_company_invitation', {
                p_company_id: managedCompany.id,
                p_email: inviteEmail.trim().toLowerCase(),
                p_role_code: inviteRoleCode,
            });
            if (error) throw error;
            if (!data?.token) throw new Error(t('inviteWithoutToken', language));

            setInviteToken(data.token);
            await Clipboard.setStringAsync(data.token);
            setInviteEmail('');
            await fetchCompanyManagement(managedCompany.id);
            void notifyBusinessEvent('member_added', managedCompany.id, null, {
                message: `${inviteEmail.trim().toLowerCase()} was invited to the tenant.`,
            }).catch((notificationError) => console.warn('Member notification could not be sent:', notificationError));
            Alert.alert(t('inviteCreated', language), t('inviteCopiedInstruction', language));
        } catch (error: any) {
            Alert.alert(t('couldNotCreateInvite', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const handleRoleChange = async (member: CompanyMember, role: RoleOption) => {
        setManagementLoading(true);
        try {
            const { error } = await supabase.rpc('set_company_member_role', {
                p_membership_id: member.membership_id,
                p_role_code: role.code,
            });
            if (error) throw error;
            setRolePickerMemberId(null);
            if (managedCompany) await fetchCompanyManagement(managedCompany.id);
        } catch (error: any) {
            Alert.alert(t('couldNotChangePrivilege', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const handleRemoveMember = (member: CompanyMember) => {
        Alert.alert(
            t('removeAccess', language),
            t('removeAccessConfirmation', language)
                .replace('{user}', member.email || t('pendingUser', language))
                .replace('{company}', managedCompany?.company_name || t('company', language)),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('removeCompany', language),
                    style: 'destructive',
                    onPress: () => { void removeMember(member); },
                },
            ],
        );
    };

    const removeMember = async (member: CompanyMember) => {
        setManagementLoading(true);
        try {
            const { error } = await supabase.rpc('remove_company_member', { p_membership_id: member.membership_id });
            if (error) throw error;
            if (managedCompany) await fetchCompanyManagement(managedCompany.id);
        } catch (error: any) {
            Alert.alert(t('couldNotRemoveAccess', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const revokeInvitation = async (invitation: PendingInvitation) => {
        setManagementLoading(true);
        try {
            const { error } = await supabase.rpc('revoke_company_invitation', { p_invitation_id: invitation.id });
            if (error) throw error;
            if (managedCompany) await fetchCompanyManagement(managedCompany.id);
        } catch (error: any) {
            Alert.alert(t('couldNotRevokeInvite', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const handleArchiveCompany = (company: Company) => {
        Alert.alert(
            t('removeCompany', language),
            t('removeCompanyConfirmation', language).replace('{company}', company.company_name),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('removeCompany', language),
                    style: 'destructive',
                    onPress: () => { void archiveCompany(company); },
                },
            ],
        );
    };

    const archiveCompany = async (company: Company) => {
        setManagementLoading(true);
        try {
            const { error } = await supabase.rpc('archive_company', { p_company_id: company.id });
            if (error) throw error;
            setManagedCompanyId(null);
            setShowEdit(false);
            setShowInvite(false);
            await fetchData();
        } catch (error: any) {
            Alert.alert(t('couldNotRemoveCompany', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const copyInviteToken = async () => {
        if (!inviteToken) return;
        await Clipboard.setStringAsync(inviteToken);
        Alert.alert(t('copied', language), t('inviteCodeCopied', language));
    };

    const updateEditField = (field: keyof CompanyEditForm, value: string) => {
        setEditForm((current) => ({ ...current, [field]: value }));
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: bgColor }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('back', language)}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View style={styles.headerCopy}>
                    <Text style={[styles.eyebrow, { color: mutedColor }]}>{t('workspace', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('companiesAccess', language)}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCreate((current) => !current)} style={styles.headerAction} accessibilityRole="button" accessibilityLabel={t('addCompany', language)}>
                    {showCreate ? <X color={primaryColor} size={24} /> : <Plus color={primaryColor} size={24} />}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                nestedScrollEnabled
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={primaryColor} />}
            >
                {showCreate && (
                    <Card style={[styles.createCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('addToOrganization', language)}</Text>
                        <Text style={[styles.helperText, { color: mutedColor }]}>{t('createParentOrSubdivision', language)}</Text>
                        <View style={styles.modeRow}>
                            {([
                                ['main', t('mainCompany', language)],
                                ['subdivision', t('subdivision', language)],
                                ['groupExisting', t('groupExisting', language)],
                            ] as const).map(([mode, label]) => (
                                <TouchableOpacity
                                    key={mode}
                                    onPress={() => setCreateMode(mode)}
                                    style={[styles.modeButton, { borderColor }, createMode === mode && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                                >
                                    <Text style={[styles.modeButtonText, { color: createMode === mode ? '#fff' : mutedColor }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {createMode !== 'groupExisting' && (
                            <Input
                                label={createMode === 'subdivision' ? t('subdivisionName', language) : t('mainCompanyName', language)}
                                value={newCompanyName}
                                onChangeText={setNewCompanyName}
                                placeholder={createMode === 'subdivision' ? 'e.g. InternetKudo' : 'e.g. LRDY Group'}
                            />
                        )}
                        {(createMode === 'subdivision' || createMode === 'groupExisting') && (
                            <CompanyChoiceRow
                                label={t('parentCompany', language)}
                                options={rootCompanies.filter((company) => company.id !== companyToMoveId)}
                                selectedId={parentCompanyId}
                                onSelect={setParentCompanyId}
                                textColor={textColor}
                                mutedColor={mutedColor}
                                borderColor={borderColor}
                                primaryColor={primaryColor}
                                language={language}
                            />
                        )}
                        {createMode === 'groupExisting' && (
                            <CompanyChoiceRow
                                label={t('existingCompanyToGroup', language)}
                                options={rootCompanies.filter((company) => company.id !== parentCompanyId)}
                                selectedId={companyToMoveId}
                                onSelect={setCompanyToMoveId}
                                textColor={textColor}
                                mutedColor={mutedColor}
                                borderColor={borderColor}
                                primaryColor={primaryColor}
                                language={language}
                            />
                        )}
                        <View style={styles.actionRow}>
                            <Button title={t('cancel', language)} variant="outline" onPress={() => { setShowCreate(false); setCreateMode('main'); }} style={styles.flexButton} />
                            <Button title={createMode === 'groupExisting' ? t('groupExisting', language) : t('create', language)} onPress={() => { void handleCreate(); }} loading={loading} style={styles.flexButton} />
                        </View>
                    </Card>
                )}

                <Text style={[styles.label, { color: mutedColor }]}>{t('organizationLabel', language)}</Text>
                {companies
                    .filter((company) => !company.parent_company_id || !companies.some((parent) => parent.id === company.parent_company_id))
                    .map((company) => renderCompany(company, 0))}

                {companies.length === 0 && !loading && (
                    <View style={styles.emptyState}>
                        <Building color={mutedColor} size={48} />
                        <Text style={{ color: mutedColor, marginTop: 12 }}>{t('noCompaniesFound', language)}</Text>
                    </View>
                )}

                {managedCompany && renderManagementPanel()}
            </ScrollView>
        </KeyboardAvoidingView>
    );

    function renderCompany(company: Company, depth: number): React.ReactNode {
        const isActive = activeCompanyId === company.id;
        const isManaged = managedCompanyId === company.id;
        const children = companies.filter((child) => child.parent_company_id === company.id);
        const parent = company.parent_company_id ? companies.find((candidate) => candidate.id === company.parent_company_id) : null;
        const directRole = membershipRoles[company.id];
        const inheritedRole = parent ? membershipRoles[parent.id] : undefined;
        const roleLabel = directRole
            ? t('rolePrefix', language).replace('{role}', roleLabelForCode(directRole, language))
            : inheritedRole
                ? t('accessInheritedFrom', language).replace('{company}', parent?.company_name || t('company', language))
                : t('organizationAccess', language);
        const subtitle = depth === 0
            ? children.length > 0 ? t('mainCompanySubdivisionCount', language).replace('{count}', String(children.length)) : t('mainCompany', language)
            : t('subdivisionOf', language).replace('{company}', parent?.company_name || t('mainCompany', language));

        return (
            <View key={company.id} style={depth > 0 ? styles.subdivisionWrapper : undefined}>
                <View style={styles.companyCardRow}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => { void handleSwitch(company.id); }} style={styles.companyCardTouch}>
                        <Card style={[styles.companyCard, { backgroundColor: cardBg, borderColor }, depth > 0 && styles.subdivisionCard, isActive && { borderColor: primaryColor, borderWidth: 2 }, isManaged && { backgroundColor: `${primaryColor}10` }]}>
                            <View style={[styles.iconContainer, { backgroundColor: `${isActive ? primaryColor : '#667085'}20` }]}>
                                <Building2 color={isActive ? primaryColor : '#667085'} size={24} />
                            </View>
                            <View style={styles.companyInfo}>
                                <Text style={[styles.companyName, { color: textColor }]} numberOfLines={1}>{company.company_name}</Text>
                                <Text style={[styles.companyRole, { color: mutedColor }]}>{subtitle}</Text>
                                <Text style={[styles.companyRole, { color: mutedColor }]}>{roleLabel}</Text>
                                {depth === 0 && children.length > 0 && (
                                    <Text style={[styles.aggregateHint, { color: primaryColor }]}>{t('selectIncludesSubdivisions', language)}</Text>
                                )}
                            </View>
                            {isActive && (
                                <View style={[styles.activeBadge, { backgroundColor: primaryColor }]}>
                                    <Check color="#fff" size={14} />
                                </View>
                            )}
                        </Card>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => { void openCompanyManagement(company); }}
                        style={[styles.manageButton, { backgroundColor: cardBg, borderColor }, isManaged && { borderColor: primaryColor, backgroundColor: `${primaryColor}15` }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('manageCompany', language).replace('{company}', company.company_name)}
                    >
                        <Pencil color={isManaged ? primaryColor : mutedColor} size={17} />
                    </TouchableOpacity>
                </View>
                {children.map((child) => renderCompany(child, depth + 1))}
            </View>
        );
    }

    function renderManagementPanel() {
        if (!managedCompany) return null;

        return (
            <Card style={[styles.managementCard, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.panelHeader}>
                    <View style={[styles.panelIcon, { backgroundColor: `${primaryColor}18` }]}>
                        <Building2 color={primaryColor} size={20} />
                    </View>
                    <View style={styles.panelHeaderCopy}>
                        <Text style={[styles.panelEyebrow, { color: mutedColor }]}>{t('manageCompanyUpper', language)}</Text>
                        <Text style={[styles.panelTitle, { color: textColor }]}>{managedCompany.company_name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setManagedCompanyId(null)} accessibilityRole="button" accessibilityLabel={t('closeCompanyManagement', language)}>
                        <X color={mutedColor} size={20} />
                    </TouchableOpacity>
                </View>

                <View style={styles.actionRow}>
                    <Button title={t('editDetails', language)} variant="outline" icon={Pencil} onPress={() => setShowEdit((current) => !current)} style={styles.flexButton} />
                    <Button title={t('inviteUser', language)} icon={Mail} onPress={() => setShowInvite((current) => !current)} style={styles.flexButton} />
                </View>
                <TouchableOpacity
                    onPress={() => handleArchiveCompany(managedCompany)}
                    style={[styles.removeCompanyButton, { borderColor: '#FCA5A5' }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('removeCompany', language)}
                >
                    <Trash2 color="#DC2626" size={16} />
                    <Text style={styles.removeCompanyText}>{t('removeCompany', language)}</Text>
                </TouchableOpacity>

                {showEdit && renderEditForm()}
                {showInvite && renderInviteForm()}

                <View style={styles.divider} />
                <View style={styles.sectionHeadingRow}>
                    <View style={styles.sectionHeadingCopy}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('teamMembers', language)}</Text>
                        <Text style={[styles.helperText, { color: mutedColor }]}>{t('changeAccessForCompany', language)}</Text>
                    </View>
                    <Users color={primaryColor} size={20} />
                </View>

                {managementLoading && members.length === 0 ? (
                    <Text style={[styles.helperText, { color: mutedColor, marginTop: 14 }]}>{t('loadingTeam', language)}</Text>
                ) : members.length === 0 ? (
                    <Text style={[styles.helperText, { color: mutedColor, marginTop: 14 }]}>{t('noDirectMembers', language)}</Text>
                ) : (
                    <ScrollView
                        style={styles.memberListScroll}
                        contentContainerStyle={styles.memberList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                    >
                        {members.map((member) => renderMember(member))}
                    </ScrollView>
                )}

                {pendingInvitations.length > 0 && (
                    <View style={styles.inviteList}>
                        <Text style={[styles.subsectionTitle, { color: textColor }]}>{t('pendingInvitations', language)}</Text>
                        {pendingInvitations.map((invitation) => (
                            <View key={invitation.id} style={[styles.invitationRow, { borderColor }]}>
                                <View style={[styles.smallIcon, { backgroundColor: `${primaryColor}18` }]}><Mail color={primaryColor} size={16} /></View>
                                <View style={styles.memberCopy}>
                                    <Text style={[styles.memberName, { color: textColor }]} numberOfLines={1}>{invitation.email}</Text>
                                    <Text style={[styles.memberMeta, { color: mutedColor }]}>{roleLabelForCode(invitation.role_code, language)} · {t('expires', language)} {formatLocalizedDate(invitation.expires_at, language)}</Text>
                                </View>
                                <TouchableOpacity onPress={() => { void revokeInvitation(invitation); }} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={t('delete', language)}>
                                    <Trash2 color="#EF4444" size={17} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}
            </Card>
        );
    }

    function renderEditForm() {
        return (
            <View style={[styles.inlinePanel, { backgroundColor: inputBg, borderColor }]}>
                <Text style={[styles.subsectionTitle, { color: textColor }]}>{t('companyDetails', language)}</Text>
                <Input label={t('companyName', language)} value={editForm.company_name} onChangeText={(value) => updateEditField('company_name', value)} />
                <Input label={t('taxIdRegistration', language)} value={editForm.tax_id} onChangeText={(value) => updateEditField('tax_id', value)} />
                <Input label={t('email', language)} value={editForm.email} onChangeText={(value) => updateEditField('email', value)} keyboardType="email-address" autoCapitalize="none" />
                <Input label={t('phone', language)} value={editForm.phone} onChangeText={(value) => updateEditField('phone', value)} keyboardType="phone-pad" />
                <Input label={t('address', language)} value={editForm.address} onChangeText={(value) => updateEditField('address', value)} multiline />
                <Input label={t('website', language)} value={editForm.website} onChangeText={(value) => updateEditField('website', value)} autoCapitalize="none" />
                <CompanyChoiceRow
                    label={t('parentCompany', language)}
                    includeNoParent
                    options={rootCompanies.filter((company) => company.id !== managedCompanyId)}
                    selectedId={editParentCompanyId}
                    onSelect={setEditParentCompanyId}
                    textColor={textColor}
                    mutedColor={mutedColor}
                    borderColor={borderColor}
                    primaryColor={primaryColor}
                    language={language}
                />
                <View style={styles.actionRow}>
                    <Button title={t('cancel', language)} variant="outline" onPress={() => setShowEdit(false)} style={styles.flexButton} />
                    <Button title={t('saveChanges', language)} onPress={() => { void handleEditCompany(); }} loading={managementLoading} style={styles.flexButton} />
                </View>
            </View>
        );
    }

    function renderInviteForm() {
        return (
            <View style={[styles.inlinePanel, { backgroundColor: inputBg, borderColor }]}>
                <Text style={[styles.subsectionTitle, { color: textColor }]}>{t('inviteAUser', language)}</Text>
                <Text style={[styles.helperText, { color: mutedColor }]}>{t('invitationExpires', language)}</Text>
                <Input
                    label={t('emailAddress', language)}
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    placeholder="person@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                <Text style={[styles.fieldLabel, { color: textColor }]}>{t('privilege', language)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleChoices}>
                    {selectableRoles.map((role) => (
                        <TouchableOpacity
                            key={role.id}
                            onPress={() => setInviteRoleCode(role.code)}
                            style={[styles.roleChoice, { borderColor }, inviteRoleCode === role.code && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                        >
                            <Text style={[styles.roleChoiceText, { color: inviteRoleCode === role.code ? '#fff' : mutedColor }]}>{role.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <Button title={t('createInviteCode', language)} icon={Mail} onPress={() => { void handleInvite(); }} loading={managementLoading} style={{ marginTop: 14 }} />
                {inviteToken && (
                    <View style={[styles.tokenBox, { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }]}>
                        <View style={styles.tokenCopy}>
                            <Text style={[styles.tokenLabel, { color: mutedColor }]}>{t('oneTimeInviteCode', language)}</Text>
                            <Text style={[styles.tokenText, { color: textColor }]} selectable>{inviteToken}</Text>
                        </View>
                        <TouchableOpacity onPress={() => { void copyInviteToken(); }} style={[styles.copyButton, { backgroundColor: primaryColor }]} accessibilityRole="button" accessibilityLabel={t('copyInviteCode', language)}>
                            <Copy color="#fff" size={17} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    }

    function renderMember(member: CompanyMember) {
        const displayName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || t('pendingUser', language);
        const roleOptions = selectableRoles;
        const companyOwnerId = (managedCompany as (Company & { owner_id?: string | null }) | null)?.owner_id;
        const canManageMember = member.user_id !== user?.id
            && member.user_id !== companyOwnerId
            && member.role_code !== 'super_administrator';

        return (
            <View key={member.membership_id} style={[styles.memberRow, { borderColor }]}>
                <View style={[styles.memberAvatar, { backgroundColor: `${primaryColor}18` }]}>
                    <Text style={{ color: primaryColor, fontWeight: '800' }}>{displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.memberCopy}>
                    <Text style={[styles.memberName, { color: textColor }]} numberOfLines={1}>{displayName}</Text>
                    <Text style={[styles.memberMeta, { color: mutedColor }]} numberOfLines={1}>{member.email || t('invitationPending', language)}{member.status && member.status !== 'active' ? ` · ${member.status}` : ''}</Text>
                    {canManageMember ? (
                        <TouchableOpacity onPress={() => setRolePickerMemberId(rolePickerMemberId === member.membership_id ? null : member.membership_id)} style={[styles.rolePill, { borderColor: primaryColor }]} accessibilityRole="button" accessibilityLabel={t('couldNotChangePrivilege', language)}>
                            <Text style={[styles.rolePillText, { color: primaryColor }]}>{member.role_name || roleLabelForCode(member.role_code, language)}</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={[styles.rolePill, { borderColor }]}>
                            <Text style={[styles.rolePillText, { color: mutedColor }]}>{member.role_name || roleLabelForCode(member.role_code, language)}</Text>
                        </View>
                    )}
                </View>
                {canManageMember && (
                    <TouchableOpacity onPress={() => handleRemoveMember(member)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={t('removeAccess', language)}>
                        <Trash2 color="#EF4444" size={17} />
                    </TouchableOpacity>
                )}
                {canManageMember && rolePickerMemberId === member.membership_id && (
                    <ScrollView
                        style={styles.memberRoleScroll}
                        horizontal
                        nestedScrollEnabled
                        scrollEnabled
                        showsHorizontalScrollIndicator
                        contentContainerStyle={styles.memberRoleChoices}
                    >
                        {roleOptions.map((role) => (
                            <TouchableOpacity key={role.id} onPress={() => { void handleRoleChange(member, role); }} style={[styles.memberRoleChoice, { backgroundColor: role.code === member.role_code ? primaryColor : cardBg, borderColor: role.code === member.role_code ? primaryColor : borderColor }]}>
                                <Text style={{ color: role.code === member.role_code ? '#fff' : mutedColor, fontSize: 11, fontWeight: '700' }}>{role.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>
        );
    }
}

function roleLabelForCode(roleCode: string, language: string) {
    const roleKeys: Record<string, 'owner' | 'adminRole' | 'accountantRole' | 'managerRole' | 'readOnlyRole' | 'memberRole' | 'staffRole' | 'employeeRole' | 'superAdminRole'> = {
        owner: 'owner',
        super_administrator: 'superAdminRole',
        admin: 'adminRole',
        company_administrator: 'adminRole',
        accountant: 'accountantRole',
        manager: 'managerRole',
        employee: 'employeeRole',
        read_only: 'readOnlyRole',
        member: 'memberRole',
        staff: 'staffRole',
    };
    const key = roleKeys[roleCode];
    return key ? t(key, language) : roleCode.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function CompanyChoiceRow({
    label,
    options,
    selectedId,
    onSelect,
    textColor,
    mutedColor,
    borderColor,
    primaryColor,
    includeNoParent = false,
    language,
}: {
    label: string;
    options: Company[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    textColor: string;
    mutedColor: string;
    borderColor: string;
    primaryColor: string;
    includeNoParent?: boolean;
    language: string;
}) {
    return (
        <View style={styles.parentPicker}>
            <Text style={[styles.parentLabel, { color: textColor }]}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parentOptions}>
                {includeNoParent && (
                    <TouchableOpacity
                        onPress={() => onSelect(null)}
                        style={[styles.parentOption, { borderColor: selectedId === null ? primaryColor : borderColor, backgroundColor: selectedId === null ? `${primaryColor}20` : 'transparent' }]}
                    >
                        <Text style={{ color: selectedId === null ? primaryColor : mutedColor, fontWeight: '600' }}>{t('mainCompany', language)}</Text>
                    </TouchableOpacity>
                )}
                {options.map((company) => {
                    const selected = selectedId === company.id;
                    return (
                        <TouchableOpacity
                            key={company.id}
                            onPress={() => onSelect(company.id)}
                            style={[styles.parentOption, { borderColor: selected ? primaryColor : borderColor, backgroundColor: selected ? `${primaryColor}20` : 'transparent' }]}
                        >
                            <Text style={{ color: selected ? primaryColor : mutedColor, fontWeight: '600' }}>{company.company_name}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
    backButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    headerAction: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    eyebrow: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48 },
    createCard: { padding: 16, marginBottom: 24, borderWidth: 1 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
    helperText: { fontSize: 12, lineHeight: 18 },
    createActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
    flexButton: { flex: 1 },
    modeRow: { flexDirection: 'row', gap: 8, marginVertical: 16 },
    modeButton: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1 },
    modeButtonText: { fontSize: 12, fontWeight: '700' },
    parentPicker: { marginTop: 8, marginBottom: 4 },
    parentLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
    parentOptions: { gap: 8, paddingBottom: 4 },
    parentOption: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    label: { fontSize: 12, fontWeight: 'bold', marginBottom: 12, marginHorizontal: 4 },
    companyCardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 12 },
    companyCardTouch: { flex: 1 },
    companyCard: { flexDirection: 'row', alignItems: 'center', padding: 16, minHeight: 92, borderWidth: 1 },
    subdivisionWrapper: { marginLeft: 20 },
    subdivisionCard: { paddingVertical: 13, minHeight: 80 },
    manageButton: { width: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    iconContainer: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    companyInfo: { flex: 1, minWidth: 0 },
    companyName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    companyRole: { fontSize: 12, textTransform: 'capitalize' },
    aggregateHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
    activeBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    managementCard: { padding: 16, marginTop: 12, borderWidth: 1 },
    panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    panelIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    panelHeaderCopy: { flex: 1 },
    panelEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 2 },
    panelTitle: { fontSize: 19, fontWeight: '800' },
    inlinePanel: { borderRadius: 15, borderWidth: 1, padding: 13, marginTop: 16 },
    subsectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
    fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 3, marginBottom: 8 },
    roleChoices: { gap: 8, paddingBottom: 2 },
    roleChoice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
    roleChoiceText: { fontSize: 11, fontWeight: '700' },
    tokenBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, gap: 10 },
    tokenCopy: { flex: 1 },
    tokenLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginBottom: 5 },
    tokenText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    copyButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    divider: { height: 1, backgroundColor: 'rgba(148,163,184,0.18)', marginVertical: 18 },
    sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionHeadingCopy: { flex: 1 },
    memberListScroll: { maxHeight: 360, marginTop: 12 },
    memberList: { paddingBottom: 2 },
    memberRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 12, gap: 10 },
    memberAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    smallIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    memberCopy: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 13, fontWeight: '700' },
    memberMeta: { fontSize: 11, marginTop: 2 },
    rolePill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginTop: 7 },
    rolePillText: { fontSize: 10, fontWeight: '800' },
    removeButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    removeCompanyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 10 },
    removeCompanyText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
    memberRoleScroll: { width: '100%' },
    memberRoleChoices: { flexDirection: 'row', gap: 7, paddingTop: 2, paddingRight: 8 },
    memberRoleChoice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 },
    inviteList: { marginTop: 18 },
    invitationRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8, gap: 9 },
});
