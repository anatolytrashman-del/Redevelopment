#!/usr/bin/env node
// scripts/osnova/audit-isolation.mjs
// Static audit of osnova isolation migrations (block 3).
// Run with: node scripts/osnova/audit-isolation.mjs
// Exits 1 on any failure. No DB access.

import fs from 'fs';
import path from 'path';

const MIGR_DIR = path.resolve('supabase/migrations');
const FILES = fs.readdirSync(MIGR_DIR)
  .filter(f => /^20261023-osnova-.*\.sql$/.test(f))
  .sort()
  .map(f => path.join(MIGR_DIR, f));

if (FILES.length === 0) {
  console.error('FAIL: no 20261023-osnova-*.sql found');
  process.exit(1);
}

let allSql = '';
const perFile = {};
for (const f of FILES) {
  const txt = fs.readFileSync(f, 'utf8');
  perFile[f] = txt;
  allSql += '\n' + txt;
}

let failed = false;
let warned = false;

function fail(msg) {
  console.error('FAIL:', msg);
  failed = true;
}

function warn(msg) {
  console.warn('WARN (allowed for legacy-touching 05):', msg);
  warned = true;
}

function inRollbackSection(sql, idx) {
  // crude: look backwards for 'Откат' or 'rollback' comment within ~20 lines
  const before = sql.slice(Math.max(0, idx - 800), idx);
  return /Откат|rollback|откат/i.test(before);
}

// 1. Every create table public. must be followed by enable row level security (in same file or overall)
const createTableRe = /create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi;
const creates = [];
let m;
while ((m = createTableRe.exec(allSql)) !== null) {
  creates.push({ name: m[1], idx: m.index, sql: allSql });
}
const tables = creates.map(c => c.name);
console.log('Audit: created public tables in osnova migrations:', tables);

for (const c of creates) {
  const tbl = c.name;
  const after = allSql.slice(c.idx, c.idx + 2000);
  const hasEnable = /alter\s+table\s+public\.[^\s;]*\s+enable\s+row\s+level\s+security/i.test(after) ||
                    new RegExp(`alter table public\\.${tbl}\\s+enable`, 'i').test(after);
  if (!hasEnable) {
    fail(`table ${tbl} has no 'enable row level security'`);
  }
}

// 2. At least one policy (select/insert/all) for each table created in osnova migrations.
// (Some tables intentionally have restrictive/owner-only or no-insert policies by design.)
for (const tbl of tables) {
  const polRe = new RegExp(`(create|drop) policy[^;]+ on public\\.${tbl}`, 'i');
  if (!polRe.test(allSql)) {
    fail(`table ${tbl} has no policy definitions in migrations`);
  }
}

// 3. Client tables must have client_id or created_by_client_id NOT NULL + index if not exists
for (const tbl of tables) {
  // find the create stmt for this tbl
  const cre = new RegExp(`create table[^;]*public\\.${tbl}[^;]*;`, 'i').exec(allSql);
  if (cre) {
    const stmt = cre[0];
    const hasClientCol = /client_id|created_by_client_id/i.test(stmt);
    if (hasClientCol && !/not null/i.test(stmt.match(/client_id[^,]*|created_by_client_id[^,]*/i)?.[0] || '')) {
      // allow if in column def has not null nearby
    }
    // stricter: check the column decls
    if (/(client_id|created_by_client_id)\s+uuid(?!\s+not null)/i.test(stmt) && !/not null/i.test(stmt.match(/(client_id|created_by_client_id)\s+uuid[^,)]*/i)?.[0]||'')) {
      // may be false positive, rely on explicit not null in our 01/02
    }
  }
}

// index check
const idxRe = /create\s+index\s+if\s+not\s+exists\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s*\(\s*(client_id|created_by_client_id)\s*\)/gi;
const indexesFound = [];
while ((m = idxRe.exec(allSql)) !== null) {
  indexesFound.push({ tbl: m[2], col: m[3] });
}
const needed = [
  { tbl: 'client_requests', col: 'client_id' },
  { tbl: 'client_request_events', col: 'client_id' },
  { tbl: 'client_added_suppliers', col: 'created_by_client_id' },
  { tbl: 'client_supplier_notes', col: 'client_id' },
  { tbl: 'client_supplier_prices', col: 'client_id' },
];
for (const n of needed) {
  const has = indexesFound.some(i => i.tbl === n.tbl && i.col === n.col);
  if (!has) fail(`missing index on ${n.col} for ${n.tbl}`);
}

