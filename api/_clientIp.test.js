import { describe, expect, it } from 'vitest';
import { getClientIp, getTrustedProxyIps, parseIp, isFromTrustedProxy } from './_clientIp.js';

const PROXY = '185.207.1.94';
const req = (headers) => ({ headers });

describe('getClientIp: X-RF-Client-IP от доверенного прокси', () => {
  it('транспортный IP = прокси (x-forwarded-for) → берётся X-RF-Client-IP', () => {
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-rf-client-ip': '93.84.12.7' }))).toBe('93.84.12.7');
  });

  it('прокси виден в x-vercel-forwarded-for / x-real-ip → тоже доверяем', () => {
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-vercel-forwarded-for': PROXY, 'x-real-ip': PROXY, 'x-rf-client-ip': '93.84.12.7' }))).toBe('93.84.12.7');
    expect(getClientIp(req({ 'x-real-ip': PROXY, 'x-rf-client-ip': '93.84.12.7' }))).toBe('93.84.12.7');
  });

  it('IPv6 клиента, пробелы и список — берётся первое обрезанное значение', () => {
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-rf-client-ip': ' 2a00:1fa0:4:1::5 , 10.0.0.1' }))).toBe('2a00:1fa0:4:1::5');
  });

  it('IPv4-mapped адрес прокси тоже распознаётся', () => {
    expect(getClientIp(req({ 'x-forwarded-for': `::ffff:${PROXY}`, 'x-rf-client-ip': '93.84.12.7' }))).toBe('93.84.12.7');
  });

  it('TRUSTED_PROXY_IPS переопределяет список прокси', () => {
    const trustedProxyIps = getTrustedProxyIps({ TRUSTED_PROXY_IPS: '203.0.113.5, 203.0.113.6' });
    expect(trustedProxyIps).toEqual(['203.0.113.5', '203.0.113.6']);
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.6', 'x-rf-client-ip': '93.84.12.7' }), { trustedProxyIps })).toBe('93.84.12.7');
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-rf-client-ip': '93.84.12.7' }), { trustedProxyIps })).toBe(PROXY);
    expect(getTrustedProxyIps({})).toEqual([PROXY]);
  });
});

describe('getClientIp: заголовок с чужого IP игнорируется', () => {
  it('прямой заход на Vercel с подделанным X-RF-Client-IP → прежняя логика', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '77.88.55.60', 'x-rf-client-ip': '1.2.3.4' }))).toBe('77.88.55.60');
  });

  it('x-vercel-forwarded-for (выставляет Vercel) не прокси → не доверяем, даже если XFF подделан', () => {
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-vercel-forwarded-for': '77.88.55.60', 'x-rf-client-ip': '1.2.3.4' }))).toBe(PROXY);
  });

  it('прокси не первым в x-forwarded-for → не доверяем', () => {
    expect(getClientIp(req({ 'x-forwarded-for': `77.88.55.60, ${PROXY}`, 'x-rf-client-ip': '1.2.3.4' }))).toBe('77.88.55.60');
  });

  it('без заголовков → null, как раньше', () => {
    expect(getClientIp(req({}))).toBe(null);
    expect(isFromTrustedProxy(req({}))).toBe(false);
  });
});

describe('getClientIp: мусор в заголовке → прежняя логика', () => {
  it.each(['', '   ', 'unknown', 'not-an-ip', '999.1.1.1', '1.2.3', '<script>', '93.84.12.7; DROP TABLE'])('%j', (bad) => {
    expect(getClientIp(req({ 'x-forwarded-for': PROXY, 'x-rf-client-ip': bad }))).toBe(PROXY);
  });

  it('массив x-forwarded-for — как в прежней логике, первый элемент', () => {
    expect(getClientIp(req({ 'x-forwarded-for': ['77.88.55.60', PROXY] }))).toBe('77.88.55.60');
  });

  it('parseIp', () => {
    expect(parseIp(' 10.1.2.3 ')).toBe('10.1.2.3');
    expect(parseIp('::1')).toBe('::1');
    expect(parseIp('abc')).toBe(null);
    expect(parseIp(undefined)).toBe(null);
  });
});
