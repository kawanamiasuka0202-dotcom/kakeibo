import { describe, expect, it } from 'vitest';
import { candidateToTransaction, occurrenceDate, pendingRecurring } from '@/lib/recurring';
import { recurringRule } from './factories';

const AUGUST = { year: 2026, month: 8 };

describe('定期支出の確認候補', () => {
  it('有効なルールが当月の候補になる', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ dayOfMonth: 5 })],
      key: AUGUST,
      monthStartDay: 1,
      existing: [],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].occurredOn).toBe('2026-08-05');
  });

  it('自動では確定しない（候補を返すだけで取引は作らない）', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule()],
      key: AUGUST,
      monthStartDay: 1,
      existing: [],
    });
    const input = candidateToTransaction(candidates[0]);
    expect(input.amountYen).toBe(92000);
    expect(input.description).toBe('家賃');
    // 変換しただけでは保存されない = 呼び出し側が明示的に登録する必要がある
    expect(input.savingsGoalId).toBeNull();
  });

  it('確認済みの月は候補に出ない', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ lastConfirmedMonth: '2026-08-01' })],
      key: AUGUST,
      monthStartDay: 1,
      existing: [],
    });
    expect(candidates).toHaveLength(0);
  });

  it('停止中のルールは候補に出ない', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ active: false })],
      key: AUGUST,
      monthStartDay: 1,
      existing: [],
    });
    expect(candidates).toHaveLength(0);
  });

  it('似た記録がすでにあれば重複の可能性を知らせる', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ categoryId: 'cat-rent', amountYen: 92000, dayOfMonth: 5 })],
      key: AUGUST,
      monthStartDay: 1,
      existing: [{ categoryId: 'cat-rent', amountYen: 92000, occurredOn: '2026-08-03' }],
    });
    expect(candidates[0].possibleDuplicate).toBe(true);
  });

  it('金額が違えば重複扱いしない', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ categoryId: 'cat-rent', amountYen: 92000 })],
      key: AUGUST,
      monthStartDay: 1,
      existing: [{ categoryId: 'cat-rent', amountYen: 80000, occurredOn: '2026-08-03' }],
    });
    expect(candidates[0].possibleDuplicate).toBe(false);
  });

  it('月の開始日が25日のとき、5日発生のルールは期間内（翌月5日）に寄せられる', () => {
    const candidates = pendingRecurring({
      rules: [recurringRule({ dayOfMonth: 5 })],
      key: AUGUST,
      monthStartDay: 25,
      existing: [],
    });
    expect(candidates[0].occurredOn).toBe('2026-09-05');
  });

  it('発生日が月末を超える場合は月末に丸める', () => {
    expect(occurrenceDate(recurringRule({ dayOfMonth: 28 }), { year: 2026, month: 2 })).toBe(
      '2026-02-28',
    );
  });
});
