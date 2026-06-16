export interface Tenant {
  id: string;
  name: string;
  context: {
    preview?: string;
    live?: string;
  };
}

export interface SiteInfo {
  name: string;
  hostName: string;
  rootPath: string;  // text path, display only
  homeId: string;    // {UPPERCASE-GUID} of the Home page item — used for Edge
                     // _path CONTAINS filter so Presentation items (Header,
                     // Footer, Default) are excluded; they are siblings of Home,
                     // not descendants, so they won't match.
}

export interface PageItem {
  id: string;
  name: string;
  path: string;
  language: string;
  siteName: string;
}

export interface PublicLinkMatch {
  assetId: string;
  publicLinkUrl: string;
  fieldName: string;
}

export interface ScanRecord {
  asset_id: string;
  /** Content Hub dam-id identifier (e.g. "ONgDpFyGQqqpYVEpF_ZhBQ"), present when the field carries a dam-id attribute. */
  identifier?: string;
  public_link_url: string;
  site_name: string;
  page_name: string;
  page_path: string;
  component_name: string;
  field_name: string;
  risk_level: 'Critical' | 'High' | 'Low' | 'Unknown';
  language: string;
  scanned_at: string;
  /** Set after delta comparison. Absent on first-ever scan (no baseline). */
  status?: 'Active' | 'New' | 'Removed';
}

export interface ScanProgress {
  currentSite: string;
  currentPage: string;
  pagesScanned: number;
  totalPages: number;
}

export interface ScanState {
  status: 'idle' | 'running' | 'complete' | 'error';
  records: ScanRecord[];
  progress: ScanProgress;
  summary: {
    totalPages: number;
    totalLinks: number;
    criticalAssets: number;
  };
  error?: string;
}

export interface ScanConfig {
  selectedSites: string[];
  language: string;
  sitecoreContextId: string;
}

export interface OperationError {
  asset_id: string;
  httpStatus?: number;
  message: string;
}

export interface BulkUpdateResult {
  updated: number;
  skipped: number;
  failed: number;
  taxonomyCreated: number;
  errors: OperationError[];
}
