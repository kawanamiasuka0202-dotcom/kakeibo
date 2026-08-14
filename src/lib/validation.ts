import { isYmd, type Ymd } from './date';
import { MAX_YEN, type Yen } from './money';
import { PAYMENT_METHODS, type TransactionInput } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

const ok: ValidationResult = { ok: true, errors: {} };

/** 金額が「1円以上・整数・上限以内」であることを検証する。 */
export function validateAmount(value: Yen | null | undefined, label = '金額'): string | null {
  if (value === null || value === undefined) return `${label}を入力してください`;
  if (!Number.isInteger(value)) return `${label}は1円単位の整数で入力してください`;
  if (value <= 0) return `${label}は1円以上で入力してください`;
  if (value > MAX_YEN) return `${label}が大きすぎます`;
  return null;
}

export function validateDate(value: Ymd | null | undefined, label = '日付'): string | null {
  if (!value) return `${label}を選択してください`;
  if (!isYmd(value)) return `${label}の形式が正しくありません`;
  return null;
}

export function validateText(
  value: string | null | undefined,
  label: string,
  { required = false, max = 200 }: { required?: boolean; max?: number } = {},
): string | null {
  const v = (value ?? '').trim();
  if (required && v === '') return `${label}を入力してください`;
  if (v.length > max) return `${label}は${max}文字以内で入力してください`;
  return null;
}

/** 取引の入力内容を検証する。 */
export function validateTransaction(input: Partial<TransactionInput>): ValidationResult {
  const errors: Record<string, string> = {};

  const amountError = validateAmount(input.amountYen);
  if (amountError) errors.amountYen = amountError;

  const dateError = validateDate(input.occurredOn);
  if (dateError) errors.occurredOn = dateError;

  if (!input.categoryId) errors.categoryId = 'カテゴリを選択してください';
  if (!input.paidBy) errors.paidBy = '支払った人を選択してください';
  if (input.type !== 'expense' && input.type !== 'income') errors.type = '種別を選択してください';
  if (input.shareScope !== 'shared' && input.shareScope !== 'personal') {
    errors.shareScope = '区分を選択してください';
  }
  if (input.paymentMethod && !PAYMENT_METHODS.includes(input.paymentMethod)) {
    errors.paymentMethod = '支払方法を選択してください';
  }

  const descError = validateText(input.description, '内容・店名', { max: 100 });
  if (descError) errors.description = descError;
  const memoError = validateText(input.memo, 'メモ', { max: 500 });
  if (memoError) errors.memo = memoError;

  return Object.keys(errors).length === 0 ? ok : { ok: false, errors };
}

export function validateGoal(input: {
  name?: string;
  targetYen?: Yen | null;
  targetDate?: Ymd | null;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const nameError = validateText(input.name, '目標名', { required: true, max: 50 });
  if (nameError) errors.name = nameError;
  const amountError = validateAmount(input.targetYen, '目標金額');
  if (amountError) errors.targetYen = amountError;
  if (input.targetDate) {
    const dateError = validateDate(input.targetDate, '目標日');
    if (dateError) errors.targetDate = dateError;
  }
  return Object.keys(errors).length === 0 ? ok : { ok: false, errors };
}

export function validateBudgetAmount(value: Yen | null | undefined): string | null {
  if (value === null || value === undefined) return '予算額を入力してください';
  if (!Number.isInteger(value)) return '予算額は1円単位の整数で入力してください';
  if (value < 0) return '予算額は0円以上で入力してください';
  if (value > MAX_YEN) return '予算額が大きすぎます';
  return null;
}

export function validateDisplayName(value: string): string | null {
  return validateText(value, '表示名', { required: true, max: 20 });
}

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'メールアドレスを入力してください';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'メールアドレスの形式が正しくありません';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'パスワードを入力してください';
  if (value.length < 8) return 'パスワードは8文字以上で入力してください';
  if (value.length > 72) return 'パスワードは72文字以内で入力してください';
  return null;
}
