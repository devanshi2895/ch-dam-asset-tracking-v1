'use client';

import type { ScanProgress } from '@/src/lib/types';

interface ProgressIndicatorProps {
  progress: ScanProgress;
  totalSites: number;
  currentSiteIndex: number;
}

/**
 * Plain-text scan progress display.
 * No animation library — uses a native HTML <progress> element.
 */
export function ProgressIndicator({
  progress,
  totalSites,
  currentSiteIndex,
}: ProgressIndicatorProps) {
  const { currentSite, currentPage, pagesScanned, totalPages } = progress;
  const pct = totalPages > 0 ? Math.round((pagesScanned / totalPages) * 100) : 0;

  return (
    <div style={s.wrapper}>
      <p style={s.line}>
        Scanning site <strong>{currentSiteIndex + 1}</strong> of{' '}
        <strong>{totalSites}</strong>: <strong>{currentSite}</strong>
      </p>
      <p style={s.line}>
        Page <strong>{pagesScanned}</strong> of{' '}
        <strong>{totalPages}</strong>:{' '}
        <span style={s.pageName}>{currentPage}</span>
      </p>
      <progress
        value={pagesScanned}
        max={totalPages || 1}
        style={s.progress}
        aria-label={`Scan progress: ${pagesScanned} of ${totalPages} pages (${pct}%)`}
      />
      <p style={s.pct}>{pct}% complete</p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
  },
  line: { margin: 0, fontSize: 13, color: '#374151' },
  pageName: { color: '#6b7280', fontStyle: 'italic' },
  progress: { width: '100%', accentColor: '#eb1f1f' },
  pct: { margin: 0, fontSize: 12, color: '#6b7280' },
};
