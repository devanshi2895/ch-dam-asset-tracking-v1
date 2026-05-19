'use client';

import { useState, useMemo } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import type { ScanRecord } from '@/src/lib/types';

type SortKey = keyof ScanRecord;
type SortDir = 'asc' | 'desc';

interface FilterState {
  siteName: string;
  componentName: string;
  riskLevel: string;
  httpStatus: string;
  assetId: string;
}

interface ResultsTableProps {
  records: ScanRecord[];
}

const RISK_COLORS: Record<string, string> = {
  Critical: '#dc2626',
  High: '#ea580c',
  Low: '#16a34a',
  Broken: '#7c3aed',
  Unknown: '#6b7280',
};

const STATUS_COLOR = (status: number | null): string => {
  if (status === 200) return '#16a34a';
  if (status === null) return '#9ca3af';
  return '#dc2626';
};

/**
 * Filterable, sortable results table with client-side filtering.
 * Clicking a column header toggles sort asc/desc.
 * "Download Excel" triggers GET /api/export with current filter state.
 */
export function ResultsTable({ records }: ResultsTableProps) {
  const { client } = useMarketplaceClientContext();
  const [filters, setFilters] = useState<FilterState>({
    siteName: '',
    componentName: '',
    riskLevel: '',
    httpStatus: '',
    assetId: '',
  });
  const [sortKey, setSortKey] = useState<SortKey>('risk_level');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Derive unique filter options from the full record set
  const siteOptions = useMemo(
    () => [...new Set(records.map((r) => r.site_name))].sort(),
    [records]
  );
  const componentOptions = useMemo(
    () => [...new Set(records.map((r) => r.component_name).filter(Boolean))].sort(),
    [records]
  );
  const statusOptions = useMemo(
    () =>
      [...new Set(records.map((r) => String(r.http_status ?? '')))].sort(
        (a, b) => Number(a) - Number(b)
      ),
    [records]
  );

  const setFilter = (key: keyof FilterState, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () =>
    setFilters({ siteName: '', componentName: '', riskLevel: '', httpStatus: '', assetId: '' });

  // Apply filters
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filters.siteName && r.site_name !== filters.siteName) return false;
      if (filters.componentName && r.component_name !== filters.componentName) return false;
      if (filters.riskLevel && r.risk_level !== filters.riskLevel) return false;
      if (filters.httpStatus && String(r.http_status ?? '') !== filters.httpStatus) return false;
      if (filters.assetId && !r.asset_id.toLowerCase().includes(filters.assetId.toLowerCase())) return false;
      return true;
    });
  }, [records, filters]);

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

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      // 1. Store the current filtered+sorted records on the server.
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: sorted }),
      });
      if (!res.ok) throw new Error(`Store failed: ${res.status}`);

      // 2. Ask the host application (Sitecore Cloud Portal) to open the export
      //    URL in a new top-level tab. The download happens in the host context,
      //    not in the sandboxed iframe, so the sandbox restrictions don't apply.
      const exportUrl = `${window.location.origin}/api/export`;
      await client!.navigateToExternalUrl(exportUrl, true);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
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

  return (
    <div>
      {/* Filter bar */}
      <div style={s.filterBar}>
        <select
          style={s.select}
          value={filters.siteName}
          onChange={(e) => setFilter('siteName', e.target.value)}
          aria-label="Filter by site"
        >
          <option value="">All Sites</option>
          {siteOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          style={s.select}
          value={filters.componentName}
          onChange={(e) => setFilter('componentName', e.target.value)}
          aria-label="Filter by component"
        >
          <option value="">All Components</option>
          {componentOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          style={s.select}
          value={filters.riskLevel}
          onChange={(e) => setFilter('riskLevel', e.target.value)}
          aria-label="Filter by risk level"
        >
          <option value="">All Risk Levels</option>
          {['Critical', 'High', 'Low', 'Broken', 'Unknown'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          style={s.select}
          value={filters.httpStatus}
          onChange={(e) => setFilter('httpStatus', e.target.value)}
          aria-label="Filter by HTTP status"
        >
          <option value="">All HTTP Status</option>
          {statusOptions.map((st) => (
            <option key={st} value={st}>
              {st === '' ? '— (null)' : st}
            </option>
          ))}
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
        Showing <strong>{sorted.length}</strong> of{' '}
        <strong>{records.length}</strong> records
      </p>

      {/* Table */}
      <div style={s.tableWrapper}>
        <table style={s.table}>
          <thead>
            <tr>
              <Th label="Site" col="site_name" minWidth={100} />
              <Th label="Page" col="page_name" minWidth={120} />
              <Th label="Component" col="component_name" minWidth={140} />
              <Th label="Field" col="field_name" minWidth={100} />
              <Th label="Asset ID" col="asset_id" minWidth={130} />
              <th style={{ ...s.th, minWidth: 220 }}>Public Link URL</th>
              <Th label="HTTP" col="http_status" minWidth={60} />
              <Th label="Risk" col="risk_level" minWidth={80} />
              <Th label="Scanned At" col="scanned_at" minWidth={140} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={`${r.asset_id}-${r.page_path}-${r.field_name}-${i}`}
                style={{
                  backgroundColor: i % 2 === 0 ? '#fff' : '#f9fafb',
                }}
              >
                <td style={s.td}>{r.site_name}</td>
                <td style={s.td}>{r.page_name}</td>
                <td style={{ ...s.td, fontWeight: 500 }}>{r.component_name}</td>
                <td style={{ ...s.td, color: '#6b7280' }}>{r.field_name}</td>
                <td
                  style={{
                    ...s.td,
                    fontFamily: 'monospace',
                    fontSize: 11,
                  }}
                >
                  {r.asset_id}
                </td>
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
                <td style={{ ...s.td, textAlign: 'center' }}>
                  <span
                    style={{
                      color: STATUS_COLOR(r.http_status),
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {r.http_status ?? '—'}
                  </span>
                </td>
                <td style={s.td}>
                  <span
                    style={{
                      ...s.badge,
                      backgroundColor: (RISK_COLORS[r.risk_level] ?? '#6b7280') + '18',
                      color: RISK_COLORS[r.risk_level] ?? '#6b7280',
                      borderColor: (RISK_COLORS[r.risk_level] ?? '#6b7280') + '40',
                    }}
                  >
                    {r.risk_level}
                  </span>
                </td>
                <td
                  style={{
                    ...s.td,
                    fontSize: 12,
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.scanned_at.replace('T', ' ').split('.')[0]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download footer */}
      <div style={s.downloadRow}>
        <button
          style={{ ...s.downloadBtn, ...(isDownloading ? s.downloadBtnDisabled : {}) }}
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? 'Generating…' : 'Download Excel'}
        </button>
        <div>
          <p style={s.downloadMeta}>
            Includes <strong>{sorted.length}</strong> record
            {sorted.length !== 1 ? 's' : ''} across{' '}
            <strong>{uniqueSitesInView}</strong> site
            {uniqueSitesInView !== 1 ? 's' : ''}
          </p>
          <p style={s.importNote}>
            Column structure ready for Content Hub import (Step 2)
          </p>
          {downloadError && <p style={s.downloadError}>{downloadError}</p>}
        </div>
      </div>
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
  downloadBtnDisabled: { backgroundColor: '#d1d5db', cursor: 'not-allowed' },
  downloadMeta: { margin: 0, fontSize: 13, color: '#374151' },
  importNote: { margin: '3px 0 0', fontSize: 11, color: '#9ca3af' },
  downloadError: { margin: '4px 0 0', fontSize: 12, color: '#dc2626' },
};
