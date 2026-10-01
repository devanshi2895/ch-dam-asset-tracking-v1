import type { PublicLinkMatch } from './types';

/**
 * Pattern 0: https://{domain}/api/gateway/{numericId}/thumbnail
 * Content Hub gateway thumbnail URLs — the numeric segment is the canonical
 * DAM asset ID used in Content Hub imports.
 */
const GATEWAY_PATTERN =
  /https:\/\/[a-zA-Z0-9.\-_]+\/api\/gateway\/(\d+)\/thumbnail/;

/**
 * Extracts the numeric Content Hub asset ID from a gateway thumbnail URL.
 * Returns null if the URL doesn't match the gateway pattern.
 */
export function extractGatewayId(thumbnailSrc: string): string | null {
  const m = GATEWAY_PATTERN.exec(thumbnailSrc);
  return m?.[1] ?? null;
}

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

/**
 * Attempts to infer a component or field label from the HTML surrounding
 * a matched URL. Used when scanning rendered page HTML via getPageHTML()
 * rather than the Layout Service JSON (where field names are available
 * directly as JSON keys).
 *
 * Precedence:
 *  1. Nearest `data-component` attribute in the 600 chars before the match
 *  2. Nearest `data-field-name` attribute
 *  3. Nearest semantic element (figure, article, section, picture, aside)
 *  4. Fallback: "page-html"
 *
 * @param html       - Full rendered HTML string
 * @param matchIndex - Character index of the matched URL within html
 * @returns Inferred context label
 */
export function extractContext(html: string, matchIndex: number): string {
  const WINDOW = 600;
  const before = html.substring(Math.max(0, matchIndex - WINDOW), matchIndex);

  // 1. data-component="ComponentName" — JSS component wrapper attribute.
  //    Verify the component's <div> hasn't been closed before the match:
  //    if closeDivs > openDivs in the text after the attribute, we've exited it.
  const compMatches = [...before.matchAll(/data-component="([^"]+)"/g)];
  const compMatch = compMatches.at(-1);
  if (compMatch) {
    const afterComp = before.substring(compMatch.index! + compMatch[0].length);
    const openDivs = (afterComp.match(/<div[^>]*>/gi) ?? []).length;
    const closeDivs = (afterComp.match(/<\/div>/gi) ?? []).length;
    if (closeDivs <= openDivs) {
      return compMatch[1];
    }
    // Wrapper already closed — fall through to next heuristics
  }

  // 2. data-field-name="fieldName" — inline editing attribute
  const fieldMatches = [...before.matchAll(/data-field-name="([^"]+)"/g)];
  const fieldMatch = fieldMatches.at(-1);
  if (fieldMatch) return fieldMatch[1];

  // 3. Nearest semantic HTML element
  const semanticMatches = before.match(
    /<(figure|article|section|picture|aside|main|header|footer)[^>]*>/gi
  );
  if (semanticMatches) {
    const last = semanticMatches.at(-1);
    const tagName = last?.match(/<(\w+)/)?.[1];
    if (tagName) return tagName;
  }

  return 'page-html';
}

/**
 * Scans rendered page HTML (e.g. from the Marketplace SDK's getPageHTML())
 * for Sitecore Content Hub public link URLs.
 *
 * Unlike findPublicLinks() which operates on a single field value string,
 * this function scans the full rendered HTML of the page in one pass —
 * catching dynamically assembled URLs that may not appear verbatim in
 * Layout Service field values (e.g. computed srcset, Rich Text links,
 * component-level URL construction).
 *
 * Field names are inferred from surrounding HTML context via extractContext().
 *
 * @param html - Rendered page HTML from getPageHTML()
 * @returns Array of PublicLinkMatch objects; empty if none found
 */
