/**
 * Seeds a temporary, clearly-labelled dataset into a workspace so the revenue,
 * trend, customer and checkout paths can be exercised against non-zero values,
 * then removes it again.
 *
 * Why this exists: every unit test stubs the database and the only live store
 * has no orders, so the aggregation SQL behind the overview, the trend chart and
 * customer value has never actually run against a row. "Zero" and "wrong" look
 * identical on an empty table, which is how a broken sum() can pass every check.
 *
 * Every row is written with a `zzverify-` id prefix and is removed by
 * `cleanup()`, which also refuses to touch anything without that prefix. The
 * script prints the workspace and the row counts it touched, and it defaults to
 * seeding, so running it twice is visible rather than silent.
 *
 *   node scripts/verify-analytics.mjs            seed, print, leave in place
 *   node scripts/verify-analytics.mjs --cleanup  remove everything it created
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { getOverview } from '../dist/api/queries.js';
import { listCheckouts } from '../dist/api/queries.js';
import { createDatabase, closeDatabase } from '../dist/db/client.js';

const PREFIX = 'zzverify-';
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const shop = process.env.SHOPIFY_SHOP_DOMAIN ?? 'vedant-mahajan-store.myshopify.com';

const db = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 20000,
});

/** Deterministic pseudo-random so a rerun produces the same shape. */
function rng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function workspaceId() {
  const result = await db.query('select id, currency_code from workspaces where shop_domain = $1', [shop]);
  if (result.rowCount === 0) throw new Error(`no workspace for ${shop}`);
  return result.rows[0];
}

async function cleanup(workspace) {
  // Refuses to run unless every target row carries the sentinel prefix, so a
  // mistyped scope can never delete a merchant's real data.
  const counts = {};
  for (const table of ['order_lines', 'refunds', 'orders', 'checkouts', 'customers']) {
    const column = table === 'order_lines' ? 'order_id' : table === 'refunds' ? 'order_id' : 'id';
    const found = await db.query(
      `select count(*)::int n from ${table} where workspace_id = $1 and ${column} like $2`,
      [workspace, `${PREFIX}%`],
    );
    counts[table] = found.rows[0].n;
  }
  for (const [table, column] of [
    ['order_lines', 'order_id'],
    ['refunds', 'order_id'],
    ['orders', 'id'],
    ['checkouts', 'id'],
    ['customers', 'id'],
  ]) {
    await db.query(`delete from ${table} where workspace_id = $1 and ${column} like $2`, [workspace, `${PREFIX}%`]);
  }
  console.log('removed rows that had been present:', JSON.stringify(counts));
  const after = await db.query(
    `select
       (select count(*)::int from orders where workspace_id = $1) as orders,
       (select count(*)::int from customers where workspace_id = $1) as customers,
       (select count(*)::int from checkouts where workspace_id = $1) as checkouts,
       (select count(*)::int from refunds where workspace_id = $1) as refunds`,
    [workspace],
  );
  console.log('workspace now holds:', JSON.stringify(after.rows[0]));
}

