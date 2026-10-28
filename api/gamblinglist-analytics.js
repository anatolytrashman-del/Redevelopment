// Показатели gamblinglist.pro для админки (/admin/metrics → «GamblingList»).
//
// Сайт gamblinglist.pro живёт в отдельном репозитории (whitegambling) и
// отдельном Vercel-проекте `gamblinglist`, поэтому своего счётчика
// (page_views_daily) у него нет — источник здесь Vercel Web Analytics,
// публичный REST API (GET /v1/query/web-analytics/visits/aggregate, доступен
// с 2026-05-18, https://vercel.com/docs/analytics/web-analytics-api).
//
// Web Analytics не умеет «задним числом»: данные начинаются с релиза
// gamblinglist, в котором подключён скрипт /_vercel/insights. До этого API
// честно отдаёт пустые ряды — страница так и показывает.
//
// Env (Production/Preview проекта redevelopment):
//   VERCEL_ANALYTICS_TOKEN — Vercel access token с доступом к команде trashman
//                            (read-only достаточно). Без него эндпоинт
//                            отвечает { configured: false } — это не ошибка.
//   VERCEL_ANALYTICS_TEAM_ID       — необязательно, по умолчанию team trashman.
//   GAMBLINGLIST_VERCEL_PROJECT    — необязательно, по умолчанию gamblinglist.
//
// Авторизация — staff session (api/_auth.js), токен Vercel наружу не уходит.

import { requireStaffAuth } from './_auth.js';

const API = 'https://api.vercel.com/v1/query/web-analytics/visits/aggregate';
const DEFAULT_TEAM_ID = 'team_kyP6ogW1N5p9HN17G6Sg7iHV'; // trashman, не секрет
const DEFAULT_PROJECT = 'gamblinglist';
const MAX_DAYS = 90;

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function clampDays(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, MAX_DAYS);
}

async function aggregate({ token, teamId, projectId, since, until, by, limit }) {
  const params = new URLSearchParams({ projectId, teamId, since, until, by });
  if (limit) params.set('limit', String(limit));
  const resp = await fetch(`${API}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!resp.ok) {
    const message = body?.error?.message || body?.error?.code || `HTTP ${resp.status}`;
    const err = new Error(message);
    err.status = resp.status;
    throw err;
  }
  return Array.isArray(body?.data) ? body.data : [];
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeDaily(rows) {
  return rows
    .map((row) => ({
      day: String(row.timestamp ?? row.day ?? '').slice(0, 10),
      pageviews: toNumber(row.pageviews),
      visitors: toNumber(row.visitors),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function normalizeBreakdown(rows, key) {
  return rows
    .map((row) => ({
      key: row[key] == null || row[key] === '' ? '' : String(row[key]),
      pageviews: toNumber(row.pageviews),
      visitors: toNumber(row.visitors),
    }))
    .sort((a, b) => b.pageviews - a.pageviews);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  res.setHeader('Cache-Control', 'private, no-store');

  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID || DEFAULT_TEAM_ID;
  const projectId = process.env.GAMBLINGLIST_VERCEL_PROJECT || DEFAULT_PROJECT;
  if (!token) {
    res.status(200).json({ configured: false, source: 'vercel-web-analytics' });
    return;
  }

  const days = clampDays(req.query?.days);
  const untilDate = new Date();
  const sinceDate = new Date(untilDate.getTime() - (days - 1) * 86_400_000);
  // Полные сутки UTC от начала периода до текущего момента: с голой датой в
  // until API обрезает разбивки (не по дням) на 01:00 последнего дня.
  const since = `${isoDay(sinceDate)}T00:00:00.000Z`;
  const until = untilDate.toISOString();
  const base = { token, teamId, projectId, since, until };

  try {
    const [daily, pages, referrers, countries] = await Promise.all([
      aggregate({ ...base, by: 'day', limit: 100 }),
      aggregate({ ...base, by: 'requestPath', limit: 10 }),
      // 50, а не 10: в «Показателях» видны только поиск и ИИ, их не должен
      // вытеснять из топа прямой трафик и прочие сайты.
      aggregate({ ...base, by: 'referrerHostname', limit: 50 }),
      aggregate({ ...base, by: 'country', limit: 10 }),
    ]);
    res.status(200).json({
      configured: true,
      source: 'vercel-web-analytics',
      since,
      until,
      daily: normalizeDaily(daily),
      pages: normalizeBreakdown(pages, 'requestPath'),
      referrers: normalizeBreakdown(referrers, 'referrerHostname'),
      countries: normalizeBreakdown(countries, 'country'),
    });
  } catch (err) {
    res.status(502).json({
      configured: true,
      error: `Vercel Web Analytics: ${err?.message || 'ошибка запроса'}`,
    });
  }
}
