// Определение IP клиента для лимитов (OTP, вход) с учётом RU-прокси перед
// Vercel (nginx на Beget VPS, см. PROXY-BEGET.md).
//
// Vercel перезаписывает x-forwarded-for / x-real-ip / x-vercel-forwarded-for
// IP-адресом входящего соединения (доверенный X-Forwarded-For — только
// Enterprise). Поэтому за прокси все посетители видны как IP прокси, а
// реальный адрес прокси передаёт в X-RF-Client-IP ($remote_addr nginx).
//
// Доверяем X-RF-Client-IP ТОЛЬКО если транспортный IP (то, что проставил
// Vercel) — один из доверенных прокси. При прямом заходе на Vercel этот
// заголовок может подставить кто угодно, и он игнорируется.

import { isIP } from 'node:net';

export const DEFAULT_TRUSTED_PROXY_IPS = Object.freeze(['185.207.1.94']);
export const CLIENT_IP_HEADER = 'x-rf-client-ip';

function headerValue(req, name) {
  const v = req?.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

// Первый элемент списка через запятую, без пробелов; '' если пусто.
function firstListValue(raw) {
  if (raw == null) return '';
  return String(raw).split(',')[0].trim();
}

// IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4, чтобы сравнение с IPv4 работало.
function normalizeIp(ip) {
  const s = String(ip || '').trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  return m ? m[1] : s;
}

// Валидный IPv4/IPv6 (первое значение, обрезанное) или null.
export function parseIp(raw) {
  const first = normalizeIp(firstListValue(raw));
  return first && isIP(first) ? first : null;
}

export function getTrustedProxyIps(env = process.env) {
  const raw = env?.TRUSTED_PROXY_IPS;
  if (raw == null || String(raw).trim() === '') return [...DEFAULT_TRUSTED_PROXY_IPS];
  return String(raw)
    .split(/[\s,]+/)
    .map((s) => normalizeIp(s))
    .filter((s) => s && isIP(s));
}

// Прежняя логика agreement-otp-request.js: первый IP из x-forwarded-for
// (как есть, без валидации), иначе null.
export function getForwardedForIp(req) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  return Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : (forwardedFor ?? '').split(',')[0].trim() || null;
}

// Пришёл ли запрос с доверенного прокси. Смотрим на заголовки, которые
// выставляет сам Vercel: x-vercel-forwarded-for (не перезаписывается
// прокси, приоритетный), иначе транспортный IP по прежней логике
// (первый x-forwarded-for), иначе x-real-ip.
export function isFromTrustedProxy(req, { transportIp, trustedProxyIps } = {}) {
  const trusted = trustedProxyIps ?? getTrustedProxyIps();
  if (!trusted.length) return false;
  const vercelFwd = firstListValue(headerValue(req, 'x-vercel-forwarded-for'));
  const candidate = vercelFwd
    ? vercelFwd
    : (transportIp ?? getForwardedForIp(req)) || firstListValue(headerValue(req, 'x-real-ip'));
  if (!candidate) return false;
  return trusted.includes(normalizeIp(candidate));
}

// IP клиента: X-RF-Client-IP, если запрос пришёл с доверенного прокси и
// заголовок — валидный IP; иначе — результат прежней логики (transportIp
// или getForwardedForIp), без изменений.
export function getClientIp(req, { transportIp, trustedProxyIps } = {}) {
  const transport = transportIp !== undefined ? transportIp : getForwardedForIp(req);
  if (isFromTrustedProxy(req, { transportIp: transport, trustedProxyIps })) {
    const real = parseIp(headerValue(req, CLIENT_IP_HEADER));
    if (real) return real;
  }
  return transport;
}
