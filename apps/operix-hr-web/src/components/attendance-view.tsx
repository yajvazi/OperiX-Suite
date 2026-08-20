"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, MapPin, Play, Square } from "lucide-react";
import { calculateAttendanceHours, clockIn, clockOut, employeeDisplayName } from "@invoice-monorepo/hr";
import { createClient } from "@/lib/supabase/client";
import { useHrSnapshot } from "@/lib/hr-hooks";
import { Button, Card, EmptyState, ErrorState, FormMessage, LoadingBlock, PageHeader, StatusBadge, TimeStatus } from "./ui";

export function AttendanceView() {
  const query = useHrSnapshot();
  const [mode, setMode] = useState<"office" | "remote">("office");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const data = query.data;
  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = data?.currentEmployee ? data.attendance.find((record) => record.employee_id === data.currentEmployee?.id && record.date === today) : undefined;
  const weekHours = useMemo(() => (data?.attendance || []).filter((record) => record.employee_id === data?.currentEmployee?.id).reduce((sum, record) => sum + calculateAttendanceHours(record), 0), [data?.attendance, data?.currentEmployee?.id]);
  const peopleByDay = (data?.attendance || []).filter((record) => record.date === today);

  async function toggleClock() {
    const client = createClient();
    if (!client || !query.workspace?.companyId || !data?.currentEmployee) { setError("Your employee profile is not linked to this OperiX account."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      if (todayRecord?.check_in && !todayRecord.check_out) { await clockOut(client, query.workspace.companyId, data.currentEmployee.id); setMessage("You are clocked out. Your hours are saved in the shared HR record."); }
      else { await clockIn(client, query.workspace.companyId, data.currentEmployee.id, mode); setMessage(`Clocked in from ${mode}.`); }
      await query.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update attendance."); }
    setBusy(false);
  }

  if (query.loading && !data) return <><PageHeader title="Attendance" description="Loading attendance records…" /><Card><LoadingBlock lines={12} /></Card></>;
  if (query.error && !data) return <><PageHeader title="Attendance" description="Track work time and team presence." /><ErrorState message={query.error} onRetry={() => void query.refresh()} /></>;
  if (!data) return null;
  return <><PageHeader title="Attendance" description="One shared attendance record for web and mobile." action={data.currentEmployee ? <Button onClick={() => void toggleClock()} disabled={busy}>{busy ? null : todayRecord?.check_in && !todayRecord.check_out ? <Square size={15} /> : <Play size={15} />}{todayRecord?.check_in && !todayRecord.check_out ? "Clock out" : "Clock in"}</Button> : undefined} />{error ? <FormMessage message={error} /> : null}{message ? <FormMessage message={message} tone="success" /> : null}<div className="dashboard-grid"><div className="dashboard-column"><Card title="Today’s attendance"><div className="attendance-hero"><div className={`attendance-state ${todayRecord?.check_in && !todayRecord.check_out ? "attendance-live" : ""}`}><span className="attendance-state-icon"><Clock3 size={20} /></span><div><strong>{todayRecord?.check_in && !todayRecord.check_out ? "Working now" : todayRecord?.check_out ? "Workday complete" : "Not clocked in"}</strong><p>{data.currentEmployee ? employeeDisplayName(data.currentEmployee) : "No linked employee profile"}</p></div></div><div className="attendance-times"><div><span>Clock in</span><TimeStatus date={todayRecord?.check_in} /></div><div><span>Clock out</span><TimeStatus date={todayRecord?.check_out} /></div><div><span>Hours today</span><strong>{todayRecord ? `${calculateAttendanceHours(todayRecord).toFixed(2)}h` : "0.00h"}</strong></div></div>{!todayRecord?.check_in ? <div className="work-mode-control"><span>Work location</span><div><button type="button" className={mode === "office" ? "mode-active" : ""} onClick={() => setMode("office")}><MapPin size={14} />Office</button><button type="button" className={mode === "remote" ? "mode-active" : ""} onClick={() => setMode("remote")}><Activity size={14} />Remote</button></div><small>Location services are not collected by this action.</small></div> : null}</div></Card><Card title="My attendance history" action={<span className="muted-inline">Last 7 days · {weekHours.toFixed(2)}h</span>}>{data.currentEmployee ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Status</th><th>In</th><th>Out</th><th>Total</th></tr></thead><tbody>{data.attendance.filter((record) => record.employee_id === data.currentEmployee?.id).map((record) => <tr key={record.id}><td>{record.date}</td><td><StatusBadge status={record.status} /></td><td><TimeStatus date={record.check_in} /></td><td><TimeStatus date={record.check_out} /></td><td>{calculateAttendanceHours(record).toFixed(2)}h</td></tr>)}</tbody></table></div> : <EmptyState icon={<UserIcon />} title="No linked employee profile" description="Ask an organization administrator to link your OperiX account to an employee record." />}</Card></div><div className="dashboard-column"><Card title="Today’s team presence" action={<span className="muted-inline">{peopleByDay.length} records</span>}>{peopleByDay.length ? <div className="activity-list">{peopleByDay.slice(0, 10).map((record) => <div className="activity-row" key={record.id}><span className="employee-avatar">{record.employee ? `${record.employee.first_name.slice(0, 1)}${record.employee.last_name.slice(0, 1)}` : "—"}</span><div><strong>{record.employee ? employeeDisplayName(record.employee) : "Employee"}</strong><p>{record.employee?.job_title || record.employee?.department || "Team member"}</p></div><StatusBadge status={record.status} /></div>)}</div> : <EmptyState icon={<Activity size={19} />} title="No attendance recorded today" description="Clock-in activity will appear here as your team starts work." />}</Card><Card title="Attendance controls"><div className="quick-list"><div><span>Shared source of truth</span><strong>Supabase HR records</strong></div><div><span>Current work mode</span><strong>{todayRecord?.work_mode || mode}</strong></div><div><span>Location tracking</span><strong>Not enabled</strong></div></div></Card></div></div></>;
}

function UserIcon() { return <Activity size={19} />; }
