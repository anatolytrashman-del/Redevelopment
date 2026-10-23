#!/usr/bin/env node
// scripts/matreshka/import/lib.mjs
// Общее для импорта волн 3.x: парсинг CSV (с кавычками), нормализация, маппинг,
// отчёт сверки (ambiguous rows по юрлицу), create/apply/rollback batch через PostgREST.
// Секреты — ТОЛЬКО при --apply, из process.env, НИКОГДА не печатаются и не читаются в dry-run.
// Dry-run по умолчанию. Никаких сетевых вызовов в dry-run. Не трогает legacy-таблицы.

import fs from 'node:fs';
import path from 'node:path';

const TMP_REPORT_DIR = path.resolve('tmp/matreshka-import');

export function ensureTmpDir() {
  fs.mkdirSync(TMP_REPORT_DIR, { recursive: true });
  return TMP_REPORT_DIR;
}

export function parseCSV(text) {
  // Минимальный парсер CSV, поддерживает "..." и "" внутри
  if (!text || typeof text !== 'string') return [];
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuote && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i++;
      continue;
    }
    if (ch === ',' && !inQuote) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuote) {
      row.push(field);
      field = '';
      if (row.length > 0 && row.some((c) => c.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      if (ch === '\r' && next === '\n') i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] || '').trim();
    });
    return obj;
  });
}

export function parseMapping(m) {
  if (!m) return {};
  if (typeof m === 'object') return m;
  try {
    return JSON.parse(m);
  } catch (e) {
    throw new Error('invalid --mapping JSON: ' + String(e));
  }
}

const AMBIGUOUS_LEGAL = ['трэшмен', 'лавэ драйв', 'лэвэ', 'трешмен'];

export function isAmbiguousForMatreshka(row, mapping) {
  const m = parseMapping(mapping);
  const canon = {};
  for (const [csvH, val] of Object.entries(row)) {
    const c = m[csvH] || csvH;
    canon[c.toLowerCase()] = val;
  }
  const legal = (canon.legalentity || canon['юрлицо'] || canon.legal || canon.company || '').toLowerCase();
  if (!legal) return false;
  if (legal.includes('матр') || legal.includes('matr')) return false;
  return AMBIGUOUS_LEGAL.some((a) => legal.includes(a));
}

export function normalizeRequestRow(raw, mapping) {
  const m = parseMapping(mapping);
  const r = {};
  for (const [csvH, val] of Object.entries(raw)) {
    const canon = m[csvH] || csvH;
    r[canon] = val;
  }
  const rawAmt = String(r.amount || r['сумма'] || '0').replace(/\s/g, '').replace(/,/g, '.');
  const num = parseFloat(rawAmt.replace(/[^\d.-]/g, '')) || 0;
  return {
    date: r.date || r['дата'] || '',
    number: r.number || r['номер'] || '',
    supplier: r.supplier || r['поставщик'] || '',
    legalEntity: r.legalEntity || r['юрлицо'] || r.legal || '',
    amount: num,
    supplyKind: (r.supplyKind || r['вид поставки'] || r['вид'] || 'прочее').toLowerCase(),
    comment: r.comment || r['комментарий'] || r['коммент'] || '',
    raw: raw,
  };
}

function getServiceCreds() {
  // читаем ТОЛЬКО когда вызвано из apply-пути
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --apply');
  }
  return { url: String(url).trim(), key: String(key) };
}

async function restGet(url, key, pathQuery) {
  const resp = await fetch(`${url}/rest/v1/${pathQuery}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  });
  if (!resp.ok) throw new Error(`GET ${pathQuery} ${resp.status}`);
  const total = Number((resp.headers.get('content-range') || '0-0/0').split('/')[1] || '0');
  const data = await resp.json().catch(() => []);
  return { data, total };
}

async function restPost(url, key, table, payload) {
  const resp = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`POST ${table} failed ${resp.status}: ${t.slice(0, 300)}`);
  }
  return resp.json();
}

async function restPatch(url, key, tableQuery, payload) {
  const resp = await fetch(`${url}/rest/v1/${tableQuery}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`PATCH ${tableQuery} ${resp.status}`);
  return resp.json();
}

