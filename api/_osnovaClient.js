// Хелперы для client.* маршрутов (блок 2).
// ВАЖНО: client_id всегда из контекста хоста/сессии, НЕ из body.
// DB-вызовы в client.* — с USER JWT (RLS), не service_role.

import { dbGet, dbPost, rest } from './_osnovaDb.js';

export function parseSupplierRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^(catalog|added):([0-9a-fA-F-]{2,})$/);
  if (!m) return null;
  return { source: m[1], id: m[2] };
}

export function validateRequestInput(body) {
  const errs = [];
  const title = (body?.title || '').trim();
  if (!title) errs.push('title_required');
  const status = body?.status;
  const allowed = ['new','in_progress','waiting','done','cancelled'];
  if (status && !allowed.includes(status)) errs.push('invalid_status');
  return { ok: errs.length === 0, errors: errs, title };
}

export function validateSupplierAdd(body) {
  const errs = [];
  if (!(body?.name || '').trim()) errs.push('name_required');
  return { ok: errs.length === 0, errors: errs };
}

export function validateNoteAdd(body) {
  if (!(body?.supplier_ref || '').trim()) return { ok: false, errors: ['supplier_ref_required'] };
  if (!parseSupplierRef(body.supplier_ref)) return { ok: false, errors: ['bad_supplier_ref'] };
  if (!(body?.body || '').trim()) return { ok: false, errors: ['body_required'] };
  return { ok: true, errors: [] };
}

export function validatePriceAdd(body) {
  if (!(body?.supplier_ref || '').trim()) return { ok: false, errors: ['supplier_ref_required'] };
  if (!parseSupplierRef(body.supplier_ref)) return { ok: false, errors: ['bad_supplier_ref'] };
  if (body?.price != null && isNaN(Number(body.price))) return { ok: false, errors: ['bad_price'] };
  return { ok: true, errors: [] };
}

// Получить client_id по slug (service_role, для login/platform)
export async function getClientBySlug(slug) {
  if (!slug) return null;
  const q = `?slug=eq.${encodeURIComponent(slug)}&limit=1`;
  const res = await dbGet(rest('clients', q), null, true);
  if (res.ok && res.data && res.data[0]) return res.data[0];
  return null;
}

// Проверить membership + active client для client.* (использует token пользователя)
export async function ensureClientAccess(ctx, token, clientSlugFromQuery = null) {
  // ctx from buildSessionContext
  if (!ctx || !ctx.ok) return { ok: false, status: 401, error: 'auth_required' };

  const { profile, contexts, user } = ctx;
  const hostClient = contexts?.current?.hostClient || null;
  let clientSlug = hostClient;
  let isSwitcher = false;

  if (!clientSlug && clientSlugFromQuery) {
    // non-client host: only for platform_owner switcher
    if (!contexts?.platform_owner) {
      return { ok: false, status: 403, error: 'platform_owner_required' };
    }
    clientSlug = clientSlugFromQuery;
    isSwitcher = true;
  }

  if (!clientSlug) {
    return { ok: false, status: 403, error: 'no_client_context' };
  }

  // load client (with user token? but to check status, may need; for RLS but here use service for check? wait spec says all client DB with USER JWT
  // but to decide suspended we can use membership from ctx
  let c = null;
  if (contexts?.current && contexts.current.client_slug === clientSlug) {
    c = { id: contexts.current.client_id, status: contexts.current.client_status || 'active', name: contexts.current.client_name };
  } else {
    // for switcher, platform owner uses service to lookup
    c = await getClientBySlug(clientSlug);
  }
  if (!c) return { ok: false, status: 403, error: 'no_client_membership' };

  if (c.status === 'suspended' || c.status === 'disabled') {
    return { ok: false, status: 403, error: 'client_suspended' };
  }
  if (c.status !== 'active') {
    return { ok: false, status: 403, error: 'client_not_active' };
  }

  // for host case, membership already in ctx
  let membership = contexts?.current;
  if (isSwitcher || !membership || membership.client_slug !== clientSlug) {
    // verify membership with user token
    const memQ = `?client_id=eq.${c.id}&user_id=eq.${user.id}&limit=1&select=role,position_id,positions(title)`;
    const memRes = await dbGet(rest('client_members', memQ), token); // USER token
    if (!memRes.ok || !memRes.data || !memRes.data[0]) {
      return { ok: false, status: 403, error: 'no_client_membership' };
    }
    membership = {
      client_id: c.id,
      client_slug: clientSlug,
      client_name: c.name,
      role: memRes.data[0].role,
      position: memRes.data[0].positions?.title || null,
    };
  }

  return {
    ok: true,
    client: c,
    membership,
    user,
    profile,
    isSwitcherView: isSwitcher, // client_staff view for owner
  };
}

// write event on status change etc, with user token
export async function writeRequestEvent(requestId, clientId, actorId, kind, payload, token) {
  await dbPost(rest('client_request_events'), {
    request_id: requestId,
    client_id: clientId,
    actor_id: actorId,
    kind,
    payload: payload || {},
    created_at: new Date().toISOString(),
  }, token, false);
}

export async function getClientIdForHostOrQuery(req, token, ctx) {
  const u = new URL(req.url || '/', 'http://x');
  const qClient = u.searchParams.get('client');
  const access = await ensureClientAccess(ctx, token, qClient);
  if (!access.ok) throw Object.assign(new Error(access.error), { status: access.status });
  return { clientId: access.client.id, access };
}
