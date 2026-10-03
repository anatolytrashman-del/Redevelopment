import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Approved covers are reviewed on preview without mutating the shared database.
export async function applyApprovedTcPreview(directory, environment = process.env.VERCEL_ENV) {
  if (environment !== 'preview') return;
  const approved = JSON.parse(readFileSync(new URL('./data/approved-tc-preview.json', import.meta.url), 'utf8'));
  const listFile = join(directory, 'trade-centers.json');
  if (!existsSync(listFile)) {
    const rows = [];
    const url = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
    const key = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
    for (let offset = 0; ; offset += 500) {
      const response = await fetch(`${url}/rest/v1/business_centers?select=*&kind=eq.tc&is_hidden=eq.false&order=sort_order.asc,id.asc`, {
        headers: { apikey: key, Range: `${offset}-${offset + 499}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Preview TC catalogue fetch failed: ${response.status}`);
      const page = await response.json();
      rows.push(...page.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('official_site_snapshot_')))));
      if (page.length < 500) break;
    }
    mkdirSync(directory, { recursive: true });
    const generatedAt = new Date().toISOString();
    mkdirSync(join(directory, 'bc'), { recursive: true });
    for (const row of rows) writeFileSync(join(directory, 'bc', `${row.slug}.json`), JSON.stringify({ generatedAt, row }));
    writeFileSync(listFile, JSON.stringify({ generatedAt, rows }));
  }
  const list = JSON.parse(readFileSync(listFile, 'utf8'));
  const rows = new Map(list.rows.map((row) => [row.slug, row]));
  const detailDirectory = join(directory, 'bc');
  mkdirSync(detailDirectory, { recursive: true });
  for (const approvedRow of approved.rows) {
    const file = join(detailDirectory, `${approvedRow.slug}.json`);
    const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).row : approvedRow;
    const row = { ...current, photos: approvedRow.photos, is_hidden: false };
    rows.set(row.slug, { ...(rows.get(row.slug) ?? row), photos: row.photos, is_hidden: false });
    writeFileSync(file, JSON.stringify({ generatedAt: list.generatedAt, row }));
  }
  list.rows = [...rows.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  writeFileSync(listFile, JSON.stringify(list));
  console.log(`[catalog-data] approved preview covers: ${approved.rows.length}`);
}
