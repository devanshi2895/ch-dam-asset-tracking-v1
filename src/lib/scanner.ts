import { GET_PAGES_FOR_SITE, GET_PAGE_FIELDS } from './queries';
import { findPublicLinks } from './patternMatcher';
import { calculateRiskLevels } from './riskEngine';
import { checkHttpStatuses } from './httpChecker';
import type {
  ScanConfig,
  ScanRecord,
  SiteInfo,
  PageItem,
  ScanProgress,
} from './types';

/**
 * Normalises a Sitecore item ID to {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}.
 * The Edge `item(path: ...)` resolver requires the hyphenated GUID format.
 * Search results return IDs without hyphens (32 hex chars), so we insert them.
 */
function normalizeItemId(id: string): string {
  let bare = id.trim().replace(/[{}]/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(bare)) {
    bare = `${bare.slice(0,8)}-${bare.slice(8,12)}-${bare.slice(12,16)}-${bare.slice(16,20)}-${bare.slice(20)}`;
  }
  return `{${bare.toUpperCase()}}`;
}

/**
 * Walks the layout service `rendered` JSON and returns a flat list of
 * { label, value } pairs — one entry per component field, where label is
 * "ComponentName.FieldName" and value is the stringified field value.
 *
 * Structure: rendered.sitecore.route.placeholders → [ { componentName,
 * fields: { FieldName: { value, ... } }, placeholders: { ... } } ]
 *
 * Falls back to stringifying the whole rendered blob if parsing fails.
 */
function extractComponentFields(
  rendered: unknown
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];

  function walkFields(
    fields: Record<string, unknown>,
    componentName: string
  ) {
    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      const label = `${componentName}.${fieldName}`;
      const str =
        fieldValue == null
          ? ''
          : typeof fieldValue === 'string'
          ? fieldValue
          : JSON.stringify(fieldValue);
      if (str) out.push({ label, value: str });
    }
  }

  function walkPlaceholders(placeholders: Record<string, unknown>) {
    for (const components of Object.values(placeholders)) {
      if (!Array.isArray(components)) continue;
      for (const comp of components) {
        if (typeof comp !== 'object' || comp === null) continue;
        const c = comp as Record<string, unknown>;
        const name = (c.componentName as string) || 'Unknown';
        if (c.fields && typeof c.fields === 'object') {
          walkFields(c.fields as Record<string, unknown>, name);
        }
        if (c.placeholders && typeof c.placeholders === 'object') {
          walkPlaceholders(c.placeholders as Record<string, unknown>);
        }
      }
    }
  }

  try {
    const obj =
      typeof rendered === 'string' ? JSON.parse(rendered) : rendered;
    const placeholders = obj?.sitecore?.route?.placeholders;
    if (placeholders && typeof placeholders === 'object') {
      walkPlaceholders(placeholders as Record<string, unknown>);
    }
  } catch {
    // Fallback: scan the raw string
    if (typeof rendered === 'string' && rendered.length > 0) {
      out.push({ label: 'rendered', value: rendered });
    }
  }

  return out;
}

/** Rate-limit delay between page field queries to respect Edge limits */
const RATE_LIMIT_MS = 100;
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Executes a GraphQL query via the Marketplace SDK authoring mutation.
 * All auth is handled by the SDK — no API keys exposed in the browser.
 */
async function xmcQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sitecoreContextId: string,
  query: string,
  variables: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const opMatch = query.match(/query\s+(\w+)/);
  const opName = opMatch?.[1] ?? 'GraphQL';
  console.group(`[scanner] ${opName}`);
  console.log('variables:', variables);

  const response = await client.mutate('xmc.preview.graphql', {
    params: {
      query: { sitecoreContextId },
      body: { query, variables },
    },
  });

  const httpBody = response?.data;           // { "data": {...}, "errors": [...] }
  if (httpBody?.errors) {
    console.error('errors:', httpBody.errors);
  } else {
    console.log('response data:', httpBody?.data);
  }
  console.groupEnd();
  return httpBody?.data;                     // unwrap GraphQL envelope → { item/search/... }
}

