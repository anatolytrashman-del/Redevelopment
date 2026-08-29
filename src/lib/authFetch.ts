import { supabase } from './supabase';

// Обёртка над fetch для приватных api/*.js эндпоинтов (P0.3 аудита
// безопасности) — добавляет Authorization: Bearer <access_token> текущей
// сессии Supabase Auth, которую проверяет api/_auth.js. Публичные
// эндпоинты (agreement-otp-request/verify, exchange-rate) в этом не
// нуждаются и вызывают обычный fetch напрямую.
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
