import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { downloadAnalyticsCsv, getAnalyticsDashboard } from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';

const COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];

function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  useEffect(() => {
    getAnalyticsDashboard(days).then(setData);
  }, [days]);

  const handleExport = async () => {
    const blob = await downloadAnalyticsCsv(days);
    saveBlob(blob, `deskdibs-analytics-${days}d.csv`);
  };

  if (!data) return null;

  const heatmapDays = data.busiest_days;
  const avgUtilization = Math.round(
    data.occupancy_trend.reduce((sum, point) => sum + point.occupancy, 0) / data.occupancy_trend.length,
  );

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Occupancy trends, desk performance and busiest days"
        action={(
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input-field w-auto"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" onClick={handleExport} className="btn-secondary">
              Export CSV
            </button>
          </div>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Occupancy Rate', value: `${data.occupancy_rate}%` },
          { label: `Utilization (${days}d)`, value: `${avgUtilization}%` },
          { label: 'Total Reservations', value: data.active_reservations },
          {
            label: 'Available Capacity',
            value: data.total_desks + data.total_rooms - data.active_reservations,
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className="text-3xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-semibold">Occupancy Over Time ({days} days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.occupancy_trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="occupancy" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Busiest Days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={heatmapDays}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Utilization by Floor</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.floor_utilization}
                dataKey="utilization"
                nameKey="floor"
                cx="50%"
                cy="50%"
                outerRadius={85}
                label={(props) => {
                  const entry = props.payload;
                  return `F${entry.floor ?? ''}: ${entry.utilization ?? 0}%`;
                }}
              >
                {data.floor_utilization.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Top Booked Desks</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="pb-2">Desk</th>
                <th className="pb-2">Bookings</th>
                <th className="pb-2">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {data.most_used_desks.map((d) => (
                <tr key={d.name} className="border-b border-slate-100">
                  <td className="py-2">{d.name}</td>
                  <td className="py-2">{d.bookings}</td>
                  <td className="py-2">{d.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Least Used Desks</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="pb-2">Desk</th>
                <th className="pb-2">Bookings</th>
                <th className="pb-2">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {data.least_used_desks.map((d) => (
                <tr key={d.name} className="border-b border-slate-100">
                  <td className="py-2">{d.name}</td>
                  <td className="py-2">{d.bookings}</td>
                  <td className="py-2">{d.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
