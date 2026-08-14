import { describe, expect, it } from 'vitest';
import {
  validateAmount,
  validateBudgetAmount,
  validateDisplayName,
  validateEmail,
  validateGoal,
  validatePassword,
  validateTransaction,
} from '@/lib/validation';
import { ME } from './factories';

const validInput = {
  type: 'expense' as const,
  amountYen: 1200,
  categoryId: 'cat-1',
  description: 'スーパー',
  occurredOn: '2026-08-14',
  paidBy: ME,
  shareScope: 'shared' as const,
  paymentMethod: '現金' as const,
  memo: '',
  savingsGoalId: null,
  receiptPath: null,
};

describe('金額の検証', () => {
  it('0円以下は登録できない', () => {
    expect(validateAmount(0)).toContain('1円以上');
    expect(validateAmount(-100)).toContain('1円以上');
  });

  it('小数は登録できない', () => {
    expect(validateAmount(1200.5)).toContain('整数');
  });

  it('未入力はエラー', () => {
    expect(validateAmount(null)).toContain('入力');
  });

  it('1円は登録できる', () => {
    expect(validateAmount(1)).toBeNull();
  });

  it('予算額は0円を許可する（予算なしの表現に使う）', () => {
    expect(validateBudgetAmount(0)).toBeNull();
    expect(validateBudgetAmount(-1)).toContain('0円以上');
  });
});

describe('取引の検証', () => {
  it('正しい入力は通る', () => {
    expect(validateTransaction(validInput).ok).toBe(true);
  });

  it('金額0はエラーになる', () => {
    const result = validateTransaction({ ...validInput, amountYen: 0 });
    expect(result.ok).toBe(false);
    expect(result.errors.amountYen).toBeTruthy();
  });

  it('カテゴリ未選択はエラーになる', () => {
    const result = validateTransaction({ ...validInput, categoryId: '' });
    expect(result.ok).toBe(false);
    expect(result.errors.categoryId).toBeTruthy();
  });

  it('日付の形式が不正ならエラーになる', () => {
    expect(validateTransaction({ ...validInput, occurredOn: '2026-13-40' }).ok).toBe(false);
    expect(validateTransaction({ ...validInput, occurredOn: '2026/08/14' }).ok).toBe(false);
  });

  it('存在しない日付は弾く', () => {
    expect(validateTransaction({ ...validInput, occurredOn: '2026-02-30' }).ok).toBe(false);
  });

  it('内容が長すぎるとエラーになる', () => {
    const result = validateTransaction({ ...validInput, description: 'あ'.repeat(101) });
    expect(result.ok).toBe(false);
  });
});

describe('貯金目標の検証', () => {
  it('目標名と金額が必要', () => {
    expect(validateGoal({ name: '', targetYen: 100000 }).ok).toBe(false);
    expect(validateGoal({ name: '旅行', targetYen: 0 }).ok).toBe(false);
    expect(validateGoal({ name: '旅行', targetYen: 100000 }).ok).toBe(true);
  });
});

describe('アカウント情報の検証', () => {
  it('メールアドレスの形式を確認する', () => {
    expect(validateEmail('user@example.com')).toBeNull();
    expect(validateEmail('user@')).toBeTruthy();
    expect(validateEmail('')).toBeTruthy();
  });

  it('パスワードは8文字以上', () => {
    expect(validatePassword('1234567')).toContain('8文字以上');
    expect(validatePassword('12345678')).toBeNull();
  });

  it('表示名は必須で20文字まで', () => {
    expect(validateDisplayName('')).toBeTruthy();
    expect(validateDisplayName('あ'.repeat(21))).toBeTruthy();
    expect(validateDisplayName('たろう')).toBeNull();
  });
});
