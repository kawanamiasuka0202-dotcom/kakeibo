import { describe, expect, it } from 'vitest';
import { describeDeadline, goalProgress, monthsLeftFromDays, sortGoals } from '@/lib/savings';
import { goal, ME, PARTNER, savingsEntry } from './factories';

const TODAY = '2026-08-14';

describe('貯金目標の進捗', () => {
  const target = goal({ id: 'goal-a', targetYen: 300000, targetDate: '2027-01-10' });
  const entries = [
    savingsEntry({ goalId: 'goal-a', amountYen: 50000, userId: ME }),
    savingsEntry({ goalId: 'goal-a', amountYen: 40000, userId: PARTNER }),
    savingsEntry({ goalId: 'goal-a', amountYen: 45000, userId: ME }),
    savingsEntry({ goalId: 'goal-other', amountYen: 999999, userId: ME }),
  ];

  it('現在額は入金の合計（他の目標は混ざらない）', () => {
    const p = goalProgress(target, entries, TODAY);
    expect(p.currentYen).toBe(135000);
    expect(p.entryCount).toBe(3);
  });

  it('残額と達成率を計算する', () => {
    const p = goalProgress(target, entries, TODAY);
    expect(p.remainingYen).toBe(165000);
    expect(p.rate).toBe(45);
    expect(p.achieved).toBe(false);
  });

  it('出金（取り崩し）は現在額から引かれる', () => {
    const p = goalProgress(target, [...entries, savingsEntry({ goalId: 'goal-a', amountYen: -20000 })], TODAY);
    expect(p.currentYen).toBe(115000);
    expect(p.depositYen).toBe(135000);
    expect(p.withdrawalYen).toBe(20000);
    expect(p.remainingYen).toBe(185000);
  });

  it('目標を超えても残額はマイナスにならず、達成扱いになる', () => {
    const p = goalProgress(target, [savingsEntry({ goalId: 'goal-a', amountYen: 320000 })], TODAY);
    expect(p.remainingYen).toBe(0);
    expect(p.achieved).toBe(true);
    expect(p.rate).toBeGreaterThan(100);
  });

  it('誰がいくら入れたかを集計する', () => {
    const p = goalProgress(target, entries, TODAY);
    expect(p.byMember).toEqual([
      { userId: ME, amountYen: 95000 },
      { userId: PARTNER, amountYen: 40000 },
    ]);
  });

  it('月あたりの積立目安は整数で、切り上げる', () => {
    const p = goalProgress(target, entries, TODAY);
    expect(p.daysLeft).toBe(149);
    expect(p.monthsLeft).toBe(5);
    expect(p.monthlyNeededYen).toBe(33000);
    expect(Number.isInteger(p.monthlyNeededYen)).toBe(true);
  });

  it('目標日がなければ期限に関する値は null', () => {
    const noDate = goal({ id: 'goal-a', targetDate: null });
    const p = goalProgress(noDate, entries, TODAY);
    expect(p.daysLeft).toBeNull();
    expect(p.monthlyNeededYen).toBeNull();
  });

  it('入金がなければ現在額0・達成率0', () => {
    const p = goalProgress(target, [], TODAY);
    expect(p.currentYen).toBe(0);
    expect(p.rate).toBe(0);
    expect(p.remainingYen).toBe(300000);
  });
});

describe('残り期間', () => {
  it('30日を1ヶ月として切り上げる（最低1ヶ月）', () => {
    expect(monthsLeftFromDays(0)).toBe(0);
    expect(monthsLeftFromDays(1)).toBe(1);
    expect(monthsLeftFromDays(30)).toBe(1);
    expect(monthsLeftFromDays(31)).toBe(2);
    expect(monthsLeftFromDays(150)).toBe(5);
  });

  it('期限を日本語で説明する', () => {
    expect(describeDeadline(null, null)).toBe('目標日なし');
    expect(describeDeadline(0, '2026-08-14')).toContain('今日まで');
    expect(describeDeadline(10, '2026-08-24')).toContain('あと10日');
    expect(describeDeadline(-3, '2026-08-11')).toContain('3日超過');
    expect(describeDeadline(90, '2026-11-12')).toContain('あと約3ヶ月');
  });
});

describe('目標の並び順', () => {
  it('進行中 → 一時停止 → 達成 → アーカイブの順に並ぶ', () => {
    const goals = [
      goal({ id: 'g-archived', status: 'archived', targetDate: null }),
      goal({ id: 'g-done', status: 'done', targetDate: null }),
      goal({ id: 'g-paused', status: 'paused', targetDate: null }),
      goal({ id: 'g-active', status: 'active', targetDate: null }),
    ];
    expect(sortGoals(goals).map((g) => g.id)).toEqual(['g-active', 'g-paused', 'g-done', 'g-archived']);
  });

  it('同じ状態なら目標日が近い順', () => {
    const goals = [
      goal({ id: 'later', targetDate: '2027-05-01' }),
      goal({ id: 'sooner', targetDate: '2026-09-01' }),
    ];
    expect(sortGoals(goals).map((g) => g.id)).toEqual(['sooner', 'later']);
  });
});
