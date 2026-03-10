ALTER TABLE "urls" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sitemaps" DROP COLUMN "last_checked_at";--> statement-breakpoint
ALTER TABLE "urls" DROP COLUMN "retry_count";--> statement-breakpoint
ALTER TABLE "urls" DROP COLUMN "first_seen_at";