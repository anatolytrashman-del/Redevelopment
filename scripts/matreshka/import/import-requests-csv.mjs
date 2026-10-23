#!/usr/bin/env node
// scripts/matreshka/import/import-requests-csv.mjs
// Импорт реестра поставок (заявок) из CSV (ручная выгрузка из Google Sheets «Поставки ООО Зеленый» / «Матрешка Зеленый»).
// НЕ использует Google API. Dry-run по умолчанию.
//   node scripts/matreshka/import/import-requests-csv.mjs --file=scripts/matreshka/import/fixtures/sample-requests.csv --client=matreshka --mapping='{"Дата":"date","Поставщик":"supplier","Юрлицо":"legalEntity","Сумма":"amount","Вид поставки":"supplyKind","Номер":"number","Комментарий":"comment"}'
//   --apply --confirm "matreshka"   # обе флаги обязательны для записи; иначе отказ БЕЗ чтения секретов и БЕЗ сети
//
// Отчёт сверки: строки, суммы, ambiguous (ИП Трэшмен / Лавэ Драйв и т.п. — исключены, перечислены).
// Отчёт пишется в tmp/matreshka-import/*.json (даже в dry).
// Секреты читаются ТОЛЬКО при --apply, никогда не печатаются.

import fs from 'node:fs';
import path from 'node:path';
import {
  parseCSV,
  normalizeRequestRow,
  isAmbiguousForMatreshka,
  createBatch,
  applyRequests,
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
  console.error('ERROR: --apply requires --confirm "' + client + '" (exact match) to write. Refusing without network or secret read.');
  process.exit(1);
}

const dryRun = !doApply;
const csvPath = path.resolve(file);
if (!fs.existsSync(csvPath)) {
  console.error('file not found:', csvPath);
  process.exit(1);
}
const text = fs.readFileSync(csvPath, 'utf8');
const rawRows = parseCSV(text);
const parsed = rawRows.map((r) => normalizeRequestRow(r, mappingJson));

const ambiguous = parsed.filter((r) => isAmbiguousForMatreshka(r.raw, mappingJson));
const included = parsed.filter((r) => !isAmbiguousForMatreshka(r.raw, mappingJson));
const totalSum = included.reduce((s, r) => s + (r.amount || 0), 0);

const report = {
  wave: '3.3',
  client,
  source: 'csv:' + path.basename(csvPath),
  dryRun,
  totalRows: parsed.length,
  includedRows: included.length,
  excludedRows: ambiguous.length,
  sumIncluded: totalSum,
  ambiguousList: ambiguous.map((a) => ({ legal: a.legalEntity, supplier: a.supplier, amount: a.amount })),
  timestamp: new Date().toISOString(),
};

console.log('=== Import requests CSV (dry-run default) ===');
console.log('client:', client);
console.log('total rows:', parsed.length);
console.log('included:', included.length, 'sum:', totalSum);
console.log('excluded (ambiguous legal entity):', ambiguous.length);
if (ambiguous.length) {
  console.log('Ambiguous (will be excluded, listed for manual review):');
  ambiguous.forEach((a) => console.log('  -', a.legalEntity || '?', a.supplier, a.amount));
}
console.log('mapping used:', mappingJson);

const reportPath = writeReport('requests', report);
console.log('report:', reportPath);

if (dryRun) {
  console.log('--apply not passed: dry-run complete, no writes, no secrets read, no network.');
  process.exit(0);
}

// APPLY path — here we may read secrets (only now)
const batch = await createBatch({
  clientSlug: client,
  wave: '3.3',
  source: 'csv:' + path.basename(csvPath),
  dryRun: false,
  stats: { total: parsed.length, included: included.length, sum: totalSum },
  note: 'import from ' + path.basename(csvPath),
});
console.log('batch created:', batch.id);

const res = await applyRequests(batch, client, included, { dryRun: false });
console.log('applied requests:', res.inserted);
console.log('final batch status would be applied');
process.exit(0);
