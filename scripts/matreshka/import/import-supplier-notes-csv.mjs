#!/usr/bin/env node
// scripts/matreshka/import/import-supplier-notes-csv.mjs
// Аналогично requests: импорт client_supplier_notes / prices из CSV (пометки/цены по поставщикам).
// Dry-run default. --apply + --confirm оба обязательны для записи.
// Секреты только на apply, не печатаются. Без сети в dry. Только matreshka-таблицы.

import fs from 'node:fs';
import path from 'node:path';
import {
  parseCSV,
  parseMapping,
  createBatch,
  applySupplierNotes,
  writeReport,
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
const file = args.file || args.f;
const client = args.client || 'matreshka';
const mappingJson = args.mapping || '{}';
const doApply = !!args.apply;
const confirm = typeof args.confirm === 'string' ? args.confirm : '';

if (!file) {
  console.error('Usage: --file <csv> --client <slug> [--mapping <json>] [--apply --confirm "<slug>"]');
  process.exit(2);
}
if (doApply && (!confirm || confirm !== client)) {
  console.error('ERROR: --apply requires --confirm "' + client + '" (exact). Refusing without secret read or network.');
  process.exit(1);
}

const dryRun = !doApply;
const csvPath = path.resolve(file);
if (!fs.existsSync(csvPath)) {
  console.error('file not found:', csvPath);
  process.exit(1);
}
const text = fs.readFileSync(csvPath, 'utf8');
const raw = parseCSV(text);
const m = parseMapping(mappingJson);
const rows = raw.map((row) => {
  const norm = {};
  for (const [h, v] of Object.entries(row)) {
    const c = m[h] || h;
    norm[c] = v;
  }
  return norm;
});

const report = {
  wave: '3.2',
  client,
  source: 'csv-notes:' + path.basename(csvPath),
  dryRun,
  totalRows: rows.length,
  timestamp: new Date().toISOString(),
};
console.log('=== import-supplier-notes-csv (dry default) ===');
console.log('client:', client, 'rows:', rows.length);
const rp = writeReport('supplier-notes', report);
console.log('report:', rp);

if (dryRun) {
  console.log('dry-run complete (no secrets, no net).');
  process.exit(0);
}

const batch = await createBatch({ clientSlug: client, wave: '3.2', source: 'notes-csv', dryRun: false });
const res = await applySupplierNotes(batch, client, rows, { dryRun: false });
console.log('notes inserted (apply):', res.insertedNotes);
process.exit(0);
