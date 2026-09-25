ALTER TABLE "shopify_installations" ADD COLUMN "encrypted_refresh_token" text;--> statement-breakpoint
ALTER TABLE "shopify_installations" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shopify_installations" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shopify_installations" ADD COLUMN "reauthorize_required_at" timestamp with time zone;