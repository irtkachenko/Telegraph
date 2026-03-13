ALTER TABLE "messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_online" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'offline';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status_message" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferences" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "theme" text DEFAULT 'system';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
CREATE INDEX "idx_user_provider" ON "user" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "idx_user_last_seen" ON "user" USING btree ("last_seen");