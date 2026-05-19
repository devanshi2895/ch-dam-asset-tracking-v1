'use client';

interface SummaryStripProps {
  pagesWithAssets: number;
  uniqueAssets: number;
  componentsUsed: number;
  brokenLinks: number;
}

export function SummaryStrip({
  pagesWithAssets,
  uniqueAssets,
  componentsUsed,
  brokenLinks,
}: SummaryStripProps) {
  const stats = [
    { label: 'Pages with Assets', value: pagesWithAssets, alert: false },
    { label: 'Unique Assets', value: uniqueAssets, alert: false },
    { label: 'Components Using Assets', value: componentsUsed, alert: false },
    { label: 'Broken Links', value: brokenLinks, alert: brokenLinks > 0 },
  ];

  return (
    <div style={s.strip}>
      {stats.map((stat) => (
        <div key={stat.label} style={s.box}>
          <span style={{ ...s.value, color: stat.alert ? '#dc2626' : '#1a1a1a' }}>
            {stat.value.toLocaleString()}
          </span>
          <span style={s.label}>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  strip: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  box: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '18px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    backgroundColor: '#fff',
    gap: 6,
  },
  value: { fontSize: 30, fontWeight: 700, lineHeight: 1 },
  label: { fontSize: 12, color: '#6b7280', textAlign: 'center' as const, lineHeight: 1.3 },
};
