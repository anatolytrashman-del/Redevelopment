// Уточнение причины неудачного входа на экране PasswordGate (2026-10-21).
//
// Supabase Auth на неверный пароль, несуществующего пользователя и
// неподтверждённый/заблокированный аккаунт отвечает одинаково —
// `invalid_credentials`, — так что «Неверный пароль» на экране входа мог
// означать что угодно. После такого ответа клиент спрашивает здесь, что
// именно с аккаунтом: есть ли он, подтверждён ли, не заблокирован ли и есть
// ли у него строка access_profiles (доступ в панель).
//
// Отвечаем ТОЛЬКО про внутренние логины @redevelopment.pro — они и так
// захардкожены в публичном бандле (src/data/loginAccounts.ts), секрета в
// самом факте их существования нет. Ни пароля, ни токенов, ни дат наружу не
// отдаём — только четыре флага. Через наш домен, а не *.supabase.co, — так
// ответ доходит и тогда, когда сам Supabase из сети пользователя не открывается.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_DOMAIN = '@redevelopment.pro';
const TIMEOUT_MS = 8000;

async function sbFetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`supabase ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const email = String((req.method === 'POST' ? req.body?.email : req.query?.email) ?? '')
    .trim()
    .toLowerCase();
  if (!email.endsWith(ALLOWED_DOMAIN) || email.length > 120) {
    res.status(400).json({ error: 'bad_email' });
    return;
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({ error: 'not_configured' });
    return;
  }
  try {
    // filter — поиск по подстроке email в GoTrue; точное совпадение проверяем сами.
    const list = await sbFetch(`/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`);
    const user = (list?.users ?? []).find((u) => String(u.email ?? '').toLowerCase() === email);
    if (!user) {
      res.status(200).json({ exists: false, confirmed: false, banned: false, hasAccess: false });
      return;
    }
    const bannedUntil = user.banned_until ? Date.parse(user.banned_until) : NaN;
    const profiles = await sbFetch(`/rest/v1/access_profiles?select=id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    res.status(200).json({
      exists: true,
      confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
      banned: Number.isFinite(bannedUntil) && bannedUntil > Date.now(),
      hasAccess: Array.isArray(profiles) && profiles.length > 0,
    });
  } catch {
    res.status(502).json({ error: 'upstream' });
  }
}
