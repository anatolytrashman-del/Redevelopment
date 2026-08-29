// Vercel serverless function: проксирует публичную превью-страницу
// t.me/<handle> и достаёт из неё og:image — единственный способ получить
// аватар произвольного пользователя Telegram по юзернейму без официального
// API (Bot API отдаёт фото только тем ботам, кому пользователь сам написал,
// по чужому юзернейму так фото не получить в принципе).
//
// Неофициальный приём: Telegram может поменять разметку страницы, а если у
// пользователя скрыта приватность фото — вместо селфи вернётся сгенерированный
// Telegram-ом кружок с буквой, не более информативный, чем наша заглушка с
// инициалами.
//
// Здесь только скачивание и проксирование картинки — сохранение в бакет и
// привязка к лиду делает клиент через уже существующий uploadLeadPhoto
// (см. src/lib/leadsApi.ts, tryAutoFillTelegramAvatar).

import { requireStaffAuth } from './_auth.js';

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const FETCH_TIMEOUT_MS = 8000;
// t.me отдаёт HTML-превью независимо от User-Agent, но браузерный UA снижает
// риск попасть под отдельные лимиты/блокировки для очевидно не-браузерных
// запросов.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Атрибуты meta-тега у Telegram идут в фиксированном порядке
// (property потом content), но на случай изменений сначала находим весь
// тег, потом content внутри него — устойчивее к порядку атрибутов.
function extractOgImage(html) {
  const tagMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i);
  if (!tagMatch) return null;
  const contentMatch = tagMatch[0].match(/content=["']([^"']+)["']/i);
  return contentMatch ? contentMatch[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const handle = typeof req.query.handle === 'string' ? req.query.handle : '';
  if (!HANDLE_RE.test(handle)) {
    res.status(400).json({ error: 'Некорректный юзернейм' });
    return;
  }

  try {
    const pageResp = await fetchWithTimeout(`https://t.me/${handle}`, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
    if (!pageResp.ok) {
      res.status(404).json({ error: 'Профиль не найден' });
      return;
    }
    const html = await pageResp.text();
    const imageUrl = extractOgImage(html);
    if (!imageUrl) {
      res.status(404).json({ error: 'Фото не найдено' });
      return;
    }

    const imageResp = await fetchWithTimeout(imageUrl);
    if (!imageResp.ok) {
      res.status(404).json({ error: 'Не удалось скачать фото' });
      return;
    }

    const buffer = Buffer.from(await imageResp.arrayBuffer());
    res.setHeader('Content-Type', imageResp.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Не удалось получить фото' });
  }
}
