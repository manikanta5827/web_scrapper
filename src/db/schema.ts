import { pgTable, serial, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const sitemaps = pgTable('sitemaps', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id').references((): AnyPgColumn => sitemaps.id, { onDelete: 'cascade' }), // Reference to the parent sitemap if nested
  rootId: integer('root_id'), // Reference to the top-level sitemap
  sitemapUrl: text('sitemap_url').notNull().unique(),
  lastMod: timestamp('last_mod'),
  totalUrlsFound: integer('total_urls_found').default(0),
  status: text('status', { enum: ['active', 'processing', 'failed'] }).default('active'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    rootIdIdx: index('sitemaps_root_id_idx').on(table.rootId),
  };
});

export const urls = pgTable('urls', {
  id: serial('id').primaryKey(),
  sitemapId: integer('sitemap_id').references(() => sitemaps.id, { onDelete: 'cascade' }).notNull(),
  rootId: integer('root_id'), // Reference to the top-level sitemap
  url: text('url').notNull().unique(),
  lastMod: timestamp('last_mod'),
  s3Url: text('s3_url'), // Link to raw HTML in S3
  mdS3Url: text('md_s3_url'), // Link to cleaned Markdown in S3
  status: text('status', { enum: ['queued', 'scraping', 'scraped', 'processing', 'done', 'failed'] }).default('queued'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastScrapedAt: timestamp('last_scraped_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    rootIdIdx: index('urls_root_id_idx').on(table.rootId),
    statusIdx: index('urls_status_idx').on(table.status),
    combinedIdx: index('urls_root_status_idx').on(table.rootId, table.status),
  };
});

export const healthChecks = pgTable('health_checks', {
  serviceName: text('service_name').primaryKey(), // e.g., 'unified-worker'
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
  concurrency: integer('concurrency').default(0).notNull(),
});

export type Sitemap = InferSelectModel<typeof sitemaps>;
export type NewSitemap = InferInsertModel<typeof sitemaps>;
export type Url = InferSelectModel<typeof urls>;
export type NewUrl = InferInsertModel<typeof urls>;
