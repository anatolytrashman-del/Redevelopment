// Клиентский API для «Основа» (блок 1). Все запросы к /api/osnova?route=...
// Токен — из supabase.auth.getSession (после setSession).

import { osnovaSupabase } from './supabaseClient';

const BASE = '/api/osnova';

async function call(route: string, init?: RequestInit) {
  const { data } = await osnovaSupabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}?route=${encodeURIComponent(route)}`, {
    ...init,
    headers,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || res.statusText);
    (err as any).status = res.status;
    (err as any).code = json?.error;
    throw err;
  }
  return json;
}

export const osnovaApi = {
  async login(email: string, password: string) {
    return call('auth.login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  async providers() {
    return call('auth.providers', { method: 'GET' });
  },
  async me() {
    return call('auth.me', { method: 'GET' });
  },
  async changePassword(current_password: string, new_password: string) {
    return call('auth.change_password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) });
  },
  async logoutAll() {
    return call('auth.logout_all', { method: 'POST' });
  },
};