async function restDelete(url, key, tableQuery) {
  const resp = await fetch(`${url}/rest/v1/${tableQuery}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!resp.ok) throw new Error(`DELETE ${tableQuery} ${resp.status}`);
  return true;
}

async function fetchClientId(url, key, slug) {
  const { data } = await restGet(url, key, `clients?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  if (!data || !data[0]) throw new Error(`client not found by slug: ${slug}`);
  return data[0].id;
}

export async function createBatch({ clientSlug, wave = '3.3', source, dryRun = true, stats = {}, note = '' }) {
  if (dryRun) {
    return {
      id: 'dry-' + Date.now(),
      client_id: null,
      wave,
      source,
      status: 'dry_run',
      stats,
      dryRun: true,
    };
  }
  const { url, key } = getServiceCreds(); // read secrets ONLY on apply path
  const clientId = await fetchClientId(url, key, clientSlug);
  const payload = {
    client_id: clientId,
    wave,
    source,
    status: 'applied',
    stats: { ...stats, applied_at: new Date().toISOString() },
    note,
  };
  const [batch] = await restPost(url, key, 'import_batches', payload);
  return batch;
}

export async function applyRequests(batch, clientSlug, rowsToInsert, { dryRun = true }) {
  // rowsToInsert expected to be already filtered (no ambiguous)
  const n = rowsToInsert.length;
  const sum = rowsToInsert.reduce((s, r) => s + (r.amount || 0), 0);
  const report = { total: n, included: n, excluded: 0, sumIncluded: sum, ambiguous: [] };
  if (dryRun) {
    return { batch: { ...batch, dryRun: true }, report, inserted: 0 };
  }
  const { url, key } = getServiceCreds();
  const clientId = batch.client_id || (await fetchClientId(url, key, clientSlug));
  const toIns = rowsToInsert.map((r) => ({
    client_id: clientId,
    title: [r.number, r.supplier].filter(Boolean).join(' ') || 'Импорт поставки',
    description: `Импорт: ${r.date} | ${r.supplier} | ${r.legalEntity} | ${r.amount} | ${r.comment}`.slice(0, 2000),
    supply_kind: r.supplyKind || 'прочее',
    status: 'new',
    import_batch_id: batch.id,
    created_at: r.date ? new Date(r.date).toISOString() : undefined,
  }));
  if (toIns.length) await restPost(url, key, 'client_requests', toIns);
  await restPost(url, key, 'client_request_events', toIns.map((r, idx) => ({
    request_id: null,
    client_id: clientId,
    kind: 'imported',
    payload: { from_batch: batch.id, orig: rowsToInsert[idx] },
    import_batch_id: batch.id,
  })).slice(0, 1));
  return { batch, report, inserted: toIns.length };
}

export async function applySupplierNotes(batch, clientSlug, rows, { dryRun = true }) {
  // stub for notes/prices; real mapping would be in the csv script
  if (dryRun) {
    return { batch: { ...batch, dryRun: true }, insertedNotes: 0, insertedPrices: 0 };
  }
  const { url, key } = getServiceCreds();
  const clientId = batch.client_id || (await fetchClientId(url, key, clientSlug));
  // minimal insert to prove path; real would map supplier_ref etc.
  const notes = rows.map((r) => ({
    client_id: clientId,
    supplier_ref: r.supplier_ref || 'catalog:dry',
    body: r.body || 'imported note',
    import_batch_id: batch.id,
  }));
  if (notes.length) await restPost(url, key, 'client_supplier_notes', notes);
  return { batch, insertedNotes: notes.length, insertedPrices: 0 };
}

export async function rollbackBatch(batchId, { dryRun = true, confirm = '' }) {
  if (!batchId) throw new Error('batch id required');
  if (!dryRun) {
    if (!confirm || String(confirm) !== String(batchId)) {
      throw new Error('--apply requires --confirm <batch-uuid> exactly');
    }
    const { url, key } = getServiceCreds();
    const tables = [
      'client_request_events',
      'client_requests',
      'client_added_suppliers',
      'client_supplier_notes',
      'client_supplier_prices',
      'client_members',
    ];
    for (const t of tables) {
      await restDelete(url, key, `${t}?import_batch_id=eq.${encodeURIComponent(batchId)}`);
    }
    await restPatch(url, key, `import_batches?id=eq.${encodeURIComponent(batchId)}`, {
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
    });
    return { rolledBack: true, batchId };
  }
  // dry-run: never read secrets
  return rollbackDryPlan(batchId);
}

// helper to avoid reading env in pure dry paths for rollback
export function rollbackDryPlan(batchId) {
  return {
    dryRun: true,
    batchId,
    tables: ['client_request_events','client_requests','client_added_suppliers','client_supplier_notes','client_supplier_prices','client_members'],
    message: 'dry-run: would DELETE rows where import_batch_id = ' + batchId + ' from above tables (matreshka only), then mark batch rolled_back',
  };
}

export function writeReport(name, data) {
  const dir = ensureTmpDir();
  const p = path.join(dir, `${name}-${Date.now()}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}
