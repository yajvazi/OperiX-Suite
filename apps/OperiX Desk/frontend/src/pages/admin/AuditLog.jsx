import { useEffect, useState } from 'react';
import { getAuditLogs } from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    getAuditLogs().then(setLogs).catch(() => setLogs([]));
  }, []);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Administrative actions recorded for accountability"
      />
      <div className="card max-h-[calc(100dvh-12rem)] overflow-auto overscroll-contain sm:max-h-none">
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-600">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium">{log.actor_name}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3 text-slate-600">
                  {log.entity_type}
                  {log.entity_id ? ` #${log.entity_id}` : ''}
                </td>
                <td className="px-4 py-3 text-slate-600">{log.details ?? '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
