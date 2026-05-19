'use client';

import { useEffect, useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import type { Tenant } from '@/src/lib/types';

export function TenantSelector() {
  const { client, appContext } = useMarketplaceClientContext();
  const { tenants, selectedTenant, setTenants, setSelectedTenant } =
    useTenantContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !appContext) return;

    const resource = appContext.resourceAccess?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sitecoreContextId: string = (resource as any)?.context?.preview ?? '';

    if (!sitecoreContextId) {
      setError('No sitecoreContextId found in application context.');
      return;
    }

    setIsLoading(true);
    setError(null);

    client
      .query('xmc.xmapp.listCollections', {
        params: { query: { sitecoreContextId } },
      })
      .then((res) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const collections: Array<any> = (res as any)?.data?.data ?? [];
        console.log('[TenantSelector] listCollections:', collections);

        if (!collections.length) {
          setError('No headless tenants found for this installation.');
          return;
        }

        const mapped: Tenant[] = collections
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((col: any) => ({
            id: col.id ?? '',
            name: col.displayName ?? col.name ?? 'Unknown Tenant',
            context: { preview: sitecoreContextId },
          }))
          .filter((t: Tenant) => t.id);

        setTenants(mapped);
        if (mapped.length === 1) setSelectedTenant(mapped[0]);
      })
      .catch((err: unknown) => {
        setError(
          `Failed to load tenants: ${err instanceof Error ? err.message : String(err)}`
        );
      })
      .finally(() => setIsLoading(false));
  }, [client, appContext, setTenants, setSelectedTenant]);

  if (!appContext) {
    return <p style={s.hint}>No tenant context available.</p>;
  }

  if (isLoading) {
    return <p style={s.hint}>Loading headless tenants…</p>;
  }

  return (
    <div style={s.wrapper}>
      <label style={s.label} htmlFor="tenant-select">
        Headless Tenant (Site Collection)
      </label>
      {error ? (
        <p style={s.error}>{error}</p>
      ) : (
        <select
          id="tenant-select"
          style={s.select}
          value={selectedTenant?.id ?? ''}
          onChange={(e) => {
            const t = tenants.find((t) => t.id === e.target.value) ?? null;
            setSelectedTenant(t);
          }}
        >
          {!selectedTenant && <option value="">— select a tenant —</option>}
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {selectedTenant && (
        <p style={s.hint}>
          Context ID:{' '}
          <code style={s.code}>{selectedTenant.context.preview || '(not set)'}</code>
        </p>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  select: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 14,
    backgroundColor: '#fff',
    cursor: 'pointer',
    maxWidth: 400,
  },
  hint: { fontSize: 12, color: '#6b7280', margin: 0 },
  code: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    padding: '1px 4px',
    borderRadius: 3,
  },
};
