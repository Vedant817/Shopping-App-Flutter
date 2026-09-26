import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  const workspace = await client.query(
    "select id, name, currency_code, time_zone, shopify_shop_id, installed_at from workspaces where shop_domain = 'vedant-mahajan-store.myshopify.com'",
  );
  console.log('workspace:', JSON.stringify(workspace.rows[0], null, 2));

  const products = await client.query(
    `select p.id, p.title, p.handle, p.status, p.category, p.variants_complete, p.total_inventory, p.featured_image_url,
            (select count(*)::int from product_variants v where v.workspace_id = p.workspace_id and v.product_id = p.id) as variants
     from products p join workspaces w on w.id = p.workspace_id
     where w.shop_domain = 'vedant-mahajan-store.myshopify.com' order by p.title`,
  );
  console.log('\nproducts synced through the real Admin API:');
  for (const row of products.rows) {
    console.log(`  ${row.title}`);
    console.log(`    handle=${row.handle} status=${row.status} category=${row.category}`);
    console.log(`    inventory=${row.total_inventory} variants=${row.variants} variantsComplete=${row.variants_complete}`);
    console.log(`    shopifyGid=${row.id}`);
  }

  const variants = await client.query(
    `select v.title, v.sku, v.price, v.compare_at_price, v.inventory_quantity, v.option_values
     from product_variants v join workspaces w on w.id = v.workspace_id
     where w.shop_domain = 'vedant-mahajan-store.myshopify.com' order by v.title`,
  );
  console.log('\nvariants:');
  for (const row of variants.rows) {
    console.log(`  ${row.title} sku=${row.sku ?? '-'} price=${row.price} compareAt=${row.compare_at_price ?? '-'} stock=${row.inventory_quantity}`);
  }

  const runs = await client.query(
    `select r.resource, r.status, r.stats, r.started_at, r.completed_at
     from sync_runs r join workspaces w on w.id = r.workspace_id
     where w.shop_domain = 'vedant-mahajan-store.myshopify.com' order by r.started_at`,
  );
  console.log('\nsync runs:');
  for (const row of runs.rows) {
    console.log(`  ${row.resource} ${row.status} stats=${JSON.stringify(row.stats)}`);
  }
} catch (error) {
  console.log('failed:', error.message);
} finally {
  await client.end().catch(() => {});
}
