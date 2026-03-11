CREATE INDEX "urls_last_scraped_at_idx" ON "urls" USING btree ("last_scraped_at");--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "db_total";--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "db_idle";--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "db_waiting";--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "boss_total";--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "boss_idle";--> statement-breakpoint
ALTER TABLE "health_checks" DROP COLUMN "boss_waiting";