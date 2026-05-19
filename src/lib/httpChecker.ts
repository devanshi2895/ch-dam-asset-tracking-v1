/**
 * Calls the server-side /api/check-status route to perform HEAD requests.
 * Using a server route avoids CORS issues with external asset domains.
 *
 * @param urls - Array of public link URLs to check
 * @returns Map<url, statusCode> — unknown URLs get status 0
 */
export async function checkHttpStatuses(
  urls: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!urls.length) return result;

  try {
    const response = await fetch('/api/check-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      console.error('[httpChecker] /api/check-status returned', response.status);
      urls.forEach((url) => result.set(url, 0));
      return result;
    }

    const data: { results: { url: string; status: number }[] } =
      await response.json();

    for (const { url, status } of data.results) {
      result.set(url, status);
    }
  } catch (err) {
    console.error('[httpChecker] Failed to call /api/check-status:', err);
    urls.forEach((url) => result.set(url, 0));
  }

  return result;
}
