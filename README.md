# XMC Public Link Tracker

A Sitecore Marketplace standalone extension that scans an XM Cloud instance via Experience Edge GraphQL to find all DAM Public Link asset references across pages. Results appear in a filterable table and export to a 3-sheet Excel workbook structured for Sitecore Content Hub import.

---

## What It Does

1. **Connects** to your XM Cloud tenant via the Marketplace SDK — no API keys required; auth is handled by the SDK.
2. **Loads** all sites from your XMC instance.
3. **Scans** selected sites page-by-page, inspecting every field value for Public Link and Content Hub Gateway URLs matching known patterns.
4. **Checks** HTTP liveness for every unique URL (server-side HEAD requests — no CORS issues).
5. **Calculates** risk levels based on reference count and HTTP status.
6. **Tracks deltas** against the previous scan (stored in browser `localStorage`) to surface New, Active, and Removed asset references.
7. **Exports** a 3-sheet Excel file ready for Content Hub Step 2 import.

---

## Prerequisites

- Node.js 18+
- npm 9+
- An active Sitecore XM Cloud instance
- A Sitecore Cloud Portal account with permission to register Marketplace apps

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/devanshi2895/ch-dam-asset-tracking-v1.git
cd ch-dam-asset-tracking-v1
npm install
```

### 2. Configure environment (optional)

All variables have built-in defaults — `.env.local` is only needed if you want to override them.

```bash
cp .env.example .env.local
# Edit .env.local as needed
```

### 3. Start the dev server

```bash
npm run dev
```

The app runs on `https://localhost:3000` (experimental HTTPS, required by the Marketplace SDK).

> **Important:** You cannot use this app by navigating to `localhost:3000` directly. The Marketplace SDK communicates via `postMessage` with its parent iframe host (the Sitecore Cloud Portal). You must register the app and open it through the portal — see below.

---

## Registering in Sitecore Cloud Portal

