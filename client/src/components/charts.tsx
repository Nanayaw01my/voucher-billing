/**
 * Charts drawn as inline SVG in black on white. No chart library and no palette:
 * series are distinguished by fill, hatch and stroke dash rather than colour,
 * which keeps them legible in print and on a monochrome screen.
 */

interface Point { label: string; value: number }

function niceMax(values: number[]): number {
  const max = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

export function BarChart({ data, height = 180, valueFormat }: { data: Point[]; height?: number; valueFormat?: (v: number) => string }) {
  if (data.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted">No data yet.</div>;

  const max = niceMax(data.map((d) => d.value));
  const width = 600;
  const padding = { top: 8, right: 8, bottom: 26, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slot = plotWidth / data.length;
  const barWidth = Math.max(2, Math.min(28, slot * 0.6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6b6b6b">
              {valueFormat ? valueFormat(max * fraction) : Math.round(max * fraction)}
            </text>
          </g>
        );
      })}
      {data.map((point, index) => {
        const barHeight = (point.value / max) * plotHeight;
        const x = padding.left + slot * index + (slot - barWidth) / 2;
        return (
          <g key={point.label}>
            <rect x={x} y={padding.top + plotHeight - barHeight} width={barWidth} height={barHeight} fill="#000" />
            {(data.length <= 12 || index % Math.ceil(data.length / 8) === 0) && (
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="9" fill="#6b6b6b">
                {point.label}
              </text>
            )}
          </g>
        );
      })}
      <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} stroke="#000" strokeWidth="1" />
    </svg>
  );
}

export function LineChart({ data, height = 180, valueFormat }: { data: Point[]; height?: number; valueFormat?: (v: number) => string }) {
  if (data.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted">No data yet.</div>;

  const max = niceMax(data.map((d) => d.value));
  const width = 600;
  const padding = { top: 8, right: 8, bottom: 26, left: 44 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const coords = data.map((point, index) => ({
    x: padding.left + step * index,
    y: padding.top + plotHeight * (1 - point.value / max),
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1]!.x.toFixed(1)},${padding.top + plotHeight} L${coords[0]!.x.toFixed(1)},${padding.top + plotHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Line chart">
      <defs>
        {/* A hatch stands in for a fill tint, so the chart stays purely black and white. */}
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#000" strokeWidth="1" opacity="0.18" />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e5e5" strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6b6b6b">
              {valueFormat ? valueFormat(max * fraction) : Math.round(max * fraction)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#hatch)" />
      <path d={path} fill="none" stroke="#000" strokeWidth="1.75" />
      {data.map((point, index) => (
        (data.length <= 12 || index % Math.ceil(data.length / 8) === 0) && (
          <text key={point.label} x={coords[index]!.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#6b6b6b">
            {point.label}
          </text>
        )
      ))}
      <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} stroke="#000" strokeWidth="1" />
    </svg>
  );
}

/** Ranked horizontal bars -- the readable form for "revenue by package" style data. */
export function RankedBars({ data, format }: { data: Point[]; format?: (v: number) => string }) {
  if (data.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted">No data yet.</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="divide-y divide-hairline">
      {data.map((point) => (
        <li key={point.label} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate">{point.label}</span>
            <span className="tabular-nums font-medium">{format ? format(point.value) : point.value.toLocaleString()}</span>
          </div>
          <div className="mt-2 h-2 w-full border border-hairline">
            <div className="h-full bg-ink" style={{ width: `${Math.max(2, (point.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
