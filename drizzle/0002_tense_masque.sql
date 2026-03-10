ALTER TABLE "sitemaps" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "sitemaps" ADD COLUMN "last_mod" timestamp;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "last_mod" timestamp;--> statement-breakpoint
ALTER TABLE "sitemaps" DROP COLUMN "last_hash";