// REST-доступ к Supabase из serverless (без @supabase/ssr / js-client на сервере).
// Вызовы от имени пользователя (anon + его JWT) — RLS работает.
// service_role — только для login/логов/платформы (после проверки platform_owner).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iohcdylttyuhwovztrbk.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function baseHeaders({ token, useService = false }) {
  const key = useService ? SERVICE_ROLE_KEY : ANON_KEY;
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
  const url = path.startsWith('http') ? path : `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...baseHeaders({ token, useService }), ...extra },
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

export async function dbPost(path, body, token, useService = false) {
  const res = await dbRequest(path, { method: 'POST', token, useService, body });
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

export async function dbPatch(path, body, token, useService = false) {
  const res = await dbRequest(path, { method: 'PATCH', token, useService, body });
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
