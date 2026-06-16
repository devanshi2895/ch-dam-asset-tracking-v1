import type { ScanRecord, BulkUpdateResult, OperationError } from './types';

export interface BulkUpdateOptions {
  chBaseUrl: string;
  chToken: string;
  batchSize: number;
  pageField: string;
  componentField: string;
  pageDefinition: string;
  componentDefinition: string;
  createMissingTaxonomy: boolean;
  batchDelayMs: number;
}

interface AssetGroup {
  asset_id: string;
  pageNames: Set<string>;
  componentNames: Set<string>;
}

// ---------------------------------------------------------------------------
// Record grouping
// ---------------------------------------------------------------------------

/**
 * Groups records by asset_id, mirroring the activeGroups logic in excelExporter.ts.
 * Removed records and non-numeric asset IDs are skipped.
 */
function groupRecords(records: ScanRecord[]): {
  groups: Map<string, AssetGroup>;
  skipped: number;
} {
  const groups = new Map<string, AssetGroup>();
  let skipped = 0;

  for (const r of records) {
    if (r.status === 'Removed' || !/^\d+$/.test(r.asset_id)) {
      skipped++;
      continue;
    }
    if (!groups.has(r.asset_id)) {
      groups.set(r.asset_id, {
        asset_id: r.asset_id,
        pageNames: new Set(),
        componentNames: new Set(),
      });
    }
    const g = groups.get(r.asset_id)!;
    if (r.page_name) g.pageNames.add(`PageName.${r.page_name.replace(/\s+/g, '')}`);
    if (r.component_name) g.componentNames.add(`ComponentName.${r.component_name}`);
  }

  return { groups, skipped };
}

// ---------------------------------------------------------------------------
// Phase 1: Taxonomy resolution
// ---------------------------------------------------------------------------

/** Derives a human-readable label from a taxonomy identifier (e.g. "PageName.MyPage" → "My Page"). */
function toLabel(identifier: string): string {
  const name = identifier.split('.').slice(1).join('.');
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * Queries CH for existing taxonomy entities matching the given identifiers.
 * Returns a map of identifier → entity href for all found entities.
 * Splits into chunks of 50 to stay within URL length limits.
 */
async function lookupTaxonomyEntities(
  identifiers: string[],
  definitionName: string,
  chBaseUrl: string,
  chToken: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!identifiers.length) return result;

  const CHUNK = 50;
  for (let i = 0; i < identifiers.length; i += CHUNK) {
    const chunk = identifiers.slice(i, i + CHUNK);
    const orClause = chunk.map((id) => `Identifier=='${id}'`).join(' OR ');
    // Use the definition-scoped endpoint — /api/entities?query=... misses taxonomy entities
    const url = `${chBaseUrl}/api/entitydefinitions/${definitionName}/entities?query=${encodeURIComponent(orClause)}&take=${chunk.length}`;

    try {
      const res = await fetch(url, {
        headers: { 'X-Auth-Token': chToken, 'X-ApiVersion': '3' },
      });
      if (!res.ok) continue;

      const json = await res.json() as { items?: Array<{ identifier: string; self: { href: string } }> };
      for (const item of json.items ?? []) {
        if (item.identifier && item.self?.href) {
          result.set(item.identifier, item.self.href);
        }
      }
    } catch {
      // query failed for this chunk — treat all as missing
    }
  }

  return result;
}

/**
 * Creates a taxonomy entity in CH for the given identifier.
 * Returns the href of the newly created entity, or null on failure.
 */
