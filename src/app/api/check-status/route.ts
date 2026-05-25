import { NextRequest, NextResponse } from 'next/server';
import { CHECK_STATUS_BATCH_SIZE, CHECK_STATUS_TIMEOUT_MS } from '@/src/lib/config';

interface CheckResult {
  url: string;
  status: number;
}

/**
 * Performs a HEAD request for a single URL with a 5-second timeout.
 * redirect: 'manual' captures 301/302 responses as-is rather than following.
 * Returns status 0 on timeout, network error, or invalid URL.
 */
async function headRequest(url: string): Promise<CheckResult> {
  // Basic URL validation before attempting the request
  try {
    new URL(url);
  } catch {
    return { url, status: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_STATUS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
    });
    return { url, status: res.status };
  } catch {
    return { url, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/check-status
 *
 * Body: { urls: string[] }
 *
 * Runs HEAD requests in batches of 20 concurrent requests.
 * Returns: { results: { url: string, status: number }[] }
 *
 * Status 0 means timeout or network error.
 * Uses server-side execution to avoid CORS issues with external domains.
 */
export async function POST(request: NextRequest) {
  let urls: string[] = [];

  try {
    const body = await request.json();
    urls = Array.isArray(body?.urls) ? (body.urls as string[]) : [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const results: CheckResult[] = [];

  for (let i = 0; i < urls.length; i += CHECK_STATUS_BATCH_SIZE) {
    const batch = urls.slice(i, i + CHECK_STATUS_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(headRequest));
    results.push(...batchResults);
  }

  return NextResponse.json({ results });
}
