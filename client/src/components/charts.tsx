/**
 * Charts drawn as inline SVG on a white surface, in a single validated blue.
 *
 * Every chart here is single-series, so no categorical palette is involved and
 * no legend is needed -- the panel title names the measure. SERIES is the data
 * mark colour (4.42:1 on white, comfortably over the 3:1 a mark needs); axis
 * and value text stays in the muted ink token rather than the series colour.
 */

/** Data marks only. Text and UI use the darker `brand` blue, which clears AA. */
const SERIES = '#2a78d6';
const GRID = '#e3e8ef';
const AXIS = '#0f172a';
const TEXT_MUTED = '#5b6472';

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
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={TEXT_MUTED}>
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
            <rect x={x} y={padding.top + plotHeight - barHeight} width={barWidth} height={barHeight} fill={SERIES} rx="2" />
            {(data.length <= 12 || index % Math.ceil(data.length / 8) === 0) && (
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="9" fill={TEXT_MUTED}>
                {point.label}
              </text>
            )}
          </g>
        );
      })}
      <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} stroke={AXIS} strokeWidth="1" />
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
          <line x1="0" y1="0" x2="0" y2="6" stroke={SERIES} strokeWidth="1" opacity="0.22" />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((fraction) => {
        const y = padding.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill={TEXT_MUTED}>
              {valueFormat ? valueFormat(max * fraction) : Math.round(max * fraction)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#hatch)" />
      <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((point, index) => (
        (data.length <= 12 || index % Math.ceil(data.length / 8) === 0) && (
          <text key={point.label} x={coords[index]!.x} y={height - 8} textAnchor="middle" fontSize="9" fill={TEXT_MUTED}>
            {point.label}
          </text>
        )
      ))}
      <line x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} stroke={AXIS} strokeWidth="1" />
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
          <div className="mt-2 h-2 w-full rounded-sm bg-wash">
            <div
              className="h-full rounded-sm bg-series"
              style={{ width: `${Math.max(2, (point.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
