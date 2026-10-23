import { describe, expect, it } from 'vitest';
import { parseSupplierRef, validateRequestInput, validateSupplierAdd, validateNoteAdd, validatePriceAdd } from './_osnovaClient.js';

// simple permission matrix test (pure, no side effects)
function permissionMatrix(hostClient, hasMembership, isPlatformOwner, clientStatus) {
  if (!hostClient && !isPlatformOwner) return { code: 403, error: 'platform_owner_required' };
  if (!hasMembership) return { code: 403, error: 'no_client_membership' };
  if (clientStatus === 'suspended' || clientStatus === 'disabled') return { code: 403, error: 'client_suspended' };
  if (clientStatus !== 'active') return { code: 403, error: 'client_not_active' };
  return { code: 200, ok: true };
}

describe('_osnovaClient pure helpers', () => {
  it('parseSupplierRef valid catalog and added', () => {
    expect(parseSupplierRef('catalog:123e4567-e89b-12d3-a456-426614174000')).toEqual({ source: 'catalog', id: '123e4567-e89b-12d3-a456-426614174000' });
    expect(parseSupplierRef('added:abc-123')).toEqual({ source: 'added', id: 'abc-123' });
    expect(parseSupplierRef('bad')).toBeNull();
    expect(parseSupplierRef(null)).toBeNull();
  });

  it('validateRequestInput', () => {
    expect(validateRequestInput({ title: '  foo  ' }).ok).toBe(true);
    expect(validateRequestInput({}).ok).toBe(false);
    expect(validateRequestInput({ title: 'x', status: 'foo' }).ok).toBe(false);
  });

  it('validateSupplierAdd requires name', () => {
    expect(validateSupplierAdd({ name: '  ' }).ok).toBe(false);
    expect(validateSupplierAdd({ name: 'ООО Тест' }).ok).toBe(true);
  });

  it('validateNoteAdd and Price require valid ref and body/price', () => {
    expect(validateNoteAdd({ supplier_ref: 'catalog:11111111-1111-1111-1111-111111111111', body: 'ok' }).ok).toBe(true);
    expect(validateNoteAdd({ supplier_ref: 'bad', body: 'x' }).ok).toBe(false);
    expect(validatePriceAdd({ supplier_ref: 'added:222', price: '123' }).ok).toBe(true);
    expect(validatePriceAdd({ supplier_ref: 'added:222', price: 'abc' }).ok).toBe(false);
  });

  it('permission matrix: suspended -> 403 client_suspended', () => {
    const r = permissionMatrix('matreshka', true, false, 'suspended');
    expect(r.code).toBe(403);
    expect(r.error).toBe('client_suspended');
  });

  it('permission matrix: platform owner switcher without host', () => {
    const r = permissionMatrix(null, true, true, 'active');
    expect(r.ok).toBe(true);
  });

  it('permission matrix: no membership -> 403', () => {
    expect(permissionMatrix('matreshka', false, false, 'active').error).toBe('no_client_membership');
  });
});
