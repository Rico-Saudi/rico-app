import { useState } from 'react';

const CHART_HEIGHT = 140;
const BAR_GAP = 2;

// Thin bar chart, no external deps — one series (daily impression counts for
// a single business), so no legend is needed per dataviz guidance (identity
// is already named by the panel title).
export default function ImpressionsChart({ series }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const max = Math.max(1, ...series.map((s) => s.count));
  const width = Math.max(320, series.length * 14);
  const barWidth = width / series.length - BAR_GAP;

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  }

  const labelEvery = Math.ceil(series.length / 6);

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${width} ${CHART_HEIGHT + 24}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <line x1={0} y1={CHART_HEIGHT} x2={width} y2={CHART_HEIGHT} stroke="#EEE" strokeWidth={1} />
        {series.map((s, i) => {
          const barHeight = (s.count / max) * (CHART_HEIGHT - 8);
          const x = i * (barWidth + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          const isHover = hoverIndex === i;
          return (
            <g key={s.date}>
              <rect
                x={x}
                y={y}
                width={Math.max(1, barWidth)}
                height={Math.max(0, barHeight)}
                rx={Math.min(4, barWidth / 2)}
                fill={isHover ? '#0C7A45' : '#0F9D58'}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              <rect
                x={x}
                y={0}
                width={Math.max(1, barWidth)}
                height={CHART_HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              {i % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={CHART_HEIGHT + 16} fontSize={9} fill="#888" textAnchor="middle">
                  {formatDate(s.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${(hoverIndex / series.length) * 100}%`,
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
          {formatDate(series[hoverIndex].date)} — {series[hoverIndex].count}
        </div>
      )}
    </div>
  );
}
