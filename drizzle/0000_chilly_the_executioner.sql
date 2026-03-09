CREATE TABLE "sitemaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"sitemap_url" text NOT NULL,
	"last_hash" text,
	"last_checked_at" timestamp,
	"total_urls_found" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sitemaps_sitemap_url_unique" UNIQUE("sitemap_url")
);
--> statement-breakpoint
CREATE TABLE "urls" (
	"id" serial PRIMARY KEY NOT NULL,
	"sitemap_id" integer NOT NULL,
	"url" text NOT NULL,
	"content_hash" text,
	"status" text DEFAULT 'queued',
	"retry_count" integer DEFAULT 0,
	"raw_content" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_scraped_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "urls_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "urls" ADD CONSTRAINT "urls_sitemap_id_sitemaps_id_fk" FOREIGN KEY ("sitemap_id") REFERENCES "public"."sitemaps"("id") ON DELETE no action ON UPDATE no action;