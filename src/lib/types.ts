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
  public_link_url: string;
  site_name: string;
  page_name: string;
  page_path: string;
  component_name: string; // rendering componentName from layout
  field_name: string;     // field within the component
  http_status: number | null;
  risk_level: 'Critical' | 'High' | 'Low' | 'Broken' | 'Unknown';
  language: string;
  scanned_at: string; // ISO datetime
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
    brokenLinks: number;
    criticalAssets: number;
  };
  error?: string;
}

export interface ScanConfig {
  selectedSites: string[];
  language: string;
  sitecoreContextId: string;
}
