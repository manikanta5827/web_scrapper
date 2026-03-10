import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const sitemaps = pgTable('sitemaps', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id'), // Reference to the parent sitemap if nested
  rootId: integer('root_id'), // Reference to the top-level sitemap
  sitemapUrl: text('sitemap_url').notNull().unique(),
  lastMod: timestamp('last_mod'),
  totalUrlsFound: integer('total_urls_found').default(0),
  status: text('status', { enum: ['active', 'processing', 'failed'] }).default('active'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const urls = pgTable('urls', {
  id: serial('id').primaryKey(),
  sitemapId: integer('sitemap_id').references(() => sitemaps.id).notNull(),
  rootId: integer('root_id'), // Reference to the top-level sitemap
  url: text('url').notNull().unique(),
  lastMod: timestamp('last_mod'),
  s3Url: text('s3_url'), // Link to raw HTML in S3
  status: text('status', { enum: ['queued', 'scraping', 'scraped', 'processing', 'done', 'failed'] }).default('queued'),
  failureReason: text('failure_reason'),
  rawContent: text('raw_content'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastScrapedAt: timestamp('last_scraped_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const healthChecks = pgTable('health_checks', {
  serviceName: text('service_name').primaryKey(), // 'sitemap-worker', 'page-worker'
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
});

export type Sitemap = InferSelectModel<typeof sitemaps>;
export type NewSitemap = InferInsertModel<typeof sitemaps>;
export type Url = InferSelectModel<typeof urls>;
export type NewUrl = InferInsertModel<typeof urls>;
