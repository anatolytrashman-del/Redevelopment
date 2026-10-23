// REST-доступ к Supabase из serverless (без @supabase/ssr / js-client на сервере).
// Вызовы от имени пользователя (anon + его JWT) — RLS работает.
// service_role — только для login/логов/платформы (после проверки platform_owner).

import { matreshkaEnv } from './_matreshkaEnv.js';

function getEnv() {
  return matreshkaEnv();
}

function baseHeaders({ token, useService = false }) {
  const { anonKey, serviceKey } = getEnv();
  const key = useService ? serviceKey : anonKey;
  const auth = token ? `Bearer ${token}` : `Bearer ${key}`;
  return {
    apikey: key,
    Authorization: auth,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function dbRequest(path, opts = {}) {
  const { method = 'GET', token, useService = false, body, headers: extra = {} } = opts;
  const { url: base } = getEnv();
  const fullPath = path.startsWith('http') ? path : `${base}${path}`;
  const h = baseHeaders({ token, useService });
  if (typeof path === 'string' && path.startsWith('/rest/v1/')) {
    h['Accept-Profile'] = 'matreshka';
    h['Content-Profile'] = 'matreshka';
  }
  const res = await fetch(fullPath, {
    method,
    headers: { ...h, ...extra },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function dbGet(path, token, useService = false) {
  const res = await dbRequest(path, { method: 'GET', token, useService });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  const data = await res.json().catch(() => null);
  return { ok: true, status: 200, data };
}

export async function dbPost(path, body, token, useService = false, extraHeaders = {}) {
  const h = { 'Prefer': 'return=representation', ...extraHeaders };
  const res = await dbRequest(path, { method: 'POST', token, useService, body, headers: h });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: true, status: res.status, data };
}

export async function dbPut(path, body, token, useService = false) {
  const res = await dbRequest(path, { method: 'PUT', token, useService, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: true, status: res.status, data };
}

export async function dbPatch(path, body, token, useService = false, extraHeaders = {}) {
  const h = { 'Prefer': 'return=representation', ...extraHeaders };
  const res = await dbRequest(path, { method: 'PATCH', token, useService, body, headers: h });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: true, status: res.status, data };
}

export async function dbDelete(path, token, useService = false) {
  const res = await dbRequest(path, { method: 'DELETE', token, useService });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: text || res.statusText };
  }
  return { ok: true, status: res.status, data: null };
}

// Удобные обёртки под /rest/v1
export function rest(path, q = '') {
  const qs = q ? (q.startsWith('?') ? q : `?${q}`) : '';
  return `/rest/v1/${path}${qs}`;
}

export function rpc(name, args = {}) {
  return { path: `/rest/v1/rpc/${name}`, body: args };
}
