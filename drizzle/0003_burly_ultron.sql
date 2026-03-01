ALTER TABLE "user" RENAME COLUMN "email_verified" TO "emailVerified";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "content" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "updated_at" DROP NOT NULL;