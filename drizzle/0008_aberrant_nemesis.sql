ALTER TABLE "health_checks" ADD COLUMN "boss_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "boss_idle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "boss_waiting" integer DEFAULT 0 NOT NULL;