1. Log in to [Sitecore Cloud Portal](https://portal.sitecorecloud.io)
2. Go to **Marketplace → My Apps → Create App**
3. Set the **App URL** to:
   - Your deployed Vercel URL (for production), or
   - An ngrok tunnel pointing to `https://localhost:3000` (for local dev)
4. Choose **Standalone Extension** as the extension point
5. Save and install to your XMC organization

For full details see the [Marketplace developer docs](https://doc.sitecore.com/mp/en/developers/marketplace/introduction-to-sitecore-marketplace.html).

---

## Deployment (Vercel)

The project is Vercel-ready. Push to your branch and connect the repo in Vercel. The `vercel.json` at the root increases the `/api/check-status` function timeout to 30 seconds to handle slow HEAD requests.

```bash
npm run build   # verify the build locally before deploying
```

Set any required environment variable overrides in the Vercel project settings (Environment Variables tab). None are required — all default values are production-safe.

---

## How to Use

### Connect tab
Your tenant is auto-detected by the Marketplace SDK. Select it in the dropdown, set the language (default: `en`), then click **Load Sites**.

### Scan tab
Check the sites you want to scan and click **Run Scan**. Progress is shown page-by-page. A delta comparison against your previous scan runs automatically.

### Results tab
Opens automatically when the scan finishes. Use the filter bar to narrow by site, component, risk level, or HTTP status. Click **Download Excel** to export.

---

## Excel Export Reference

The export produces a 3-sheet workbook. Column order is fixed — do not reorder before importing into Content Hub.

### Sheet 1: `ComponentName`

Taxonomy sheet — one row per unique `ComponentName.FieldName` pair found during the scan.

| Column | Field | Description |
|---|---|---|
| A | `identifier` | `ComponentName.FieldName` (e.g. `Hero.BackgroundImage`) |
| B | `TaxonomyName` | Human-readable component name |
| C | `TaxonomyLabel` | Human-readable field name |

### Sheet 2: `PageName`

Taxonomy sheet — one row per unique page that contains an asset reference.

| Column | Field | Description |
|---|---|---|
| A | `identifier` | `PageName.{PageNameNoSpaces}` |
| B | `TaxonomyName` | `PageName` |
| C | `TaxonomyLabel` | Page display name |

### Sheet 3: `M.Asset`

Main import sheet — one row per unique asset.

| Column | Field | Description |
|---|---|---|
| A | `id` | Asset ID extracted from the public link URL |
| B | `identifier` | DAM `dam-id` attribute, or extracted asset ID |
| C | `page_name` | Pipe-separated `PageName.X` references (all pages using this asset) |
| D | `ComponentNameToAsset` | Pipe-separated `ComponentName.FieldName` references |
| E | `status` | `New`, `Active`, or `Removed` (delta vs. previous scan) |

---

## Delta Tracking

Each scan stores its results as a baseline in browser `localStorage` (key: `xmc-public-links-last-scan`). The next scan compares against this baseline:

| Status | Meaning |
|---|---|
| `New` | Asset reference found in current scan but not in the previous baseline |
| `Active` | Asset reference present in both current scan and baseline |
| `Removed` | Asset reference was in the baseline but is no longer found — use these rows to clean up Content Hub relations |

Clearing browser storage resets the baseline. The export always includes all three statuses so you can filter in Content Hub post-import.

---

## URL Patterns Detected

The scanner recognises three Public Link formats and one Content Hub Gateway format:

| Pattern | Example |
|---|---|
| CDN | `https://cdn.sitecore.cloud/m=p/{assetId}/...` |
| Tenant subdomain | `https://{tenant}.sitecorecloud.io/api/public/content/{assetId}` |
| Custom domain | `https://{domain}/api/public/content/{assetId}` |
| CH Gateway (thumbnail) | `https://{domain}/api/gateway/{numericId}/thumbnail` |

---

## Risk Level Logic

| Condition | Risk Level |
|---|---|
| HTTP 404, 0 (timeout/error), 301, 302 | `Broken` |
| Asset referenced ≥ 15 times | `Critical` |
| Asset referenced ≥ 5 times | `High` |
| Asset referenced ≥ 1 time | `Low` |
| No matching condition | `Unknown` |

Thresholds are configurable via `RISK_CRITICAL_THRESHOLD` and `RISK_HIGH_THRESHOLD` environment variables.

---

## Environment Variables

Copy `.env.example` to `.env.local` to override any of these. All are optional — shown values are the defaults.

| Variable | Default | Description |
|---|---|---|
| `SCANNER_PAGE_BATCH_SIZE` | `5` | Concurrent pages fetched per batch |
| `SCANNER_BATCH_DELAY_MS` | `300` | Delay between batches (ms) |
| `NEXT_PUBLIC_GRAPHQL_PAGE_SIZE` | `50` | Pages per GraphQL request (Edge complexity budget) |
| `CHECK_STATUS_BATCH_SIZE` | `20` | Concurrent HEAD requests per batch |
| `CHECK_STATUS_TIMEOUT_MS` | `5000` | HEAD request timeout (ms) |
| `RISK_CRITICAL_THRESHOLD` | `15` | Min references for "Critical" |
| `RISK_HIGH_THRESHOLD` | `5` | Min references for "High" |
| `NEXT_PUBLIC_DEFAULT_LANGUAGE` | `en` | Language pre-filled on load |
| `NEXT_PUBLIC_EXPORT_FILENAME_PREFIX` | `xmc-public-links` | Excel filename prefix |
| `CONTENT_HUB_BASE_URL` | _(empty)_ | Content Hub instance URL — no trailing slash |
| `CONTENT_HUB_API_TOKEN` | _(empty)_ | CH API token — server-side only, never use `NEXT_PUBLIC_` |

---

## Known Limitations

- **In-memory only** — scan results are not persisted server-side. Restarting the server clears any in-progress state; the browser tab must stay open during a scan.
- **One scan at a time** — concurrent scans are not supported.
- **Single language per scan** — enter one language code (e.g. `en`). Multi-language support is a planned enhancement.
- **Delta baseline is per-browser** — `localStorage` is device-local. Running scans from different machines will not share a baseline.
