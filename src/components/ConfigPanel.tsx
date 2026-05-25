'use client';

import { useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import { fetchSitesViaRest } from '@/src/lib/scanner';
import { DEFAULT_LANGUAGE } from '@/src/lib/config';
import type { SiteInfo } from '@/src/lib/types';

interface ConfigPanelProps {
  /** Called when sites are successfully loaded — enables the Scan tab */
  onSitesLoaded: (sites: SiteInfo[], language: string) => void;
}

/**
 * Language selector and "Load Sites" trigger.
 * Calls GET_SITES via client.mutate("xmc.authoring.graphql") — no raw fetch.
 */
export function ConfigPanel({ onSitesLoaded }: ConfigPanelProps) {
  const { client } = useMarketplaceClientContext();
  const { selectedTenant } = useTenantContext();
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handleLoadSites = async () => {
    if (!client || !selectedTenant) return;
    setIsLoading(true);
    setError(null);
    setLoaded(false);

    try {
      const results: SiteInfo[] = await fetchSitesViaRest(
        client,
        selectedTenant.context.preview ?? '',
        selectedTenant.id
      );

      if (!results.length) {
        setError('No sites found in this site collection. Check that sites exist under the selected headless tenant.');
        return;
      }

      setLoaded(true);
      onSitesLoaded(results, language.trim() || 'en');
    } catch (err) {
      setError(
        `Failed to load sites: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const canLoad = !!client && !!selectedTenant && !isLoading;

  return (
    <div style={s.wrapper}>
      <div style={s.field}>
        <label style={s.label} htmlFor="language-input">
          Language
        </label>
        <input
          id="language-input"
          type="text"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={s.input}
          placeholder="en"
        />
        <p style={s.hint}>
          Comma-separate for future multi-language support — e.g.{' '}
          <code style={s.code}>en,de</code>
        </p>
      </div>

      <button
        style={{ ...s.button, ...(!canLoad ? s.buttonDisabled : {}) }}
        onClick={handleLoadSites}
        disabled={!canLoad}
      >
        {isLoading ? 'Loading Sites…' : 'Load Sites'}
      </button>

      {error && <p style={s.error}>{error}</p>}
      {loaded && (
        <p style={s.success}>✓ Sites loaded — proceed to the Scan tab.</p>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  input: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 14,
    width: 200,
  },
  hint: { fontSize: 12, color: '#6b7280', margin: 0 },
  code: {
    fontFamily: 'monospace',
    fontSize: 11,
    backgroundColor: '#f3f4f6',
    padding: '1px 4px',
    borderRadius: 3,
  },
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
  success: { color: '#16a34a', fontSize: 13, margin: 0 },
};
