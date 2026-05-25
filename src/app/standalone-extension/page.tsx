'use client';

import { useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import { TenantSelector } from '@/src/components/TenantSelector';
import { ConfigPanel } from '@/src/components/ConfigPanel';
import { ScanPanel } from '@/src/components/ScanPanel';
import { SummaryStrip } from '@/src/components/SummaryStrip';
import { ResultsTable } from '@/src/components/ResultsTable';
import { DebugPanel } from '@/src/components/DebugPanel';
import type { SiteInfo, ScanRecord } from '@/src/lib/types';

type TabId = 'connect' | 'scan' | 'results' | 'debug';

/**
 * Root component for the XMC Public Link Tracker standalone extension.
 *
 * Three-step tab flow:
 *   1. Connect  — select tenant, configure language, load sites
 *   2. Scan     — select sites, run scan, view progress
 *   3. Results  — summary stats, filterable table, Excel download
 *
 * SDK is initialized in the parent layout via MarketplaceClientProvider.
 */
function PublicLinkTrackerApp() {
  const { isInitialized, isLoading, error } = useMarketplaceClientContext();
  const { selectedTenant } = useTenantContext();

  const [activeTab, setActiveTab] = useState<TabId>('connect');
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [language, setLanguage] = useState('en');
  const [records, setRecords] = useState<ScanRecord[]>([]);

  const handleSitesLoaded = (loadedSites: SiteInfo[], lang: string) => {
    setSites(loadedSites);
    setLanguage(lang);
  };

  const handleScanComplete = (scanRecords: ScanRecord[]) => {
    setRecords(scanRecords);
    setActiveTab('results');
  };

  // --- Loading / error gates ---
  if (isLoading) {
    return (
      <div style={s.gate}>
        <p style={s.gateText}>Initialising Marketplace SDK…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={s.gate}>
        <p style={s.errorText}>
          Failed to initialise Marketplace SDK: {String(error)}
        </p>
        <p style={s.gateHint}>
          Ensure this page is opened inside the Sitecore Cloud Portal extension
          frame, not directly in a browser.
        </p>
      </div>
    );
  }

  if (!isInitialized) return null;

  // --- Tab config ---
  const tabs: { id: TabId; label: string; disabled: boolean }[] = [
    { id: 'connect', label: '1. Connect', disabled: false },
    {
      id: 'scan',
      label: '2. Scan',
      disabled: !selectedTenant || sites.length === 0,
    },
    { id: 'results', label: '3. Results', disabled: records.length === 0 },
    { id: 'debug', label: 'Debug', disabled: !selectedTenant },
  ];

  const activeRecords = records.filter((r) => r.status !== 'Removed');
  const hasDelta = records.some((r) => r.status !== undefined);
  const summary = {
    pagesWithAssets: new Set(activeRecords.map((r) => r.page_path)).size,
    uniqueAssets: new Set(activeRecords.map((r) => r.asset_id)).size,
    componentsUsed: new Set(activeRecords.map((r) => r.component_name)).size,
    brokenLinks: activeRecords.filter((r) => r.risk_level === 'Broken').length,
    newLinks: hasDelta ? records.filter((r) => r.status === 'New').length : undefined,
    removedLinks: hasDelta ? records.filter((r) => r.status === 'Removed').length : undefined,
  };

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>XMC Public Link Tracker</h1>
        <p style={s.subtitle}>
          Scan Experience Edge for public asset links across your XM Cloud sites
        </p>
      </div>

      {/* Tab navigation */}
      <nav style={s.tabBar} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            style={{
              ...s.tab,
              ...(activeTab === tab.id ? s.tabActive : {}),
              ...(tab.disabled ? s.tabDisabled : {}),
            }}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main style={s.content}>
        {activeTab === 'connect' && (
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Tenant &amp; Configuration</h2>
            <TenantSelector />
            <hr style={s.rule} />
            <ConfigPanel onSitesLoaded={handleSitesLoaded} />
          </section>
        )}

        {activeTab === 'scan' && (
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Select Sites &amp; Run Scan</h2>
            <ScanPanel
              sites={sites}
              language={language}
              onScanComplete={handleScanComplete}
            />
          </section>
        )}

        {activeTab === 'results' && (
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Scan Results</h2>
            <SummaryStrip
              pagesWithAssets={summary.pagesWithAssets}
              uniqueAssets={summary.uniqueAssets}
              componentsUsed={summary.componentsUsed}
              brokenLinks={summary.brokenLinks}
              newLinks={summary.newLinks}
              removedLinks={summary.removedLinks}
            />
            <ResultsTable records={records} />
          </section>
        )}

        {activeTab === 'debug' && (
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Debug — Raw API Tester</h2>
            <DebugPanel />
          </section>
        )}
      </main>
    </div>
  );
}

export default function StandaloneExtensionPage() {
  return <PublicLinkTrackerApp />;
}

const s: Record<string, React.CSSProperties> = {
  app: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    maxWidth: 1280,
    margin: '0 auto',
    color: '#1a1a1a',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    borderBottom: '1px solid #e5e7eb',
    padding: '20px 24px',
    backgroundColor: '#fff',
  },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a1a' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    padding: '0 24px',
    backgroundColor: '#fff',
  },
  tab: {
    padding: '12px 20px',
    border: 'none',
    borderBottom: '2px solid transparent',
    backgroundColor: 'transparent',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    color: '#6b7280',
    marginBottom: -1,
  },
  tabActive: {
    borderBottom: '2px solid #eb1f1f',
    color: '#1a1a1a',
    fontWeight: 600,
  },
  tabDisabled: { color: '#d1d5db', cursor: 'not-allowed' },
  content: { padding: 24 },
  section: { display: 'flex', flexDirection: 'column', gap: 20 },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
  },
  rule: { border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 },
  gate: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    padding: 32,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    gap: 8,
  },
  gateText: { color: '#6b7280', fontSize: 14, margin: 0 },
  errorText: { color: '#dc2626', fontSize: 14, margin: 0, fontWeight: 500 },
  gateHint: { color: '#9ca3af', fontSize: 12, margin: 0, textAlign: 'center' as const },
};
