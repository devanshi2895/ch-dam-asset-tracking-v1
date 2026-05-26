import * as XLSX from 'xlsx';
import type { ScanRecord } from './types';

/** Converts CamelCase to "Camel Case" for taxonomy labels. */
function toHumanReadable(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/** Extracts the Content Hub asset identifier from a public link URL. */
function extractIdentifierFromUrl(url: string): string {
  const m = /\/api\/public\/content\/([a-zA-Z0-9_\-]+)/.exec(url);
  if (m) return m[1];
  const m2 = /\/m=p\/([a-zA-Z0-9_\-]+)/.exec(url);
  if (m2) return m2[1];
  return '';
}

function buildSheet(
  rows: unknown[][],
  headers: string[]
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const colWidths = headers.map((h, colIdx) => {
    const maxLen = rows.reduce(
      (max, row) => Math.max(max, String(row[colIdx] ?? '').length),
      h.length
    );
    return { wch: Math.min(maxLen + 2, 80) };
  });
  ws['!cols'] = colWidths;
  headers.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[cellRef]) ws[cellRef].s = { font: { bold: true } };
  });
  return ws;
}

/**
 * Generates an Excel workbook from scan records.
 *
 * Sheet 1 "ComponentName" — unique component taxonomy entries
 * Sheet 2 "PageName"      — unique page taxonomy entries
 * Sheet 3 "M.Asset"       — one row per ScanRecord (Content Hub import format)
 */
export function generateExcelBuffer(records: ScanRecord[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------------------
  // Sheet 1: ComponentName
  // -------------------------------------------------------------------------
  const uniqueComponents = [
    ...new Set(records.map((r) => r.component_name).filter(Boolean)),
  ].sort();

  const compRows = uniqueComponents.map((name) => [
    `ComponentName.${name}`,
    toHumanReadable(name),
    toHumanReadable(name),
  ]);

  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(compRows, ['identifier', 'TaxonomyName', 'TaxonomyLabel']),
    'ComponentName'
  );

  // -------------------------------------------------------------------------
  // Sheet 2: PageName
  // -------------------------------------------------------------------------
  const uniquePages = [
    ...new Set(records.map((r) => r.page_name).filter(Boolean)),
  ].sort();

  const pageRows = uniquePages.map((name) => [
    `PageName.${name.replace(/\s+/g, '')}`,
    toHumanReadable(name),
    toHumanReadable(name),
  ]);

  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(pageRows, ['identifier', 'TaxonomyName', 'TaxonomyLabel']),
    'PageName'
  );

  // -------------------------------------------------------------------------
  // Sheet 3: M.Asset
  // -------------------------------------------------------------------------
  const ASSET_HEADERS = [
    'id',
    'identifier',
    'page_name',
    'ComponentNameToAsset',
    'status',
  ];

  // Group active/new records by identifier — one row per unique asset,
  // with PageName.* and ComponentName.* values joined by | when reused.
  interface AssetGroup {
    asset_id: string;
    identifier: string;
    pageNames: Set<string>;
    componentNames: Set<string>;
    hasNew: boolean;
  }

  const activeGroups = new Map<string, AssetGroup>();
  const removedGroups = new Map<string, { asset_id: string; identifier: string }>();

  for (const r of records) {
    const key = r.identifier ?? r.asset_id;
    const resolvedId = r.identifier ?? extractIdentifierFromUrl(r.public_link_url);
    if (r.status === 'Removed') {
      if (!removedGroups.has(key)) {
        removedGroups.set(key, { asset_id: r.asset_id, identifier: resolvedId });
      }
    } else {
      if (!activeGroups.has(key)) {
        activeGroups.set(key, {
          asset_id: r.asset_id,
          identifier: resolvedId,
          pageNames: new Set(),
          componentNames: new Set(),
          hasNew: false,
        });
      }
      const g = activeGroups.get(key)!;
      if (r.page_name) g.pageNames.add(`PageName.${r.page_name.replace(/\s+/g, '')}`);
      if (r.component_name) g.componentNames.add(`ComponentName.${r.component_name}`);
      if (r.status === 'New') g.hasNew = true;
    }
  }

  const assetRows: unknown[][] = [
    ...[...activeGroups.values()].map((g) => [
      g.asset_id,
      g.identifier,
      [...g.pageNames].join('|'),
      [...g.componentNames].join('|'),
      g.hasNew ? 'New' : 'Active',
    ]),
    ...[...removedGroups.values()].map((g) => [
      g.asset_id,
      g.identifier,
      '',
      '',
      'Removed',
    ]),
  ];

  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(assetRows, ASSET_HEADERS),
    'M.Asset'
  );

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