async function createTaxonomyEntity(
  identifier: string,
  definitionName: string,
  chBaseUrl: string,
  chToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${chBaseUrl}/api/entities`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': chToken,
        'Content-Type': 'application/json',
        'X-ApiVersion': '3',
      },
      body: JSON.stringify({
        identifier,
        entitydefinition: { href: `/api/entitydefinitions/${definitionName}` },
        properties: {
          TaxonomyName: toLabel(identifier),
          TaxonomyLabel: { 'en-US': toLabel(identifier) },
        },
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        // Entity already exists — re-query via definition-scoped endpoint
        const fallback = await lookupTaxonomyEntities([identifier], definitionName, chBaseUrl, chToken);
        const href = fallback.get(identifier) ?? null;
        if (href) console.warn(`[ch-update] 409 for ${identifier} — recovered via lookup`);
        else console.error(`[ch-update] 409 for ${identifier} but re-lookup also failed`);
        return href;
      }
      const errText = await res.text().catch(() => '');
      console.error(`[ch-update] failed to create taxonomy entity ${identifier}: HTTP ${res.status} ${errText.slice(0, 200)}`);
      return null;
    }

    // CH POST /api/entities returns the new entity in the body
    const json = await res.json() as { id?: number; self?: { href: string } };
    return json.self?.href ?? (json.id ? `${chBaseUrl}/api/entities/${json.id}` : null);
  } catch (e) {
    console.error(`[ch-update] error creating taxonomy entity ${identifier}:`, e);
    return null;
  }
}

/**
 * Resolves all taxonomy identifiers to CH entity hrefs.
 * Creates missing entities when createMissing=true.
 * Returns { hrefMap, created, unresolved } — unresolved lists identifiers that couldn't be resolved.
 */
async function resolveTaxonomyEntities(
  identifiers: string[],
  definitionName: string,
  chBaseUrl: string,
  chToken: string,
  createMissing: boolean,
): Promise<{ hrefMap: Map<string, string>; created: number; unresolved: string[] }> {
  const hrefMap = await lookupTaxonomyEntities(identifiers, definitionName, chBaseUrl, chToken);
  let created = 0;

  if (createMissing) {
    for (const identifier of identifiers) {
      if (hrefMap.has(identifier)) continue;
      const href = await createTaxonomyEntity(identifier, definitionName, chBaseUrl, chToken);
      if (href) {
        hrefMap.set(identifier, href);
        created++;
      }
    }
  }

  const unresolved = identifiers.filter((id) => !hrefMap.has(id));

  return { hrefMap, created, unresolved };
}

// ---------------------------------------------------------------------------
// Phase 2: Direct relation updates (no bulk API)
// ---------------------------------------------------------------------------

interface RelationOp {
  asset_id: string;
  member: string;
  parents: Array<{ href: string }>;
}

function buildRelationOps(
  group: AssetGroup,
  pageField: string,
  componentField: string,
  pageHrefs: Map<string, string>,
  componentHrefs: Map<string, string>,
): RelationOp[] {
  const ops: RelationOp[] = [];

  const pageParents = [...group.pageNames]
    .filter((id) => pageHrefs.has(id))
    .map((id) => ({ href: pageHrefs.get(id) as string }));

  const componentParents = [...group.componentNames]
    .filter((id) => componentHrefs.has(id))
    .map((id) => ({ href: componentHrefs.get(id) as string }));

  if (pageParents.length > 0) {
    ops.push({ asset_id: group.asset_id, member: pageField, parents: pageParents });
  }
  if (componentParents.length > 0) {
    ops.push({ asset_id: group.asset_id, member: componentField, parents: componentParents });
  }

  return ops;
}

async function putRelation(
  op: RelationOp,
  chBaseUrl: string,
  chToken: string,
): Promise<{ ok: true } | { ok: false; httpStatus?: number; message: string }> {
  const url = `${chBaseUrl}/api/entities/${op.asset_id}/relations/${op.member}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Auth-Token': chToken,
        'Content-Type': 'application/json',
        'X-ApiVersion': '3',
      },
      body: JSON.stringify({ parents: op.parents }),
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    return { ok: false, httpStatus: res.status, message: text.slice(0, 300) || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs ops in concurrent chunks of `concurrency`, with optional delay between chunks. */
async function sendConcurrent(
  ops: RelationOp[],
  concurrency: number,
  batchDelayMs: number,
  chBaseUrl: string,
  chToken: string,
): Promise<{ updated: number; failed: number; errors: OperationError[] }> {
  let updated = 0;
  let failed = 0;
  const errors: OperationError[] = [];

  for (let i = 0; i < ops.length; i += concurrency) {
    const chunk = ops.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map((op) => putRelation(op, chBaseUrl, chToken)));

    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      const label = `${chunk[j].asset_id} ${chunk[j].member}`;
      if (r.ok) {
        updated++;
      } else {
        errors.push({ asset_id: label, httpStatus: r.httpStatus, message: r.message });
        failed++;
      }
    }

    if (i + concurrency < ops.length && batchDelayMs > 0) {
      await delay(batchDelayMs);
    }
  }

  return { updated, failed, errors };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runBulkUpdate(
  records: ScanRecord[],
  options: BulkUpdateOptions,
): Promise<BulkUpdateResult> {
  const {
    chBaseUrl, chToken, batchSize, batchDelayMs,
    pageField, componentField,
    pageDefinition, componentDefinition,
    createMissingTaxonomy,
  } = options;

  const { groups, skipped } = groupRecords(records);

  if (groups.size === 0) {
    return { updated: 0, skipped, failed: 0, taxonomyCreated: 0, errors: [] };
  }

  // --- Phase 1: resolve / create taxonomy entities ---
  const allPageNames = [...new Set([...groups.values()].flatMap((g) => [...g.pageNames]))];
  const allComponentNames = [...new Set([...groups.values()].flatMap((g) => [...g.componentNames]))];

  const [pageResolved, componentResolved] = await Promise.all([
    resolveTaxonomyEntities(allPageNames, pageDefinition, chBaseUrl, chToken, createMissingTaxonomy),
    resolveTaxonomyEntities(allComponentNames, componentDefinition, chBaseUrl, chToken, createMissingTaxonomy),
  ]);

  const taxonomyCreated = pageResolved.created + componentResolved.created;
  console.log(`[ch-update] taxonomy: ${pageResolved.hrefMap.size}/${allPageNames.length} page, ${componentResolved.hrefMap.size}/${allComponentNames.length} component, ${taxonomyCreated} created`);

  // Collect unresolved taxonomy identifiers as errors so they surface in the UI
  const taxonomyErrors: OperationError[] = [
    ...pageResolved.unresolved.map((id) => ({ asset_id: `taxonomy:${id}`, message: `Could not resolve/create taxonomy entity — check ${pageDefinition} entity definition properties` })),
    ...componentResolved.unresolved.map((id) => ({ asset_id: `taxonomy:${id}`, message: `Could not resolve/create taxonomy entity — check ${componentDefinition} entity definition properties` })),
  ];

  // --- Phase 2: direct relation updates ---
  const allOps: RelationOp[] = [];
  for (const group of groups.values()) {
    allOps.push(...buildRelationOps(group, pageField, componentField, pageResolved.hrefMap, componentResolved.hrefMap));
  }

  const result = await sendConcurrent(allOps, batchSize, batchDelayMs, chBaseUrl, chToken);

  return {
    updated: result.updated,
    skipped,
    failed: result.failed + taxonomyErrors.length,
    taxonomyCreated,
    errors: [...taxonomyErrors, ...result.errors],
  };
}
