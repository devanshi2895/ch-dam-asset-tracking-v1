import { NextRequest, NextResponse } from 'next/server';
import { generateExcelBuffer } from '@/src/lib/excelExporter';
import { EXPORT_FILENAME_PREFIX } from '@/src/lib/config';
import type { ScanRecord } from '@/src/lib/types';

/**
 * Module-level in-memory store for the current session's scan records.
 * Populated via POST from ScanPanel after a scan completes.
 * Consumed via GET to generate and return the Excel download.
 *
 * Note: works for a persistent Node.js server process (dev + production
 * with `npm start`). Not suitable for serverless/edge deployments.
 */
let storedRecords: ScanRecord[] = [];

/**
 * POST /api/export
 *
 * Two modes depending on Content-Type:
 *
 * application/json (ScanPanel after scan):
 *   Body: { records: ScanRecord[] }
 *   Stores records in-memory for the GET endpoint.
 *   Returns: { stored: number }
 *
 * application/x-www-form-urlencoded (hidden-form download button):
 *   Body: records=<JSON string>
 *   Generates and returns the .xlsx file immediately — no stored state needed.
 *   The form uses target="_blank" so the response lands in a new top-level tab,
 *   which bypasses the cross-origin iframe allow-downloads restriction.
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const formData = await request.formData();
      const records: ScanRecord[] = JSON.parse((formData.get('records') as string | null) ?? '[]');

      if (!records.length) {
        return new NextResponse('No records to export', { status: 400 });
      }

      const buffer = generateExcelBuffer(records);
      const today = new Date().toISOString().split('T')[0];

      return new NextResponse(Buffer.from(buffer), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${EXPORT_FILENAME_PREFIX}-${today}.xlsx"`,
        },
      });
    } catch {
      return new NextResponse('Export failed', { status: 500 });
    }
  }

  // JSON: store records for GET
  try {
    const body = await request.json();
    storedRecords = Array.isArray(body?.records)
      ? (body.records as ScanRecord[])
      : [];
    return NextResponse.json({ stored: storedRecords.length });
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
}

/**
 * GET /api/export?filter=<JSON-encoded filter state>
 *
 * Optional filter keys: siteName, riskLevel, httpStatus, assetId
 * Generates a .xlsx file from stored records (optionally filtered).
 * Returns with Content-Disposition: attachment header.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filterParam = searchParams.get('filter');

  let records = storedRecords;

  if (filterParam) {
    try {
      const filter: Partial<{
        siteName: string;
        componentName: string;
        riskLevel: string;
        httpStatus: string;
        assetId: string;
      }> = JSON.parse(decodeURIComponent(filterParam));

      records = records.filter((r) => {
        if (filter.siteName && r.site_name !== filter.siteName) return false;
        if (filter.componentName && r.component_name !== filter.componentName) return false;
        if (filter.riskLevel && r.risk_level !== filter.riskLevel) return false;
        if (
          filter.httpStatus &&
          String(r.http_status ?? '') !== filter.httpStatus
        )
          return false;
        if (
          filter.assetId &&
          !r.asset_id.toLowerCase().includes(filter.assetId.toLowerCase())
        )
          return false;
        return true;
      });
    } catch {
      // Invalid filter param — fall back to all records
    }
  }

  if (!records.length) {
    return NextResponse.json(
      { error: 'No records available to export. Run a scan first.' },
      { status: 404 }
    );
  }

  const buffer = generateExcelBuffer(records);
  // Convert Uint8Array → Buffer (Node.js BodyInit-compatible) for NextResponse
  const nodeBuffer = Buffer.from(buffer);
  const today = new Date().toISOString().split('T')[0];

  return new NextResponse(nodeBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${EXPORT_FILENAME_PREFIX}-${today}.xlsx"`,
    },
  });
}