async function seed(workspace, currency) {
  const random = rng(20260926);
  const products = await db.query(
    `select p.id, p.title, pv.id as variant_id, pv.price
     from products p
     left join lateral (
       select id, price from product_variants
       where product_id = p.id order by position asc, id asc limit 1
     ) pv on true
     where p.workspace_id = $1 and p.deleted_at is null
     order by p.title`,
    [workspace],
  );
  if (products.rowCount === 0) throw new Error('workspace has no products to reference');

  const now = Date.now();
  const day = 86400000;
  const customers = [];
  const orders = [];
  const lines = [];
  const refunds = [];
  const checkouts = [];

  for (let i = 0; i < 6; i += 1) {
    customers.push({
      id: `${PREFIX}customer-${i}`,
      email: `buyer${i}@example.com`,
      first: ['Asha', 'Rohan', 'Mira', 'Dev', 'Nisha', 'Kabir'][i],
      last: ['Iyer', 'Nair', 'Kapoor', 'Menon', 'Rao', 'Bose'][i],
      city: ['Kochi', 'Pune', 'Bengaluru', 'Chennai', 'Mumbai', 'Delhi'][i],
      country: 'India',
      // Spread creation dates across the window so "new customer" logic has
      // something to distinguish.
      created: new Date(now - (25 - i * 4) * day),
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const customer = customers[Math.floor(random() * customers.length)];
    const lineCount = 1 + Math.floor(random() * 3);
    let subtotal = 0;
    let units = 0;
    const orderId = `${PREFIX}order-${i}`;
    const created = new Date(now - (26 - Math.floor(i * 1.05)) * day);
    const lineRows = [];
    for (let l = 0; l < lineCount; l += 1) {
      const product = products.rows[Math.floor(random() * products.rowCount)];
      const quantity = 1 + Math.floor(random() * 2);
      const unitPrice = Number(product.price ?? 500);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      units += quantity;
      lineRows.push({ product, quantity, unitPrice, lineTotal, index: l });
    }
    const tax = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + tax;
    orders.push({
      id: orderId,
      name: `#${1000 + i}`,
      number: 1000 + i,
      customer,
      financial: i % 9 === 0 ? 'refunded' : i % 5 === 0 ? 'pending' : 'paid',
      fulfillment: i % 4 === 0 ? 'fulfilled' : 'unfulfilled',
      subtotal,
      tax,
      total,
      units,
      created,
      cancelled: i === 7 ? new Date(created.getTime() + day) : null,
    });
    lineRows.forEach((line, l) => {
      lines.push({
        orderId,
        id: `${orderId}-l${l}`,
        productId: line.product.id,
        variantId: line.product.variant_id,
        title: line.product.title,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.lineTotal,
      });
    });
    if (i % 9 === 0) {
      refunds.push({ id: `${orderId}-refund`, orderId, amount: total, created });
    }
  }

  for (let i = 0; i < 7; i += 1) {
    const customer = customers[i % customers.length];
    const total = 400 + Math.floor(random() * 4000);
    checkouts.push({
      id: `${PREFIX}checkout-${i}`,
      cartId: `${PREFIX}cart-${i}`,
      customer,
      total,
      units: 1 + Math.floor(random() * 3),
      created: new Date(now - (20 - i * 2.5) * day),
      updated: new Date(now - (19 - i * 2.5) * day),
      completed: i === 4 ? new Date(now - 2 * day) : null,
    });
  }

  for (const c of customers) {
    await db.query(
      `insert into customers (workspace_id, id, email, first_name, last_name, city, country, verified_email, orders_count, total_spent, shopify_created_at, shopify_updated_at, raw)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,'{}'::jsonb)`,
      [workspace, c.id, c.email, c.first, c.last, c.city, c.country,
        orders.filter((o) => o.customer.id === c.id).length,
        orders.filter((o) => o.customer.id === c.id).reduce((t, o) => t + o.total, 0).toFixed(4),
        c.created, c.created],
    );
  }
  for (const o of orders) {
    await db.query(
      `insert into orders (workspace_id, id, name, order_number, customer_id, email, financial_status, fulfillment_status, currency_code,
         subtotal_price, total_discounts, total_tax, total_price, total_units, processed_at, shopify_created_at, shopify_updated_at, cancelled_at, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$14,$14,$15,'{}'::jsonb)`,
      [workspace, o.id, o.name, o.number, o.customer.id, o.customer.email, o.financial, o.fulfillment, currency,
        o.subtotal.toFixed(4), o.tax.toFixed(4), o.total.toFixed(4), o.units, o.created, o.cancelled],
    );
  }
  for (const l of lines) {
    await db.query(
      `insert into order_lines (workspace_id, order_id, id, product_id, variant_id, title, quantity, unit_price, total_discount, total_price, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,'{}'::jsonb)`,
      [workspace, l.orderId, l.id, l.productId, l.variantId, l.title, l.quantity, l.unitPrice.toFixed(4), l.totalPrice.toFixed(4)],
    );
  }
  for (const r of refunds) {
    await db.query(
      `insert into refunds (workspace_id, id, order_id, note, total_amount, currency_code, processed_at, shopify_created_at, shopify_updated_at, raw)
       values ($1,$2,$3,'verification refund',$4,$5,$6,$6,$6,'{}'::jsonb)`,
      [workspace, r.id, r.orderId, r.amount.toFixed(4), currency, r.created],
    );
  }
  for (const c of checkouts) {
    await db.query(
      `insert into checkouts (workspace_id, id, cart_id, customer_id, email, currency_code, total_price, subtotal_price, total_quantity, shopify_created_at, shopify_updated_at, completed_at, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'{}'::jsonb)`,
      [workspace, c.id, c.cartId, c.customer.id, c.customer.email, currency, c.total.toFixed(4),
        (c.total * 0.85).toFixed(4), c.units, c.created, c.updated, c.completed],
    );
  }

  console.log(`seeded ${customers.length} customers, ${orders.length} orders, ${lines.length} lines, ${refunds.length} refunds, ${checkouts.length} checkouts`);
  return { orders, checkouts, currency };
}

const range = (days) => ({
  preset: `${days}d`,
  from: new Date(Date.now() - days * 86400000),
  to: new Date(Date.now() + 86400000),
});

try {
  await db.connect();
  const workspace = await workspaceId();
  console.log(`workspace ${workspace.id} (${shop}, ${workspace.currency_code})`);

  if (process.argv.includes('--cleanup')) {
    await cleanup(workspace.id);
  } else {
    await cleanup(workspace.id);
    const seeded = await seed(workspace.id, workspace.currency_code);

    // Read the data back through the same query functions the API uses, so this
    // proves the aggregation rather than restating the seed arithmetic.
    const owner = await db.query(
      'select user_id from workspace_members where workspace_id = $1 order by role limit 1',
      [workspace.id],
    );
    const callerId = owner.rows[0]?.user_id;
    const conn = createDatabase(env.DATABASE_URL, env.DATABASE_SSL === 'true', 'development');

    // Independent expectation, computed from the seed rather than from the
    // database, so a wrong sum in the query cannot agree with itself.
    const windowStart = range(30).from;
    const expected = seeded.orders.filter((order) => !order.cancelled && order.created >= windowStart);
    const expectedRevenue = expected
      .reduce((total, order) => total + order.total, 0)
      .toFixed(2);
    const expectedUnits = expected.reduce((total, order) => total + order.units, 0);
    const expectedAov = expected.length === 0
      ? '0.00'
      : (expected.reduce((t, o) => t + o.total, 0) / expected.length).toFixed(2);

    let failures = 0;
    for (const days of [7, 30, 90]) {
      const overview = await getOverview(conn.db, workspace.id, range(days), new Date(), callerId);
      const trendTotal = overview.trend
        .map((point) => Number(point.revenue))
        .reduce((total, value) => total + value, 0)
        .toFixed(2);
      const metrics = overview.metrics;
      console.log(`\n${days}d overview`);
      console.log(`  orders            ${metrics.orderCount}`);
      console.log(`  customers         ${metrics.customerCount}`);
      console.log(`  units             ${metrics.units}`);
      console.log(`  revenue           ${metrics.revenue} ${metrics.currencyCode}`);
      console.log(`  average order     ${metrics.averageOrderValue}`);
      console.log(`  basis             ${metrics.metricBasis}`);
      console.log(`  trend points      ${overview.trend.length}`);
      console.log(`  trend sum         ${trendTotal}`);
      console.log(`  top customers     ${overview.topCustomers.length}`);
      console.log(`  decisions         ${overview.decisions.length}`);
      console.log(`  data quality      ${JSON.stringify(overview.dataQuality)}`);
      if (days === 30) {
        const gaps = overview.trend.slice(1).map((point, index) => {
          const previous = new Date(`${overview.trend[index].date}T00:00:00Z`);
          return (new Date(`${point.date}T00:00:00Z`) - previous) / 86400000;
        });
        const checks = [
          ['revenue matches the seed', metrics.revenue === expectedRevenue, `${metrics.revenue} vs ${expectedRevenue}`],
          ['units match the seed', metrics.units === expectedUnits, `${metrics.units} vs ${expectedUnits}`],
          ['order count is non-zero', metrics.orderCount > 0, String(metrics.orderCount)],
          ['aov is non-zero', Number(metrics.averageOrderValue) > 0, metrics.averageOrderValue],
          ['trend covers the window', overview.trend.length >= 30, `${overview.trend.length} buckets`],
          ['trend has no gaps', gaps.every((gap) => gap === 1), `gaps: ${[...new Set(gaps)].join(',') || 'none'}`],
          ['trend sums to the revenue', trendTotal === expectedRevenue, `${trendTotal} vs ${expectedRevenue}`],
          ['top customers are ranked', overview.topCustomers.length > 0, String(overview.topCustomers.length)],
        ];
        console.log('\n  assertions against the independently computed seed totals:');
        for (const [name, ok, detail] of checks) {
          if (!ok) failures += 1;
          console.log(`   ${ok ? 'pass' : 'FAIL'}  ${name} (${detail})`);
        }
        void expectedAov;
      }
    }

    const checkouts = await listCheckouts(conn.db, workspace.id, range(30), 50);
    const expectedCheckouts = seeded.checkouts.filter((c) => !c.completed);
    const expectedRecovered = expectedCheckouts
      .reduce((total, c) => total + c.total, 0)
      .toFixed(2);
    console.log('\n30d checkouts');
    console.log(`  returned          ${checkouts.items.length} of ${seeded.checkouts.length} seeded (one completed, so ${expectedCheckouts.length} expected)`);
    console.log(`  recovered value   ${checkouts.recoveredValue} ${checkouts.currencyCode}`);
    for (const [name, ok, detail] of [
      ['completed checkout excluded', checkouts.items.every((i) => i.id !== seeded.checkouts[4].id), 'no completed row returned'],
      ['count matches', checkouts.items.length === expectedCheckouts.length, `${checkouts.items.length} vs ${expectedCheckouts.length}`],
      ['recovered value matches', checkouts.recoveredValue === expectedRecovered, `${checkouts.recoveredValue} vs ${expectedRecovered}`],
    ]) {
      if (!ok) failures += 1;
      console.log(`   ${ok ? 'pass' : 'FAIL'}  ${name} (${detail})`);
    }

    await closeDatabase(conn);
    console.log(`\n${failures === 0 ? 'all analytics assertions passed' : `${failures} analytics assertion(s) FAILED`}`);
    if (failures > 0) process.exitCode = 1;
    console.log('seeded data is still present; run with --cleanup to remove it');
  }
} catch (error) {
  console.error('failed:', error.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