/**
 * Fetches sites for a specific site collection via xmc.xmapp.listCollectionSites,
 * or all sites via xmc.xmapp.listSites when no collectionId is provided.
 * Avoids the `siteInfoCollection` GraphQL field which is not available on the
 * Experience Edge preview schema.
 *
 * rootPath is derived as /sitecore/content/{collectionName}/{siteName}
 * which is the standard XM Cloud Headless Site path convention.
 */
export async function fetchSitesViaRest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sitecoreContextId: string,
  collectionId?: string
): Promise<SiteInfo[]> {
  console.group('[scanner] fetchSitesViaRest');
  const sitesRes = collectionId
    ? await client.query('xmc.xmapp.listCollectionSites', {
        params: { path: { collectionId }, query: { sitecoreContextId } },
      })
    : await client.query('xmc.xmapp.listSites', {
        params: { query: { sitecoreContextId } },
      });
  console.log('raw sites response:', sitesRes);

  // xmc.xmapp REST calls return RequestResult<T> from @hey-api/client-fetch,
  // so the actual array is at .data.data (QueryResult wraps RequestResult).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites: Array<any> = sitesRes?.data?.data ?? [];
  console.log(`raw sites count: ${sites.length}, collectionId: ${collectionId ?? 'all'}`, sites.map((s) => s.name));

  const mapped = sites
    .map((site) => {
      const rootPath: string = site.properties?.rootPath ?? '';
      const host = site.hosts?.[0];
      // homePageId is the Home item GUID. Using it for _path CONTAINS means
      // only descendants of Home are matched — Presentation items (Header,
      // Footer, Default) are siblings of Home and are excluded automatically.
      const rawHomeId: string = (host?.homePageId as string) ?? '';
      const homeId: string = rawHomeId
        ? `{${rawHomeId.toUpperCase()}}`
        : '';
      const hostName: string =
        (host?.targetHostname as string) ||
        (host?.hostnames?.[0] as string) ||
        '*';
      return {
        name: (site.name as string) ?? '',
        hostName,
        rootPath,
        homeId,
      } as SiteInfo;
    })
    .filter((s) => s.name && s.homeId);

  console.log('mapped sites:', mapped);
  console.groupEnd();
  return mapped;
}

/**
 * Fetches all pages for a site with automatic cursor-based pagination.
 */
async function fetchAllPages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sitecoreContextId: string,
  homeId: string,
  language: string,
  siteName: string
): Promise<PageItem[]> {
  const pages: PageItem[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await xmcQuery(
      client,
      sitecoreContextId,
      GET_PAGES_FOR_SITE,
      { homeId, language, after }
    );

    const results: Array<{ id: string; name: string }> =
      data?.search?.results ?? [];

    for (const r of results) {
      pages.push({
        id: r.id,
        name: r.name,
        path: r.id,
        language,
        siteName,
      });
    }

    hasNextPage = data?.search?.pageInfo?.hasNext ?? false;
    after = data?.search?.pageInfo?.endCursor;
  }

  return pages;
}

/**
 * Main scan orchestrator.
 *
 * Algorithm:
 *   1. Fetch all sites, filter to config.selectedSites
 *   2. For each site: fetch all pages (paginated)
 *   3. For each page: fetch all fields (with 100ms delay)
 *   4. Run pattern matcher on both value and jsonValue of each field
 *   5. After all pages: batch HTTP status check all unique URLs
 *   6. Apply statuses and calculate risk levels
 *   7. Return final ScanRecord[]
 *
 * Error handling: single page/site failures are logged and skipped —
 * the full scan is never aborted by a single failure.
 *
 * @param config      - Sites, language, and sitecoreContextId
 * @param client      - Initialized Marketplace SDK ClientSDK instance
 * @param onProgress  - Callback invoked after every page scanned
 * @returns           - Final ScanRecord[] with http_status and risk_level set
 */
