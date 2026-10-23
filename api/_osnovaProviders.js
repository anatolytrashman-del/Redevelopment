// Провайдеры авторизации (заготовка под Битрикс24).
// password — рабочий (через GoTrue password grant).
// bitrix24 — заглушка 404 provider_not_connected + rate limit на auth.bitrix.* .


import { logSecurity } from './_osnovaLog.js';
import { osnovaEnv } from './_osnovaEnv.js';

export async function passwordLogin({ email, password, ip = '' }) {
  // GoTrue password grant → access/refresh
  const { url, anonKey } = osnovaEnv();
  const tokenUrl = `${url}/auth/v1/token?grant_type=password`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    await logSecurity('login_failed', { email, provider: 'password', reason: json.error || 'invalid', ip }, { ip });
    return { ok: false, error: 'invalid_credentials' };
  }
  await logSecurity('login_success', { email, provider: 'password', user: json.user?.id }, { ip, userId: json.user?.id });
  return { ok: true, access_token: json.access_token, refresh_token: json.refresh_token, user: json.user };
}

export function getProviders() {
  // bitrix24 включён флагом в clients.settings или auth_provider_configs — пока false
  return { password: true, bitrix24: false };
}

// Заглушка
export async function bitrixStart() {
  return { error: 'provider_not_connected' };
}
export async function bitrixCallback() {
  return { error: 'provider_not_connected' };
}
export async function bitrixGetProfile() {
  return { error: 'provider_not_connected' };
}
