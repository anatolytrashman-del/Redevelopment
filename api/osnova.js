// Единственная новая serverless-функция (блок 1).
// Роутер по ?route=... ; /api/auth/* рерайтятся сюда.
// Никогда не трогаем api/_auth.js и старые.

import { getClientFromRequest } from './_osnovaTenant.js';
import { buildSessionContext } from './_osnovaSession.js';
import { checkBlocked, recordFailure, recordSuccess } from './_osnovaRateLimit.js';
import { passwordLogin, getProviders } from './_osnovaProviders.js';
import { logSecurity } from './_osnovaLog.js';
import { dbGet, dbPatch, dbPost, rest, rpc } from './_osnovaDb.js';
import { validateRequestInput, validateSupplierAdd, validateNoteAdd, validatePriceAdd, writeRequestEvent, parseSupplierRef, getClientIdForHostOrQuery } from './_osnovaClient.js';
import {
  requirePlatformOwner, listClients, createClient, updateClientStatus,
  listUsers, createUserGoTrue, updateUser, resetUserPassword,
  listSecurityLog, listSupplierModeration, moderateSupplier
} from './_osnovaPlatform.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iohcdylttyuhwovztrbk.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';

function send(res, status, body) {
  res.status(status).json(body);
}

function getRoute(req) {
  const u = new URL(req.url || '/', 'http://x');
  let r = u.searchParams.get('route') || '';
  if (!r && req.query && req.query.route) r = String(req.query.route);
  // после rewrite /api/auth/xxx -> ?route=auth.xxx
  return r;
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    ''
  );
}

function getAuthToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const route = getRoute(req);
  const ip = getIp(req);
  const token = getAuthToken(req);
  const clientInfo = getClientFromRequest(req);

  try {
    // auth.login — без токена
    if (route === 'auth.login' && req.method === 'POST') {
      const { email, password, provider = 'password' } = req.body || {};
      if (!email || !password) return send(res, 400, { error: 'email_password_required' });

      const normEmail = String(email).toLowerCase().trim();
      // check first, no increment
      let pre;
      try {
        pre = await checkBlocked({ ip, email: normEmail });
      } catch (e) {
        if (String(e && e.message || e) === 'not_configured') {
          return send(res, 503, { error: 'not_configured' });
        }
        throw e;
      }
      if (pre.blocked) {
        return send(res, 429, { error: 'rate_limited', blocked_until: pre.until });
      }

      if (provider !== 'password') {
        await recordFailure({ ip, email: normEmail });
        return send(res, 404, { error: 'provider_not_connected' });
      }

      const login = await passwordLogin({ email: normEmail, password, ip });
      if (!login.ok) {
        await recordFailure({ ip, email: normEmail });
        return send(res, 401, { error: 'invalid_credentials' });
      }

      // successful password grant — now additional checks (service_role)
      const user = login.user;
      if (!user || !user.id) {
        await recordFailure({ ip, email: normEmail });
        return send(res, 401, { error: 'invalid_credentials' });
      }

      // load user_profiles with service_role
      const profQ = `?id=eq.${user.id}&limit=1`;
      const profRes = await dbGet(rest('user_profiles', profQ), null, true);
      const profile = profRes.ok && profRes.data && profRes.data[0] ? profRes.data[0] : null;
      if (!profile || profile.status !== 'active') {
        await logSecurity('login_denied_inactive', { email: normEmail, user: user.id }, { ip, userId: user.id });
        await recordFailure({ ip, email: normEmail });
        return send(res, 401, { error: 'invalid_credentials' });
      }

      if (clientInfo.slug) {
        // require membership: lookup client by slug (service), then check client_members
        const cQ = `?slug=eq.${encodeURIComponent(clientInfo.slug)}&select=id,status&limit=1`;
        const cRes = await dbGet(rest('clients', cQ), null, true);
        const cRow = cRes.ok && cRes.data && cRes.data[0] ? cRes.data[0] : null;
        const cid = cRow ? cRow.id : null;
        if (!cid) {
          await recordFailure({ ip, email: normEmail });
          return send(res, 403, { error: 'no_client_membership' });
        }
        if (cRow.status === 'suspended' || cRow.status === 'disabled') {
          await logSecurity('login_denied_suspended', { email: normEmail, client_slug: clientInfo.slug }, { ip, userId: user.id });
          await recordFailure({ ip, email: normEmail });
          return send(res, 403, { error: 'client_suspended' });
        }
        if (cRow.status !== 'active') {
          await recordFailure({ ip, email: normEmail });
          return send(res, 403, { error: 'no_client_membership' });
        }
        const memQ = `?client_id=eq.${cid}&user_id=eq.${user.id}&limit=1`;
        const memRes = await dbGet(rest('client_members', memQ), null, true);
        if (!memRes.ok || !memRes.data || !memRes.data[0]) {
          await logSecurity('login_denied_no_membership', { email: normEmail, client_slug: clientInfo.slug }, { ip, userId: user.id });
          await recordFailure({ ip, email: normEmail });
          return send(res, 403, { error: 'no_client_membership' });
        }
      }

      // update last_login_at (service)
      try {
        await dbPatch(rest(`user_profiles?id=eq.${user.id}`), { last_login_at: new Date().toISOString() }, null, true);
      } catch {}

      // success — reset email counter only
      await recordSuccess({ email: normEmail });
      return send(res, 200, { access_token: login.access_token, refresh_token: login.refresh_token });
    }

    // auth.providers — публично (кнопка битрикс показывается если true)
    if (route === 'auth.providers' && req.method === 'GET') {
      return send(res, 200, getProviders());
    }

    // bitrix stubs + лимит (scope bitrix, key bitrix-ip:<ip>, count every)
    if (route.startsWith('auth.bitrix.')) {
      try {
        const pre = await checkBlocked({ ip, scope: 'bitrix' });
        if (pre.blocked) return send(res, 429, { error: 'rate_limited', blocked_until: pre.until });
      } catch (e) {
        if (String(e && e.message || e) === 'not_configured') {
          return send(res, 503, { error: 'not_configured' });
        }
        throw e;
      }
      await recordFailure({ ip, scope: 'bitrix' });
      // 404 как указано
      return send(res, 404, { error: 'provider_not_connected' });
    }

    // Все остальные требуют валидной сессии
    if (!token) return send(res, 401, { error: 'auth_required' });

    const ctx = await buildSessionContext(req, token);
    if (!ctx.ok) {
      return send(res, ctx.status || 401, { error: ctx.error || 'unauthorized' });
    }
    const { profile, contexts, user } = ctx;

    // auth.me
    if (route === 'auth.me' && req.method === 'GET') {
      // на клиентском хосте — только роль в этом клиенте, без platform_owner
      if (!clientInfo.slug && !contexts?.platform_owner) {
        return send(res, 403, { error: 'not_platform_owner' });
      }
      let outContexts = { ...contexts };
      if (clientInfo.slug) {
        outContexts = {
          clients: contexts.clients,
          current: contexts.current,
        };
      }
      return send(res, 200, {
        user: { id: user.id, email: profile.email || user.email },
        profile: {
          id: profile.id,
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          middle_name: profile.middle_name || '',
          position: profile.position || (contexts.current?.position || ''),
        },
        contexts: outContexts,
      });
    }

    // auth.logout_all — используем USER token (не service_role)
    if (route === 'auth.logout_all' && req.method === 'POST') {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=global`, {
          method: 'POST',
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });
      } catch {}
      await logSecurity('logout_all', { user: user.id }, { ip, userId: user.id });
      return send(res, 200, { ok: true });
    }

    // auth.change_password — использовать константы с fallback'ами; не отдавать детали ошибок GoTrue
    if (route === 'auth.change_password' && req.method === 'POST') {
      const { current_password, new_password } = req.body || {};
      if (!current_password || !new_password || new_password.length < 10) {
        return send(res, 400, { error: 'bad_password' });
      }
      // verify current via grant (anon)
      const grantUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
      const grant = await fetch(grantUrl, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email || user.email, password: current_password }),
      });
      if (!grant.ok) {
        await logSecurity('password_change_failed', { reason: 'current_invalid' }, { ip, userId: user.id });
        return send(res, 401, { error: 'current_password_invalid' });
      }
      // меняем через user jwt
      const upd = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: new_password }),
      });
      if (!upd.ok) {
        await logSecurity('password_change_failed', { reason: 'update_failed' }, { ip, userId: user.id });
        return send(res, 400, { error: 'change_failed' });
      }
      await logSecurity('password_changed', {}, { ip, userId: user.id });
      return send(res, 200, { ok: true });
    }

    // === BLOCK 2: client.* and platform.* ===
    // client.* : require client context (host or ?client for owner switcher), active, membership. DB calls use USER token.
    const isClientRoute = route.startsWith('client.');
    const isPlatformRoute = route.startsWith('platform.');
    const u = new URL(req.url || '/', 'http://x');

    if (isClientRoute) {
      let clientCtx;
      try {
        clientCtx = await getClientIdForHostOrQuery(req, token, ctx);
      } catch (e) {
        const st = e.status || 403;
        return send(res, st, { error: e.message || 'forbidden' });
      }
      const { clientId, access: acc } = clientCtx;
      const isStaffView = acc.isSwitcherView || false;
      const callerRole = acc.membership?.role || 'client_staff';

      // auth already checked, now dispatch
      if (route === 'client.me' && req.method === 'GET') {
        return send(res, 200, {
          user: { id: user.id, email: profile.email || user.email },
          profile: {
            id: profile.id,
            first_name: profile.first_name || '',
            last_name: profile.last_name || '',
            middle_name: profile.middle_name || '',
            position: profile.position || (acc.membership?.position || ''),
          },
          role: callerRole,
          client: { id: clientId, name: acc.client.name, slug: acc.membership?.client_slug },
          is_owner_view: !!isStaffView,
        });
      }

      if (route === 'client.members.list' && req.method === 'GET') {
        // use rpc (user token) because no FK client_members -> user_profiles for embed
        const rpcBody = { p_client: clientId };
        const r = await dbPost(rpc('osnova_client_member_list').path, rpcBody, token, false);
        const list = (r.ok ? r.data : []) || [];
        const out = list.map((m) => ({
          user_id: m.user_id,
          role: callerRole === 'client_admin' || acc.isSwitcherView ? m.role : undefined,
          position: m.position || '',
          name: [m.last_name, m.first_name, m.middle_name].filter(Boolean).join(' '),
          status: m.status,
          last_login_at: m.last_login_at,
        }));
        return send(res, 200, { members: out });
      }

      if (route === 'client.requests.list' && req.method === 'GET') {
        const statusF = u.searchParams.get('status');
        let q = `?client_id=eq.${clientId}&select=*&order=number.desc&limit=200`;
        if (statusF) q += `&status=eq.${encodeURIComponent(statusF)}`;
        const r = await dbGet(rest('client_requests', q), token);
        return send(res, 200, { requests: r.ok ? (r.data || []) : [] });
      }

      if (route === 'client.requests.create' && req.method === 'POST') {
        const v = validateRequestInput(req.body || {});
        if (!v.ok) return send(res, 400, { error: v.errors.join(',') });
        const payload = {
          client_id: clientId,
          title: v.title,
          description: (req.body.description || '').trim() || null,
          status: req.body.status || 'new',
          priority: req.body.priority || 'normal',
          due_date: req.body.due_date || null,
          created_by: user.id,
          assignee_id: req.body.assignee_id || null,
        };
        const ins = await dbPost(rest('client_requests'), payload, token);
        if (!ins.ok) return send(res, 400, { error: 'create_failed' });
        const rid = ins.data?.[0]?.id;
        await writeRequestEvent(rid, clientId, user.id, 'created', { title: v.title }, token);
        await logSecurity('client_request_created', { request: rid, client_id: clientId }, { ip, userId: user.id, clientId });
        return send(res, 200, { request: ins.data?.[0] });
      }

      if (route === 'client.requests.update_status' && req.method === 'POST') {
        const { id, status } = req.body || {};
        if (!id || !status) return send(res, 400, { error: 'id_status_required' });
        const allowed = ['new','in_progress','waiting','done','cancelled'];
        if (!allowed.includes(status)) return send(res, 400, { error: 'invalid_status' });
        const patch = await dbPatch(rest(`client_requests?id=eq.${id}&client_id=eq.${clientId}`), { status, updated_at: new Date().toISOString() }, token);
        if (!patch.ok) return send(res, 403, { error: 'not_found_or_forbidden' });
        await writeRequestEvent(id, clientId, user.id, 'status_changed', { status }, token);
        await logSecurity('client_request_status', { request: id, status, client_id: clientId }, { ip, userId: user.id, clientId });
        return send(res, 200, { ok: true });
      }

      if (route === 'client.suppliers.list' && req.method === 'GET') {
        const search = u.searchParams.get('search') || null;
        const lim = Math.min(100, parseInt(u.searchParams.get('limit') || '50', 10) || 50);
        const off = parseInt(u.searchParams.get('offset') || '0', 10) || 0;
        // call rpc with user token
        const rpcBody = { p_client: clientId, p_search: search, p_limit: lim, p_offset: off };
        const r = await dbPost(rpc('osnova_client_suppliers').path, rpcBody, token, false);
        return send(res, 200, { suppliers: r.ok ? (r.data || []) : [] });
      }

      if (route === 'client.suppliers.add' && req.method === 'POST') {
        const v = validateSupplierAdd(req.body || {});
        if (!v.ok) return send(res, 400, { error: v.errors.join(',') });
        const payload = {
          created_by_client_id: clientId,
          created_by: user.id,
          name: (req.body.name || '').trim(),
          inn: req.body.inn || null,
          website_url: req.body.website_url || null,
          phone: req.body.phone || null,
          email: req.body.email || null,
          city: req.body.city || null,
          note: req.body.note || null,
          moderation_status: 'pending',
        };
        const ins = await dbPost(rest('client_added_suppliers'), payload, token);
        if (!ins.ok) return send(res, 400, { error: 'add_failed' });
        await logSecurity('client_supplier_added', { id: ins.data?.[0]?.id, client_id: clientId }, { ip, userId: user.id, clientId });
        return send(res, 200, { supplier: ins.data?.[0] });
      }

      if (route === 'client.supplier_notes.list' && req.method === 'GET') {
        const ref = u.searchParams.get('supplier_ref');
        if (!ref || !parseSupplierRef(ref)) return send(res, 400, { error: 'bad_supplier_ref' });
        const q = `?client_id=eq.${clientId}&supplier_ref=eq.${encodeURIComponent(ref)}&select=*&order=created_at.desc`;
        const r = await dbGet(rest('client_supplier_notes', q), token);
        return send(res, 200, { notes: r.ok ? (r.data || []) : [] });
      }

      if (route === 'client.supplier_notes.add' && req.method === 'POST') {
        const v = validateNoteAdd(req.body || {});
        if (!v.ok) return send(res, 400, { error: v.errors.join(',') });
        const payload = {
          client_id: clientId,
          supplier_ref: req.body.supplier_ref,
          body: (req.body.body || '').trim(),
          created_by: user.id,
        };
        const ins = await dbPost(rest('client_supplier_notes'), payload, token);
        if (!ins.ok) return send(res, 400, { error: 'add_failed' });
        await logSecurity('client_supplier_note_added', { client_id: clientId, ref: req.body.supplier_ref }, { ip, userId: user.id, clientId });
        return send(res, 200, { note: ins.data?.[0] });
      }

      if (route === 'client.supplier_prices.list' && req.method === 'GET') {
        const ref = u.searchParams.get('supplier_ref');
        if (!ref || !parseSupplierRef(ref)) return send(res, 400, { error: 'bad_supplier_ref' });
        const q = `?client_id=eq.${clientId}&supplier_ref=eq.${encodeURIComponent(ref)}&select=*&order=created_at.desc`;
        const r = await dbGet(rest('client_supplier_prices', q), token);
        return send(res, 200, { prices: r.ok ? (r.data || []) : [] });
      }

      if (route === 'client.supplier_prices.add' && req.method === 'POST') {
        const v = validatePriceAdd(req.body || {});
        if (!v.ok) return send(res, 400, { error: v.errors.join(',') });
        const payload = {
          client_id: clientId,
          supplier_ref: req.body.supplier_ref,
          item: (req.body.item || '').trim() || null,
          price: req.body.price != null ? Number(req.body.price) : null,
          currency: req.body.currency || 'BYN',
          note: req.body.note || null,
          created_by: user.id,
        };
        const ins = await dbPost(rest('client_supplier_prices'), payload, token);
        if (!ins.ok) return send(res, 400, { error: 'add_failed' });
        await logSecurity('client_supplier_price_added', { client_id: clientId, ref: req.body.supplier_ref }, { ip, userId: user.id, clientId });
        return send(res, 200, { price: ins.data?.[0] });
      }

      return send(res, 404, { error: 'unknown_client_route' });
    }

    if (isPlatformRoute) {
      // require platform owner; then service_role ok for writes
      try {
        await requirePlatformOwner(ctx);
      } catch (e) {
        return send(res, e.status || 403, { error: e.message || 'not_platform_owner' });
      }

      if (route === 'platform.clients.list' && req.method === 'GET') {
        const list = await listClients(null, true);
        return send(res, 200, { clients: list });
      }
      if (route === 'platform.clients.create' && req.method === 'POST') {
        try {
          const created = await createClient(req.body || {}, user.id, ip, token);
          return send(res, 200, { client: created });
        } catch (e) { return send(res, 400, { error: e.message || 'bad' }); }
      }
      if (route === 'platform.clients.update' && req.method === 'POST') {
        const { client_id, status } = req.body || {};
        if (!client_id || !status) return send(res, 400, { error: 'client_id_status_required' });
        try {
          await updateClientStatus(client_id, status, user.id, ip, token);
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 400, { error: e.message }); }
      }

      if (route === 'platform.users.list' && req.method === 'GET') {
        const list = await listUsers(null, true);
        return send(res, 200, { users: list });
      }
      if (route === 'platform.users.create' && req.method === 'POST') {
        const b = req.body || {};
        try {
          const resU = await createUserGoTrue({
            email: b.email,
            temp_password: b.temp_password,
            first_name: b.first_name,
            last_name: b.last_name,
            client_id: b.client_id,
            role: b.role,
            position_id: b.position_id,
            position_title: b.position_title,
          }, user.id, ip);
          return send(res, 200, resU); // temp_password returned ONCE
        } catch (e) { return send(res, 400, { error: e.message || 'create_user_failed' }); }
      }
      if (route === 'platform.users.update' && req.method === 'POST') {
        const { user_id, ...fields } = req.body || {};
        if (!user_id) return send(res, 400, { error: 'user_id_required' });
        try {
          await updateUser(user_id, fields, user.id, ip);
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (route === 'platform.users.reset_password' && req.method === 'POST') {
        const { user_id, client_id } = req.body || {};
        if (!user_id) return send(res, 400, { error: 'user_id_required' });
        try {
          const pr = await resetUserPassword(user_id, null, user.id, ip, client_id);
          return send(res, 200, pr); // temp once
        } catch (e) { return send(res, 400, { error: 'reset_failed' }); }
      }

      if (route === 'platform.security_log.list' && req.method === 'GET') {
        const fl = {
          client_id: u.searchParams.get('client_id'),
          event_type: u.searchParams.get('event_type'),
          limit: parseInt(u.searchParams.get('limit') || '100', 10),
        };
        const log = await listSecurityLog(fl, null);
        return send(res, 200, { log });
      }

      if (route === 'platform.suppliers.moderation.list' && req.method === 'GET') {
        const pend = await listSupplierModeration(null);
        return send(res, 200, { pending: pend });
      }
      if ((route === 'platform.suppliers.moderation.approve' || route === 'platform.suppliers.moderation.reject') && req.method === 'POST') {
        const { id } = req.body || {};
        if (!id) return send(res, 400, { error: 'id_required' });
        const action = route.endsWith('approve') ? 'approve' : 'reject';
        try {
          const m = await moderateSupplier(id, action, user.id, ip);
          return send(res, 200, m);
        } catch (e) { return send(res, 400, { error: 'moderation_failed' }); }
      }

      return send(res, 404, { error: 'unknown_platform_route' });
    }

    return send(res, 404, { error: 'unknown_route' });
  } catch (err) {
    // Если упали на relation not exists — not_configured (миграция не применена)
    const msg = String(err && err.message || err);
    if (/relation .* does not exist|42P01|not_configured/i.test(msg)) {
      return send(res, 503, { error: 'not_configured' });
    }
    // лог и 500
    await logSecurity('osnova_error', { route, err: msg }, { ip });
    return send(res, 500, { error: 'internal' });
  }
}
