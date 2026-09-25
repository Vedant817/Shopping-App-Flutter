CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"actor_user_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_lines" (
	"workspace_id" text NOT NULL,
	"cart_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"total_price" numeric(18, 4) NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_lines_workspace_id_cart_id_id_pk" PRIMARY KEY("workspace_id","cart_id","id")
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"customer_id" text,
	"currency_code" text NOT NULL,
	"total_price" numeric(18, 4) NOT NULL,
	"subtotal_price" numeric(18, 4) NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"abandoned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shopify_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"cart_id" text,
	"customer_id" text,
	"email" text,
	"currency_code" text NOT NULL,
	"total_price" numeric(18, 4) NOT NULL,
	"subtotal_price" numeric(18, 4) NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shopify_created_at" timestamp with time zone,
	"shopify_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkouts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "custom_events" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"event_type" text NOT NULL,
	"customer_id" text,
	"session_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_events_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"state" text,
	"verified_email" boolean,
	"orders_count" integer,
	"total_spent" numeric(18, 4),
	"default_address" jsonb,
	"avatar_url" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shopify_created_at" timestamp with time zone,
	"shopify_updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"resource" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"user_id" text,
	"shop_domain" text NOT NULL,
	"code_verifier_encrypted" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"title" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"total_discount" numeric(18, 4) NOT NULL,
	"total_price" numeric(18, 4) NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_workspace_id_order_id_id_pk" PRIMARY KEY("workspace_id","order_id","id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text,
	"order_number" integer,
	"customer_id" text,
	"email" text,
	"financial_status" text,
	"fulfillment_status" text,
	"currency_code" text NOT NULL,
	"subtotal_price" numeric(18, 4) NOT NULL,
	"total_discounts" numeric(18, 4) NOT NULL,
	"total_tax" numeric(18, 4) NOT NULL,
	"total_price" numeric(18, 4) NOT NULL,
	"total_units" integer DEFAULT 0 NOT NULL,
	"source_name" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"shopify_created_at" timestamp with time zone,
	"shopify_updated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"workspace_id" text NOT NULL,
	"product_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"sku" text,
	"barcode" text,
	"price" numeric(18, 4) NOT NULL,
	"compare_at_price" numeric(18, 4),
	"inventory_quantity" integer,
	"inventory_policy" text,
	"taxable" boolean,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"handle" text,
	"description_html" text,
	"vendor" text,
	"product_type" text,
	"status" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"total_inventory" integer,
	"featured_image_url" text,
	"online_store_url" text,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"shopify_created_at" timestamp with time zone,
	"shopify_updated_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "shopify_installations" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"encrypted_offline_token" text NOT NULL,
	"scopes" text[] NOT NULL,
	"api_version" text NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"workspace_id" text NOT NULL,
	"resource" text NOT NULL,
	"cursor" text,
	"last_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_cursors_workspace_id_resource_pk" PRIMARY KEY("workspace_id","resource")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"resource" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"cursor_from" text,
	"cursor_to" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"shop_domain" text NOT NULL,
	"topic" text NOT NULL,
	"api_version" text,
	"payload" jsonb NOT NULL,
	"hmac" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"name" text NOT NULL,
	"currency_code" text NOT NULL,
	"time_zone" text NOT NULL,
	"shopify_shop_id" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_app_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_events" ADD CONSTRAINT "custom_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_installations" ADD CONSTRAINT "shopify_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "cart_lines_workspace_product_idx" ON "cart_lines" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "carts_workspace_updated_idx" ON "carts" USING btree ("workspace_id","shopify_updated_at","id");--> statement-breakpoint
CREATE INDEX "checkouts_workspace_updated_idx" ON "checkouts" USING btree ("workspace_id","shopify_updated_at","id");--> statement-breakpoint
CREATE INDEX "custom_events_workspace_occurred_idx" ON "custom_events" USING btree ("workspace_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "custom_events_workspace_type_idx" ON "custom_events" USING btree ("workspace_id","event_type");--> statement-breakpoint
CREATE INDEX "customers_workspace_updated_idx" ON "customers" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "customers_workspace_email_idx" ON "customers" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_jobs_workspace_idempotency_unique" ON "ingestion_jobs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_claim_idx" ON "ingestion_jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_stale_lock_idx" ON "ingestion_jobs" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX "order_lines_workspace_product_idx" ON "order_lines" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "order_lines_workspace_order_idx" ON "order_lines" USING btree ("workspace_id","order_id");--> statement-breakpoint
CREATE INDEX "orders_workspace_processed_idx" ON "orders" USING btree ("workspace_id","processed_at","id");--> statement-breakpoint
CREATE INDEX "orders_workspace_customer_idx" ON "orders" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE INDEX "orders_workspace_status_idx" ON "orders" USING btree ("workspace_id","financial_status","fulfillment_status");--> statement-breakpoint
CREATE INDEX "product_variants_workspace_product_idx" ON "product_variants" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX "products_workspace_updated_idx" ON "products" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "products_workspace_status_idx" ON "products" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "sync_runs_workspace_started_idx" ON "sync_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_webhook_id_unique" ON "webhook_events" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_events_workspace_received_idx" ON "webhook_events" USING btree ("workspace_id","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_shop_domain_unique" ON "workspaces" USING btree ("shop_domain");--> statement-breakpoint
CREATE INDEX "workspaces_updated_at_idx" ON "workspaces" USING btree ("updated_at");