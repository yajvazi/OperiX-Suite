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
import { getAnalyticsDashboard } from '../../api/client';
import PageHeader from '../../components/ui/PageHeader';

const COLORS = ['#0052cc', '#2684ff', '#4c9aff', '#80b8ff', '#b3d4ff'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getAnalyticsDashboard().then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const trend = data.occupancy_trend.slice(-14).map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Office utilization, booking trends and resource overview"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Desks', value: data.total_desks },
          { label: 'Meeting Rooms', value: data.total_rooms },
          { label: 'Active Reservations', value: data.active_reservations },
          { label: 'Occupancy Rate', value: `${data.occupancy_rate}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="card p-5">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className="mt-1 text-3xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold">Occupancy Trends</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${v}%`, 'Occupancy']} />
              <Line type="monotone" dataKey="occupancy" stroke="#0052cc" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Busiest Days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.busiest_days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0052cc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Floor Utilization</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.floor_utilization}
                dataKey="utilization"
                nameKey="floor"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(props) => `F${String(props.name ?? '')}`}
              >
                {data.floor_utilization.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Most Used Desks</h3>
          <div className="space-y-3">
            {data.most_used_desks.map((d) => (
              <div key={d.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{d.name}</span>
                  <span className="text-slate-500">{d.bookings} bookings</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-brand-600"
                    style={{ width: `${Math.min(d.utilization, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold">Recent Activity</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {data.recent_activity.map((a, i) => (
              <li key={i} className="border-b border-slate-100 pb-2">
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
