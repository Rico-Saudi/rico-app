import { useState } from 'react';

const DAY_LABELS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const CELL = 18;
const GAP = 2;
const LABEL_WIDTH = 42;

// Single-hue sequential magnitude (brand green), light→dark by count — one
// series, so no legend is needed beyond the title; per-cell hover tooltip
// per dataviz interaction guidance.
export default function HeatmapChart({ heatmap }) {
  const [hover, setHover] = useState(null); // {dayOfWeek, hour, count} | null

  const countByCell = new Map(heatmap.map((h) => [`${h.dayOfWeek}-${h.hour}`, h.count]));
  const max = Math.max(1, ...heatmap.map((h) => h.count));

  function cellColor(count) {
    if (count === 0) return '#F0F1F3';
    const intensity = 0.25 + 0.75 * (count / max);
    return `rgba(15, 157, 88, ${intensity.toFixed(2)})`;
  }

  const width = LABEL_WIDTH + 24 * (CELL + GAP);
  const height = 7 * (CELL + GAP) + 16;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={LABEL_WIDTH + h * (CELL + GAP) + CELL / 2} y={10} fontSize={9} fill="#888" textAnchor="middle">
            {h}:00
          </text>
        ))}
        {DAY_LABELS.map((label, dayIdx) => {
          const dayOfWeek = dayIdx + 1; // Mongo $dayOfWeek: 1=Sunday..7=Saturday
          const y = 16 + dayIdx * (CELL + GAP);
          return (
            <g key={dayOfWeek}>
              <text x={LABEL_WIDTH - 6} y={y + CELL / 2 + 4} fontSize={10} fill="#666" textAnchor="end">
                {label}
              </text>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = countByCell.get(`${dayOfWeek}-${hour}`) ?? 0;
                const x = LABEL_WIDTH + hour * (CELL + GAP);
                return (
                  <rect
                    key={hour}
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    fill={cellColor(count)}
                    onMouseEnter={() => setHover({ dayOfWeek, hour, count, x, y })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: hover.y,
            left: hover.x,
            transform: 'translate(-50%, -100%)',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {DAY_LABELS[hover.dayOfWeek - 1]} {hover.hour}:00 — {hover.count}
        </div>
      )}
    </div>
  );
}
