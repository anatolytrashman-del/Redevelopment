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
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    console.warn('[trigger-rebuild] VERCEL_DEPLOY_HOOK_URL не настроен — пересборка не запущена');
    res.status(200).json({ triggered: false, reason: 'no deploy hook configured' });
    return;
  }

  try {
    const hookRes = await fetch(hookUrl, { method: 'POST' });
    res.status(200).json({ triggered: hookRes.ok });
  } catch (err) {
    console.error('[trigger-rebuild] не удалось дёрнуть Deploy Hook:', err);
    res.status(200).json({ triggered: false, reason: 'fetch failed' });
  }
}
