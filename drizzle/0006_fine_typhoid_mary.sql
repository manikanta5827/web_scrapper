CREATE TABLE "health_checks" (
	"service_name" text PRIMARY KEY NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"concurrency" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sitemaps" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "md_s3_url" text;--> statement-breakpoint
ALTER TABLE "urls" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "urls" DROP COLUMN "raw_content";