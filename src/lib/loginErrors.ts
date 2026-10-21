// Текст ошибки на экране входа (PasswordGate) — 2026-10-21.
//
// Раньше любая неудача signInWithPassword показывалась как «Неверный пароль»:
// и неверный пароль, и лимит попыток, и недоступная база (сеть/VPN, 402
// при превышении квоты 23.09). Здесь каждый случай получает свой текст.
// Чистые функции без React — покрыты src/lib/loginErrors.test.ts.

export type LoginErrorKind =
  | 'wrong_password'
  | 'no_user'
  | 'no_access'
  | 'not_confirmed'
  | 'banned'
  | 'rate_limited'
  | 'unreachable'
  | 'db_unavailable'
  | 'unknown';

export interface LoginErrorInfo {
  kind: LoginErrorKind;
  /** Код для строки «Код: …» в неизвестной ошибке и в логах. */
  code?: string;
}

// Сколько ждать после «слишком много попыток». Точного остатка Supabase
// клиенту не отдаёт (Retry-After supabase-js наружу не пробрасывает), а окно
// лимита входа в Supabase Auth — 5 минут.
export const RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

const NETWORK_MESSAGE_RE = /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|не отвечает/i;

export function classifyLoginError(error: unknown): LoginErrorInfo {
  const e = (error ?? {}) as ErrorLike;
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : 0;

  if (code === 'invalid_credentials') return { kind: 'wrong_password', code };
  if (code === 'email_not_confirmed' || code === 'phone_not_confirmed') return { kind: 'not_confirmed', code };
  if (code === 'user_banned') return { kind: 'banned', code };
  if (code === 'user_not_found') return { kind: 'no_user', code };
  if (status === 429 || code.startsWith('over_') || code === 'too_many_requests') {
    return { kind: 'rate_limited', code: code || '429' };
  }
  // Проект Supabase на паузе / закрыт за квоту (402 exceed_egress_quota), 5xx и
  // 540/544 (проект спит / таймаут шлюза) — база есть, но сейчас не отвечает.
  if (status === 402 || status >= 500) return { kind: 'db_unavailable', code: code || String(status) };
  // supabase-js: AuthRetryableFetchError (status 0) — запрос не дошёл до сервера.
  if (name === 'AuthRetryableFetchError' || name === 'TypeError' || name === 'AbortError' || NETWORK_MESSAGE_RE.test(message)) {
    return { kind: 'unreachable', code: name || 'network' };
  }
  // Старый сервер Auth без error_code: 400 «Invalid login credentials».
  if (status === 400 && /invalid login credentials/i.test(message)) return { kind: 'wrong_password', code: 'invalid_credentials' };
  return { kind: 'unknown', code: code || (status ? String(status) : name || 'unknown') };
}

export interface AccountCheck {
  exists: boolean;
  confirmed: boolean;
  banned: boolean;
  hasAccess: boolean;
}

/** Уточняет `wrong_password` по ответу /api/login-check (Supabase на всё это отвечает одним invalid_credentials). */
export function refineWithAccountCheck(info: LoginErrorInfo, check: AccountCheck | null): LoginErrorInfo {
  if (info.kind !== 'wrong_password' || !check) return info;
  if (!check.exists) return { kind: 'no_user', code: info.code };
  if (check.banned) return { kind: 'banned', code: info.code };
  if (!check.confirmed) return { kind: 'not_confirmed', code: info.code };
  if (!check.hasAccess) return { kind: 'no_access', code: info.code };
  return info;
}

export function loginErrorMessage(info: LoginErrorInfo, waitMs = RATE_LIMIT_WAIT_MS): string {
  switch (info.kind) {
    case 'wrong_password':
      return 'Неверный пароль';
    case 'no_user':
      return 'Такого пользователя нет. Обратитесь к администратору';
    case 'no_access':
      return 'У этого аккаунта нет доступа к панели. Обратитесь к администратору';
    case 'not_confirmed':
      return 'Аккаунт не подтверждён. Обратитесь к администратору';
    case 'banned':
      return 'Аккаунт заблокирован. Обратитесь к администратору';
    case 'rate_limited': {
      const minutes = Math.max(1, Math.ceil(waitMs / 60000));
      return `Слишком много попыток. Попробуйте через ${minutes} ${pluralMinutes(minutes)}`;
    }
    case 'unreachable':
      return 'Нет связи с базой. Проверьте интернет или включите VPN';
    case 'db_unavailable':
      return `База временно недоступна. Попробуйте позже (код ${info.code ?? '—'})`;
    default:
      return `Не удалось войти. Код: ${info.code ?? 'unknown'}`;
  }
}

function pluralMinutes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'минуту';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'минуты';
  return 'минут';
}
