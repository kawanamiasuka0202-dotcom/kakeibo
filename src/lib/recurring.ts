import {
  daysInMonth,
  formatYmd,
  monthKeyToDbDate,
  monthPeriod,
  parseYmd,
  type MonthKey,
} from './date';
import type { RecurringRule, TransactionInput } from './types';

/**
 * 定期支出は自動で確定登録しない。
 * 「当月分の確認候補」として提示し、ユーザーが確認したものだけを取引として登録する。
 */
export interface RecurringCandidate {
  rule: RecurringRule;
  /** その月に登録される日付 */
  occurredOn: string;
  /** すでに同じ内容の取引が当月に存在する可能性がある場合 true */
  possibleDuplicate: boolean;
}

/** 指定した月における、その定期支出の発生日を求める。月末が短い月は月末に丸める。 */
export function occurrenceDate(rule: RecurringRule, key: MonthKey): string {
  const day = Math.min(Math.max(1, rule.dayOfMonth), daysInMonth(key.year, key.month));
  return formatYmd({ year: key.year, month: key.month, day });
}

/**
 * 当月の確認候補を返す。
 * - active でないものは除外
 * - すでにその月を確認済み（lastConfirmedMonth）のものは除外
 * - 期間内に同じカテゴリ・同じ金額の取引があれば possibleDuplicate を立てる
 */
export function pendingRecurring(params: {
  rules: readonly RecurringRule[];
  key: MonthKey;
  monthStartDay: number;
  existing: readonly { categoryId: string; amountYen: number; occurredOn: string }[];
}): RecurringCandidate[] {
  const { rules, key, monthStartDay, existing } = params;
  const month = monthKeyToDbDate(key);
  const period = monthPeriod(key, monthStartDay);

  return rules
    .filter((r) => r.active && r.lastConfirmedMonth !== month)
    .map((rule) => {
      // 発生日が集計期間からはみ出す場合は期間内へ寄せる（月の開始日が1以外のとき）
      let occurredOn = occurrenceDate(rule, key);
      if (occurredOn < period.start) {
        const nextMonthKey =
          key.month === 12 ? { year: key.year + 1, month: 1 } : { year: key.year, month: key.month + 1 };
        occurredOn = occurrenceDate(rule, nextMonthKey);
      }
      const possibleDuplicate = existing.some(
        (t) =>
          t.categoryId === rule.categoryId &&
          t.amountYen === rule.amountYen &&
          parseYmd(t.occurredOn).month === parseYmd(occurredOn).month,
      );
      return { rule, occurredOn, possibleDuplicate };
    })
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
}

/** 確認候補から取引の入力値を作る。 */
export function candidateToTransaction(candidate: RecurringCandidate): TransactionInput {
  const { rule, occurredOn } = candidate;
  return {
    type: rule.type,
    amountYen: rule.amountYen,
    categoryId: rule.categoryId,
    description: rule.name,
    occurredOn,
    paidBy: rule.paidBy,
    shareScope: rule.shareScope,
    paymentMethod: rule.paymentMethod,
    memo: rule.memo,
    savingsGoalId: null,
    receiptPath: null,
  };
}
