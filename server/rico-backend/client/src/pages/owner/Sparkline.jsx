const WIDTH = 70;
const HEIGHT = 22;

// Bare trend indicator for a table row — no axis, no legend, no hover
// (the full interactive chart is one click away on the business detail
// page). Single brand hue, per dataviz single-series convention.
export default function Sparkline({ data }) {
  const total = data.reduce((sum, v) => sum + v, 0);
  if (total === 0) {
    return <span style={{ fontSize: 11, color: '#BBB' }}>—</span>;
  }

  const max = Math.max(1, ...data);
  const stepX = WIDTH / (data.length - 1 || 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = HEIGHT - (v / max) * (HEIGHT - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <polyline points={points.join(' ')} fill="none" stroke="#0F9D58" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
