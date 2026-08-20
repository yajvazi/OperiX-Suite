import type { HrAttendanceRecord, HrEmployee, HrLeaveRequest } from './types';

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) return 0;
  return Math.floor((end.valueOf() - start.valueOf()) / 86_400_000) + 1;
}

export function calculateAttendanceHours(record: Pick<HrAttendanceRecord, 'check_in' | 'check_out' | 'total_hours'>): number {
  if (typeof record.total_hours === 'number' && Number.isFinite(record.total_hours)) return Math.max(0, record.total_hours);
  if (!record.check_in || !record.check_out) return 0;
  const hours = (new Date(record.check_out).valueOf() - new Date(record.check_in).valueOf()) / 3_600_000;
  return Number.isFinite(hours) ? Math.max(0, Math.round(hours * 100) / 100) : 0;
}

export function employeeDisplayName(employee: Pick<HrEmployee, 'first_name' | 'last_name'> | null | undefined): string {
  if (!employee) return 'Employee';
  return [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim() || 'Employee';
}

export function leaveRequestDays(request: Pick<HrLeaveRequest, 'start_date' | 'end_date' | 'requested_days'>): number {
  return typeof request.requested_days === 'number' && request.requested_days > 0
    ? request.requested_days
    : calculateLeaveDays(request.start_date, request.end_date);
}

export function groupByDay(records: readonly HrAttendanceRecord[]): Map<string, HrAttendanceRecord[]> {
  const grouped = new Map<string, HrAttendanceRecord[]>();
  for (const record of records) grouped.set(record.date, [...(grouped.get(record.date) ?? []), record]);
  return grouped;
}
