import { describe, expect, it } from 'vitest';
import { classifyLoginError, loginErrorMessage, refineWithAccountCheck } from './loginErrors';

const ok = { exists: true, confirmed: true, banned: false, hasAccess: true };

describe('classifyLoginError', () => {
  it('неверный пароль', () => {
    expect(classifyLoginError({ name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }).kind).toBe('wrong_password');
    expect(classifyLoginError({ name: 'AuthApiError', status: 400, message: 'Invalid login credentials' }).kind).toBe('wrong_password');
  });
  it('лимит попыток', () => {
    expect(classifyLoginError({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' }).kind).toBe('rate_limited');
    expect(classifyLoginError({ status: 429 }).kind).toBe('rate_limited');
  });
  it('не подтверждён / заблокирован', () => {
    expect(classifyLoginError({ status: 400, code: 'email_not_confirmed' }).kind).toBe('not_confirmed');
    expect(classifyLoginError({ status: 400, code: 'user_banned' }).kind).toBe('banned');
  });
  it('сеть и таймаут — не «неверный пароль»', () => {
    expect(classifyLoginError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }).kind).toBe('unreachable');
    expect(classifyLoginError(new TypeError('Load failed')).kind).toBe('unreachable');
    expect(classifyLoginError(new Error('Сервер не отвечает. Попробуйте ещё раз')).kind).toBe('unreachable');
  });
  it('база на паузе / 5xx', () => {
    expect(classifyLoginError({ status: 402, code: 'exceed_egress_quota' })).toEqual({ kind: 'db_unavailable', code: 'exceed_egress_quota' });
    expect(classifyLoginError({ status: 503 }).kind).toBe('db_unavailable');
  });
  it('неизвестное — с кодом', () => {
    expect(classifyLoginError({ name: 'AuthApiError', status: 400, code: 'captcha_failed' })).toEqual({ kind: 'unknown', code: 'captcha_failed' });
  });
});

describe('refineWithAccountCheck', () => {
  const wrong = { kind: 'wrong_password' as const, code: 'invalid_credentials' };
  it('уточняет invalid_credentials', () => {
    expect(refineWithAccountCheck(wrong, { ...ok, exists: false }).kind).toBe('no_user');
    expect(refineWithAccountCheck(wrong, { ...ok, banned: true }).kind).toBe('banned');
    expect(refineWithAccountCheck(wrong, { ...ok, confirmed: false }).kind).toBe('not_confirmed');
    expect(refineWithAccountCheck(wrong, { ...ok, hasAccess: false }).kind).toBe('no_access');
    expect(refineWithAccountCheck(wrong, ok).kind).toBe('wrong_password');
    expect(refineWithAccountCheck(wrong, null).kind).toBe('wrong_password');
  });
});

describe('loginErrorMessage', () => {
  it('минуты склоняются', () => {
    expect(loginErrorMessage({ kind: 'rate_limited' }, 5 * 60000)).toBe('Слишком много попыток. Попробуйте через 5 минут');
    expect(loginErrorMessage({ kind: 'rate_limited' }, 60000)).toBe('Слишком много попыток. Попробуйте через 1 минуту');
    expect(loginErrorMessage({ kind: 'rate_limited' }, 2 * 60000)).toBe('Слишком много попыток. Попробуйте через 2 минуты');
  });
  it('неизвестная — с кодом', () => {
    expect(loginErrorMessage({ kind: 'unknown', code: 'captcha_failed' })).toBe('Не удалось войти. Код: captcha_failed');
  });
});
