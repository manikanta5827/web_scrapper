import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const sitemaps = pgTable('sitemaps', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id'), // Reference to the parent sitemap if nested
  sitemapUrl: text('sitemap_url').notNull().unique(),
  lastCheckedAt: timestamp('last_checked_at'),
  lastMod: timestamp('last_mod'),
  totalUrlsFound: integer('total_urls_found').default(0),
  status: text('status', { enum: ['active', 'processing', 'failed'] }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const urls = pgTable('urls', {
  id: serial('id').primaryKey(),
  sitemapId: integer('sitemap_id').references(() => sitemaps.id).notNull(),
  url: text('url').notNull().unique(),
  lastMod: timestamp('last_mod'),
  status: text('status', { enum: ['queued', 'scraping', 'scraped', 'processing', 'done', 'failed'] }).default('queued'),
  retryCount: integer('retry_count').default(0),
  rawContent: text('raw_content'),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastScrapedAt: timestamp('last_scraped_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Sitemap = InferSelectModel<typeof sitemaps>;
export type NewSitemap = InferInsertModel<typeof sitemaps>;
export type Url = InferSelectModel<typeof urls>;
export type NewUrl = InferInsertModel<typeof urls>;
