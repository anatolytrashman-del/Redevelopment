// Ограничение частоты и паузы между повторами для ИИ-воркера на боксе.
// Не больше BOX_WORKER_RPM вызовов модели в минуту (по умолчанию 6) и не
// чаще одного вызова в minIntervalMs. Ошибки провайдера делим на те, что
// имеет смысл повторить (429, 403 «регион» при переподключении VPN, 5xx,
// сеть, таймаут), и окончательные (401/400, битый файл).

export function createRateLimiter({ perMinute = 6, minIntervalMs = 3000, now = () => Date.now(), sleep = defaultSleep } = {}) {
  const stamps = [];
  let last = null;
  return async function acquire() {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= 60_000) stamps.shift();
      const waitWindow = stamps.length >= perMinute ? 60_000 - (t - stamps[0]) : 0;
      const waitGap = last != null ? Math.max(0, minIntervalMs - (t - last)) : 0;
      const wait = Math.max(waitWindow, waitGap);
      if (wait <= 0) {
        stamps.push(t);
        last = t;
        return;
      }
      await sleep(wait);
    }
  };
}

export function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Экспонента с потолком и небольшим разбросом, чтобы повторы не шли пачкой.
export function backoffMs(attempt, { baseMs = 60_000, maxMs = 3_600_000, jitter = 0.2, random = Math.random } = {}) {
  const raw = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(raw * (1 - jitter + 2 * jitter * random()));
}

export function classifyError(err) {
  const msg = String(err?.message ?? err ?? '');
  const status = Number(err?.status ?? (msg.match(/\b(4\d\d|5\d\d)\b/) || [])[1] ?? 0);
  if (status === 429 || /rate.?limit|too many requests/i.test(msg)) {
    return { retry: true, reason: 'rate_limit', retryAfterS: err?.retryAfterS ?? null };
  }
  if (status === 403 && /region|country|territor/i.test(msg)) return { retry: true, reason: 'region' };
  if (status >= 500) return { retry: true, reason: 'server' };
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|timeout|socket hang up/i.test(msg)) return { retry: true, reason: 'network' };
  if (status === 401 || status === 403) return { retry: false, reason: 'auth' };
  return { retry: false, reason: 'fatal' };
}
