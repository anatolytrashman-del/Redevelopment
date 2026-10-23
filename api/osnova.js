// Единственная новая serverless-функция (блок 1).
// Роутер по ?route=... ; /api/auth/* рерайтятся сюда.
// Никогда не трогаем api/_auth.js и старые.

import { getClientFromRequest } from './_osnovaTenant.js';
import { buildSessionContext } from './_osnovaSession.js';
import { checkBlocked, recordFailure, recordSuccess } from './_osnovaRateLimit.js';
import { passwordLogin, getProviders } from './_osnovaProviders.js';
import { logSecurity } from './_osnovaLog.js';
import { dbGet, dbPatch, rest } from './_osnovaDb.js';

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
        const cQ = `?slug=eq.${encodeURIComponent(clientInfo.slug)}&status=eq.active&select=id&limit=1`;
        const cRes = await dbGet(rest('clients', cQ), null, true);
        const cid = cRes.ok && cRes.data && cRes.data[0] ? cRes.data[0].id : null;
        if (!cid) {
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
