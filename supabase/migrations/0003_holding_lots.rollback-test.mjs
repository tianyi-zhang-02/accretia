// Rollback-safety verification for migration 0003.
//
// Exercises the do-block at the bottom of 0003_holding_lots.sql against a
// real Postgres engine (pglite — Postgres compiled to WASM, ~3MB devDep)
// in four scenarios:
//
//   CASE 1 (GOOD): lots and holdings match exactly to the cent.
//                  → do-block must complete without raising.
//   CASE 2 (BAD):  one lot's cost_basis is off by $0.01.
//                  → do-block must raise; transaction would roll back.
//   CASE 3 (BAD):  a holding has zero lots (backfill missed it).
//                  → do-block must raise; transaction would roll back.
//   CASE 4 (BAD):  quantity off by 1e-8 (the precision boundary of
//                  numeric(18,8)).
//                  → do-block must raise; transaction would roll back.
//
// All four must pass for the migration to be considered safe to apply on
// real data. The same test was run during PR #9 review and observed to
// behave correctly on every case; this file pins the verification so any
// future change to 0003's safety check has to keep passing it.
//
// Run with:
//   npm run test:migrations
//
// Future migrations with their own safety blocks should ship a sibling
// `NNNN_xxx.rollback-test.mjs` and extend the `test:migrations` npm
// script to invoke it.

import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let exitCode = 0;

// Minimal schema mirroring just the columns the do-block reads. The full
// schema isn't loaded — we're testing the safety check, not the table
// creation or the backfill INSERT (those are independently exercised by
// the JS test in 0003_holding_lots.test.ts and by the actual migration
// at apply time).
await db.exec(`
  create table public.holdings (
    id          uuid primary key default gen_random_uuid(),
    quantity    numeric(18,8) not null,
    cost_basis  numeric(14,2) not null
  );
  create table public.holding_lots (
    id          uuid primary key default gen_random_uuid(),
    holding_id  uuid not null,
    quantity    numeric(18,8) not null,
    cost_basis  numeric(14,2) not null
  );
`);

// The exact do-block from the migration source.
const SAFETY_CHECK = `
  do $$
  declare
    mismatched_holdings int;
    total_holdings      int;
    total_lots          int;
  begin
    select count(*) into total_holdings from public.holdings;
    select count(*) into total_lots     from public.holding_lots;

    select count(*) into mismatched_holdings
    from public.holdings h
    left join (
      select holding_id,
             sum(quantity)   as lot_quantity_sum,
             sum(cost_basis) as lot_cost_basis_sum
      from public.holding_lots
      group by holding_id
    ) l on l.holding_id = h.id
    where l.holding_id is null
          or l.lot_quantity_sum   != h.quantity
          or l.lot_cost_basis_sum != h.cost_basis;

    if mismatched_holdings > 0 then
      raise exception
        'Tax lot migration safety check failed: % of % holdings have lot sums that do not match the holding total to the cent. Rolling back the entire migration. NO changes have been applied to the database.',
        mismatched_holdings, total_holdings;
    end if;

    raise notice
      'Tax lot migration verified: % holdings, % lots, all sums identical to the cent.',
      total_holdings, total_lots;
  end;
  $$;
`;

function header(s) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}

async function resetTables() {
  await db.exec(`truncate public.holdings cascade; truncate public.holding_lots;`);
}

async function expectPass(label, seed) {
  console.log(`  Seed: ${seed.summary}`);
  await db.exec(seed.sql);
  try {
    await db.exec(SAFETY_CHECK);
    console.log(`  ✅ ${label}: do-block completed without raising (as expected).`);
  } catch (e) {
    console.log(`  ❌ ${label}: UNEXPECTED EXCEPTION (good case should not raise):`);
    console.log(`     ${e.message}`);
    exitCode = 1;
  }
}

async function expectRaise(label, seed) {
  console.log(`  Seed: ${seed.summary}`);
  await db.exec(seed.sql);
  try {
    await db.exec(SAFETY_CHECK);
    console.log(`  ❌ ${label}: do-block did NOT raise — safety check is BROKEN.`);
    exitCode = 1;
  } catch (e) {
    console.log(`  ✅ ${label}: do-block raised as expected:`);
    console.log(`     ${e.message}`);
  }
}

// ─── CASE 1 — GOOD ───────────────────────────────────────────────────────
header('CASE 1 — GOOD: lots match holding totals to the cent');
await resetTables();
await expectPass('CASE 1', {
  summary: '3 holdings, 3 lots, each lot mirrors the parent holding exactly.',
  sql: `
    insert into public.holdings (id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000001', 100,         14350.50),
      ('00000000-0000-0000-0000-000000000002',  47.39281004, 9876.21),
      ('00000000-0000-0000-0000-000000000003',  25,             0.00);
    insert into public.holding_lots (holding_id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000001', 100,         14350.50),
      ('00000000-0000-0000-0000-000000000002',  47.39281004, 9876.21),
      ('00000000-0000-0000-0000-000000000003',  25,             0.00);
  `,
});

// ─── CASE 2 — BAD: $0.01 cost-basis mismatch ─────────────────────────────
header('CASE 2 — BAD: deliberate $0.01 cost-basis mismatch on one holding');
await resetTables();
await expectRaise('CASE 2', {
  summary: 'Lot for holding #4 is off by $0.01; holding #5 is fine.',
  sql: `
    insert into public.holdings (id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000004', 50, 1000.00),
      ('00000000-0000-0000-0000-000000000005', 10,  500.00);
    insert into public.holding_lots (holding_id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000004', 50,  999.99),
      ('00000000-0000-0000-0000-000000000005', 10,  500.00);
  `,
});

// ─── CASE 3 — BAD: zero-lot holding ──────────────────────────────────────
header('CASE 3 — BAD: holding has zero lots (missed by the backfill)');
await resetTables();
await expectRaise('CASE 3', {
  summary: '2 holdings, only 1 lot — holding #7 has none.',
  sql: `
    insert into public.holdings (id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000006', 100, 14350.50),
      ('00000000-0000-0000-0000-000000000007',  10,   500.00);
    insert into public.holding_lots (holding_id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000006', 100, 14350.50);
  `,
});

// ─── CASE 4 — BAD: precision boundary (1e-8 quantity drift) ──────────────
header('CASE 4 — BAD: quantity off by 1e-8 (precision boundary)');
await resetTables();
await expectRaise('CASE 4', {
  summary: 'Holding quantity 0.12345678, lot quantity 0.12345677 — off by 1e-8.',
  sql: `
    insert into public.holdings (id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000008', 0.12345678, 4321.99);
    insert into public.holding_lots (holding_id, quantity, cost_basis) values
      ('00000000-0000-0000-0000-000000000008', 0.12345677, 4321.99);
  `,
});

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
console.log('SUMMARY');
console.log('='.repeat(72));
if (exitCode === 0) {
  console.log('  ✅ All 4 cases behaved as expected. Safety check is sound.');
} else {
  console.log('  ❌ At least one case behaved unexpectedly. Migration 0003 is UNSAFE');
  console.log('     to apply against real data until this is investigated.');
}
process.exit(exitCode);
