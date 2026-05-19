'use client';

import { useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import { ProgressIndicator } from './ProgressIndicator';
import { runScan } from '@/src/lib/scanner';
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

      // Store records server-side for the /api/export GET download
      try {
        await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records }),
        });
      } catch (storeErr) {
        console.warn('[ScanPanel] Could not store records for export:', storeErr);
      }

      onScanComplete(records);
    } catch (err) {
      setError(
        `Scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsScanning(false);
    }
  };

  const canScan = !!client && !!selectedTenant && selectedSites.length > 0 && !isScanning;

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

      <button
        style={{ ...s.button, ...(!canScan ? s.buttonDisabled : {}) }}
        onClick={handleRunScan}
        disabled={!canScan}
      >
        {isScanning
          ? 'Scanning…'
          : `Run Scan (${selectedSites.length} site${selectedSites.length !== 1 ? 's' : ''})`}
      </button>

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
  buttonDisabled: { backgroundColor: '#d1d5db', cursor: 'not-allowed' },
  error: { color: '#dc2626', fontSize: 13, margin: 0 },
};
