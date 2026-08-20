import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Eye, FileLock, FileText, Trash2, Upload } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card } from '@invoice-monorepo/ui';
import { resolveWorkspace, supabase } from '@invoice-monorepo/api';
import { createEmployeeDocument, deleteEmployeeDocument, getEmployeeForUser, listEmployeeDocuments, subscribeToHrChanges, type HrDocument, type HrEmployee } from '@invoice-monorepo/hr';

const BLUE = '#004FFE';

export function EmployeeVaultScreen({ navigation, route }: any) {
  const { isDark } = useTheme();
  const employeeId = route.params?.id as string | undefined;
  const [documents, setDocuments] = useState<HrDocument[]>([]);
  const [employee, setEmployee] = useState<HrEmployee | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const colors = {
    bg: isDark ? '#0f172a' : '#f8fafc',
    card: isDark ? '#1e293b' : '#fff',
    text: isDark ? '#fff' : '#1e293b',
    muted: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e4e9f0',
  };

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setRefreshing(true);
    try {
      const workspace = await resolveWorkspace(supabase, user.id);
      const own = await getEmployeeForUser(supabase, user.id, workspace.companyId);
      setEmployee(own);
      setCompanyId(workspace.companyId);
      setCanManage(
        ['owner', 'admin', 'company_administrator', 'hr_admin', 'hr_manager'].includes(workspace.profile.role || '')
          || ['admin', 'manager', 'hr_manager'].includes(own?.role || ''),
      );
      setDocuments(await listEmployeeDocuments(supabase, workspace.companyIds, employeeId));
    } catch (error: any) {
      Alert.alert('Unable to load documents', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
    let removeSubscription: (() => void) | undefined;
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      try {
        const workspace = await resolveWorkspace(supabase, user.id);
        removeSubscription = subscribeToHrChanges(supabase, workspace.companyId, () => { void load(); });
      } catch { /* The initial load reports the actionable error. */ }
    });
    return () => removeSubscription?.();
  }, [load]);

  async function handleUpload() {
    const targetEmployeeId = employeeId || employee?.id;
    if (!companyId || !targetEmployeeId) {
      Alert.alert('Employee profile missing', 'Open an employee profile or ask HR to link your account first.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    if (!file) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${companyId}/${targetEmployeeId}/${Date.now()}-${safeName}`;
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: (FileSystem as any).EncodingType?.Base64 || 'base64' });
      const storageResult = await supabase.storage.from('employee-documents').upload(path, decode(base64), { contentType: file.mimeType || 'application/octet-stream', upsert: false });
      if (storageResult.error) throw storageResult.error;
      try {
        await createEmployeeDocument(supabase, { companyId, employeeId: targetEmployeeId, name: file.name, documentType: 'other', filePath: path });
      } catch (metadataError) {
        await supabase.storage.from('employee-documents').remove([path]);
        throw metadataError;
      }
      Alert.alert('Uploaded', 'The private document is now available to authorized users.');
      await load();
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message || 'Unable to upload this document.');
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(document: HrDocument) {
    if (!canManage) return;
    Alert.alert('Delete document', 'This removes the document metadata and its private file.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const storageResult = await supabase.storage.from('employee-documents').remove([document.file_url]);
          if (storageResult.error) throw storageResult.error;
          await deleteEmployeeDocument(supabase, document.id);
          await load();
        } catch (error: any) {
          Alert.alert('Unable to delete document', error?.message || 'Please try again.');
        }
      } },
    ]);
  }

  async function handleView(document: HrDocument) {
    try {
      const result = await supabase.storage.from('employee-documents').createSignedUrl(document.file_url, 60);
      if (result.error) throw result.error;
      if (result.data?.signedUrl) await Linking.openURL(result.data.signedUrl);
    } catch (error: any) {
      Alert.alert('Unable to open document', error?.message || 'The private link could not be created.');
    }
  }

  function renderItem({ item }: { item: HrDocument }) {
    return <Card style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={[styles.iconBox, { backgroundColor: `${BLUE}12` }]}><FileText color={BLUE} size={23} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.docMeta, { color: colors.muted }]}>{item.employee ? `${item.employee.first_name} ${item.employee.last_name}` : 'Employee'} · {item.uploaded_at ? new Date(item.uploaded_at).toLocaleDateString() : 'Uploaded'}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => void handleView(item)}><Eye color={colors.muted} size={19} /></TouchableOpacity>
        {canManage ? <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(item)}><Trash2 color="#c43d53" size={19} /></TouchableOpacity> : null}
      </View>
    </Card>;
  }

  return <View style={[styles.container, { backgroundColor: colors.bg }]}>
    <View style={styles.header}>
      <View style={styles.headerLeft}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ArrowLeft color={colors.text} size={22} /></TouchableOpacity><View><Text style={[styles.kicker, { color: BLUE }]}>PRIVATE STORAGE</Text><Text style={[styles.title, { color: colors.text }]}>Document vault</Text></View></View>
      <TouchableOpacity style={[styles.uploadButton, { backgroundColor: BLUE, opacity: uploading ? .65 : 1 }]} onPress={() => void handleUpload()} disabled={uploading || (!employeeId && !employee)}>{uploading ? <ActivityIndicator color="#fff" size="small" /> : <><Upload color="#fff" size={18} /><Text style={styles.uploadText}>Upload</Text></>}</TouchableOpacity>
    </View>
    <View style={[styles.infoBanner, { backgroundColor: `${BLUE}10` }]}><FileLock color={BLUE} size={19} /><Text style={[styles.infoText, { color: colors.muted }]}>Documents use private storage and short-lived signed links. Access is checked again by Supabase.</Text></View>
    {loading ? <ActivityIndicator style={{ marginTop: 50 }} color={BLUE} /> : <FlatList data={documents} renderItem={renderItem} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={BLUE} />} ListEmptyComponent={<View style={styles.empty}><FileText color={colors.muted} size={45} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No documents found</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Private contracts and HR documents will appear here when uploaded.</Text></View>} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 56, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  title: { marginTop: 3, fontSize: 20, fontWeight: '800' },
  uploadButton: { minWidth: 92, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 10 },
  uploadText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18, marginBottom: 15, padding: 12, borderRadius: 11 },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16 },
  list: { paddingHorizontal: 15, paddingBottom: 35 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 14, borderRadius: 14 },
  iconBox: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  docName: { fontSize: 13, fontWeight: '700' },
  docMeta: { marginTop: 4, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 2 },
  actionButton: { padding: 7 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 25 },
  emptyTitle: { marginTop: 13, fontSize: 14, fontWeight: '800' },
  emptyText: { marginTop: 6, textAlign: 'center', fontSize: 11, lineHeight: 17 },
});
