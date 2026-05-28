import type { ScanRecord } from './types';

const STORAGE_KEY = 'xmc-public-links-last-scan';

export interface StoredScan {
  records: ScanRecord[];
  scanned_at: string;
}

/** Persists raw scan results (no status field) as the new baseline. */
export function saveLastScan(records: ScanRecord[]): void {
  try {
    const payload: StoredScan = {
      // Strip status before saving so we always compare against clean records
      records: records.map(({ status: _s, ...rest }) => rest as ScanRecord), // eslint-disable-line @typescript-eslint/no-unused-vars
      scanned_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in restricted iframe contexts
  }
}

/** Returns the last persisted scan, or null if none exists. */
export function loadLastScan(): StoredScan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredScan) : null;
  } catch {
    return null;
  }
}

/** Clears the stored baseline (used when the user wants a fresh start). */
export function clearLastScan(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Unique key per asset-component link.
 * asset_id + page_path (item ID) + component_name + field_name
 * covers the case where the same asset is used in multiple fields/components on one page.
 */
function linkKey(r: ScanRecord): string {
  return `${r.asset_id}|${r.page_path}|${r.component_name}|${r.field_name}`;
}

/**
 * Diffs current scan against a previous baseline.
 *
 * - Records in current only  → New
 * - Records in both          → Active
 * - Records in previous only → Removed  (appended with last-known metadata)
 *
 * Returns a combined array ready to pass to the results table and exporter.
 * If previous is empty (first scan), all records are marked Active.
 */
export function computeDelta(current: ScanRecord[], previous: ScanRecord[]): ScanRecord[] {
  if (!previous.length) {
    return current.map((r) => ({ ...r, status: 'Active' as const }));
  }

  const prevKeys = new Set(previous.map(linkKey));
  const currKeys = new Set(current.map(linkKey));

  const activeAndNew: ScanRecord[] = current.map((r) => ({
    ...r,
    status: prevKeys.has(linkKey(r)) ? ('Active' as const) : ('New' as const),
  }));

  const removed: ScanRecord[] = previous
    .filter((r) => !currKeys.has(linkKey(r)))
    .map((r) => ({ ...r, status: 'Removed' as const }));

  return [...activeAndNew, ...removed];
}
