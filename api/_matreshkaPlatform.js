// Хелперы platform.* (блок 2). Только после проверки platform_owner.
// service_role разрешён после owner check.
// Все platform writes → logSecurity(actor, client_id).

import { dbGet, dbPost, dbPatch, rest } from './_matreshkaDb.js';
import { logSecurity } from './_matreshkaLog.js';
import { randomBytes } from 'node:crypto';
import { matreshkaEnv } from './_matreshkaEnv.js';

function getMatreshka() {
  return matreshkaEnv();
}

export async function requirePlatformOwner(ctx) {
  if (!ctx || !ctx.ok || !ctx.contexts?.platform_owner) {
    const err = new Error('not_platform_owner');
    err.status = 403;
    throw err;
  }
  return ctx;
}

export async function listClients(tokenOrNull, useService = false) {
  // count users via separate? for now simple list
  // Служебная запись платформы (settings.platform_service=true) — не клиент, в списке не показываем.
  const q = `?select=*,client_members(count)&or=(settings->>platform_service.is.null,settings->>platform_service.neq.true)&order=created_at.desc&limit=200`;
  const res = await dbGet(rest('clients', q), tokenOrNull, useService);
  return res.ok ? (res.data || []) : [];
}

export async function createClient(body, actorId, ip, _token) {
  // platform only, use service
  const payload = {
    slug: String(body.slug || '').trim().toLowerCase(),
    name: String(body.name || '').trim(),
    status: 'active',
    hosts: body.hosts || [],
    settings: body.settings || {},
  };
  if (!payload.slug || !payload.name) throw new Error('slug_name_required');
  const res = await dbPost(rest('clients'), payload, null, true);
  if (!res.ok) throw new Error(res.error || 'create_failed');
  await logSecurity('platform_client_created', { client: res.data?.[0]?.id, ...payload }, { ip, userId: actorId, clientId: res.data?.[0]?.id });
  return res.data?.[0];
}

export async function updateClientStatus(clientId, status, actorId, ip, _token) {
  if (!['active', 'suspended', 'disabled'].includes(status)) throw new Error('bad_status');
  const patchRes = await dbPatch(rest(`clients?id=eq.${clientId}`), { status }, null, true);
  if (!patchRes.ok) throw new Error('update_failed');
  await logSecurity('platform_client_status_changed', { client_id: clientId, status }, { ip, userId: actorId, clientId });
  return { ok: true };
}

export async function listUsers(token, useService = true) {
  const q = `?select=*,client_members(client_id,role,clients(slug,name),positions(title))&limit=500`;
  const res = await dbGet(rest('user_profiles', q), token, useService);
  return res.ok ? (res.data || []) : [];
}

export async function createUserGoTrue({ email, temp_password, first_name, last_name, client_id, role, position_id, position_title }, actorId, ip) {
  const normEmail = (email || '').toLowerCase().trim();
  if (!normEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) throw new Error('bad_email');
  const normRole = role === 'client_admin' ? 'client_admin' : 'client_staff';
  if (!['client_admin', 'client_staff'].includes(role)) throw new Error('bad_role');
  // use GoTrue admin /auth/v1/admin/users , email_confirm true
  const { url: base, serviceKey } = getMatreshka();
  const password = temp_password || randomBytes(12).toString('base64url');
  const adminCreate = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: normEmail,
      password,
      email_confirm: true,
    }),
  });
  const j = await adminCreate.json().catch(() => ({}));
  if (!adminCreate.ok) {
    throw new Error(j.error || j.message || 'gotrue_create_failed');
  }
  const uid = j.id || j.user?.id;
  // insert profile
  await dbPost(rest('user_profiles'), {
    id: uid,
    email: normEmail,
    first_name: first_name || '',
    last_name: last_name || '',
    status: 'active',
    position: position_title || null,
  }, null, true);
  // membership
  if (client_id && role) {
    await dbPost(rest('client_members'), {
      user_id: uid,
      client_id,
      role: normRole,
      position_id: position_id || null,
    }, null, true);
  }
  await logSecurity('platform_user_created', { user: uid, email: '***', client_id, role: normRole }, { ip, userId: actorId, clientId: client_id });
  return { id: uid, temp_password: password }; // return once
}

export async function updateUser(userId, { status, role, position_id, client_id }, actorId, ip) {
  const { url: base, serviceKey } = getMatreshka();
  if (status) {
    await dbPatch(rest(`user_profiles?id=eq.${userId}`), { status }, null, true);
    if (status === 'disabled') {
      // ban via admin
      await fetch(`${base}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ban_duration: '876000h' }), // long ban ~100y
      }).catch(() => {});
      // also global logout? GoTrue admin has /logout but use update
      await fetch(`${base}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ban_duration: '876000h' }),
      }).catch(() => {});
    } else {
      await fetch(`${base}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ban_duration: null }),
      }).catch(() => {});
    }
  }
  if (role && client_id) {
    // update membership role
    await dbPatch(rest(`client_members?user_id=eq.${userId}&client_id=eq.${client_id}`), { role }, null, true);
  }
  if (position_id != null && client_id) {
    await dbPatch(rest(`client_members?user_id=eq.${userId}&client_id=eq.${client_id}`), { position_id }, null, true);
  }
  await logSecurity('platform_user_updated', { user: userId, status, role, client_id }, { ip, userId: actorId, clientId: client_id });
  return { ok: true };
}

export async function resetUserPassword(userId, newPass, actorId, ip, clientId) {
  const { url: base, serviceKey } = getMatreshka();
  const pass = newPass || randomBytes(12).toString('base64url');
  const r = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass }),
  });
  if (!r.ok) throw new Error('reset_failed');
  await logSecurity('platform_password_reset', { user: userId }, { ip, userId: actorId, clientId });
  return { temp_password: pass };
}

export async function listSecurityLog(filters, token) {
  let q = '?select=*&order=created_at.desc';
  if (filters.client_id) q += `&client_id=eq.${filters.client_id}`;
  if (filters.event_type) q += `&event_type=eq.${encodeURIComponent(filters.event_type)}`;
  if (filters.limit) q += `&limit=${Math.min(200, filters.limit)}`;
  const res = await dbGet(rest('security_log', q), token, true);
  return res.ok ? (res.data || []) : [];
}

export async function listSupplierModeration(token) {
  const q = `?moderation_status=eq.pending&select=*&order=created_at.desc&limit=200`;
  const res = await dbGet(rest('client_added_suppliers', q), token, true);
  return res.ok ? (res.data || []) : [];
}

export async function moderateSupplier(id, action, actorId, ip) {
  const status = action === 'approve' ? 'approved' : 'rejected';
  const now = new Date().toISOString();
  await dbPatch(rest(`client_added_suppliers?id=eq.${id}`), {
    moderation_status: status,
    moderated_by: actorId,
    moderated_at: now,
  }, null, true);
  await logSecurity('platform_supplier_moderated', { supplier_added_id: id, status }, { ip, userId: actorId });
  return { ok: true, status };
}
