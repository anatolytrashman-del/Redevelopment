#!/usr/bin/env node
// scripts/osnova/import/rollback-batch.mjs
// Откат волны импорта по import_batch_id.
// Dry-run (список кол-в по таблицам) — default.
//   node scripts/osnova/import/rollback-batch.mjs --batch <uuid>
//   --apply --confirm <uuid>   # оба, иначе отказ БЕЗ сети/секретов
// Удаляет ТОЛЬКО из osnova client_* таблиц (requests,events,added,notes,prices,members). Legacy не трогает.

import {
  rollbackBatch,
  rollbackDryPlan,
} from './lib.mjs';

function parseArgs(argv) {
  const args = {};
  const VALUED = new Set(['file', 'f', 'client', 'mapping', 'batch', 'confirm']);
  for (let i = 2; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    if (a.includes('=')) {
      const [k, v] = a.split('=', 2);
      args[k] = v;
      continue;
    }
    if (VALUED.has(a)) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[a] = next;
        i++;
      } else {
        args[a] = true;
      }
      continue;
    }
    if (a === 'apply' || a === 'confirm') {
      args[a] = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[a] = next;
        i++;
      }
      continue;
    }
    args[a] = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const batchId = args.batch || args.b;
const doApply = !!args.apply;
const confirm = typeof args.confirm === 'string' ? args.confirm : '';

if (!batchId) {
  console.error('Usage: --batch <uuid> [--apply --confirm <uuid>]');
  process.exit(2);
}

const dryRun = !doApply;
if (doApply && (!confirm || confirm !== batchId)) {
  console.error('ERROR: --apply for rollback requires --confirm "' + batchId + '" exactly. Refusing (no secret read, no network).');
  process.exit(1);
}

if (dryRun) {
  const plan = rollbackDryPlan(batchId);
  console.log('=== rollback dry-run ===');
  console.log('batch:', batchId);
  console.log('would delete from (osnova only):', plan.tables.join(', '));
  console.log(plan.message);
  console.log('No secrets read, no network performed.');
  process.exit(0);
}

// apply
try {
  const res = await rollbackBatch(batchId, { dryRun: false, confirm });
  console.log('rolled back:', res);
} catch (e) {
  console.error('rollback failed:', e.message);
  process.exit(1);
}
process.exit(0);
