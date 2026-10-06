'use client';

import { useState } from 'react';
import { useMarketplaceClientContext } from '@/src/context/MarketplaceClientProvider';
import { useTenantContext } from '@/src/context/TenantContext';
import { GET_PAGES_FOR_SITE, GET_PAGE_FIELDS } from '@/src/lib/queries';
import { DEFAULT_LANGUAGE } from '@/src/lib/config';

// ---------------------------------------------------------------------------
// CH debug proxy helper
// ---------------------------------------------------------------------------

async function chRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch('/api/ch-debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path, body }),
  });
  return res.json();
}

/**
 * Developer debug panel — runs each scanner step in isolation and shows
 * the raw API response so query issues can be diagnosed without a full scan.
 *
 * Steps:
 *   1. List Sites  — xmc.xmapp.listSites REST call
 *   2. Get Pages   — GET_PAGES_FOR_SITE GraphQL via xmc.preview.graphql
 *   3. Get Fields  — GET_PAGE_FIELDS GraphQL for a specific item ID
 */
export function DebugPanel() {
  const { client } = useMarketplaceClientContext();
  const { selectedTenant } = useTenantContext();

  const sitecoreContextId = selectedTenant?.context?.preview ?? '';

  const [homeId, setHomeId] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [itemId, setItemId] = useState('');

  // XMC debug state
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<string>('');

  // CH API tester state
  const [chAssetId, setChAssetId] = useState('');
  const [chTaxonomyId, setChTaxonomyId] = useState('PageName.BoseQuietComfort45WirelessHeadphones');
  const [chCustomMethod, setChCustomMethod] = useState('GET');
  const [chCustomPath, setChCustomPath] = useState('/api/entities/');
  const [chCustomBody, setChCustomBody] = useState('');
  const [chResult, setChResult] = useState<unknown>(null);
  const [chLoading, setChLoading] = useState(false);
  const [chActiveStep, setChActiveStep] = useState<string>('');

  async function run(label: string, fn: () => Promise<unknown>) {
    setLoading(true);
    setActiveStep(label);
    setResult(null);
    try {
      const data = await fn();
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function gqlQuery(query: string, variables: Record<string, unknown>) {
    const response = await client!.mutate('xmc.preview.graphql', {
      params: {
        query: { sitecoreContextId },
        body: { query, variables },
      },
    });
    return response?.data;
  }

  const handleListSites = () =>
    run('List Sites', async () => {
      const res = await client!.query('xmc.xmapp.listSites', {
        params: { query: { sitecoreContextId } },
      });
      return res;
    });

  const handleGetPages = () =>
    run('Get Pages', () =>
      gqlQuery(GET_PAGES_FOR_SITE, {
        homeId: homeId.trim(),
        language: language.trim(),
      })
    );

  function normalizeItemId(id: string) {
    let bare = id.trim().replace(/[{}]/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(bare)) {
      bare = `${bare.slice(0,8)}-${bare.slice(8,12)}-${bare.slice(12,16)}-${bare.slice(16,20)}-${bare.slice(20)}`;
    }
    return `{${bare.toUpperCase()}}`;
  }

  const handleGetFields = () =>
    run('Get Fields', () =>
      gqlQuery(GET_PAGE_FIELDS, {
        id: normalizeItemId(itemId),
        language: language.trim(),
      })
    );

  const canRun = !!client && !!sitecoreContextId && !loading;

  // CH helpers
  async function runCH(label: string, fn: () => Promise<unknown>) {
    setChLoading(true);
    setChActiveStep(label);
    setChResult(null);
    try {
      setChResult(await fn());
    } catch (err) {
      setChResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setChLoading(false);
    }
  }

  const handleGetEntity = () =>
    runCH('GET Entity', () =>
      chRequest('GET', `/api/entities/${chAssetId.trim()}`)
    );

  const handleCheckTaxonomy = () =>
    runCH('Check Taxonomy Node', () =>
      chRequest('GET', `/api/entities?query=Identifier==%27${encodeURIComponent(chTaxonomyId.trim())}%27&take=5`)
    );

  const handleListPageNameNodes = () =>
    runCH('List PageName Taxonomy Nodes', () =>
      chRequest('GET', `/api/entitydefinitions/PageName/entities?take=20`)
    );

  const handleListEntityDefinitions = () =>
    runCH('List Entity Definitions', () =>
      chRequest('GET', `/api/entitydefinitions?take=100`)
    );

  const handleCheckEntityDefinition = (defName: string) =>
    runCH(`Check definition: ${defName}`, () =>
      chRequest('GET', `/api/entitydefinitions/${defName}`)
    );

  const handleCustomRequest = () => {
    let parsedBody: unknown;
    if (chCustomBody.trim()) {
      try {
        parsedBody = JSON.parse(chCustomBody);
      } catch {
        setChResult({ error: 'Body is not valid JSON' });
        return;
      }
    }
    runCH(`${chCustomMethod} ${chCustomPath}`, () =>
      chRequest(chCustomMethod, chCustomPath, parsedBody)
    );
  };

  const handleTestBulkPayload = () => {
    if (!chAssetId.trim()) { setChResult({ error: 'Enter an Asset ID first' }); return; }
    const payload = {
      operations: [{
        method: 'PUT',
        uri: `/api/entities/${chAssetId.trim()}`,
        body: {
          propertyValues: {
            PageNameToAsset: { values: ['PageName.TestPage'] },
            ComponentNameToAsset: { values: ['ComponentName.TestComponent'] },
          },
        },
      }],
    };
    runCH('Test Bulk Payload', () => chRequest('POST', '/api/bulk', payload));
  };

  return (
    <div style={s.wrapper}>
      <p style={s.note}>
        Runs each scanner step in isolation against the live API — no full scan needed.
        Open DevTools Console for additional logs.
      </p>

      {/* Inputs */}
      <div style={s.fields}>
        <label style={s.label}>
          sitecoreContextId (from selected tenant)
          <input style={s.input} value={sitecoreContextId} readOnly />
        </label>

        <label style={s.label}>
          homeId <span style={s.hint}>(Home page GUID — from Step 1 result: <code>hosts[0].homePageId</code> formatted as {`{UPPERCASE-GUID}`})</span>
          <input
            style={s.input}
            value={homeId}
            onChange={(e) => setHomeId(e.target.value)}
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
          />
        </label>

        <label style={s.label}>
          language
          <input
            style={{ ...s.input, width: 80 }}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </label>

        <label style={s.label}>
          item ID <span style={s.hint}>(for Step 3 — paste an id from Step 2 results)</span>
          <input
            style={s.input}
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="e.g. cda20dcb-ebde-4c54-bef5-3134f5ca72b3"
          />
        </label>
      </div>

      {/* Buttons */}
      <div style={s.buttons}>
        <button
          style={{ ...s.btn, ...(!canRun ? s.btnDisabled : {}) }}
          onClick={handleListSites}
          disabled={!canRun}
        >
          1. List Sites
        </button>
        <button
          style={{ ...s.btn, ...(!canRun || !homeId.trim() ? s.btnDisabled : {}) }}
          onClick={handleGetPages}
          disabled={!canRun || !homeId.trim()}
        >
          2. Get Pages
        </button>
        <button
          style={{ ...s.btn, ...(!canRun || !itemId.trim() ? s.btnDisabled : {}) }}
          onClick={handleGetFields}
          disabled={!canRun || !itemId.trim()}
        >
          3. Get Fields
        </button>
      </div>

      {/* Output */}
      {(loading || result !== null) && (
        <div style={s.output}>
          <div style={s.outputHeader}>
            <span style={s.outputLabel}>
              {loading ? `Running: ${activeStep}…` : `Result: ${activeStep}`}
            </span>
            {result !== null && (
              <button
                style={s.copyBtn}
                onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
              >
                Copy JSON
              </button>
            )}
          </div>
          <pre style={s.pre}>
            {loading ? '…' : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Content Hub API Tester                                              */}
      {/* ------------------------------------------------------------------ */}
      <hr style={s.divider} />
      <h3 style={s.subHeading}>Content Hub API Tester</h3>
      <p style={s.note}>
        Proxies requests through <code>/api/ch-debug</code> — token stays server-side.
        Requires <code>CONTENT_HUB_BASE_URL</code> and <code>CONTENT_HUB_API_TOKEN</code> in <code>.env.local</code>.
      </p>

      {/* Preset operations */}
      <div style={s.fields}>
        <label style={s.label}>
          Asset ID (numeric CH entity ID)
          <input
            style={{ ...s.input, maxWidth: 200 }}
            value={chAssetId}
            onChange={(e) => setChAssetId(e.target.value)}
            placeholder="e.g. 38374"
          />
        </label>
        <label style={s.label}>
          Taxonomy identifier to check
          <input
            style={s.input}
            value={chTaxonomyId}
            onChange={(e) => setChTaxonomyId(e.target.value)}
            placeholder="PageName.BoseQuietComfort45WirelessHeadphones"
          />
        </label>
      </div>

      <div style={s.buttons}>
        <button
          style={{ ...s.btn, ...(!chAssetId.trim() || chLoading ? s.btnDisabled : {}) }}
          onClick={handleGetEntity}
          disabled={!chAssetId.trim() || chLoading}
          title="GET /api/entities/{id} — shows current field & relation values"
        >
          GET Entity
        </button>
        <button
          style={{ ...s.btn, ...(!chTaxonomyId.trim() || chLoading ? s.btnDisabled : {}) }}
          onClick={handleCheckTaxonomy}
          disabled={!chTaxonomyId.trim() || chLoading}
          title="Query CH for this taxonomy identifier — 0 items = needs to be created first"
        >
          Check Taxonomy Node
        </button>
        <button
          style={{ ...s.btn, ...(chLoading ? s.btnDisabled : {}), backgroundColor: '#6b7280' }}
          onClick={handleListPageNameNodes}
          disabled={chLoading}
          title="List existing PageName taxonomy entities — query DefinitionName=='PageName'"
        >
          List PageName Nodes
        </button>
        <button
          style={{ ...s.btn, ...(chLoading ? s.btnDisabled : {}), backgroundColor: '#6b7280' }}
          onClick={handleListEntityDefinitions}
          disabled={chLoading}
          title="GET /api/entitydefinitions — lists all entity definitions to find correct PageName/ComponentName names"
        >
          List Entity Definitions
        </button>
        <button
          style={{ ...s.btn, ...(chLoading ? s.btnDisabled : {}), backgroundColor: '#6b7280' }}
          onClick={() => handleCheckEntityDefinition('PageName')}
          disabled={chLoading}
          title="GET /api/entitydefinitions/PageName — verify this definition exists"
        >
          Check PageName Def
        </button>
        <button
          style={{ ...s.btn, ...(!chAssetId.trim() || chLoading ? s.btnDisabled : {}), backgroundColor: '#7c3aed' }}
          onClick={handleTestBulkPayload}
          disabled={!chAssetId.trim() || chLoading}
          title="Send a minimal test bulk payload with placeholder taxonomy values"
        >
          Test Bulk Payload
        </button>
      </div>

      {/* Custom request */}
      <div style={s.fields}>
        <p style={{ ...s.note, marginTop: 8, fontWeight: 600, color: '#374151' }}>Custom request</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ ...s.label, width: 90 }}>
            Method
            <select
              style={{ ...s.input, maxWidth: 90 }}
              value={chCustomMethod}
              onChange={(e) => setChCustomMethod(e.target.value)}
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
            </select>
          </label>
          <label style={{ ...s.label, flex: 1 }}>
            Path
            <input
              style={s.input}
              value={chCustomPath}
              onChange={(e) => setChCustomPath(e.target.value)}
              placeholder="/api/entities/38374"
            />
          </label>
        </div>
        <label style={s.label}>
          Body (JSON, optional for GET)
          <textarea
            style={{ ...s.input, height: 100, resize: 'vertical', fontFamily: 'monospace', maxWidth: '100%' }}
            value={chCustomBody}
            onChange={(e) => setChCustomBody(e.target.value)}
            placeholder={'{\n  "propertyValues": { "PageNameToAsset": { "values": ["PageName.Home"] } }\n}'}
          />
        </label>
      </div>
      <div style={s.buttons}>
        <button
          style={{ ...s.btn, ...(chLoading ? s.btnDisabled : {}), backgroundColor: '#1a1a1a' }}
          onClick={handleCustomRequest}
          disabled={chLoading}
        >
          Send Request
        </button>
      </div>

      {/* CH Output */}
      {(chLoading || chResult !== null) && (
        <div style={s.output}>
          <div style={s.outputHeader}>
            <span style={s.outputLabel}>
              {chLoading ? `Running: ${chActiveStep}…` : `Result: ${chActiveStep}`}
            </span>
            {chResult !== null && (
              <button
                style={s.copyBtn}
                onClick={() => navigator.clipboard.writeText(JSON.stringify(chResult, null, 2))}
              >
                Copy JSON
              </button>
            )}
          </div>
          <pre style={s.pre}>
            {chLoading ? '…' : JSON.stringify(chResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  note: { fontSize: 13, color: '#6b7280', margin: 0 },
  fields: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  hint: { fontWeight: 400, color: '#9ca3af' },
  input: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'monospace',
    width: '100%',
    maxWidth: 600,
    boxSizing: 'border-box',
  },
  buttons: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: {
    padding: '8px 16px',
    backgroundColor: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: { backgroundColor: '#d1d5db', cursor: 'not-allowed' },
  output: {
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  outputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#f3f4f6',
    borderBottom: '1px solid #e5e7eb',
  },
  outputLabel: { fontSize: 12, fontWeight: 600, color: '#374151' },
  copyBtn: {
    fontSize: 11,
    padding: '3px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 3,
    backgroundColor: '#fff',
    cursor: 'pointer',
    color: '#374151',
  },
  divider: { border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' },
  subHeading: { margin: 0, fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  pre: {
    margin: 0,
    padding: 12,
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    overflowX: 'auto',
    overflowY: 'auto',
    maxHeight: 500,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
};
