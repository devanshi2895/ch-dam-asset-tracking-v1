'use client';

import { useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import { ProgressIndicator } from './ProgressIndicator';
import { runScan } from '@/src/lib/scanner';
import { findPublicLinksInHTML } from '@/src/lib/patternMatcher';
import { calculateRiskLevels } from '@/src/lib/riskEngine';
import { loadLastScan, saveLastScan, computeDelta } from '@/src/lib/deltaTracker';
import type { SiteInfo, ScanRecord, ScanProgress } from '@/src/lib/types';

interface ScanPanelProps {
  sites: SiteInfo[];
  language: string;
  /** Called when scan finishes — triggers auto-advance to Results tab */
  onScanComplete: (records: ScanRecord[]) => void;
}

/**
 * Site selection checkboxes and scan trigger.
 * Calls runScan() and reports progress via ProgressIndicator.
 * On completion, POSTs records to /api/export for server-side storage,
 * then calls onScanComplete to advance to the Results tab.
 */
export function ScanPanel({ sites, language, onScanComplete }: ScanPanelProps) {
  const { client } = useMarketplaceClientContext();
  const { selectedTenant } = useTenantContext();

  const [selectedSites, setSelectedSites] = useState<string[]>(
    sites.map((s) => s.name)
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningPage, setIsScanningPage] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [currentSiteIndex, setCurrentSiteIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const toggle = (name: string) =>
    setSelectedSites((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );

  const handleRunScan = async () => {
    if (!client || !selectedTenant || !selectedSites.length) return;
    setIsScanning(true);
    setError(null);
    setProgress(null);

    try {
      const records = await runScan(
        {
          selectedSites,
          language,
          sitecoreContextId: selectedTenant.context.preview ?? '',
        },
        client,
        (p) => {
          setProgress(p);
          const idx = selectedSites.indexOf(p.currentSite);
          if (idx >= 0) setCurrentSiteIndex(idx);
        }
      );

      // Delta: diff against previous scan, then save current as new baseline
      const lastScan = loadLastScan();
      const deltaRecords = computeDelta(records, lastScan?.records ?? []);
      saveLastScan(records);

      onScanComplete(deltaRecords);
    } catch (err) {
      setError(
        `Scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Scans the page currently open in Page builder using getPageHTML().
   * Complements the full batch scan — catches dynamically assembled URLs
   * that may not appear verbatim in Layout Service field values.
   */
  const handleScanCurrentPage = async () => {
    if (!client) return;
    setIsScanningPage(true);
    setError(null);

    try {
      // Fetch page context to populate ScanRecord metadata
      const pagesCtxResult = await client.query('pages.context');
      const pagesCtx = pagesCtxResult?.data;
      const siteName = pagesCtx?.siteInfo?.name ?? 'unknown-site';
      const pageName = pagesCtx?.pageInfo?.displayName ?? pagesCtx?.pageInfo?.name ?? 'unknown-page';
      const pagePath = pagesCtx?.pageInfo?.path ?? pagesCtx?.pageInfo?.route ?? '';
      const language = pagesCtx?.pageInfo?.language ?? pagesCtx?.siteInfo?.language ?? 'en';

      // Get the rendered HTML of the current page
      const html = await client.getPageHTML();

      // Run pattern matcher on the rendered HTML
      const matches = findPublicLinksInHTML(html);

      const records: ScanRecord[] = matches.map((match) => {
        const dotIdx = match.fieldName.indexOf('.');
        const component_name =
          dotIdx > -1 ? match.fieldName.slice(0, dotIdx) : match.fieldName;
        const field_name =
          dotIdx > -1 ? match.fieldName.slice(dotIdx + 1) : '';
        return {
          asset_id: match.assetId,
          public_link_url: match.publicLinkUrl,
          site_name: siteName,
          page_name: pageName,
          page_path: pagePath,
          component_name,
          field_name,
          risk_level: 'Unknown' as const,
          language,
          scanned_at: new Date().toISOString(),
        };
      });

      const withRisk = calculateRiskLevels(records);

      // Delta: diff against previous scan, save current as new baseline
      const lastScan = loadLastScan();
      const deltaRecords = computeDelta(withRisk, lastScan?.records ?? []);
      saveLastScan(withRisk);

      onScanComplete(deltaRecords);
    } catch (err) {
      setError(
        `Page scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsScanningPage(false);
    }
  };

  const canScan = !!client && !!selectedTenant && selectedSites.length > 0 && !isScanning && !isScanningPage;
  const canScanPage = !!client && !isScanning && !isScanningPage;

  return (
    <div style={s.wrapper}>
      {/* Site checkboxes */}
      <div style={s.siteList}>
        <div style={s.controls}>
          <button style={s.link} onClick={() => setSelectedSites(sites.map((s) => s.name))}>
            Select All
          </button>
          <span style={s.divider}>|</span>
          <button style={s.link} onClick={() => setSelectedSites([])}>
            Deselect All
          </button>
        </div>

        {sites.map((site) => (
          <label key={site.name} style={s.siteRow}>
            <input
              type="checkbox"
              checked={selectedSites.includes(site.name)}
              onChange={() => toggle(site.name)}
              disabled={isScanning}
              style={{ marginRight: 8, cursor: isScanning ? 'not-allowed' : 'pointer' }}
            />
            <span style={s.siteName}>{site.name}</span>
            <span style={s.siteHost}>{site.hostName}</span>
          </label>
        ))}
      </div>

      <div style={s.buttonRow}>
        <button
          style={{ ...s.button, ...(!canScan ? s.buttonDisabled : {}) }}
          onClick={handleRunScan}
          disabled={!canScan}
        >
          {isScanning
            ? 'Scanning…'
            : `Run Scan (${selectedSites.length} site${selectedSites.length !== 1 ? 's' : ''})`}
        </button>

        <button
          style={{ ...s.buttonSecondary, ...(!canScanPage ? s.buttonDisabled : {}) }}
          onClick={handleScanCurrentPage}
          disabled={!canScanPage}
          title="Scan the page currently open in Page builder using getPageHTML()"
        >
          {isScanningPage ? 'Scanning page…' : 'Scan Current Page'}
        </button>
      </div>

      {progress && isScanning && (
        <ProgressIndicator
          progress={progress}
          totalSites={selectedSites.length}
          currentSiteIndex={currentSiteIndex}
        />
      )}

      {error && <p style={s.error}>{error}</p>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  buttonRow: { display: 'flex', gap: 10, flexWrap: 'wrap' as const },
  siteList: { display: 'flex', flexDirection: 'column', gap: 2 },
  controls: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  link: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
  divider: { color: '#d1d5db', fontSize: 13 },
  siteRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    cursor: 'pointer',
    padding: '6px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  siteName: { fontWeight: 500, color: '#1a1a1a', marginRight: 8 },
  siteHost: { color: '#9ca3af', fontSize: 12 },
  button: {
    padding: '9px 18px',
    backgroundColor: '#eb1f1f',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  buttonDisabled: { backgroundColor: '#d1d5db', cursor: 'not-allowed', color: '#fff' },
  buttonSecondary: {
    padding: '9px 18px',
    backgroundColor: '#fff',
    color: '#eb1f1f',
    border: '1.5px solid #eb1f1f',
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  error: { color: '#dc2626', fontSize: 13, margin: 0 },
};
