import * as XLSX from 'xlsx';
import type { ScanRecord } from './types';

/** Formats an ISO datetime string to YYYY-MM-DD HH:mm:ss */
function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Generates an Excel workbook from scan records.
 *
 * Sheet 1 "Public Link Usage" — one row per ScanRecord in fixed column order
 * (columns match the Content Hub Step 2 import format exactly).
 *
 * Sheet 2 "Summary" — aggregated counts.
 *
 * @param records - ScanRecord[] to export
 * @returns Uint8Array of the .xlsx file binary
 */
export function generateExcelBuffer(records: ScanRecord[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------------------
  // Sheet 1: Public Link Usage
  // -------------------------------------------------------------------------
  const HEADERS = [
    'asset_id',
    'public_link_url',
    'site_name',
    'page_name',
    'page_path',
    'component_name',
    'field_name',
    'http_status',
    'risk_level',
    'language',
    'scanned_at',
  ];

  type RowTuple = [
    string, string, string, string, string,
    string, string, number | string, string, string, string,
  ];

  const dataRows: RowTuple[] = records.map((r) => [
    r.asset_id,
    r.public_link_url,
    r.site_name,
    r.page_name,
    r.page_path,
    r.component_name,
    r.field_name,
    r.http_status ?? '',
    r.risk_level,
    r.language,
    formatDateTime(r.scanned_at),
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]);

  // Freeze top row
  ws1['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Auto-width: derive from content max length
  const colWidths = HEADERS.map((h, colIdx) => {
    const maxLen = dataRows.reduce(
      (max, row) => Math.max(max, String(row[colIdx] ?? '').length),
      h.length
    );
    return { wch: Math.min(maxLen + 2, 80) };
  });
  ws1['!cols'] = colWidths;

  // Bold header cells
  HEADERS.forEach((_, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws1[cellRef]) {
      ws1[cellRef].s = { font: { bold: true } };
    }
  });

  XLSX.utils.book_append_sheet(wb, ws1, 'Public Link Usage');

  // -------------------------------------------------------------------------
  // Sheet 2: Summary
  // -------------------------------------------------------------------------
  const sites = new Set(records.map((r) => r.site_name));
  const uniquePages = new Set(records.map((r) => r.page_path)).size;
  const uniqueAssets = new Set(records.map((r) => r.asset_id)).size;
  const uniqueComponents = new Set(records.map((r) => r.component_name).filter(Boolean)).size;
  const brokenLinks = records.filter(
    (r) =>
      r.http_status === 404 ||
      r.http_status === 0 ||
      r.http_status === 301 ||
      r.http_status === 302
  ).length;
  const criticalAssets = new Set(
    records.filter((r) => r.risk_level === 'Critical').map((r) => r.asset_id)
  ).size;
  const highRiskAssets = new Set(
    records.filter((r) => r.risk_level === 'High').map((r) => r.asset_id)
  ).size;

  const scanDate = records[0]
    ? formatDateTime(records[0].scanned_at)
    : new Date().toISOString().split('T')[0];

  const summaryRows = [
    ['Metric', 'Value'],
    ['Pages with Assets', uniquePages],
    ['Unique Assets', uniqueAssets],
    ['Components Using Assets', uniqueComponents],
    ['Total References', records.length],
    ['Broken Links', brokenLinks],
    ['Critical Assets', criticalAssets],
    ['High Risk Assets', highRiskAssets],
    ['Sites Scanned', sites.size],
    ['Scan Date', scanDate],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 26 }, { wch: 22 }];

  // Bold header row
  ['A1', 'B1'].forEach((ref) => {
    if (ws2[ref]) ws2[ref].s = { font: { bold: true } };
  });

  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
