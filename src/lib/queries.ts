/**
 * NOTE: siteInfoCollection is NOT available on the Experience Edge preview/live
 * schema. Site listing is done via the XMC App REST API (xmc.xmapp.listSites +
 * xmc.xmapp.listCollections) in scanner.ts fetchSitesViaRest().
 */
import { GRAPHQL_PAGE_SIZE } from './config';

/**
 * Fetches all content pages for a site using cursor-based pagination.
 * Filters by _path (CONTAINS homeId), _hasLayout = true, and language.
 *
 * Edge `_path` stores ancestor item GUIDs (e.g. {ABC-123}), NOT text paths.
 * homeId is the Home page item GUID formatted as {UPPERCASE-GUID}.
 * Filtering by the Home GUID — not the site root GUID — excludes SXA
 * Presentation items (Header, Footer, Default) which are siblings of Home
 * and do not appear in Home's descendant chain.
 * STARTSWITH is NOT a valid ItemSearchOperator on this schema.
 *
 * first: 50 keeps the query well under Edge's complexity budget (~250).
 * The while-loop in fetchAllPages handles pagination automatically.
 */
export const GET_PAGES_FOR_SITE = `
  query GetPagesForSite($homeId: String!, $language: String!, $after: String) {
    search(
      where: {
        AND: [
          { name: "_path", value: $homeId, operator: CONTAINS }
          { name: "_hasLayout", value: "true", operator: EQ }
          { name: "_language", value: $language, operator: EQ }
        ]
      }
      first: ${GRAPHQL_PAGE_SIZE}
      after: $after
    ) {
      results {
        id
        name
      }
      pageInfo {
        hasNext
        endCursor
      }
    }
  }
`;

/**
 * Fetches the full layout service JSON for a page.
 * `rendered` is a JSON scalar that contains every component placed on the
 * page along with all field values resolved from their datasource items —
 * this is the correct way to find CH DAM assets used inside components,
 * as opposed to `item.fields` which only returns the page item's own fields.
 */
export const GET_PAGE_FIELDS = `
  query GetPageFields($id: String!, $language: String!) {
    item(path: $id, language: $language) {
      id
      name
      rendered
    }
  }
`;
