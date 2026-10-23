import { describe, expect, it } from 'vitest';
import { matchApprover } from './_osnovaApprovals.js';

describe('matchApprover pure helper (block 4)', () => {
  it('returns null for empty or no match', () => {
    expect(matchApprover([], 'facade')).toBeNull();
    expect(matchApprover(null, 'foo')).toBeNull();
    expect(matchApprover([{ supply_kind: 'other', approver_user_id: 'u1' }], 'facade')).toBeNull();
  });

  it('matches by supply_kind exact (trim ignorecase)', () => {
    const rules = [
      { supply_kind: 'Фасад', priority: 10, approver_position_id: 'p1' },
      { supply_kind: 'facade', priority: 5, approver_user_id: 'u1' },
    ];
    expect(matchApprover(rules, 'facade')).toEqual({ type: 'user', id: 'u1' });
    expect(matchApprover(rules, '  ФАСАД ')).toEqual({ type: 'position', id: 'p1' });
  });

  it('picks lowest priority on ties', () => {
    const rules = [
      { supply_kind: 'Кровля', priority: 100, approver_user_id: 'u100' },
      { supply_kind: 'Кровля', priority: 10, approver_position_id: 'p10' },
    ];
    expect(matchApprover(rules, 'Кровля')).toEqual({ type: 'position', id: 'p10' });
  });

  it('supports mixed user/position rules', () => {
    const rules = [{ supply_kind: 'misc', approver_user_id: 'u', approver_position_id: null, priority: 1 }];
    expect(matchApprover(rules, 'misc')).toEqual({ type: 'user', id: 'u' });
  });
});