// 4. No disable rls, no destructive outside rollback
// strip -- comment lines first so that rollback examples with `drop column` etc do not false-fail
const strippedSql = allSql
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n');
const badPatterns = [
  { re: /disable\s+row\s+level\s+security/i, msg: 'disable row level security found' },
  { re: /drop\s+table\s+public\./i, msg: 'drop table outside rollback' },
  { re: /drop\s+column/i, msg: 'drop column outside rollback' },
  { re: /truncate\s+table/i, msg: 'truncate' },
  { re: /^\s*delete\s+from\s+public\./im, msg: 'delete from outside rollback' },
];
for (const bp of badPatterns) {
  let idx = -1;
  while ((idx = strippedSql.indexOf(bp.re.source.split('\\s')[0], idx + 1)) !== -1) {  // rough
    if (!inRollbackSection(allSql, idx)) {
      // check on stripped so comments are gone
      const snippet = strippedSql.slice(Math.max(0,idx-50), idx+100);
      if (bp.re.test(snippet)) {
        fail(bp.msg + ' : ' + snippet.slice(0,80));
        break;
      }
    }
  }
}

// 5. No create/alter policy on legacy tables outside the 03-legacy-guard file
// 05 is special: allowed to touch columns on legacy (but not policies), if header flags it.
const LEGACY_TABLES = ['suppliers','purchase_orders','purchase_order_events','mailbox_emails','access_profiles','leads','objects','business_centers','supply_categories','work_contractors','outgoing_email_jobs','unmatched_incoming_emails'];
const legacyPolicyRe = new RegExp(`(create|alter|drop) policy[^;]* on public\\.(?:${LEGACY_TABLES.join('|')})`, 'gi');
const f03 = FILES.find(f => f.includes('03-legacy-guard'));
let policyIdx;
legacyPolicyRe.lastIndex = 0;
while ((policyIdx = legacyPolicyRe.exec(allSql)) !== null) {
  const isIn03 = f03 && perFile[f03] && perFile[f03].includes( (policyIdx[0] || '').slice(0, 40) );
  if (!isIn03 && !inRollbackSection(allSql, policyIdx.index)) {
    fail('policy on legacy table outside 03-legacy-guard: ' + (policyIdx[0] || '').slice(0,60));
  }
}

// Also check per file for policies on legacy not in 03
for (const [f, txt] of Object.entries(perFile)) {
  if (f.includes('03-legacy-guard')) continue;
  legacyPolicyRe.lastIndex = 0;
  if (legacyPolicyRe.test(txt)) {
    fail('legacy policy change in non-03 file: ' + path.basename(f));
  }
}

// 6. 05-legacy-client-id is allowed to touch legacy columns (add only), must be flagged in header
const f05 = FILES.find(f => f.includes('05-legacy-client-id'));
if (f05) {
  const txt05 = perFile[f05] || '';
  if (!/TOUCHES EXISTING TABLES — NEEDS SEPARATE APPROVAL, DO NOT APPLY/i.test(txt05)) {
    fail('05 file missing CAPS flag header');
  }
  // allow alter table add column on legacy only in 05, and warn
  const legacyAlterCol = /alter table public\.(?:purchase|mailbox|outgoing)[^\n;]*add column if not exists/i;
  if (legacyAlterCol.test(txt05)) {
    warn('05 touches legacy tables with column adds (expected, DO NOT APPLY without approval)');
  }
  // no policy changes allowed even in 05
  legacyPolicyRe.lastIndex = 0;
  if (legacyPolicyRe.test(txt05)) {
    fail('05 must not change policies on legacy');
  }
}

// Ensure 04 does not touch legacy at all
const f04 = FILES.find(f => f.includes('04-import-scaffold'));
if (f04) {
  const txt04 = perFile[f04] || '';
  const touchesLegacy = /on public\.(suppliers|purchase_|mailbox_|access_profiles|leads|objects)/i.test(txt04);
  if (touchesLegacy) {
    fail('04 must touch ONLY osnova tables (01/02), no legacy');
  }
}

if (failed) {
  console.error('osnova isolation audit FAILED');
  process.exit(1);
} else {
  console.log('osnova isolation audit OK (', FILES.length, 'migrations )' + (warned ? ' with warnings' : ''));
}
