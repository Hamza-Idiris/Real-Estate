/** Dependency-free accessible grouped bar chart (SVG) with a text-table fallback for screen readers. */
export function BarChart({ data, series, format, label: l }: { data: { name: string; [k: string]: number | string }[]; series: { key: string; name: string; color: string }[]; format: (n: number) => string; label: string }) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const W = 640, H = 200, pad = 28, bw = (W - pad * 2) / data.length;
  return <figure><svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={l} className="w-full">
    {[0, 0.5, 1].map((t) => <g key={t}><line x1={pad} x2={W - pad} y1={H - t * (H - 10)} y2={H - t * (H - 10)} stroke="#E4E8E5" /><text x={0} y={H - t * (H - 10) + 4} fontSize="9" fill="#667085">{format(max * t)}</text></g>)}
    {data.map((d, i) => <g key={d.name}>{series.map((s, k) => { const v = Number(d[s.key]) || 0; const h = (v / max) * (H - 10); const w = (bw - 8) / series.length;
      return <rect key={s.key} x={pad + i * bw + 4 + k * w} y={H - h} width={Math.max(2, w - 2)} height={h} rx="2" fill={s.color}><title>{`${d.name} · ${s.name}: ${format(v)}`}</title></rect>; })}
      <text x={pad + i * bw + bw / 2} y={H + 14} fontSize="10" textAnchor="middle" fill="#667085">{d.name}</text></g>)}
  </svg>
    <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">{series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}</figcaption>
    <table className="sr-only"><caption>{l}</caption><thead><tr><th>Period</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead><tbody>{data.map((d) => <tr key={d.name}><td>{d.name}</td>{series.map((s) => <td key={s.key}>{format(Number(d[s.key]) || 0)}</td>)}</tr>)}</tbody></table></figure>;
}
