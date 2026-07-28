import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getAvailableForTeam,
  getTeamMembers,
  updateMyTeam,
} from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';

const TEAM_NAMES = ['Product', 'Operations', 'Platform', 'Engineering', 'Design'];

export default function TeamSettings() {
  const { user } = useAuth();
  const [teamName, setTeamName] = useState(user?.team_name ?? '');
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [currentMembers, setCurrentMembers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [available, members] = await Promise.all([
      getAvailableForTeam(),
      getTeamMembers(),
    ]);
    setAvailableEmployees(available);
    setCurrentMembers(members);
    setSelectedIds(members.map((member) => member.id));
    setTeamName(user?.team_name ?? '');
  };

  useEffect(() => {
    load().catch(() => {
      setError('Could not load team settings.');
    });
  }, [user?.team_name]);

  const selectableEmployees = useMemo(() => {
    const map = new Map();
    [...availableEmployees, ...currentMembers].forEach((employee) => {
      map.set(employee.id, employee);
    });
    return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [availableEmployees, currentMembers]);

  const toggleMember = (memberId, checked) => {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, memberId]));
      return prev.filter((id) => id !== memberId);
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateMyTeam(teamName || undefined, selectedIds);
      setMessage('Your team has been updated.');
      await load();
    } catch (err) {
      setError(String(err?.response?.data?.detail ?? 'Could not save team settings.'));
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'team_leader') {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <PageHeader
        title="My Team"
        subtitle="Choose your team name and assign employees you manage"
      />

      <form onSubmit={handleSave} className="card max-w-3xl space-y-5 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Team name
          </label>
          <select
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="input-field"
          >
            <option value="">Select a team</option>
            {TEAM_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="mt-2 text-sm text-slate-500">
            If your office manager already assigned a team, you can keep it or update it here.
          </p>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Team members</div>
          <div className="space-y-2 rounded-xl border border-slate-200 p-4">
            {selectableEmployees.length === 0 ? (
              <p className="text-sm text-slate-500">No employees are available to add right now.</p>
            ) : (
              selectableEmployees.map((employee) => (
                <label
                  key={employee.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.id)}
                      onChange={(e) => toggleMember(employee.id, e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span>
                      <span className="font-medium text-slate-900">{employee.full_name}</span>
                      <span className="ml-2 text-sm text-slate-500">{employee.job_title ?? employee.email}</span>
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save team'}
        </button>
      </form>
    </div>
  );
}
