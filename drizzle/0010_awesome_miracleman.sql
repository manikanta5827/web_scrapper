ALTER TABLE "health_checks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "health_checks" CASCADE;--> statement-breakpoint
DROP INDEX "urls_last_scraped_at_idx";