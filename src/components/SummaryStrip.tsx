'use client';

interface SummaryStripProps {
  pagesWithAssets: number;
  uniqueAssets: number;
  componentsUsed: number;
  brokenLinks: number;
  newLinks?: number;
  removedLinks?: number;
}

export function SummaryStrip({
  pagesWithAssets,
  uniqueAssets,
  componentsUsed,
  brokenLinks,
  newLinks,
  removedLinks,
}: SummaryStripProps) {
  const hasDelta = newLinks !== undefined || removedLinks !== undefined;

  const stats = [
    { label: 'Pages with Assets', value: pagesWithAssets, color: '#1a1a1a' },
    { label: 'Unique Assets', value: uniqueAssets, color: '#1a1a1a' },
    { label: 'Components Using Assets', value: componentsUsed, color: '#1a1a1a' },
    { label: 'Broken Links', value: brokenLinks, color: brokenLinks > 0 ? '#dc2626' : '#1a1a1a' },
    ...(hasDelta ? [
      { label: 'New Links', value: newLinks ?? 0, color: (newLinks ?? 0) > 0 ? '#2563eb' : '#1a1a1a' },
      { label: 'Removed Links', value: removedLinks ?? 0, color: (removedLinks ?? 0) > 0 ? '#dc2626' : '#1a1a1a' },
    ] : []),
  ];

  return (
    <div style={{ ...s.strip, gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
      {stats.map((stat) => (
        <div key={stat.label} style={s.box}>
          <span style={{ ...s.value, color: stat.color }}>
            {stat.value.toLocaleString()}
          </span>
          <span style={s.label}>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  strip: { display: 'grid', gap: 12 },
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
