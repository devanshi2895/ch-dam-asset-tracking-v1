'use client';

import { useState, useMemo } from 'react';
import { loadLastScan } from '@/src/lib/deltaTracker';
import type { ScanRecord, BulkUpdateResult } from '@/src/lib/types';

type SortKey = keyof ScanRecord;
type SortDir = 'asc' | 'desc';

type BulkUpdateState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'complete'; result: BulkUpdateResult }
  | { phase: 'error'; message: string };

interface FilterState {
  siteName: string;
  componentName: string;
  assetId: string;
}

interface ResultsTableProps {
  records: ScanRecord[];
}


/**
 * Filterable, sortable results table with client-side filtering.
 * Clicking a column header toggles sort asc/desc.
 * "Download Excel" triggers GET /api/export with current filter state.
 */
const STATUS_COLORS: Record<string, string> = {
  Active: '#16a34a',
  New: '#2563eb',
  Removed: '#dc2626',
};

export function ResultsTable({ records }: ResultsTableProps) {
  const lastScan = useMemo(() => loadLastScan(), []);
  const hasDelta = records.some((r) => r.status !== undefined);

  const [exportReady, setExportReady] = useState(false);
  const [updateState, setUpdateState] = useState<BulkUpdateState>({ phase: 'idle' });

  const [filters, setFilters] = useState<FilterState>({
    siteName: '',
    componentName: '',
    assetId: '',
  });
  const [showRemoved, setShowRemoved] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('risk_level');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Derive unique filter options from the full record set
  const siteOptions = useMemo(
    () => [...new Set(records.map((r) => r.site_name))].sort(),
    [records]
  );
  const componentOptions = useMemo(
    () => [...new Set(records.map((r) => r.component_name).filter(Boolean))].sort(),
    [records]
  );
  const setFilter = (key: keyof FilterState, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () =>
    setFilters({ siteName: '', componentName: '', assetId: '' });

  // Apply filters + removed toggle
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (!showRemoved && r.status === 'Removed') return false;
      if (filters.siteName && r.site_name !== filters.siteName) return false;
      if (filters.componentName && r.component_name !== filters.componentName) return false;
if (filters.assetId && !r.asset_id.toLowerCase().includes(filters.assetId.toLowerCase())) return false;
      return true;
    });
  }, [records, filters, showRemoved]);

  // Apply sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
      });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const handleUpdateCH = async (recordsToSend: ScanRecord[]) => {
    if (!recordsToSend.length || updateState.phase === 'running') return;
    setUpdateState({ phase: 'running' });
    try {
      const res = await fetch('/api/ch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: recordsToSend }),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          (json as Record<string, string>)?.error ?? `HTTP ${res.status}`;
        setUpdateState({ phase: 'error', message: errMsg });
        return;
      }
      setUpdateState({ phase: 'complete', result: json as BulkUpdateResult });
    } catch (e) {
      setUpdateState({
        phase: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDownload = async () => {
    if (!sorted.length) return;

    // Sandboxed iframes block all download initiations — detect and route differently.
    let inIframe = false;
    try { inIframe = window !== window.top; } catch { inIframe = true; }

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: sorted }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      if (inIframe) {
        // Records are now stored server-side. Show a direct link the user
        // can open in a real browser tab where downloads are allowed.
        setExportReady(true);
        return;
      }

      // Non-sandboxed: trigger download directly via blob URL.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().split('T')[0];
      a.download = `dam-asset-report-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const Th = ({
    label,
    col,
    minWidth,
  }: {
    label: string;
    col: SortKey;
    minWidth?: number;
  }) => (
    <th
      style={{ ...s.th, minWidth: minWidth ?? 'auto', cursor: 'pointer' }}
      onClick={() => handleSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      {sortIcon(col)}
    </th>
  );

  const uniqueSitesInView = new Set(sorted.map((r) => r.site_name)).size;

  const removedCount = records.filter((r) => r.status === 'Removed').length;

  return (
    <div>
      {/* Delta banner */}
      {hasDelta && lastScan && (
        <div style={s.deltaBanner}>
          <span>
            Comparing against scan from{' '}
            <strong>{new Date(lastScan.scanned_at).toLocaleString()}</strong>
          </span>
          {removedCount > 0 && (
            <label style={s.removedToggle}>
              <input
                type="checkbox"
                checked={showRemoved}
                onChange={(e) => setShowRemoved(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Show {removedCount} removed link{removedCount !== 1 ? 's' : ''}
            </label>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={s.filterBar}>
        <select
          style={s.select}
          value={filters.siteName}
          onChange={(e) => setFilter('siteName', e.target.value)}
          aria-label="Filter by site"
        >
          <option value="">All Sites</option>
          {siteOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        <select
          style={s.select}
          value={filters.componentName}
          onChange={(e) => setFilter('componentName', e.target.value)}
          aria-label="Filter by component"
        >
          <option value="">All Components</option>
          {componentOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

<input
          type="text"
          placeholder="Asset ID search…"
          style={s.input}
          value={filters.assetId}
          onChange={(e) => setFilter('assetId', e.target.value)}
          aria-label="Search by Asset ID"
        />

        <button style={s.clearBtn} onClick={clearFilters}>
          Clear Filters
        </button>
      </div>

      <p style={s.countLabel}>
        Showing <strong>{sorted.length}</strong> of <strong>{records.length}</strong> records
      </p>

      {/* Table */}
      <div style={s.tableWrapper}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th label="Site" col="site_name" minWidth={100} />
              <Th label="Page" col="page_name" minWidth={120} />
              <Th label="Component" col="component_name" minWidth={140} />
              <th style={{ ...s.th, minWidth: 220 }}>Public Link URL</th>
              {hasDelta && <th style={{ ...s.th, minWidth: 90 }}>Status</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isRemoved = r.status === 'Removed';
              const rowBg = isRemoved
                ? '#fff5f5'
                : i % 2 === 0 ? '#fff' : '#f9fafb';
              return (
                <tr key={`${r.asset_id}-${r.page_path}-${r.field_name}-${i}`}
                  style={{ backgroundColor: rowBg, opacity: isRemoved ? 0.75 : 1 }}
                >
                  <td style={s.td}>{r.site_name}</td>
                  <td style={s.td}>{r.page_name}</td>
                  <td style={{ ...s.td, fontWeight: 500 }}>{r.component_name}</td>
                  <td
                    style={{
                      ...s.td,
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.public_link_url}
                  >
                    {r.public_link_url.length > 60
                      ? r.public_link_url.slice(0, 60) + '…'
                      : r.public_link_url}
                  </td>
                  {hasDelta && (
                    <td style={s.td}>
                      {r.status && (
                        <span style={{
                          ...s.badge,
                          color: STATUS_COLORS[r.status] ?? '#6b7280',
                          backgroundColor: (STATUS_COLORS[r.status] ?? '#6b7280') + '18',
                          borderColor: (STATUS_COLORS[r.status] ?? '#6b7280') + '40',
                        }}>
                          {r.status}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Download footer */}
      <div style={s.downloadRow}>
        <button style={s.downloadBtn} onClick={handleDownload}>
          Download Excel
        </button>
        <button
          style={{
            ...s.downloadBtn,
            backgroundColor: updateState.phase === 'running' ? '#374151' : '#1a1a1a',
            opacity: updateState.phase === 'running' ? 0.7 : 1,
            cursor: updateState.phase === 'running' ? 'not-allowed' : 'pointer',
            border: '2px dashed #6b7280',
          }}
          onClick={() => handleUpdateCH(sorted.slice(0, 1))}
          disabled={updateState.phase === 'running'}
          title={`Test with first record only: asset_id ${sorted[0]?.asset_id ?? '—'}`}
        >
          {updateState.phase === 'running' ? 'Updating…' : 'Test (1 record)'}
        </button>
        <button
          style={{
            ...s.downloadBtn,
            backgroundColor: updateState.phase === 'running' ? '#1e40af' : '#1d4ed8',
            opacity: updateState.phase === 'running' ? 0.7 : 1,
            cursor: updateState.phase === 'running' ? 'not-allowed' : 'pointer',
          }}
          onClick={() => handleUpdateCH(sorted)}
          disabled={updateState.phase === 'running'}
        >
          {updateState.phase === 'running' ? 'Updating…' : 'Update Content Hub'}
        </button>
        <div>
          <p style={s.downloadMeta}>
            Includes <strong>{sorted.length}</strong> record
            {sorted.length !== 1 ? 's' : ''} across{' '}
            <strong>{uniqueSitesInView}</strong> site
            {uniqueSitesInView !== 1 ? 's' : ''}
          </p>
          <p style={s.importNote}>Column structure ready for Content Hub import (Step 2)</p>
        </div>
      </div>

      {/* Bulk update result banner */}
      {updateState.phase === 'complete' && (
        <div style={s.updateSuccessBanner}>
          <strong>Content Hub updated.</strong>{' '}
          Updated: {updateState.result.updated} &nbsp;|&nbsp; Taxonomy created: {updateState.result.taxonomyCreated} &nbsp;|&nbsp; Skipped: {updateState.result.skipped} &nbsp;|&nbsp; Failed: {updateState.result.failed}
          {updateState.result.errors.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12 }}>
                {updateState.result.errors.length} failure{updateState.result.errors.length !== 1 ? 's' : ''} — expand for details
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {updateState.result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Asset {e.asset_id}{e.httpStatus ? ` — HTTP ${e.httpStatus}` : ''}: {e.message}
                  </li>
                ))}
                {updateState.result.errors.length > 50 && (
                  <li>…and {updateState.result.errors.length - 50} more</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}
      {updateState.phase === 'error' && (
        <div style={s.updateErrorBanner}>
          <strong>Update failed.</strong> {updateState.message}
        </div>
      )}

      {/* Sandboxed-iframe fallback: show direct GET URL */}
      {exportReady && (
        <div style={s.directLinkBanner}>
          <span style={{ fontWeight: 600 }}>Download ready.</span>
          {' '}Downloads are blocked in this embedded preview. Open the link below in your browser:
          <div style={{ marginTop: 6 }}>
            <a
              href="/api/export"
              style={s.directLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {window.location.origin}/api/export
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  select: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  input: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
    minWidth: 180,
  },
  clearBtn: {
    padding: '7px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  countLabel: { fontSize: 13, color: '#6b7280', marginBottom: 8, marginTop: 0 },
  tableWrapper: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '10px 12px',
    backgroundColor: '#f3f4f6',
    borderBottom: '2px solid #e5e7eb',
    textAlign: 'left' as const,
    fontWeight: 600,
    fontSize: 12,
    color: '#374151',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #f3f4f6',
    color: '#1a1a1a',
    verticalAlign: 'middle' as const,
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
  },
  downloadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  downloadBtn: {
    padding: '9px 18px',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  downloadMeta: { margin: 0, fontSize: 13, color: '#374151' },
  importNote: { margin: '3px 0 0', fontSize: 11, color: '#9ca3af' },
  updateSuccessBanner: {
    marginTop: 12,
    padding: '10px 14px',
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: 6,
    fontSize: 13,
    color: '#14532d',
  },
  updateErrorBanner: {
    marginTop: 12,
    padding: '10px 14px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 6,
    fontSize: 13,
    color: '#7f1d1d',
  },
  directLinkBanner: {
    marginTop: 12,
    padding: '10px 14px',
    backgroundColor: '#fefce8',
    border: '1px solid #fde047',
    borderRadius: 6,
    fontSize: 13,
    color: '#713f12',
  },
  directLink: {
    display: 'inline-block',
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#1d4ed8',
    wordBreak: 'break-all' as const,
  },
  deltaBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    fontSize: 13,
    color: '#1e40af',
    marginBottom: 10,
  },
  removedToggle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
    color: '#dc2626',
  },
};
