// Импорт CSV из Google Search Console → Generative AI performance report.
// API searchAnalytics на 2026-10-07 ещё не отдаёт type для AI Overviews /
// AI Mode — единственный путь в админку: экспорт из UI и загрузка сюда.
// Авторизация — staff session (api/_auth.js), пишет service_role.

import { createClient } from '@supabase/supabase-js';
import { requireStaffAuth } from './_auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseCsv(text) {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const split = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function colIndex(headers, names) {
  for (const name of names) {
    const i = headers.findIndex((h) => h === name || h.includes(name));
    if (i >= 0) return i;
  }
  return -1;
}

function parseImpressions(value) {
  if (value == null || value === '' || value === '-' || value === '~') return 0;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toIsoDate(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizePage(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = s.startsWith('http') ? new URL(s) : new URL(s, 'https://redevelopment.pro');
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return s.startsWith('/') ? s.replace(/\/+$/, '') || '/' : null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase env не задан' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
  const kind = req.body?.kind === 'pages' ? 'pages' : 'dates';
  if (!csv.trim()) {
    res.status(400).json({ error: 'Пустой CSV' });
    return;
  }

  const { headers, rows } = parseCsv(csv);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const stamp = new Date().toISOString();

  if (kind === 'dates') {
    const dateIdx = colIndex(headers, ['date', 'день', 'дата']);
    const imprIdx = colIndex(headers, ['impressions', 'показы', 'impression']);
    if (dateIdx < 0 || imprIdx < 0) {
      res.status(400).json({
        error: 'Нужны колонки Date и Impressions (экспорт графика Generative AI по дням).',
      });
      return;
    }
    const out = [];
    for (const row of rows) {
      const date = toIsoDate(row[dateIdx]);
      if (!date) continue;
      out.push({ date, impressions: parseImpressions(row[imprIdx]), source: 'csv', updated_at: stamp });
    }
    if (out.length === 0) {
      res.status(400).json({ error: 'В CSV не нашлось строк с датами' });
      return;
    }
    const { error } = await supabase.from('google_search_console_ai_stats').upsert(out, { onConflict: 'date' });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true, kind: 'dates', rows: out.length });
    return;
  }

  const pageIdx = colIndex(headers, ['top pages', 'page', 'pages', 'страница', 'url']);
  const imprIdx = colIndex(headers, ['impressions', 'показы', 'impression']);
  if (pageIdx < 0 || imprIdx < 0) {
    res.status(400).json({
      error: 'Нужны колонки Top pages / Page и Impressions (экспорт таблицы страниц Generative AI).',
    });
    return;
  }
  const dateFrom = toIsoDate(req.body?.dateFrom) || null;
  const dateTo = toIsoDate(req.body?.dateTo) || null;
  const merged = new Map();
  for (const row of rows) {
    const page = normalizePage(row[pageIdx]);
    if (!page) continue;
    const impressions = parseImpressions(row[imprIdx]);
    merged.set(page, (merged.get(page) ?? 0) + impressions);
  }
  const out = [...merged.entries()].map(([page, impressions]) => ({
    page,
    impressions,
    date_from: dateFrom,
    date_to: dateTo,
    updated_at: stamp,
  }));
  if (out.length === 0) {
    res.status(400).json({ error: 'В CSV не нашлось страниц' });
    return;
  }
  const del = await supabase.from('google_search_console_ai_pages').delete().gte('impressions', 0);
  if (del.error) {
    res.status(500).json({ error: del.error.message });
    return;
  }
  const { error } = await supabase.from('google_search_console_ai_pages').insert(out);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ ok: true, kind: 'pages', rows: out.length });
}
