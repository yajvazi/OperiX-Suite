import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
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
import { formatDate as formatLocalizedDate, getLocalizedErrorMessage, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { getWorkspaceScope, invalidateWorkspaceScope } from '../../services/workspace';
import { notifyBusinessEvent } from '../../services/pushNotifications';

type RoleOption = {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    company_id?: string | null;
    is_system?: boolean;
};

type Scope = 'OWN' | 'ASSIGNED' | 'ALL';

type PermissionOption = {
    code: string;
    name: string;
    category: string;
    description?: string | null;
    is_sensitive: boolean;
};

type MemberAccess = {
    role_code?: string;
    permissions?: string[];
    scopes?: Record<string, Scope>;
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
    is_company_owner?: boolean;
    access?: MemberAccess | null;
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

const permissionCategoryLabels: Record<string, TranslationKey> = {
    invoices: 'pcInvoices',
    documents: 'pcDocuments',
    payments: 'pcPayments',
    expenses: 'pcExpenses',
    customers: 'pcCustomers',
    products: 'pcProducts',
    inventory: 'pcInventory',
    reports: 'pcReports',
    accounting: 'pcAccounting',
    users: 'pcUsers',
    security: 'pcSecurity',
    settings: 'pcSettings',
};

const scopeResources: Array<{ resource: string; labelKey: TranslationKey }> = [
    { resource: 'invoice', labelKey: 'pcInvoices' },
    { resource: 'offer', labelKey: 'pcOffers' },
    { resource: 'proforma', labelKey: 'pcProformas' },
    { resource: 'order', labelKey: 'pcOrders' },
    { resource: 'delivery_note', labelKey: 'pcDeliveryNotes' },
    { resource: 'customer', labelKey: 'pcCustomers' },
    { resource: 'expense', labelKey: 'pcExpenses' },
    { resource: 'payment', labelKey: 'pcPayments' },
    { resource: 'product', labelKey: 'pcProducts' },
    { resource: 'inventory', labelKey: 'pcInventory' },
];

const sensitivePermissionCodes = new Set([
    'payment.refund',
    'invoice.void',
    'invoice.credit',
    'invoice.debit',
    'financial.export',
    'reports.profit',
    'inventory.adjust',
    'accounting_period.close',
    'accounting_period.reopen',
]);

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
    const [permissionCatalog, setPermissionCatalog] = useState<PermissionOption[]>([]);
    const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
    const [managementLoading, setManagementLoading] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [rolePickerMemberId, setRolePickerMemberId] = useState<string | null>(null);
    const [accessEditorMemberId, setAccessEditorMemberId] = useState<string | null>(null);
    const [editingPermissions, setEditingPermissions] = useState<Record<string, boolean>>({});
    const [initialEditingPermissions, setInitialEditingPermissions] = useState<Record<string, boolean>>({});
    const [editingScopes, setEditingScopes] = useState<Record<string, Scope>>({});
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRoleCode, setInviteRoleCode] = useState('employee');
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [editParentCompanyId, setEditParentCompanyId] = useState<string | null>(null);
    const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [editForm, setEditForm] = useState<CompanyEditForm>({
        company_name: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        tax_id: '',
    });
    const switchInFlight = useRef(false);

    const bgColor = isDark ? '#0A0A0B' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#151517' : '#ffffff';
    const borderColor = isDark ? '#262629' : '#E4E9F0';
    const inputBg = isDark ? '#0A0A0B' : '#F4F7FB';
    const managedCompany = companies.find((company) => company.id === managedCompanyId) || null;
    const selectableRoles = useMemo(
        () => roles.filter((role) => ['company_administrator', 'manager', 'employee'].includes(role.code)),
        [roles],
    );
    const rootCompanies = companies.filter((company) => !company.parent_company_id);
    const can = (permission: string) => platformAdmin || workspacePermissions.includes(permission);
    const canManageCompany = can('settings.company');
    const canManageUsers = can('users.manage');
    const canManagePermissions = can('permissions.manage');

    useEffect(() => {
        void fetchData();
    }, []);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        setRefreshing(false);
        try {
            const workspace = await getWorkspaceScope(user.id);
            setWorkspacePermissions(workspace.permissions);
            setPlatformAdmin(workspace.platformAdmin);
            setAccessDenied(!workspace.platformAdmin && !workspace.permissions.some((permission) => ['settings.company', 'users.manage', 'permissions.manage'].includes(permission)));
            const membershipResponse = await supabase
                .from('memberships')
                .select('company_id, role')
                .eq('user_id', user.id)
                .eq('status', 'active');

            if (membershipResponse.error) throw membershipResponse.error;

            // Use the already account-scoped resolver result. Querying the
            // companies table without an explicit membership/ownership scope
            // exposes unrelated tenants in the workspace switcher.
            const nextCompanies = (workspace.companies || []) as unknown as Company[];
            setCompanies(nextCompanies);
            setMembershipRoles(Object.fromEntries(
                (membershipResponse.data || []).map((membership: Pick<Membership, 'company_id' | 'role'>) => [membership.company_id, membership.role]),
            ));

            setActiveCompanyId(workspace.companyId);
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
        if (!canManageCompany) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
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
        if (!canManageUsers && !canManagePermissions) {
            setMembers([]);
            setRoles([]);
            setPermissionCatalog([]);
            setPendingInvitations([]);
            return;
        }
        setManagementLoading(true);
        try {
            const [memberResponse, roleResponse, invitationResponse, catalogResponse] = await Promise.all([
                supabase.rpc('rbac_list_company_members', { p_company_id: companyId }),
                supabase
                    .from('app_roles')
                    .select('id, code, name, description, company_id, is_system')
                    .or(`company_id.is.null,company_id.eq.${companyId}`)
                    .order('name'),
                supabase.rpc('list_company_invitations', { p_company_id: companyId }),
                canManagePermissions ? supabase.rpc('rbac_list_permission_catalog') : Promise.resolve({ data: [], error: null }),
            ]);

            if (memberResponse.error) throw memberResponse.error;
            if (roleResponse.error) throw roleResponse.error;
            if (invitationResponse.error) throw invitationResponse.error;
            if (catalogResponse.error) throw catalogResponse.error;

            setMembers((memberResponse.data || []) as CompanyMember[]);
            setRoles((roleResponse.data || []) as RoleOption[]);
            setPermissionCatalog((catalogResponse.data || []) as PermissionOption[]);
            setPendingInvitations((invitationResponse.data || []) as PendingInvitation[]);
        } catch (error: any) {
            setMembers([]);
            setRoles([]);
            setPermissionCatalog([]);
            setPendingInvitations([]);
            Alert.alert(t('teamAccessUnavailable', language), getLocalizedErrorMessage(error, language, 'noPermissionManageCompany'));
        } finally {
            setManagementLoading(false);
        }
    };

    const openCompanyManagement = async (company: Company) => {
        if (!canManageCompany && !canManageUsers && !canManagePermissions) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
        setManagedCompanyId(company.id);
        setShowEdit(false);
        setShowInvite(false);
        setInviteToken(null);
        setRolePickerMemberId(null);
        setAccessEditorMemberId(null);
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
        if (!canManageCompany) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
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
        if (!canManageUsers) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
        // The former token-only RPC did not reserve or bill a user seat. All
        // Invoice invitations now use the Users & Access flow, which performs
        // the server-side billing preview and Auth invitation.
        navigation.navigate('UsersAccess');
    };

    const handleRoleChange = async (member: CompanyMember, role: RoleOption) => {
        if (!canManagePermissions || role.code === 'super_administrator' || role.code === 'owner') {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
        setManagementLoading(true);
        try {
            const { error } = await supabase.rpc('rbac_update_member_access', {
                p_membership_id: member.membership_id,
                p_role_code: role.code,
                p_permissions: {},
                p_scopes: {},
            });
            if (error) throw error;
            setRolePickerMemberId(null);
            setAccessEditorMemberId(null);
            if (managedCompany) await fetchCompanyManagement(managedCompany.id);
        } catch (error: any) {
            Alert.alert(t('couldNotChangePrivilege', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setManagementLoading(false);
        }
    };

    const openMemberAccessEditor = (member: CompanyMember) => {
        if (!canManagePermissions || member.role_code === 'company_administrator' || member.role_code === 'admin') return;
        const nextPermissions = Object.fromEntries(
            permissionCatalog.map((permission) => [permission.code, Boolean(member.access?.permissions?.includes(permission.code))]),
        );
        const nextScopes = Object.fromEntries(
            scopeResources.map(({ resource }) => [resource, member.access?.scopes?.[resource] || 'OWN']),
        ) as Record<string, Scope>;
        setRolePickerMemberId(null);
        setAccessEditorMemberId((current) => current === member.membership_id ? null : member.membership_id);
        setEditingPermissions(nextPermissions);
        setInitialEditingPermissions(nextPermissions);
        setEditingScopes(nextScopes);
    };

    const saveMemberAccess = async (member: CompanyMember) => {
        if (!canManagePermissions || member.is_company_owner || member.user_id === user?.id) return;
        const grantingSensitive = permissionCatalog.some((permission) =>
            permission.is_sensitive
            && editingPermissions[permission.code]
            && !initialEditingPermissions[permission.code],
        );
        if (grantingSensitive) {
            const confirmed = await new Promise<boolean>((resolve) => {
                Alert.alert(
                    'Sensitive permission',
                    'This grants access to a sensitive financial or legally relevant operation. The change will be audited. Continue?',
                    [
                        { text: t('cancel', language), style: 'cancel', onPress: () => resolve(false) },
                        { text: t('continue', language), style: 'destructive', onPress: () => resolve(true) },
                    ],
                    { cancelable: true, onDismiss: () => resolve(false) },
                );
            });
            if (!confirmed) return;
        }

        setManagementLoading(true);
        try {
            const permissionPayload = Object.fromEntries(
                permissionCatalog.map((permission) => [permission.code, Boolean(editingPermissions[permission.code])]),
            );
            const { error } = await supabase.rpc('rbac_update_member_access', {
                p_membership_id: member.membership_id,
                p_role_code: member.role_code === 'admin' ? 'company_administrator' : member.role_code,
                p_permissions: permissionPayload,
                p_scopes: editingScopes,
            });
            if (error) throw error;
            setAccessEditorMemberId(null);
            if (managedCompany) await fetchCompanyManagement(managedCompany.id);
            Alert.alert(t('recordSaved', language), 'Team permissions and data scopes were saved and recorded in the audit log.');
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'retry'));
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
        if (!canManagePermissions) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
        navigation.navigate('UsersAccess');
    };

    const revokeInvitation = async (invitation: PendingInvitation) => {
        if (!canManagePermissions) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
        navigation.navigate('UsersAccess');
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
        if (!canManageCompany) {
            Alert.alert(t('error', language), t('noPermissionManageCompany', language));
            return;
        }
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
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: cardBg, borderColor }]} accessibilityRole="button" accessibilityLabel={t('back', language)}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View style={styles.headerCopy}>
                    <Text style={[styles.eyebrow, { color: mutedColor }]}>{t('workspace', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('companiesAccess', language)}</Text>
                </View>
                {canManageCompany ? (
                    <TouchableOpacity onPress={() => setShowCreate((current) => !current)} style={[styles.headerAction, { backgroundColor: `${primaryColor}12`, borderColor: `${primaryColor}45` }]} accessibilityRole="button" accessibilityLabel={t('addCompany', language)}>
                        {showCreate ? <X color={primaryColor} size={24} /> : <Plus color={primaryColor} size={24} />}
                    </TouchableOpacity>
                ) : <View style={styles.headerActionPlaceholder} />}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                nestedScrollEnabled
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={primaryColor} />}
            >
                {accessDenied ? (
                    <Card style={[styles.managementCard, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('noPermissionManageCompany', language)}</Text>
                    </Card>
                ) : null}
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

                <View style={styles.organizationHeader}>
                    <View style={styles.organizationHeaderCopy}>
                        <Text style={[styles.label, { color: mutedColor }]}>{t('organizationLabel', language)}</Text>
                        <Text style={[styles.organizationHint, { color: mutedColor }]}>{t('switchOrManageCompanies', language)}</Text>
                    </View>
                    <View style={[styles.companyCount, { backgroundColor: `${primaryColor}14`, borderColor: `${primaryColor}35` }]}>
                        <Building2 color={primaryColor} size={15} />
                        <Text style={[styles.companyCountText, { color: primaryColor }]}>{companies.length}</Text>
                    </View>
                </View>
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
                        <Card style={[styles.companyCard, { backgroundColor: cardBg, borderColor }, depth > 0 && styles.subdivisionCard, isActive && { borderColor: primaryColor, borderWidth: 2, backgroundColor: `${primaryColor}0B` }, isManaged && { backgroundColor: `${primaryColor}10` }]}>
                            <View style={[styles.activeRail, { backgroundColor: primaryColor, opacity: isActive ? 1 : 0 }]} />
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
                    {(canManageCompany || canManageUsers || canManagePermissions) ? (
                        <TouchableOpacity
                            onPress={() => { void openCompanyManagement(company); }}
                            style={[styles.manageButton, { backgroundColor: cardBg, borderColor }, isManaged && { borderColor: primaryColor, backgroundColor: `${primaryColor}15` }]}
                            accessibilityRole="button"
                            accessibilityLabel={t('manageCompany', language).replace('{company}', company.company_name)}
                        >
                            <Pencil color={isManaged ? primaryColor : mutedColor} size={17} />
                        </TouchableOpacity>
                    ) : null}
                </View>
                {children.map((child) => renderCompany(child, depth + 1))}
            </View>
        );
    }

    function renderManagementPanel() {
        if (!managedCompany) return null;

        return (
            <Card style={[styles.managementCard, { backgroundColor: cardBg, borderColor: managedCompany.id === activeCompanyId ? primaryColor : borderColor }]}>
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

                {canManageCompany ? (
                    <View style={styles.actionRow}>
                        <Button title={t('editDetails', language)} variant="outline" size="small" icon={Pencil} onPress={() => setShowEdit((current) => !current)} style={styles.flexButton} />
                        {canManageUsers ? <Button title={t('inviteUser', language)} size="small" icon={Mail} onPress={() => navigation.navigate('UsersAccess')} style={styles.flexButton} /> : null}
                    </View>
                ) : null}
                {canManageCompany ? (
                    <TouchableOpacity
                        onPress={() => handleArchiveCompany(managedCompany)}
                        style={[styles.removeCompanyButton, { borderColor: '#FCA5A5', backgroundColor: '#DC26260A' }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('removeCompany', language)}
                    >
                        <Trash2 color="#DC2626" size={16} />
                        <Text style={styles.removeCompanyText}>{t('removeCompany', language)}</Text>
                    </TouchableOpacity>
                ) : null}

                {showEdit && renderEditForm()}
                {showInvite && renderInviteForm()}

                <View style={styles.divider} />
                <View style={styles.sectionHeadingRow}>
                    <View style={styles.sectionHeadingCopy}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('teamMembers', language)}</Text>
                        <Text style={[styles.helperText, { color: mutedColor }]}>{t('changeAccessForCompany', language)}</Text>
                    </View>
                    <View style={[styles.sectionIcon, { backgroundColor: `${primaryColor}14` }]}>
                        <Users color={primaryColor} size={18} />
                    </View>
                </View>

                {managementLoading && members.length === 0 ? (
                    <Text style={[styles.helperText, { color: mutedColor, marginTop: 14 }]}>{t('loadingTeam', language)}</Text>
                ) : members.length === 0 ? (
                    <Text style={[styles.helperText, { color: mutedColor, marginTop: 14 }]}>{t('noDirectMembers', language)}</Text>
                ) : (
                    <ScrollView style={styles.memberListScroll} contentContainerStyle={styles.memberList} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                        {members.map((member) => renderMember(member))}
                    </ScrollView>
                )}

                {canManagePermissions && pendingInvitations.length > 0 && (
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
                <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleChoices}>
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
        const canManageMember = canManagePermissions
            && member.user_id !== user?.id
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
                    <ScrollView keyboardShouldPersistTaps="handled"
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
                {canManageMember && member.role_code !== 'company_administrator' && member.role_code !== 'admin' && (
                    <TouchableOpacity
                        onPress={() => openMemberAccessEditor(member)}
                        style={[styles.accessEditorToggle, { borderColor: primaryColor, backgroundColor: accessEditorMemberId === member.membership_id ? `${primaryColor}14` : 'transparent' }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('pcEditAccess', language)}
                    >
                        <Text style={[styles.accessEditorToggleText, { color: primaryColor }]}>{t('pcPermissionsScopes', language)}</Text>
                    </TouchableOpacity>
                )}
                {canManageMember && accessEditorMemberId === member.membership_id && renderMemberAccessEditor(member)}
            </View>
        );
    }

    function renderMemberAccessEditor(member: CompanyMember) {
        const groupedPermissions = permissionCatalog.reduce<Record<string, PermissionOption[]>>((groups, permission) => {
            (groups[permission.category] ||= []).push(permission);
            return groups;
        }, {});
        const sensitiveEnabled = Object.entries(editingPermissions).some(([code, enabled]) => enabled && sensitivePermissionCodes.has(code));

        return (
            <View style={[styles.accessEditor, { backgroundColor: inputBg, borderColor }]}>
                <Text style={[styles.subsectionTitle, { color: textColor }]}>{t('pcPermissions', language)}</Text>
                <Text style={[styles.helperText, { color: mutedColor }]}>{t('pcRoleDefaults', language)}</Text>
                {Object.entries(groupedPermissions).map(([category, permissions]) => (
                    <View key={category} style={[styles.permissionGroup, { borderColor }]}>
                        <Text style={[styles.permissionGroupTitle, { color: textColor }]}>{permissionCategoryLabels[category] ? t(permissionCategoryLabels[category], language) : category}</Text>
                        {permissions.map((permission) => (
                            <View key={permission.code} style={[styles.permissionRow, { borderTopColor: borderColor }]}>
                                <View style={styles.permissionCopy}>
                                    <Text style={[styles.permissionName, { color: textColor }]}>{permission.name}</Text>
                                    {permission.description ? <Text style={[styles.permissionDescription, { color: mutedColor }]}>{permission.description}</Text> : null}
                                    {permission.is_sensitive ? <Text style={styles.sensitiveLabel}>{t('pcSensitiveAudited', language)}</Text> : null}
                                </View>
                                <Switch
                                    value={Boolean(editingPermissions[permission.code])}
                                    onValueChange={(value) => setEditingPermissions((current) => ({ ...current, [permission.code]: value }))}
                                    trackColor={{ false: '#CBD5E1', true: `${primaryColor}70` }}
                                    thumbColor={editingPermissions[permission.code] ? primaryColor : '#F8FAFC'}
                                />
                            </View>
                        ))}
                    </View>
                ))}
                <Text style={[styles.subsectionTitle, { color: textColor, marginTop: 16 }]}>{t('pcDataScopes', language)}</Text>
                <Text style={[styles.helperText, { color: mutedColor }]}>{t('pcScopesNote', language)}</Text>
                {scopeResources.map(({ resource, labelKey }) => (
                    <View key={resource} style={styles.scopeRow}>
                        <Text style={[styles.scopeLabel, { color: textColor }]}>{t(labelKey, language)}</Text>
                        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeChoices}>
                            {(['OWN', 'ASSIGNED', 'ALL'] as Scope[]).map((scope) => (
                                <TouchableOpacity
                                    key={scope}
                                    onPress={() => setEditingScopes((current) => ({ ...current, [resource]: scope }))}
                                    style={[styles.scopeChoice, { borderColor: editingScopes[resource] === scope ? primaryColor : borderColor, backgroundColor: editingScopes[resource] === scope ? primaryColor : 'transparent' }]}
                                >
                                    <Text style={{ color: editingScopes[resource] === scope ? '#fff' : mutedColor, fontSize: 10, fontWeight: '700' }}>{scope === 'OWN' ? t('pcScopeOwn', language) : scope === 'ASSIGNED' ? t('pcScopeAssigned', language) : t('pcScopeAll', language)}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                ))}
                {sensitiveEnabled ? (
                    <View style={styles.sensitiveNotice}>
                        <Text style={styles.sensitiveNoticeText}>{t('pcSensitiveNotice', language)}</Text>
                    </View>
                ) : null}
                <Button title={t('pcSaveAccess', language)} onPress={() => { void saveMemberAccess(member); }} loading={managementLoading} style={{ marginTop: 14 }} />
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
            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.parentOptions}>
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
    backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    headerAction: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    headerActionPlaceholder: { width: 42, height: 42 },
    eyebrow: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    title: { fontSize: 24, fontWeight: '800' },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 56 },
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
    organizationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
    organizationHeaderCopy: { flex: 1 },
    organizationHint: { fontSize: 12, lineHeight: 17, marginTop: 0 },
    companyCount: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
    companyCountText: { fontSize: 12, fontWeight: '800' },
    label: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, marginHorizontal: 0 },
    companyCardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 12 },
    companyCardTouch: { flex: 1 },
    companyCard: { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 96, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
    subdivisionWrapper: { marginLeft: 16 },
    subdivisionCard: { paddingVertical: 12, minHeight: 82 },
    manageButton: { width: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    activeRail: { width: 3, alignSelf: 'stretch', borderRadius: 99, marginRight: 11 },
    iconContainer: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
    companyInfo: { flex: 1, minWidth: 0 },
    companyName: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    companyRole: { fontSize: 12, lineHeight: 17, textTransform: 'capitalize' },
    aggregateHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
    activeBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    managementCard: { padding: 18, marginTop: 8, borderWidth: 1.5, borderRadius: 21 },
    panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: 'rgba(148,163,184,0.06)' },
    panelIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
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
    divider: { height: 1, backgroundColor: 'rgba(148,163,184,0.18)', marginVertical: 22 },
    sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionHeadingCopy: { flex: 1 },
    sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    memberListScroll: { marginTop: 12 },
    memberList: { paddingBottom: 2 },
    memberRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 14, gap: 10 },
    memberAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    smallIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    memberCopy: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 13, fontWeight: '700' },
    memberMeta: { fontSize: 11, marginTop: 2 },
    rolePill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, marginTop: 7 },
    rolePillText: { fontSize: 10, fontWeight: '800' },
    removeButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF44440D' },
    removeCompanyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 13, paddingVertical: 11, marginTop: 12 },
    removeCompanyText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
    memberRoleScroll: { width: '100%' },
    memberRoleChoices: { flexDirection: 'row', gap: 7, paddingTop: 2, paddingRight: 8 },
    memberRoleChoice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 7 },
    accessEditorToggle: { width: '100%', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, marginTop: 2 },
    accessEditorToggleText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
    accessEditor: { width: '100%', borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 4 },
    permissionGroup: { borderWidth: 1, borderRadius: 12, marginTop: 10, overflow: 'hidden' },
    permissionGroupTitle: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 9 },
    permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
    permissionCopy: { flex: 1, minWidth: 0 },
    permissionName: { fontSize: 11, fontWeight: '700' },
    permissionDescription: { fontSize: 10, lineHeight: 14, marginTop: 2 },
    sensitiveLabel: { color: '#B45309', fontSize: 9, fontWeight: '800', marginTop: 2 },
    scopeRow: { marginTop: 10 },
    scopeLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
    scopeChoices: { flexDirection: 'row', gap: 6, paddingRight: 6 },
    scopeChoice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
    sensitiveNotice: { borderRadius: 10, backgroundColor: '#FEF3C7', padding: 10, marginTop: 14 },
    sensitiveNoticeText: { color: '#92400E', fontSize: 10, lineHeight: 15, fontWeight: '600' },
    inviteList: { marginTop: 18 },
    invitationRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8, gap: 9 },
});
