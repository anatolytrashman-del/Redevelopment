// Vercel serverless function: дёргает Vercel Deploy Hook, чтобы пересобрать
// прод сразу после сохранения объекта в админке (см. lib/objectsApi.ts) —
// иначе пререндеренный при сборке HTML (scripts/prerender.mjs, SEO_PLAN.md
// Э2-1) хранит старые title/meta/цену объекта до следующего обычного пуша.
// URL хука — секрет (POST на него запускает реальную пересборку прода,
// незачем светить его в клиентском бандле), лежит только в переменных
// окружения Vercel: VERCEL_DEPLOY_HOOK_URL.
//
// Best-effort: если хук не настроен или Vercel недоступен, отвечаем 200 —
// это не должно ронять сохранение объекта в админке, только логируется.
//
// P0.3 аудита безопасности: требует сессию сотрудника (раньше — вообще без
// проверки, любой мог дёргать реальную пересборку прода) + дебаунс — не
// чаще одной пересборки за DEBOUNCE_MS, даже если сохранили несколько
// объектов подряд за одну правку. Отметка времени — в таблице
// deploy_debounce (RLS без единой политики — доступна только service_role,
// как и должно быть для чисто служебной метки).
import { requireStaffAuth } from './_auth.js';

const DEBOUNCE_MS = 5 * 60_000;

async function getLastTriggeredAt() {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/deploy_debounce?id=eq.default&select=triggered_at`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0]?.triggered_at ?? null;
}

async function setLastTriggeredAt(iso) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/deploy_debounce`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 'default', triggered_at: iso }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    console.warn('[trigger-rebuild] VERCEL_DEPLOY_HOOK_URL не настроен — пересборка не запущена');
    res.status(200).json({ triggered: false, reason: 'no deploy hook configured' });
    return;
  }

  const lastTriggeredAt = await getLastTriggeredAt();
  if (lastTriggeredAt && Date.now() - new Date(lastTriggeredAt).getTime() < DEBOUNCE_MS) {
    res.status(200).json({ triggered: false, reason: 'debounced' });
    return;
  }
  // Отметку ставим до самого вызова хука — минимизирует (не гарантирует
  // абсолютно, тут не транзакция) окно, в котором два почти одновременных
  // сохранения объекта обе проскочат проверку выше.
  await setLastTriggeredAt(new Date().toISOString());

  try {
    const hookRes = await fetch(hookUrl, { method: 'POST' });
    res.status(200).json({ triggered: hookRes.ok });
  } catch (err) {
    console.error('[trigger-rebuild] не удалось дёрнуть Deploy Hook:', err);
    res.status(200).json({ triggered: false, reason: 'fetch failed' });
  }
}
