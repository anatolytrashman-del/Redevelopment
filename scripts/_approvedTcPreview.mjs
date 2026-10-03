import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Approved covers are reviewed on preview without mutating the shared database.
export function applyApprovedTcPreview(directory, environment = process.env.VERCEL_ENV) {
  if (environment !== 'preview') return;
  const approved = JSON.parse(readFileSync(new URL('./data/approved-tc-preview.json', import.meta.url), 'utf8'));
  const listFile = join(directory, 'trade-centers.json');
  if (!existsSync(listFile)) throw new Error('Preview TC catalogue is missing');
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
