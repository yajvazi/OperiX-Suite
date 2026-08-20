import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Activity, ArrowRight, Bell, CalendarDays, Clock3, FileText, Users } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { resolveWorkspace, supabase } from '@invoice-monorepo/api';
import {
    listAnnouncements,
    listAttendance,
    listEmployees,
    listHrApprovals,
    listJobOpenings,
    listLeaveRequests,
    type HrAnnouncement,
    type HrApproval,
    type HrAttendanceRecord,
    type HrEmployee,
    type HrJobOpening,
    type HrLeaveRequest,
} from '@invoice-monorepo/hr';
import { Avatar, EmptyState, LoadingState, IconButton, MetricCard, MobileScreen, SectionTitle, ShortcutRow } from '../../components/mobile/MobileUI';
import { brand, getPalette } from '../../theme/brand';

export function HRDashboardScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark } = useTheme();
    const palette = getPalette(isDark);
    const [employees, setEmployees] = useState<HrEmployee[]>([]);
    const [attendance, setAttendance] = useState<HrAttendanceRecord[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<HrLeaveRequest[]>([]);
    const [announcements, setAnnouncements] = useState<HrAnnouncement[]>([]);
    const [approvals, setApprovals] = useState<HrApproval[]>([]);
    const [openings, setOpenings] = useState<HrJobOpening[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!user) return;
        setRefreshing(true);
        try {
            const workspace = await resolveWorkspace(supabase, user.id);
            const today = new Date();
            const start = new Date(today);
            start.setDate(today.getDate() - 6);
            const date = (value: Date) => value.toISOString().slice(0, 10);
            const [people, records, requests, news, approvalRows, openingRows] = await Promise.all([
                listEmployees(supabase, workspace.companyIds),
                listAttendance(supabase, workspace.companyIds, date(start), date(today)),
                listLeaveRequests(supabase, workspace.companyIds),
                listAnnouncements(supabase, workspace.companyId),
                listHrApprovals(supabase, workspace.companyId),
                listJobOpenings(supabase, workspace.companyId),
            ]);
            setEmployees(people);
            setAttendance(records);
            setLeaveRequests(requests);
            setAnnouncements(news);
            setApprovals(approvalRows);
            setOpenings(openingRows);
        } catch (error) {
            console.warn('Unable to load HR dashboard', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

    const today = new Date().toISOString().slice(0, 10);
    const present = attendance.filter((record) => record.date === today && ['present', 'remote', 'late'].includes(record.status)).length;
    const onLeave = leaveRequests.filter((request) => request.status === 'approved' && request.start_date <= today && request.end_date >= today).length;
    const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
    const upcoming = leaveRequests.filter((request) => request.status === 'approved' && request.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 3);
    const firstName = user?.user_metadata?.first_name || 'there';
    const initials = firstName.slice(0, 1).toUpperCase();

    return (
        <MobileScreen>
            <View style={styles.header}>
                <TouchableOpacity style={styles.profileHeader} onPress={() => navigation.navigate('MoreTab', { screen: 'Profile' })}>
                    <Avatar label={initials} />
                    <View style={styles.headerCopy}>
                        <Text style={[styles.greeting, { color: palette.muted }]}>Good morning, {firstName}</Text>
                        <Text style={[styles.companyName, { color: palette.text }]}>OperiX HR</Text>
                    </View>
                </TouchableOpacity>
                <IconButton label="Notifications" onPress={() => navigation.navigate('MoreTab', { screen: 'Approvals' })}><Bell color={palette.text} size={20} /></IconButton>
            </View>

            {loading ? <LoadingState label="Opening your workspace" /> : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={brand.colors.primary} />}>
                    <View style={[styles.overviewCard, { backgroundColor: brand.colors.primary }]}>
                        <View style={styles.overviewTop}><View><Text style={styles.overviewLabel}>TEAM OVERVIEW</Text><Text style={styles.overviewTitle}>Your people at a glance</Text></View><View style={styles.overviewIcon}><Users color="#fff" size={22} /></View></View>
                        <View style={styles.overviewStats}>
                            <OverviewStat label="Employees" value={employees.length} />
                            <OverviewStat label="Present" value={present} />
                            <OverviewStat label="On leave" value={onLeave} />
                        </View>
                    </View>

                    <View style={styles.metricRow}>
                        <MetricCard label="Open positions" value={openings.filter((opening) => opening.status === 'open').length} />
                        <MetricCard label="Needs review" value={pendingApprovals.length} tone={pendingApprovals.length ? 'warning' : 'success'} />
                    </View>

                    <SectionTitle title="Quick actions" />
                    <View style={styles.quickGrid}>
                        <QuickAction icon={Clock3} label="Clock in" onPress={() => navigation.navigate('Attendance')} palette={palette} />
                        <QuickAction icon={CalendarDays} label="Request leave" onPress={() => navigation.navigate('Leave')} palette={palette} />
                        <QuickAction icon={Users} label="Employees" onPress={() => navigation.navigate('EmployeesTab', { screen: 'EmployeeDirectory' })} palette={palette} />
                        <QuickAction icon={FileText} label="Payslips" onPress={() => navigation.navigate('MoreTab', { screen: 'Payroll' })} palette={palette} />
                    </View>

                    <SectionTitle title="Approvals" action="Open inbox" onPress={() => navigation.navigate('MoreTab', { screen: 'Approvals' })} />
                    {pendingApprovals.length ? pendingApprovals.slice(0, 3).map((approval) => <ShortcutRow key={approval.id} icon={Clock3} title={approval.resource_type.replace(/_/g, ' ')} description="Needs manager review" onPress={() => navigation.navigate('MoreTab', { screen: 'Approvals' })} trailing={<ArrowRight color={palette.muted} size={18} />} />) : <EmptyState title="Nothing needs your attention" description="Pending requests will appear here." icon={Activity} />}

                    <SectionTitle title="Upcoming leave" action="View all" onPress={() => navigation.navigate('Leave')} />
                    {upcoming.length ? upcoming.map((request) => <ShortcutRow key={request.id} icon={CalendarDays} title={request.employee ? `${request.employee.first_name} ${request.employee.last_name}` : 'Employee'} description={`${request.leave_type} · ${request.start_date}`} onPress={() => navigation.navigate('Leave')} trailing={<Text style={[styles.days, { color: palette.muted }]}>{request.requested_days || '—'}d</Text>} />) : <EmptyState title="No upcoming leave" description="Approved leave will appear here." icon={CalendarDays} />}

                    <SectionTitle title="Announcements" action={announcements.length ? 'View all' : undefined} onPress={() => navigation.navigate('MoreTab', { screen: 'Settings' })} />
                    {announcements.length ? announcements.slice(0, 3).map((announcement) => <ShortcutRow key={announcement.id} icon={Bell} title={announcement.title} description={announcement.body} onPress={() => navigation.navigate('MoreTab', { screen: 'Settings' })} />) : <EmptyState title="No announcements yet" description="Company updates will appear here." icon={Bell} />}
                    <View style={{ height: 92 }} />
                </ScrollView>
            )}
        </MobileScreen>
    );
}

