// Проверка сессии + контекст пользователя (platform_owner / client memberships).
// Вызывается на каждом запросе к osnova (кроме login).

import { dbGet, dbPost, rest, rpc } from './_osnovaDb.js';
import { getClientFromRequest } from './_osnovaTenant.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iohcdylttyuhwovztrbk.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

export async function verifyJwt(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getActiveProfile(userId, token) {
  if (!userId) return null;
  const q = `?id=eq.${userId}&status=eq.active&limit=1`;
  const res = await dbGet(rest('user_profiles', q), token);
  if (res.ok && res.data && res.data[0]) return res.data[0];
  const anyQ = `?id=eq.${userId}&limit=1`;
  const any = await dbGet(rest('user_profiles', anyQ), token);
  if (any.ok && any.data && any.data[0] && any.data[0].status === 'active') return any.data[0];
  return null;
}

export async function isPlatformOwner(userId, token) {
  if (!userId) return false;
  try {
    // функция SECURITY DEFINER
    const r = await dbPost(rpc('osnova_is_platform_owner').path, {}, token, false);
    if (r.ok) return !!r.data;
  } catch {}
  // fallback: platform_roles
  const q = `?user_id=eq.${userId}&role=eq.owner&limit=1`;
  const res = await dbGet(rest('platform_roles', q), token);
  return res.ok && Array.isArray(res.data) && res.data.length > 0;
}

export async function getMyClientMemberships(userId, token) {
  if (!userId) return [];
  try {
    const r = await dbPost(rpc('osnova_my_client_ids').path, {}, token, false);
    if (r.ok && Array.isArray(r.data)) {
      // дополним при необходимости
    }
  } catch {}
  const q = `?user_id=eq.${userId}&select=*,clients!inner(slug,name,status),positions(title)&clients.status=eq.active`;
  const res = await dbGet(rest('client_members', q), token);
  if (!res.ok) return [];
  return (res.data || []).map((row) => ({
    client_id: row.client_id,
    client_slug: row.clients?.slug,
    client_name: row.clients?.name,
    role: row.role,
    position: row.positions?.title || null,
  }));
}

export async function getClientRoleForHost(userId, hostClientSlug, token) {
  if (!userId || !hostClientSlug) return null;
  const cQ = `?slug=eq.${encodeURIComponent(hostClientSlug)}&status=eq.active&select=id,name&limit=1`;
  const res2 = await dbGet(rest('clients', cQ), token);
  if (!res2.ok || !res2.data?.[0]) return null;
  const cid = res2.data[0].id;
  const memQ = `?client_id=eq.${cid}&user_id=eq.${userId}&select=role,position_id,positions(title)&limit=1`;
  const mem = await dbGet(rest('client_members', memQ), token);
  if (!mem.ok || !mem.data?.[0]) return null;
  const m = mem.data[0];
  return {
    client_id: cid,
    client_name: res2.data[0].name,
    role: m.role,
    position: m.positions?.title || null,
  };
}

export async function buildSessionContext(req, token) {
  const user = await verifyJwt(token);
  if (!user) return { ok: false, status: 401, error: 'invalid_token' };

  const profile = await getActiveProfile(user.id, token);
  if (!profile) {
    return { ok: false, status: 401, error: 'user_disabled' };
  }

  const { slug: hostClient } = getClientFromRequest(req);

  const isOwner = await isPlatformOwner(user.id, token);
  const memberships = await getMyClientMemberships(user.id, token);

  let currentClient = null;
  if (hostClient) {
    currentClient = await getClientRoleForHost(user.id, hostClient, token);
    if (!currentClient) {
      return { ok: false, status: 403, error: 'no_client_membership' };
    }
  }

  return {
    ok: true,
    user,
    profile,
    contexts: {
      platform_owner: isOwner || undefined,
      clients: memberships,
      current: currentClient ? { ...currentClient, hostClient } : undefined,
    },
  };
}
