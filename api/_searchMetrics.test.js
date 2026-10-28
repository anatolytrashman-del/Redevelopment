import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./_auth.js', () => ({ requireStaffAuth: vi.fn() }));
import { requireStaffAuth } from './_auth.js';
import handler, { readMetricsSnapshot } from './search-metrics.js';

function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
describe('GET /api/search-metrics', () => {
  beforeEach(() => vi.clearAllMocks());
  it('отдаёт реальный снимок только после авторизации', async () => {
    requireStaffAuth.mockResolvedValue({ id: 'staff' });
    const res = response();
    await handler({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const snapshot = res.json.mock.calls[0][0];
    expect(snapshot).toEqual(await readMetricsSnapshot());
    expect(snapshot.sites[0].domain).toBe('gamblinglist.pro');
    expect(snapshot.sites[0].gsc.daily.find((d) => d.day === '2026-10-25')).toMatchObject({ clicks: 8, impressions: 1098 });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(JSON.stringify(snapshot)).not.toMatch(/private_key|client_email|api[_-]?key|Bearer |AuthenticationCode/i);
  });
  it('не отдаёт данные без сессии', async () => {
    requireStaffAuth.mockResolvedValue(null);
    const res = response();
    await handler({ method: 'GET' }, res);
    expect(res.json).not.toHaveBeenCalled();
  });
  it('запрещает запись', async () => {
    const res = response();
    await handler({ method: 'POST' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(requireStaffAuth).not.toHaveBeenCalled();
  });
});
