// Лимиты входа (auth_login_attempts) + pure-функции для тестов (блок 1).
// Два независимых счётчика:
//   ip:<ip> (или bitrix-ip:<ip>) — 20 /15мин
//   email:<normEmail> — 5 /15мин
// Блок 15 мин с момента пересечения лимита.
// PostgREST: rest(..., `?attempt_key=eq....`), обновления — PATCH (не PUT).
// При отсутствии таблицы — throw Error('not_configured').
// recordSuccess сбрасывает только email-счётчик.
// log 'login_blocked' при старте блока.

import { dbGet, dbPost, dbPatch, rest } from './_matreshkaDb.js';
import { logSecurity } from './_matreshkaLog.js';

const WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 20;
const EMAIL_MAX = 5;

export function computeBlockDecision(attempts, firstAt, max, now = Date.now()) {
  if (!attempts || !firstAt || !max) return { blocked: false, until: null };
  const age = now - new Date(firstAt).getTime();
  if (age > WINDOW_MS) return { blocked: false, until: null };
  if (attempts >= max) {
    const until = new Date(new Date(firstAt).getTime() + WINDOW_MS);
    return { blocked: true, until: until.toISOString() };
  }
  return { blocked: false, until: null };
}

export function shouldBlock(attempts, firstAt, now = Date.now()) {
  // compat для старых тестов/вызовов — трактуем как email
  return computeBlockDecision(attempts, firstAt, EMAIL_MAX, now).blocked;
}

async function dbGetRow(key) {
  const q = `?attempt_key=eq.${encodeURIComponent(key)}&limit=1`;
  const got = await dbGet(rest('auth_login_attempts', q), null, true);
  if (!got.ok) {
    const errText = String(got.error || '');
    const st = got.status;
    if (st === 404 || /42P01|PGRST205|relation does not exist/i.test(errText)) {
      throw new Error('not_configured');
    }
    return null;
  }
  return got.data && got.data[0] ? got.data[0] : null;
}

export async function checkBlocked({ ip = '', email = '', scope = '' }) {
  const normEmail = (email || '').toLowerCase().trim();
  const now = Date.now();
  const ipKey = scope === 'bitrix' ? `bitrix-ip:${ip || ''}` : `ip:${ip || ''}`;
  const emailKey = normEmail ? `email:${normEmail}` : null;
  try {
    const ipRow = (ip || scope === 'bitrix') ? await dbGetRow(ipKey) : null;
    if (ipRow && ipRow.blocked_until && new Date(ipRow.blocked_until).getTime() > now) {
      return { blocked: true, until: ipRow.blocked_until };
    }
    const emRow = emailKey ? await dbGetRow(emailKey) : null;
    if (emRow && emRow.blocked_until && new Date(emRow.blocked_until).getTime() > now) {
      return { blocked: true, until: emRow.blocked_until };
    }
    return { blocked: false, until: null };
  } catch (err) {
    const msg = String(err && err.message || err);
    if (msg === 'not_configured') throw err;
    return { blocked: false, until: null };
  }
}

export async function recordFailure({ ip = '', email = '', scope = '' }) {
  const normEmail = (email || '').toLowerCase().trim();
  const now = new Date();
  const nowTs = now.getTime();
  const ipKey = scope === 'bitrix' ? `bitrix-ip:${ip || ''}` : `ip:${ip || ''}`;
  const emailKey = normEmail ? `email:${normEmail}` : null;
  let hitUntil = null;

  // IP (или bitrix-ip) counter — всегда если есть ip или bitrix scope
  if (ip || scope === 'bitrix') {
    try {
      let row = await dbGetRow(ipKey);
      let attempts = row?.attempts ?? 0;
      let firstAt = row?.first_attempt_at ?? now.toISOString();
      const age = nowTs - new Date(firstAt).getTime();
      if (age > WINDOW_MS) {
        attempts = 0;
        firstAt = now.toISOString();
      }
      attempts += 1;
      const dec = computeBlockDecision(attempts, firstAt, IP_MAX, nowTs);
      const payload = {
        attempt_key: ipKey,
        ip: ip || null,
        email: null,
        attempts,
        first_attempt_at: firstAt,
        last_attempt_at: now.toISOString(),
        blocked_until: dec.blocked ? dec.until : (row && row.blocked_until && new Date(row.blocked_until).getTime() > nowTs ? row.blocked_until : null),
      };
      if (row) {
        await dbPatch(rest(`auth_login_attempts?id=eq.${row.id}`), payload, null, true);
      } else {
        await dbPost(rest('auth_login_attempts'), payload, null, true);
      }
      if (dec.blocked && !(row && row.blocked_until && new Date(row.blocked_until).getTime() > nowTs)) {
        await logSecurity('login_blocked', { ip, email: normEmail || null, attempts, key: ipKey, scope }, { ip });
      }
      if (dec.blocked) hitUntil = dec.until;
    } catch (err) {
      const msg = String(err && err.message || err);
      if (msg === 'not_configured') throw err;
    }
  }

  // email counter — independent
  if (emailKey) {
    try {
      let row = await dbGetRow(emailKey);
      let attempts = row?.attempts ?? 0;
      let firstAt = row?.first_attempt_at ?? now.toISOString();
      const age = nowTs - new Date(firstAt).getTime();
      if (age > WINDOW_MS) {
        attempts = 0;
        firstAt = now.toISOString();
      }
      attempts += 1;
      const dec = computeBlockDecision(attempts, firstAt, EMAIL_MAX, nowTs);
      const payload = {
        attempt_key: emailKey,
        ip: null,
        email: normEmail,
        attempts,
        first_attempt_at: firstAt,
        last_attempt_at: now.toISOString(),
        blocked_until: dec.blocked ? dec.until : (row && row.blocked_until && new Date(row.blocked_until).getTime() > nowTs ? row.blocked_until : null),
      };
      if (row) {
        await dbPatch(rest(`auth_login_attempts?id=eq.${row.id}`), payload, null, true);
      } else {
        await dbPost(rest('auth_login_attempts'), payload, null, true);
      }
      if (dec.blocked && !(row && row.blocked_until && new Date(row.blocked_until).getTime() > nowTs)) {
        await logSecurity('login_blocked', { ip, email: normEmail, attempts, key: emailKey, scope }, { ip });
      }
      if (dec.blocked) hitUntil = dec.until || hitUntil;
    } catch (err) {
      const msg = String(err && err.message || err);
      if (msg === 'not_configured') throw err;
    }
  }

  return { blocked: !!hitUntil, until: hitUntil };
}

export async function recordSuccess({ email = '' }) {
  const normEmail = (email || '').toLowerCase().trim();
  if (!normEmail) return;
  const key = `email:${normEmail}`;
  try {
    const row = await dbGetRow(key);
    if (row) {
      await dbPatch(
        rest(`auth_login_attempts?id=eq.${row.id}`),
        { attempts: 0, last_attempt_at: new Date().toISOString(), blocked_until: null },
        null,
        true
      );
    }
    // ip counter не трогаем
  } catch (err) {
    const msg = String(err && err.message || err);
    if (msg === 'not_configured') throw err;
  }
}

// Старый API оставлен для совместимости в переходный момент (не используется после правки matreshka.js)
export async function recordLoginAttempt({ ip = '', email = '', success = false, route = 'auth.login' }) {
  const normEmail = (email || '').toLowerCase().trim();
  if (success) {
    await recordSuccess({ email: normEmail });
    return { blocked: false };
  }
  return recordFailure({ ip, email: normEmail, scope: route && route.includes('bitrix') ? 'bitrix' : '' });
}
