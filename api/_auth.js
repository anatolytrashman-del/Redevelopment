// Общий хелпер для api/*.js: требует валидную сессию Supabase Auth
// сотрудника (P0.3 аудита безопасности, продолжение P0.1 — до перехода на
// настоящий Auth эти функции не проверяли вообще ничего). Токен приходит в
// заголовке Authorization: Bearer <access_token> текущей сессии (см.
// src/lib/authFetch.ts на клиенте) и проверяется через Supabase Auth REST
// (GET /auth/v1/user) — тем же anon-ключом, что зашит в src/lib/supabase.ts
// (не секрет, проверку подписи токена делает сам Supabase, не мы).
//
// НЕ использовать для agreement-otp-request/verify (вызывает покупатель,
// без входа) и exchange-rate (безобидный публичный кэш курса).

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

// При успехе возвращает объект пользователя Supabase Auth; при неудаче сама
// отправляет 401 и возвращает null — вызывающему коду достаточно
// `if (!user) return;` сразу после вызова.
export async function requireStaffAuth(req, res) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Требуется вход' });
    return null;
  }
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      res.status(401).json({ error: 'Сессия недействительна, войдите заново' });
      return null;
    }
    return await resp.json();
  } catch {
    res.status(401).json({ error: 'Не удалось проверить сессию' });
    return null;
  }
}