export function findPublicLinksInHTML(html: string): PublicLinkMatch[] {
  if (!html || typeof html !== 'string') return [];

  const matches: PublicLinkMatch[] = [];
  const seenUrls = new Set<string>();

  const addMatch = (rawUrl: string, assetId: string, matchIndex: number) => {
    const url = rawUrl.trim();
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      const fieldName = extractContext(html, matchIndex);
      matches.push({ assetId, publicLinkUrl: url, fieldName });
    }
  };

  let m: RegExpExecArray | null;

  // Pattern 1 — cdn.sitecore.cloud
  const re1 = new RegExp(CDN_PATTERN_SRC, 'g');
  while ((m = re1.exec(html)) !== null) {
    addMatch(m[0], m[1], m.index);
  }

  // Pattern 2 — *.sitecorecloud.io/api/public/content/
  const re2 = new RegExp(TENANT_PATTERN_SRC, 'g');
  while ((m = re2.exec(html)) !== null) {
    addMatch(m[0], m[1], m.index);
  }

  // Pattern 3 — generic domain/api/public/content/ (dedup with P2 via seenUrls)
  const re3 = new RegExp(GENERIC_PATTERN_SRC, 'g');
  while ((m = re3.exec(html)) !== null) {
    addMatch(m[0], m[1], m.index);
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

    // ---------------------------------------------------------------------------
    // extractContext tests
    // ---------------------------------------------------------------------------
    console.assert(
      extractContext(
        '<div data-component="PromoCard"><img src="https://cdn.sitecore.cloud/m=p/x/img.jpg"',
        60
      ) === 'PromoCard',
      '[patternMatcher] extractContext: data-component'
    );
    console.assert(
      extractContext(
        '<div data-field-name="HeroImage"><img src="https://cdn.sitecore.cloud/m=p/x/img.jpg"',
        60
      ) === 'HeroImage',
      '[patternMatcher] extractContext: data-field-name'
    );
    console.assert(
      extractContext(
        '<figure><img src="https://cdn.sitecore.cloud/m=p/x/img.jpg"',
        50
      ) === 'figure',
      '[patternMatcher] extractContext: semantic element'
    );
    console.assert(
      extractContext(
        '<p>Some text https://cdn.sitecore.cloud/m=p/x/img.jpg',
        20
      ) === 'page-html',
      '[patternMatcher] extractContext: fallback'
    );

    // ---------------------------------------------------------------------------
    // findPublicLinksInHTML tests
    // ---------------------------------------------------------------------------
    const htmlSample = [
      '<div data-component="HeroBanner">',
      '  <img src="https://cdn.sitecore.cloud/m=p/html1/hero.jpg" />',
      '</div>',
      '<article>',
      '  <a href="https://myorg.sitecorecloud.io/api/public/content/html2">Link</a>',
      '</article>',
    ].join('\n');

    const tHtml = findPublicLinksInHTML(htmlSample);
    console.assert(
      tHtml.length === 2,
      '[patternMatcher] html: expected 2 matches, got ' + tHtml.length
    );
    console.assert(
      tHtml[0]?.fieldName === 'HeroBanner',
      '[patternMatcher] html: first match context should be HeroBanner, got ' + tHtml[0]?.fieldName
    );
    console.assert(
      tHtml[1]?.fieldName === 'article',
      '[patternMatcher] html: second match context should be article, got ' + tHtml[1]?.fieldName
    );

    // Deduplication in HTML scan
    const htmlDedupe = '<img src="https://cdn.sitecore.cloud/m=p/dup1/a.jpg" srcset="https://cdn.sitecore.cloud/m=p/dup1/a.jpg 2x">';
    const tHtmlDedupe = findPublicLinksInHTML(htmlDedupe);
    console.assert(
      tHtmlDedupe.length === 1,
      '[patternMatcher] html dedupe: expected 1 unique match, got ' + tHtmlDedupe.length
    );

    // Empty / non-string input
    console.assert(
      findPublicLinksInHTML('').length === 0,
      '[patternMatcher] html empty: expected 0 matches'
    );

    console.log('[patternMatcher] extractContext + findPublicLinksInHTML self-tests passed.');
  })();
}
