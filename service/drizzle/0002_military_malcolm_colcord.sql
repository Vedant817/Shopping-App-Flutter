ALTER TABLE "customers" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "ingestion_job_resources" ADD COLUMN "variants_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variants_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD COLUMN "watermark_at" timestamp with time zone;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_search_idx ON products USING gin ((lower(coalesce(title, '') || ' ' || coalesce(handle, '') || ' ' || coalesce(vendor, '') || ' ' || coalesce(product_type, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, ''))) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_variants_sku_search_idx ON product_variants USING gin (lower(coalesce(sku, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_search_idx ON customers USING gin ((lower(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(company, '') || ' ' || coalesce(city, '') || ' ' || coalesce(province, '') || ' ' || coalesce(country, '') || ' ' || id)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_workspace_cancelled_period_idx ON orders (workspace_id, cancelled_at, processed_at, id);

CREATE OR REPLACE FUNCTION public.threadline_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(coalesce(nullif(current_setting('app.user_id', true), ''), nullif(current_setting('request.jwt.claim.sub', true), '')), '')
$$;

CREATE OR REPLACE FUNCTION public.threadline_has_workspace(target_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT exists (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = target_workspace_id
      AND user_id = public.threadline_current_user_id()
  )
  AND exists (
    SELECT 1
    FROM workspaces w
    JOIN shopify_installations i ON i.workspace_id = w.id
    WHERE w.id = target_workspace_id
      AND w.uninstalled_at is null
      AND i.uninstalled_at is null
  )
$$;

CREATE INDEX IF NOT EXISTS workspace_members_lookup_idx ON workspace_members (user_id, workspace_id);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_job_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_self_select ON app_users;
DROP POLICY IF EXISTS app_users_self_write ON app_users;
DROP POLICY IF EXISTS workspaces_member_select ON workspaces;
DROP POLICY IF EXISTS workspaces_member_update ON workspaces;
DROP POLICY IF EXISTS workspace_members_self_select ON workspace_members;
DROP POLICY IF EXISTS workspace_members_self_write ON workspace_members;
DROP POLICY IF EXISTS installations_member_select ON shopify_installations;
DROP POLICY IF EXISTS oauth_states_user_select ON oauth_states;
DROP POLICY IF EXISTS oauth_states_user_write ON oauth_states;
DROP POLICY IF EXISTS sync_cursors_member_select ON sync_cursors;
DROP POLICY IF EXISTS sync_runs_member_select ON sync_runs;
DROP POLICY IF EXISTS ingestion_jobs_member_select ON ingestion_jobs;
DROP POLICY IF EXISTS ingestion_job_resources_member_select ON ingestion_job_resources;
DROP POLICY IF EXISTS webhook_events_member_select ON webhook_events;
DROP POLICY IF EXISTS products_member_select ON products;
DROP POLICY IF EXISTS product_variants_member_select ON product_variants;
DROP POLICY IF EXISTS customers_member_select ON customers;
DROP POLICY IF EXISTS orders_member_select ON orders;
DROP POLICY IF EXISTS order_lines_member_select ON order_lines;
DROP POLICY IF EXISTS carts_member_select ON carts;
DROP POLICY IF EXISTS cart_lines_member_select ON cart_lines;
DROP POLICY IF EXISTS checkouts_member_select ON checkouts;
DROP POLICY IF EXISTS custom_events_member_select ON custom_events;
DROP POLICY IF EXISTS audit_events_member_select ON audit_events;
DROP POLICY IF EXISTS audit_events_actor_insert ON audit_events;

CREATE POLICY app_users_self_select ON app_users FOR SELECT USING (id = public.threadline_current_user_id());
CREATE POLICY workspaces_member_select ON workspaces FOR SELECT USING (public.threadline_has_workspace(id));
CREATE POLICY workspace_members_self_select ON workspace_members FOR SELECT USING (user_id = public.threadline_current_user_id());
CREATE POLICY oauth_states_user_select ON oauth_states FOR SELECT USING (user_id = public.threadline_current_user_id());
CREATE POLICY sync_cursors_member_select ON sync_cursors FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY sync_runs_member_select ON sync_runs FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY ingestion_jobs_member_select ON ingestion_jobs FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY ingestion_job_resources_member_select ON ingestion_job_resources FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY webhook_events_member_select ON webhook_events FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY products_member_select ON products FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY product_variants_member_select ON product_variants FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY customers_member_select ON customers FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY orders_member_select ON orders FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY order_lines_member_select ON order_lines FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY carts_member_select ON carts FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY cart_lines_member_select ON cart_lines FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY checkouts_member_select ON checkouts FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY custom_events_member_select ON custom_events FOR SELECT USING (public.threadline_has_workspace(workspace_id));
CREATE POLICY audit_events_member_select ON audit_events FOR SELECT USING (workspace_id IS NOT NULL AND public.threadline_has_workspace(workspace_id));

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
  END IF;
END
$$;
