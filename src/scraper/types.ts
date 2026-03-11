export interface SitemapJobData {
  sitemapUrl: string;
  sitemapId: number;
  rootId: number;
  depth: number;
}

export interface PageJob {
  id: string;
  data: {
    url: string;
    sitemapId: number;
    rootId: number;
  };
}

export interface PageScrapeResult {
  url: string;
  sitemapId: number;
  rootId: number;
  status: 'done' | 'failed';
  failureReason?: string;
  s3Url?: string;
  mdS3Url?: string;
  lastScrapedAt?: Date;
  updatedAt: Date;
}