function OverviewStat({ label, value }: { label: string; value: number }) {
    return <View style={styles.overviewStat}><Text style={styles.overviewValue}>{value}</Text><Text style={styles.overviewStatLabel}>{label}</Text></View>;
}

function QuickAction({ icon: Icon, label, onPress, palette }: { icon: React.ComponentType<{ color?: string; size?: number }>; label: string; onPress: () => void; palette: ReturnType<typeof getPalette> }) {
    return <TouchableOpacity style={[styles.quickAction, { backgroundColor: palette.surface, borderColor: palette.border }]} onPress={onPress}><View style={[styles.quickIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={20} /></View><Text style={[styles.quickLabel, { color: palette.text }]}>{label}</Text><ArrowRight color={palette.muted} size={15} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
    header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 7, paddingBottom: 12 },
    profileHeader: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    headerCopy: { flex: 1, marginLeft: 10 },
    greeting: { fontSize: 11, fontFamily: brand.fonts.medium },
    companyName: { fontSize: 15, fontFamily: brand.fonts.semibold, marginTop: 3 },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    overviewCard: { borderRadius: 20, padding: 19, marginBottom: 12, ...brand.shadow.floating },
    overviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    overviewLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: brand.fonts.medium, letterSpacing: 1.1 },
    overviewTitle: { color: '#fff', fontSize: 20, lineHeight: 27, fontFamily: brand.fonts.semibold, marginTop: 5 },
    overviewIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    overviewStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 21, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
    overviewStat: { flex: 1 },
    overviewValue: { color: '#fff', fontSize: 22, fontFamily: brand.fonts.semibold },
    overviewStatLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: brand.fonts.medium, marginTop: 2 },
    metricRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 23 },
    quickAction: { width: '48.5%', minHeight: 72, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
    quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickLabel: { flex: 1, fontSize: 13, fontFamily: brand.fonts.semibold },
    days: { fontSize: 12, fontFamily: brand.fonts.medium },
});
