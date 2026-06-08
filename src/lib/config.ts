/**
 * Central configuration — all tuneable constants are derived from environment
 * variables here. Consuming modules import named exports; no magic strings or
 * literals should appear elsewhere.
 *
 * Server-only vars (no NEXT_PUBLIC_ prefix) are safe for API routes and
 * server components. Client-visible vars require the NEXT_PUBLIC_ prefix.
 */

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// Scanner (server-side only)
// ---------------------------------------------------------------------------

/** Pages fetched concurrently per batch — balances speed vs Edge rate limits */
export const SCANNER_PAGE_BATCH_SIZE = int(
  process.env.SCANNER_PAGE_BATCH_SIZE,
  5
);

/** Delay between page-fetch batches (ms) — keeps bursts within Edge limits */
export const SCANNER_BATCH_DELAY_MS = int(
  process.env.SCANNER_BATCH_DELAY_MS,
  300
);

// ---------------------------------------------------------------------------
// GraphQL (client-side — used in query string template literals)
// ---------------------------------------------------------------------------

/** Number of pages returned per GraphQL search page (Edge complexity budget) */
export const GRAPHQL_PAGE_SIZE = int(
  process.env.NEXT_PUBLIC_GRAPHQL_PAGE_SIZE,
  50
);

// ---------------------------------------------------------------------------
// Risk engine (server-side only)
// ---------------------------------------------------------------------------

/** Minimum reference count to be classified as Critical risk */
export const RISK_CRITICAL_THRESHOLD = int(
  process.env.RISK_CRITICAL_THRESHOLD,
  15
);

/** Minimum reference count to be classified as High risk */
export const RISK_HIGH_THRESHOLD = int(process.env.RISK_HIGH_THRESHOLD, 5);

// ---------------------------------------------------------------------------
// UI defaults (client-side)
// ---------------------------------------------------------------------------

/** Default language code shown in the language input on first load */
export const DEFAULT_LANGUAGE =
  process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE?.trim() || 'en';

/** Set to 'true' to show the Debug tab in the UI (default: hidden) */
export const SHOW_DEBUG_PANEL =
  process.env.NEXT_PUBLIC_SHOW_DEBUG_PANEL?.trim() === 'true';

// ---------------------------------------------------------------------------
// Content Hub
// ---------------------------------------------------------------------------

/**
 * Base URL of the Content Hub instance, e.g. https://acme.stylelabs.io
 * Used when making direct CH API calls (asset metadata, relation imports).
 * No trailing slash.
 */
export const CONTENT_HUB_BASE_URL =
  process.env.CONTENT_HUB_BASE_URL?.replace(/\/$/, '') ?? '';

/**
 * Content Hub API token (OAuth client credentials or personal access token).
 * Server-side only — never use NEXT_PUBLIC_ for tokens.
 */
export const CONTENT_HUB_API_TOKEN =
  process.env.CONTENT_HUB_API_TOKEN?.trim() ?? '';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Filename prefix for the downloaded Excel file */
export const EXPORT_FILENAME_PREFIX =
  process.env.NEXT_PUBLIC_EXPORT_FILENAME_PREFIX?.trim() || 'xmc-public-links';
