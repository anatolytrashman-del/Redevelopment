import { readFile } from 'node:fs/promises';
import { requireStaffAuth } from './_auth.js';

export async function readMetricsSnapshot() {
  return JSON.parse(await readFile(new URL('../data/search-metrics.json', import.meta.url), 'utf8'));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Метод не поддерживается' });
  if (!await requireStaffAuth(req, res)) return;
  try {
    return res.status(200).json(await readMetricsSnapshot());
  } catch {
    return res.status(503).json({ error: 'Снимок показателей недоступен' });
  }
}
