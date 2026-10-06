import { NextRequest, NextResponse } from 'next/server';
import { CONTENT_HUB_BASE_URL, CONTENT_HUB_API_TOKEN } from '@/src/lib/config';

/**
 * POST /api/ch-debug
 *
 * Development-only proxy for direct Content Hub REST API calls.
 * Keeps the Bearer token server-side while letting the Debug panel
 * fire arbitrary requests and inspect raw responses.
 *
 * Body: { method: string, path: string, body?: unknown }
 * Response: { status: number, statusText: string, body: unknown }
 */
export async function POST(request: NextRequest) {
  if (!CONTENT_HUB_BASE_URL || !CONTENT_HUB_API_TOKEN) {
    return NextResponse.json(
      { error: 'Content Hub not configured. Set CONTENT_HUB_BASE_URL and CONTENT_HUB_API_TOKEN.' },
      { status: 503 },
    );
  }

  let method: string;
  let path: string;
  let requestBody: unknown;

  try {
    const parsed = await request.json() as { method?: string; path?: string; body?: unknown };
    method = (parsed.method ?? 'GET').toUpperCase();
    path = parsed.path ?? '';
    requestBody = parsed.body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  const url = `${CONTENT_HUB_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'X-Auth-Token': CONTENT_HUB_API_TOKEN,
        'Content-Type': 'application/json',
        'X-ApiVersion': '3',
      },
      body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const rawText = await res.text();
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawText);
  } catch {
    parsedBody = rawText;
  }

  return NextResponse.json({
    status: res.status,
    statusText: res.statusText,
    body: parsedBody,
  });
}
