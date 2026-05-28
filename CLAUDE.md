# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (experimental HTTPS)
npm run build    # Build for production
npm run lint     # ESLint check
npm run format   # Prettier format
```

No test suite is configured.

## What This App Does

A Sitecore Marketplace standalone extension that scans an XM Cloud instance via Experience Edge GraphQL to find all DAM Public Link asset references across pages. Results are displayed in a filterable table and exported to a 3-sheet Excel workbook formatted for Sitecore Content Hub import (taxonomy + asset mapping sheets).

## Architecture

### Data Flow

1. **Connect** — User selects tenant via `@sitecore-marketplace-sdk/client`; sites load via `scanner.ts → getSites()`
2. **Scan** — `scanner.ts → scanSites()` fetches all pages per site (cursor-paginated GraphQL), extracts public link URLs by walking the layout service `rendered` JSON field
3. **HTTP Check** — `httpChecker.ts` calls `/api/check-status` (server-side HEAD requests, batched)
4. **Delta** — `deltaTracker.ts` diffs against prior scan baseline in `localStorage` → marks records New/Active/Removed
5. **Export** — `excelExporter.ts` generates the XLSX buffer; `/api/export` streams it as a file download

### Key Files

| File | Purpose |
|---|---|
| `src/lib/scanner.ts` | Main scan orchestrator; calls GraphQL, walks JSON, calls pattern matcher |
| `src/lib/patternMatcher.ts` | Regex detection for 3 CDN URL formats + Content Hub Gateway URLs |
| `src/lib/queries.ts` | GraphQL query strings (`GET_PAGES_FOR_SITE`, `GET_PAGE_FIELDS`) |
| `src/lib/excelExporter.ts` | XLSX workbook builder (3 sheets: ComponentName, PageName, M.Asset) |
| `src/lib/deltaTracker.ts` | localStorage baseline compare; produces New/Active/Removed status |
| `src/lib/riskEngine.ts` | Risk level logic (Broken → Critical → High → Low) |
| `src/lib/types.ts` | All shared TypeScript interfaces |
| `src/app/api/check-status/route.ts` | Server-side HEAD requests with AbortController timeout |
| `src/app/api/export/route.ts` | Excel download endpoint; handles both JSON body and form POST (iframe sandbox workaround) |
| `src/app/standalone-extension/page.tsx` | Root UI: tabbed (Connect / Scan / Results / Debug) |
| `src/context/TenantContext.tsx` | Tenant state management |

### GraphQL

All queries run through `client.mutate('xmc.preview.graphql', {...})` from the Marketplace SDK — no direct Edge API calls. Auth is handled entirely by the SDK. Queries use cursor-based pagination (`after` / `endCursor`).

### Excel Export Structure

- **Sheet 1 `ComponentName`**: `identifier | TaxonomyName | TaxonomyLabel` — unique component.field pairs
- **Sheet 2 `PageName`**: `identifier | TaxonomyName | TaxonomyLabel` — unique page names (no spaces in identifier)
- **Sheet 3 `M.Asset`**: `id | identifier | page_name | ComponentNameToAsset | status` — one row per unique asset; multi-page references are pipe-separated

Column order in `M.Asset` is fixed for Content Hub Step 2 import compatibility.

### `/api/export` Download Workaround

The app runs inside a sandboxed Marketplace iframe. Direct `<a href>` downloads are blocked. The export endpoint accepts both JSON POST (returns binary immediately) and HTML form POST with `target="_blank"` (opens a new tab, bypassing the sandbox restriction).

## Environment Variables

All have defaults; `.env.local` is optional.

| Variable | Default | Notes |
|---|---|---|
| `SCANNER_PAGE_BATCH_SIZE` | `5` | Concurrent pages per batch |
| `SCANNER_BATCH_DELAY_MS` | `300` | Delay between batches (ms) |
| `NEXT_PUBLIC_GRAPHQL_PAGE_SIZE` | `50` | Pages per GraphQL request |
| `CHECK_STATUS_BATCH_SIZE` | `20` | Concurrent HEAD requests |
| `CHECK_STATUS_TIMEOUT_MS` | `5000` | HEAD request timeout (ms) |
| `RISK_CRITICAL_THRESHOLD` | `15` | Min refs for "Critical" |
| `RISK_HIGH_THRESHOLD` | `5` | Min refs for "High" |
| `NEXT_PUBLIC_DEFAULT_LANGUAGE` | `"en"` | Language on load |
| `NEXT_PUBLIC_EXPORT_FILENAME_PREFIX` | `"xmc-public-links"` | Excel filename prefix |
| `CONTENT_HUB_BASE_URL` | — | Optional; Content Hub instance URL (no trailing slash) |
| `CONTENT_HUB_API_TOKEN` | — | Optional; server-side only |

## Code Style

- **Prettier**: single quotes, CRLF, 2-space indent, 100-char line width, trailing commas (ES5)
- **ESLint**: `next/core-web-vitals` + `next/typescript`; no `any`, no unused vars
- No CSS Modules or inline styles — Tailwind CSS only
- No test infrastructure; no SWR or React Query; no database — in-memory export state only
