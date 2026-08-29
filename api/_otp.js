// Общий хелпер для OTP-кодов подписания соглашения (agreement-otp-request.js /
// agreement-otp-verify.js) — код никогда не хранится в базе открытым текстом,
// только sha256-хэш; сравнение — timing-safe, чтобы не давать боковой канал
// по времени ответа.

import { createHash, timingSafeEqual } from 'node:crypto';

export function hashOtpCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function otpCodeMatches(code, storedHash) {
  if (!storedHash) return false;
  const actual = Buffer.from(hashOtpCode(code), 'hex');
  const expected = Buffer.from(String(storedHash), 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export const OTP_MAX_ATTEMPTS = 5;
