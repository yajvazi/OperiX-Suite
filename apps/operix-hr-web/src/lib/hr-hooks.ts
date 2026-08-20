"use client";

import { useCallback, useEffect, useState } from "react";
import { listAnnouncements, listAttendance, listEmployees, listLeaveBalances, listLeaveRequests, listLeaveTypes, listNotifications, subscribeToHrChanges, type HrAnnouncement, type HrAttendanceRecord, type HrEmployee, type HrLeaveBalance, type HrLeaveRequest, type HrLeaveType, type HrNotification } from "@invoice-monorepo/hr";
import { createClient } from "./supabase/client";
import { useHrWorkspace } from "./workspace";

export type HrSnapshot = { employees: HrEmployee[]; attendance: HrAttendanceRecord[]; leaveRequests: HrLeaveRequest[]; announcements: HrAnnouncement[]; notifications: HrNotification[]; balances: HrLeaveBalance[]; leaveTypes: HrLeaveType[]; currentEmployee: HrEmployee | null };

function dateValue(date: Date) { return date.toISOString().slice(0, 10); }

export function useHrSnapshot(options: { employeeOnly?: boolean } = {}) {
  const { workspace, loading: workspaceLoading, error: workspaceError, refresh: refreshWorkspace } = useHrWorkspace();
  const [data, setData] = useState<HrSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const client = createClient();
    if (!client || !workspace?.user || !workspace.companyId) return;
    setLoading(true);
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      const currentEmployeePromise = import("@invoice-monorepo/hr").then(({ getEmployeeForUser }) => getEmployeeForUser(client, workspace.user!.id, workspace.companyId));
      const [employees, attendance, leaveRequests, announcements, notifications, currentEmployee] = await Promise.all([
        options.employeeOnly ? currentEmployeePromise.then((employee) => employee ? [employee] : []) : listEmployees(client, workspace.companyIds),
        listAttendance(client, workspace.companyIds, dateValue(start), dateValue(today)),
        listLeaveRequests(client, workspace.companyIds, options.employeeOnly ? undefined : undefined),
        listAnnouncements(client, workspace.companyId),
        listNotifications(client, workspace.user.id, workspace.companyId),
        currentEmployeePromise,
      ]);
      const employee = currentEmployee || (employees.find((candidate) => candidate.user_id === workspace.user?.id) ?? null);
      const [balances, leaveTypes] = employee ? await Promise.all([listLeaveBalances(client, workspace.companyId, employee.id), listLeaveTypes(client, workspace.companyId)]) : [[], []];
      setData({ employees, attendance, leaveRequests: options.employeeOnly && employee ? leaveRequests.filter((request) => request.employee_id === employee.id) : leaveRequests, announcements, notifications, balances, leaveTypes, currentEmployee: employee });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load HR data.");
    } finally { setLoading(false); }
  }, [options.employeeOnly, workspace?.companyId, workspace?.companyIds, workspace?.user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const client = createClient();
    if (!client || !workspace?.companyId) return;
    return subscribeToHrChanges(client, workspace.companyId, () => { void refresh(); }, workspace.user?.id);
  }, [refresh, workspace?.companyId, workspace?.user?.id]);

  return { data, loading: workspaceLoading || loading, error: workspaceError || error, refresh, refreshWorkspace, workspace };
}

export function useHrLeaveTypes(companyId?: string) {
  const [types, setTypes] = useState<HrLeaveType[]>([]);
  useEffect(() => { const client = createClient(); if (!client || !companyId) return; void listLeaveTypes(client, companyId).then(setTypes).catch(() => setTypes([])); }, [companyId]);
  return types;
}
