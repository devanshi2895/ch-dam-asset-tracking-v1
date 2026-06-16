import { NextRequest, NextResponse } from 'next/server';
import { runBulkUpdate } from '@/src/lib/contentHubUpdater';
import {
  CONTENT_HUB_BASE_URL,
  CONTENT_HUB_API_TOKEN,
  CH_UPDATE_BATCH_SIZE,
  CONTENT_HUB_PAGE_FIELD,
  CONTENT_HUB_COMPONENT_FIELD,
  CONTENT_HUB_PAGE_DEFINITION,
  CONTENT_HUB_COMPONENT_DEFINITION,
  CONTENT_HUB_CREATE_TAXONOMY,
  SCANNER_BATCH_DELAY_MS,
} from '@/src/lib/config';
import type { ScanRecord } from '@/src/lib/types';

/**
 * POST /api/ch-update
 *
 * Body: { records: ScanRecord[] }
 *
 * Groups records by asset_id, builds a Content Hub REST Bulk API payload,
 * and sends batched PUT /api/entities/{id} operations to update the
 * PageNameToAsset and ComponentNameToAsset taxonomy relations.
 *
 * Returns: BulkUpdateResult { updated, skipped, failed, errors[] }
 */
export async function POST(request: NextRequest) {
  if (!CONTENT_HUB_BASE_URL || !CONTENT_HUB_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          'Content Hub not configured. Set CONTENT_HUB_BASE_URL and CONTENT_HUB_API_TOKEN in your environment.',
      },
      { status: 503 },
    );
  }

  let records: ScanRecord[];
  try {
    const body: unknown = await request.json();
    records = Array.isArray((body as Record<string, unknown>)?.records)
      ? ((body as Record<string, ScanRecord[]>).records as ScanRecord[])
      : [];
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!records.length) {
    return NextResponse.json({ error: 'No records provided' }, { status: 400 });
  }

  const result = await runBulkUpdate(records, {
    chBaseUrl: CONTENT_HUB_BASE_URL,
    chToken: CONTENT_HUB_API_TOKEN,
    batchSize: CH_UPDATE_BATCH_SIZE,
    pageField: CONTENT_HUB_PAGE_FIELD,
    componentField: CONTENT_HUB_COMPONENT_FIELD,
    pageDefinition: CONTENT_HUB_PAGE_DEFINITION,
    componentDefinition: CONTENT_HUB_COMPONENT_DEFINITION,
    createMissingTaxonomy: CONTENT_HUB_CREATE_TAXONOMY,
    batchDelayMs: SCANNER_BATCH_DELAY_MS,
  });

  return NextResponse.json(result);
}
