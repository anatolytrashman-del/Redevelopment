// Единственная новая serverless-функция (блок 1).
// Роутер по ?route=... ; /api/auth/* рерайтятся сюда.
// Никогда не трогаем api/_auth.js и старые.

import { getClientFromRequest } from './_matreshkaTenant.js';
import { buildSessionContext } from './_matreshkaSession.js';
import { checkBlocked, recordFailure, recordSuccess } from './_matreshkaRateLimit.js';
import { passwordLogin, getProviders } from './_matreshkaProviders.js';
import { logSecurity } from './_matreshkaLog.js';
import { getClientIp } from './_clientIp.js';
import { dbGet, dbPatch, dbPost, dbDelete, rest, rpc } from './_matreshkaDb.js';
import { validateRequestInput, validateSupplierAdd, validateNoteAdd, validatePriceAdd, writeRequestEvent, parseSupplierRef, getClientIdForHostOrQuery } from './_matreshkaClient.js';
import { getSignedUploadUrl, getSignedDownloadUrl, listRequestFiles } from './_matreshkaFiles.js';
import {
  requirePlatformOwner, listClients, createClient, updateClientStatus,
  listUsers, createUserGoTrue, updateUser, resetUserPassword,
  listSecurityLog, listSupplierModeration, moderateSupplier
} from './_matreshkaPlatform.js';
import { fetchLegacySuppliers, mergeSuppliers } from './_matreshkaLegacyCatalog.js';
import {
  computeInitialApprovalStatus,
  canApproveRequest,
  approveRequest,
  rejectRequest,
  markBitrixApproved,
  listRequestEvents,
  listApprovalRules,
  upsertApprovalRule
} from './_matreshkaApprovals.js';
import { matreshkaEnv, MatreshkaConfigError } from './_matreshkaEnv.js';

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
  const transportIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '';
  // За RU-прокси (TRUSTED_PROXY_IPS) — реальный IP из X-RF-Client-IP, иначе как было.
  return getClientIp(req, { transportIp });
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

  function sendMatreshkaConfigError(err) {
    const names = err && err.missing ? err.missing : [];
    console.error('matreshka_config_missing', names);
    res.status(500).json({ error: 'matreshka_config_missing', missing: names });
  }

  try {
    matreshkaEnv(); // early after options
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
        const { url, anonKey } = matreshkaEnv();
        await fetch(`${url}/auth/v1/logout?scope=global`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
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
      const { url, anonKey } = matreshkaEnv();
      // verify current via grant (anon)
      const grantUrl = `${url}/auth/v1/token?grant_type=password`;
      const grant = await fetch(grantUrl, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email || user.email, password: current_password }),
      });
      if (!grant.ok) {
        await logSecurity('password_change_failed', { reason: 'current_invalid' }, { ip, userId: user.id });
        return send(res, 401, { error: 'current_password_invalid' });
      }
      // меняем через user jwt
      const upd = await fetch(`${url}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: anonKey,
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
        const r = await dbPost(rpc('matreshka_client_member_list').path, rpcBody, token, false);
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
        const supplyKind = (req.body.supply_kind || '').trim() || null;
        let approvalStatus = 'not_required';
        try {
          approvalStatus = await computeInitialApprovalStatus(clientId, supplyKind, token);
        } catch {}
        const payload = {
          client_id: clientId,
          title: v.title,
          description: (req.body.description || '').trim() || null,
          status: req.body.status || 'new',
          priority: req.body.priority || 'normal',
          due_date: req.body.due_date || null,
          created_by: user.id,
          assignee_id: req.body.assignee_id || null,
          supply_kind: supplyKind,
          approval_status: approvalStatus,
        };
        const ins = await dbPost(rest('client_requests'), payload, token);
        if (!ins.ok) return send(res, 400, { error: 'create_failed' });
        const rid = ins.data?.[0]?.id;
        await writeRequestEvent(rid, clientId, user.id, 'created', { title: v.title, supply_kind: supplyKind, approval_status: approvalStatus }, token);
        await logSecurity('client_request_created', { request: rid, client_id: clientId, supply_kind: supplyKind }, { ip, userId: user.id, clientId });
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
        // always fetch full client view (notes/prices) with search=null limit 1000; merge+filter/paginate server side
        const rpcBody = { p_client: clientId, p_search: null, p_limit: 1000, p_offset: 0 };
        const r = await dbPost(rpc('matreshka_client_suppliers').path, rpcBody, token, false);
        const clientRows = r.ok ? (r.data || []) : [];
        const legRes = await fetchLegacySuppliers({ search });
        let legacyRows = legRes.rows || [];
        if (!search) {
          // collect catalog refs present in clientRows (from notes/prices) that may be missing details
          const catRefs = clientRows
            .filter((c) => c && c.source === 'catalog' && c.ref && c.ref.startsWith('catalog:'))
            .map((c) => c.ref.slice(8))
            .filter(Boolean);
          if (catRefs.length) {
            const have = new Set(legacyRows.map((l) => String(l.id)));
            const missing = catRefs.filter((id) => !have.has(String(id)));
            if (missing.length) {
              const add = await fetchLegacySuppliers({ ids: missing });
              if (add.available && add.rows) {
                legacyRows = legacyRows.concat(add.rows);
              }
            }
          }
        }
        const merged = mergeSuppliers(clientRows, legacyRows, { search, limit: lim, offset: off });
        return send(res, 200, { suppliers: merged.suppliers, total: merged.total, legacy_available: !!legRes.available });
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

      if (route === 'client.files.upload_url' && req.method === 'POST') {
        const { request_id, filename } = req.body || {};
        if (!request_id || !filename) return send(res, 400, { error: 'request_id_filename_required' });
        try {
          const signed = await getSignedUploadUrl(clientId, String(request_id), filename, token);
          await logSecurity('client_file_upload_url', { request: request_id, path: signed.path, client_id: clientId }, { ip, userId: user.id, clientId });
          return send(res, 200, { uploadUrl: signed.uploadUrl, path: signed.path });
        } catch (e) {
          const st = e.status || 403;
          return send(res, st, { error: 'forbidden' });
        }
      }

      if (route === 'client.files.sign' && req.method === 'POST') {
        const { path } = req.body || {};
        if (!path) return send(res, 400, { error: 'path_required' });
        try {
          const s = await getSignedDownloadUrl(clientId, path, token);
          return send(res, 200, s);
        } catch {
          return send(res, 403, { error: 'forbidden' });
        }
      }

      if (route === 'client.files.list' && req.method === 'GET') {
        const rid = u.searchParams.get('request_id');
        if (!rid) return send(res, 400, { error: 'request_id_required' });
        try {
          const l = await listRequestFiles(clientId, rid, token);
          return send(res, 200, l);
        } catch {
          return send(res, 200, { files: [] });
        }
      }

      if (route === 'client.requests.events.list' && req.method === 'GET') {
        const rid = u.searchParams.get('request_id');
        if (!rid) return send(res, 400, { error: 'request_id_required' });
        const evs = await listRequestEvents(rid, clientId, token);
        return send(res, 200, { events: evs });
      }

      if (route === 'client.requests.approve' && req.method === 'POST') {
        const { id } = req.body || {};
        if (!id) return send(res, 400, { error: 'id_required' });
        // load request to get supply_kind
        const rq = await dbGet(rest(`client_requests?id=eq.${id}&client_id=eq.${clientId}&select=*&limit=1`), token);
        const reqRow = rq.ok && rq.data && rq.data[0] ? rq.data[0] : null;
        if (!reqRow) return send(res, 404, { error: 'not_found' });
        const perm = await canApproveRequest(clientId, reqRow, user.id, token);
        if (!perm.ok) return send(res, 403, { error: 'not_approver' });
        try {
          const resA = await approveRequest(id, clientId, user.id, token);
          await logSecurity('client_request_approved', { request: id, method: 'platform', client_id: clientId }, { ip, userId: user.id, clientId });
          return send(res, 200, resA);
        } catch { return send(res, 403, { error: 'approve_failed' }); }
      }

      if (route === 'client.requests.reject' && req.method === 'POST') {
        const { id } = req.body || {};
        if (!id) return send(res, 400, { error: 'id_required' });
        const rq = await dbGet(rest(`client_requests?id=eq.${id}&client_id=eq.${clientId}&select=*&limit=1`), token);
        const reqRow = rq.ok && rq.data && rq.data[0] ? rq.data[0] : null;
        if (!reqRow) return send(res, 404, { error: 'not_found' });
        const perm = await canApproveRequest(clientId, reqRow, user.id, token);
        if (!perm.ok) return send(res, 403, { error: 'not_approver' });
        try {
          const resR = await rejectRequest(id, clientId, user.id, token);
          await logSecurity('client_request_rejected', { request: id, client_id: clientId }, { ip, userId: user.id, clientId });
          return send(res, 200, resR);
        } catch { return send(res, 403, { error: 'reject_failed' }); }
      }

      if (route === 'client.requests.mark_bitrix_approved' && req.method === 'POST') {
        const { id, ref, note } = req.body || {};
        if (!id) return send(res, 400, { error: 'id_required' });
        // any member
        try {
          const resM = await markBitrixApproved(id, clientId, user.id, ref || null, note || null, token);
          await logSecurity('client_request_bitrix_marked', { request: id, client_id: clientId }, { ip, userId: user.id, clientId });
          return send(res, 200, resM);
        } catch (e) {
          const msg = (e && e.message) || 'mark_failed';
          return send(res, msg === 'ref_or_note_required' ? 400 : 403, { error: msg });
        }
      }

      if (route === 'client.approval_rules.list' && req.method === 'GET') {
        const r = await listApprovalRules(clientId, token);
        return send(res, 200, r);
      }

      if (route === 'client.approval_rules.upsert' && req.method === 'POST') {
        const { rule } = req.body || {};
        // caller must be admin or owner (but since client route, check via role)
        const roleHere = callerRole || 'client_staff';
        if (roleHere !== 'client_admin' && !contexts?.platform_owner) {
          // for switcher owner ok
          if (!acc.isSwitcherView && !contexts?.platform_owner) return send(res, 403, { error: 'client_admin_required' });
        }
        try {
          const u = await upsertApprovalRule(clientId, rule, user.id, token);
          await logSecurity('approval_rule_upsert', { client_id: clientId, supply_kind: rule?.supply_kind }, { ip, userId: user.id, clientId });
          return send(res, 200, u);
        } catch (e) { return send(res, 400, { error: (e && e.message) || 'upsert_failed' }); }
      }

      if (route === 'client.approval_rules.delete' && req.method === 'POST') {
        const { id: ruleId } = req.body || {};
        if (!ruleId) return send(res, 400, { error: 'id_required' });
        const roleHere = callerRole || 'client_staff';
        if (roleHere !== 'client_admin' && !contexts?.platform_owner) {
          if (!acc.isSwitcherView && !contexts?.platform_owner) return send(res, 403, { error: 'client_admin_required' });
        }
        try {
          // perform delete with user token; build path as string (rest returns string)
          const delPath = rest(`client_approval_rules?id=eq.${ruleId}&client_id=eq.${clientId}`);
          const delRes = await dbDelete(delPath, token);
          if (!delRes.ok) throw new Error('delete_failed');
          await logSecurity('approval_rule_delete', { client_id: clientId, rule: ruleId }, { ip, userId: user.id, clientId });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 400, { error: (e && e.message) || 'delete_failed' }); }
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
        const { client_id, status, inn, settings, legal_entity_ref } = req.body || {};
        if (!client_id) return send(res, 400, { error: 'client_id_required' });
        try {
          const patch = {};
          if (status) {
            if (!['active','suspended','disabled'].includes(status)) throw new Error('bad_status');
            patch.status = status;
          }
          if (inn !== undefined) patch.inn = inn || null;
          if (legal_entity_ref !== undefined) patch.legal_entity_ref = legal_entity_ref || null;
          if (settings && typeof settings === 'object') {
            patch.settings = { ...(settings || {}) };
            // approval_required read from it
          }
          if (Object.keys(patch).length > 0) {
            await dbPatch(rest(`clients?id=eq.${client_id}`), patch, null, true);
          }
          if (status) {
            await updateClientStatus(client_id, status, user.id, ip, token); // keep log etc for status
          }
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
        } catch { return send(res, 400, { error: 'reset_failed' }); }
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
        } catch { return send(res, 400, { error: 'moderation_failed' }); }
      }

      return send(res, 404, { error: 'unknown_platform_route' });
    }

    return send(res, 404, { error: 'unknown_route' });
  } catch (err) {
    if (err instanceof MatreshkaConfigError) {
      sendMatreshkaConfigError(err);
      return;
    }
    // Если упали на relation not exists — not_configured (миграция не применена)
    const msg = String(err && err.message || err);
    if (/relation .* does not exist|42P01|not_configured/i.test(msg)) {
      return send(res, 503, { error: 'not_configured' });
    }
    // лог и 500
    await logSecurity('matreshka_error', { route, err: msg }, { ip });
    return send(res, 500, { error: 'internal' });
  }
}
