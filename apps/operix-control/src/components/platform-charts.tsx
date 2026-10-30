/** A small bar chart drawn as SVG (no chart library needed). */
export function BarChart({ data, label, color = "#004ffe" }: { data: Array<{ day: string; count: number }>; label: string; color?: string }) {
  const width = 640;
  const height = 130;
  const max = Math.max(1, ...data.map((item) => item.count));
  const barWidth = width / Math.max(1, data.length);
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <figure className="platform-chart">
    <figcaption><strong>{label}</strong><span>{total} in the last {data.length} days</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height + 18}`} role="img" aria-label={`${label}: ${total} in the last ${data.length} days`} preserveAspectRatio="none">
      {data.map((item, index) => {
        const barHeight = Math.max(item.count ? 3 : 1, (item.count / max) * height);
        return <rect key={item.day} x={index * barWidth + 1.5} y={height - barHeight} width={Math.max(2, barWidth - 3)} height={barHeight} rx="2" fill={item.count ? color : "#dfe6f2"}><title>{`${item.day}: ${item.count}`}</title></rect>;
      })}
      <text x="0" y={height + 14} fontSize="10" fill="#98a2b3">{data[0]?.day.slice(5)}</text>
      <text x={width} y={height + 14} fontSize="10" fill="#98a2b3" textAnchor="end">{data[data.length - 1]?.day.slice(5)}</text>
    </svg>
  </figure>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "granted" || status === "paid" || status === "active" ? "success" : status === "trial" || status === "trialing" ? "blue" : status === "past_due" ? "warning" : "neutral";
  return <span className={`status-badge status-badge-${tone}`}>{status.replace("_", " ")}</span>;
}
