ALTER TABLE "urls" DROP CONSTRAINT "urls_sitemap_id_sitemaps_id_fk";
--> statement-breakpoint
ALTER TABLE "health_checks" ALTER COLUMN "last_seen" SET DEFAULT (now() AT TIME ZONE 'UTC') + interval '5 hours 30 minutes';--> statement-breakpoint
ALTER TABLE "sitemaps" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'UTC') + interval '5 hours 30 minutes';--> statement-breakpoint
ALTER TABLE "sitemaps" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'UTC') + interval '5 hours 30 minutes';--> statement-breakpoint
ALTER TABLE "urls" ALTER COLUMN "created_at" SET DEFAULT (now() AT TIME ZONE 'UTC') + interval '5 hours 30 minutes';--> statement-breakpoint
ALTER TABLE "urls" ALTER COLUMN "updated_at" SET DEFAULT (now() AT TIME ZONE 'UTC') + interval '5 hours 30 minutes';--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "db_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "db_idle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "db_waiting" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sitemaps" ADD CONSTRAINT "sitemaps_parent_id_sitemaps_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sitemaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "urls" ADD CONSTRAINT "urls_sitemap_id_sitemaps_id_fk" FOREIGN KEY ("sitemap_id") REFERENCES "public"."sitemaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sitemaps_root_id_idx" ON "sitemaps" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "urls_root_id_idx" ON "urls" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "urls_status_idx" ON "urls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "urls_root_status_idx" ON "urls" USING btree ("root_id","status");