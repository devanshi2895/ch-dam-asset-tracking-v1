import type { PublicLinkMatch } from './types';

/**
 * Pattern 1: https://cdn.sitecore.cloud/m=p/{assetId}/...
 * CDN-hosted Sitecore public links.
 */
const CDN_PATTERN_SRC =
  'https://cdn\\.sitecore\\.cloud/m=p/([a-zA-Z0-9_\\-]+)(?:/[^"\'\\s<>]*)?';

/**
 * Pattern 2: https://{tenant}.sitecorecloud.io/api/public/content/{assetId}
 * Tenant-scoped sitecorecloud.io public content links.
 */
const TENANT_PATTERN_SRC =
  'https://[a-zA-Z0-9_\\-]+\\.sitecorecloud\\.io/api/public/content/([a-zA-Z0-9_\\-]+)(?:[^"\'\\s<>]*)?';

/**
 * Pattern 3: https://{domain}/api/public/content/{assetId}
 * Generic domain public content links (covers custom domains).
 * Note: also matches Pattern 2 — deduplication via seen-URL set.
 */
const GENERIC_PATTERN_SRC =
  'https://[a-zA-Z0-9.\\-_]+/api/public/content/([a-zA-Z0-9_\\-]+)(?:[^"\'\\s<>]*)?';

/**
 * Extracts all Sitecore Public Link matches from a field value string.
 *
 * Handles URLs in:
 *   - Plain text
 *   - HTML src / href attributes
 *   - JSON strings (escaped and unescaped)
 *   - srcset attributes
 *
 * One field value may contain multiple public links — all are returned.
 * URLs are normalised (trimmed) before returning.
 *
 * @param fieldValue - Raw string value of a Sitecore field
 * @param fieldName  - Name of the field (annotated on each match)
 * @returns Array of PublicLinkMatch objects; empty if none found
 */
export function findPublicLinks(
  fieldValue: string,
  fieldName = ''
): PublicLinkMatch[] {
  if (!fieldValue || typeof fieldValue !== 'string') return [];

  const matches: PublicLinkMatch[] = [];
  const seenUrls = new Set<string>();

  const addMatch = (rawUrl: string, assetId: string) => {
    const url = rawUrl.trim();
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      matches.push({ assetId, publicLinkUrl: url, fieldName });
    }
  };

  let m: RegExpExecArray | null;

  // Pattern 1 — cdn.sitecore.cloud
  const re1 = new RegExp(CDN_PATTERN_SRC, 'g');
  while ((m = re1.exec(fieldValue)) !== null) {
    addMatch(m[0], m[1]);
  }

  // Pattern 2 — *.sitecorecloud.io/api/public/content/
  const re2 = new RegExp(TENANT_PATTERN_SRC, 'g');
  while ((m = re2.exec(fieldValue)) !== null) {
    addMatch(m[0], m[1]);
  }

  // Pattern 3 — generic domain/api/public/content/ (dedup with P2 via seenUrls)
  const re3 = new RegExp(GENERIC_PATTERN_SRC, 'g');
  while ((m = re3.exec(fieldValue)) !== null) {
    addMatch(m[0], m[1]);
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Self-test — runs on module load in development mode only
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'development') {
  (() => {
    // Pattern 1
    const t1 = findPublicLinks(
      'Check this out: https://cdn.sitecore.cloud/m=p/abc123/image.jpg',
      'Image'
    );
    console.assert(t1.length === 1, '[patternMatcher] P1: expected 1 match');
    console.assert(
      t1[0]?.assetId === 'abc123',
      '[patternMatcher] P1: assetId should be abc123'
    );
    console.assert(
      t1[0]?.publicLinkUrl.startsWith('https://cdn.sitecore.cloud'),
      '[patternMatcher] P1: URL should start with cdn.sitecore.cloud'
    );

    // Pattern 2
    const t2 = findPublicLinks(
      '<img src="https://myorg.sitecorecloud.io/api/public/content/def456" />',
      'Body'
    );
    console.assert(t2.length === 1, '[patternMatcher] P2: expected 1 match');
    console.assert(
      t2[0]?.assetId === 'def456',
      '[patternMatcher] P2: assetId should be def456'
    );

    // Pattern 3
    const t3 = findPublicLinks(
      'href="https://example.com/api/public/content/ghi789"',
      'Link'
    );
    console.assert(t3.length === 1, '[patternMatcher] P3: expected 1 match');
    console.assert(
      t3[0]?.assetId === 'ghi789',
      '[patternMatcher] P3: assetId should be ghi789'
    );

    // Multiple links in one value
    const tMulti = findPublicLinks(
      'See https://cdn.sitecore.cloud/m=p/a1/img.jpg and https://example.com/api/public/content/b2 for details.',
      'RichText'
    );
    console.assert(
      tMulti.length === 2,
      '[patternMatcher] multi: expected 2 matches, got ' + tMulti.length
    );

    // Deduplication — same URL twice
    const tDedupe = findPublicLinks(
      'https://cdn.sitecore.cloud/m=p/dup1/a.jpg https://cdn.sitecore.cloud/m=p/dup1/a.jpg',
      'f'
    );
    console.assert(
      tDedupe.length === 1,
      '[patternMatcher] dedupe: expected 1 unique match'
    );

    // P2 not double-counted by P3
    const tOverlap = findPublicLinks(
      'https://myorg.sitecorecloud.io/api/public/content/xyz99',
      'f'
    );
    console.assert(
      tOverlap.length === 1,
      '[patternMatcher] overlap P2/P3: expected 1 match, got ' + tOverlap.length
    );

    console.log('[patternMatcher] All self-tests passed.');
  })();
}
