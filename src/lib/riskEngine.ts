import type { ScanRecord } from './types';
import { RISK_CRITICAL_THRESHOLD, RISK_HIGH_THRESHOLD } from './config';

/**
 * Calculates risk levels for all scan records.
 * Groups by asset_id to compute total reference counts across all sites,
 * then applies risk rules per record.
 *
 * Rules (evaluated top-to-bottom, first match wins):
 *   http_status 404 | 0 | 301 | 302 → 'Broken'
 *   totalReferences >= 15            → 'Critical'
 *   totalReferences >= 5             → 'High'
 *   totalReferences >= 1             → 'Low'
 *   default                          → 'Unknown'
 *
 * @param records - ScanRecord[] with http_status already populated
 * @returns Updated records with risk_level set on each
 */
export function calculateRiskLevels(records: ScanRecord[]): ScanRecord[] {
  // Count total references per asset_id across all sites
  const refCounts = new Map<string, number>();
  for (const record of records) {
    refCounts.set(record.asset_id, (refCounts.get(record.asset_id) ?? 0) + 1);
  }

  return records.map((record) => {
    const { http_status, asset_id } = record;
    const totalReferences = refCounts.get(asset_id) ?? 0;

    let risk_level: ScanRecord['risk_level'];

    if (
      http_status === 404 ||
      http_status === 0 ||
      http_status === 301 ||
      http_status === 302
    ) {
      risk_level = 'Broken';
    } else if (totalReferences >= RISK_CRITICAL_THRESHOLD) {
      risk_level = 'Critical';
    } else if (totalReferences >= RISK_HIGH_THRESHOLD) {
      risk_level = 'High';
    } else if (totalReferences >= 1) {
      risk_level = 'Low';
    } else {
      risk_level = 'Unknown';
    }

    return { ...record, risk_level };
  });
}