export async function runScan(
  config: ScanConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  onProgress: (progress: ScanProgress) => void
): Promise<ScanRecord[]> {
  const allRecords: ScanRecord[] = [];

  // Step 1 — fetch & filter sites via REST (siteInfoCollection is not on Edge preview schema)
  console.log('[scanner] runScan config:', config);
  const allSites = await fetchSitesViaRest(client, config.sitecoreContextId);
  const sites = allSites.filter((s) =>
    config.selectedSites.includes(s.name)
  );
  console.log(`[scanner] sites after filter (${sites.length}):`, sites.map((s) => `${s.name} → ${s.rootPath}`));

  // We don't know total pages up front — update as we discover them
  let pagesScanned = 0;
  let totalPages = 0;

  // Step 2 — per site
  for (const site of sites) {
    let sitePages: PageItem[] = [];

    console.group(`[scanner] site: ${site.name} (homeId: ${site.homeId})`);
    try {
      sitePages = await fetchAllPages(
        client,
        config.sitecoreContextId,
        site.homeId,
        config.language,
        site.name
      );
    } catch (err) {
      console.error(
        `[scanner] Failed to fetch pages for site "${site.name}":`,
        err
      );
      console.groupEnd();
      continue; // skip site, don't abort
    }

    console.log(`[scanner] pages found: ${sitePages.length}`, sitePages.map((p) => p.name));
    totalPages += sitePages.length;

    // Step 3 — per page
    for (const page of sitePages) {
      try {
        await delay(RATE_LIMIT_MS);

        const pageData = await xmcQuery(
          client,
          config.sitecoreContextId,
          GET_PAGE_FIELDS,
          { id: normalizeItemId(page.id), language: page.language }
        );

        // rendered is the full layout service JSON — it contains every
        // component on the page and all field values from datasource items.
        const rendered: unknown = pageData?.item?.rendered;
        const componentFields = extractComponentFields(rendered);

        console.log(`[scanner] page "${page.name}" — ${componentFields.length} component field(s) from rendered`);

        // Step 4 — scan each component field for DAM URLs
        let pageMatches = 0;
        for (const { label, value } of componentFields) {
          const matches = findPublicLinks(value, label);
          if (matches.length > 0) {
            console.log(`  ${label} → ${matches.length} match(es):`, matches.map((m) => m.publicLinkUrl));
          }
          for (const match of matches) {
            pageMatches++;
            // match.fieldName is "ComponentName.FieldName" — split here
            const dotIdx = match.fieldName.indexOf('.');
            const component_name =
              dotIdx > -1 ? match.fieldName.slice(0, dotIdx) : match.fieldName;
            const field_name =
              dotIdx > -1 ? match.fieldName.slice(dotIdx + 1) : '';
            allRecords.push({
              asset_id: match.assetId,
              public_link_url: match.publicLinkUrl,
              site_name: page.siteName,
              page_name: page.name,
              page_path: page.path,
              component_name,
              field_name,
              http_status: null,
              risk_level: 'Unknown',
              language: page.language,
              scanned_at: new Date().toISOString(),
            });
          }
        }
        if (pageMatches === 0) {
          console.log(`  (no DAM links found on this page)`);
        }
      } catch (err) {
        console.error(
          `[scanner] Failed to scan page "${page.id}" (${page.path}):`,
          err
        );
        // skip page, don't abort
      }

      pagesScanned++;
      onProgress({
        currentSite: site.name,
        currentPage: page.name,
        pagesScanned,
        totalPages,
      });
    }

    console.groupEnd(); // site group
  }

  // Step 5 — batch HTTP status checks for all unique URLs
  const uniqueUrls = [
    ...new Set(allRecords.map((r) => r.public_link_url)),
  ];
  const statusMap = await checkHttpStatuses(uniqueUrls);

  // Step 6 — apply statuses
  for (const record of allRecords) {
    record.http_status = statusMap.get(record.public_link_url) ?? null;
  }

  // Step 7 — calculate risk levels and return
  const final = calculateRiskLevels(allRecords);
  console.log(`[scanner] scan complete — ${final.length} total record(s)`);
  return final;
}
