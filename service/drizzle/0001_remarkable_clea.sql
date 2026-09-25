CREATE TABLE "ingestion_job_resources" (
	"job_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"resource" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cursor_from" text,
	"cursor_to" text,
	"records_read" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_job_resources_job_id_resource_pk" PRIMARY KEY("job_id","resource")
);
--> statement-breakpoint
DROP INDEX "orders_workspace_customer_idx";--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "return_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_states" ALTER COLUMN "return_url" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "option_values" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "ingestion_job_resources" ADD CONSTRAINT "ingestion_job_resources_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_job_resources" ADD CONSTRAINT "ingestion_job_resources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_job_resources_workspace_status_idx" ON "ingestion_job_resources" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "customers_workspace_name_idx" ON "customers" USING btree ("workspace_id","last_name","first_name","id");--> statement-breakpoint
CREATE INDEX "orders_workspace_created_idx" ON "orders" USING btree ("workspace_id","shopify_created_at","id");--> statement-breakpoint
CREATE INDEX "products_workspace_category_idx" ON "products" USING btree ("workspace_id","category","updated_at","id");--> statement-breakpoint
CREATE INDEX "orders_workspace_customer_idx" ON "orders" USING btree ("workspace_id","customer_id","shopify_created_at","id");