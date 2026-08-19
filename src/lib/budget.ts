import {
  addMonthKey,
  diffDays,
  elapsedDaysInPeriod,
  monthKeyToDbDate,
  monthPeriod,
  type MonthKey,
  type MonthPeriod,
  type Ymd,
} from './date';
import { remaining, shareRate, sumYen, usageRate, type Yen } from './money';
import type {
  Budget,
  BudgetScope,
  Category,
  ShareScope,
  Transaction,
  UUID,
  ViewerFilter,
} from './types';

/** 予算に対する状況のレベル */
export type BudgetLevel = 'none' | 'safe' | 'warn' | 'over';

export const WARN_THRESHOLD = 80;
export const OVER_THRESHOLD = 100;

export function levelOf(hasBudget: boolean, rate: number): BudgetLevel {
  if (!hasBudget) return 'none';
  if (rate >= OVER_THRESHOLD) return 'over';
  if (rate >= WARN_THRESHOLD) return 'warn';
  return 'safe';
}

/** 期間に含まれる取引だけを取り出す。 */
export function inPeriod(transactions: readonly Transaction[], period: MonthPeriod): Transaction[] {
  return transactions.filter(
    (t) => diffDays(t.occurredOn, period.start) >= 0 && diffDays(t.occurredOn, period.endExclusive) < 0,
  );
}

export interface TransactionFilter {
  /** 'all' = 世帯全体、'me' = 自分が支払ったもの、'partner' = パートナーが支払ったもの */
  viewer?: ViewerFilter;
  meId?: UUID;
  partnerId?: UUID | null;
  shareScope?: ShareScope | 'both';
  categoryIds?: readonly UUID[];
  keyword?: string;
  type?: 'expense' | 'income' | 'both';
}

/** 表示対象フィルタを適用する。 */
export function applyFilter(
  transactions: readonly Transaction[],
  filter: TransactionFilter,
  categories: readonly Category[] = [],
): Transaction[] {
  const {
    viewer = 'all',
    meId,
    partnerId,
    shareScope = 'both',
    categoryIds,
    keyword,
    type = 'both',
  } = filter;
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const kw = keyword?.trim().toLowerCase() ?? '';

  return transactions.filter((t) => {
    if (type !== 'both' && t.type !== type) return false;
    // 共有（paidBy が null）は誰か個人の支出には含めない
    if (viewer === 'me' && meId && t.paidBy !== meId) return false;
    if (viewer === 'partner') {
      if (!partnerId || t.paidBy !== partnerId) return false;
    }
    if (viewer === 'shared' && t.paidBy !== null) return false;
    if (shareScope !== 'both' && t.shareScope !== shareScope) return false;
    if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(t.categoryId)) return false;
    if (kw) {
      const haystack = [
        t.description,
        t.memo,
        categoryNameById.get(t.categoryId) ?? '',
        String(t.amountYen),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}

export function totalExpense(transactions: readonly Transaction[]): Yen {
  return sumYen(transactions.filter((t) => t.type === 'expense').map((t) => t.amountYen));
}

export function totalIncome(transactions: readonly Transaction[]): Yen {
  return sumYen(transactions.filter((t) => t.type === 'income').map((t) => t.amountYen));
}

// ---------------------------------------------------------------------------
// 予算の取り出し
// ---------------------------------------------------------------------------

export function budgetsOfMonth(budgets: readonly Budget[], key: MonthKey): Budget[] {
  const month = monthKeyToDbDate(key);
  return budgets.filter((b) => b.month === month);
}

/** 全体予算（カテゴリ指定なし）を取り出す。 */
export function findTotalBudget(
  budgets: readonly Budget[],
  key: MonthKey,
  viewer: ViewerFilter,
  meId?: UUID,
  partnerId?: UUID | null,
): Budget | null {
  const rows = budgetsOfMonth(budgets, key).filter((b) => b.categoryId === null);
  if (viewer === 'all') return rows.find((b) => b.scope === 'household') ?? null;
  if (viewer === 'shared') return rows.find((b) => b.scope === 'shared') ?? null;
  const userId = viewer === 'me' ? meId : partnerId;
  if (!userId) return null;
  return rows.find((b) => b.scope === 'personal' && b.userId === userId) ?? null;
}

/** 支払者別の内訳で「共有（家計から）」を表すための ID */
export const SHARED_PAYER_ID = '__shared__';

/**
 * カテゴリ別予算を Map で返す。
 * 対象（全体／共有／個人）ごとに別々の予算を持てる。
 */
export function categoryBudgetMap(
  budgets: readonly Budget[],
  key: MonthKey,
  scope: BudgetScope = 'household',
  userId: UUID | null = null,
): Map<UUID, Yen> {
  const map = new Map<UUID, Yen>();
  for (const b of budgetsOfMonth(budgets, key)) {
    if (b.scope !== scope || !b.categoryId) continue;
    if (scope === 'personal' && b.userId !== userId) continue;
    map.set(b.categoryId, b.amountYen);
  }
  return map;
}

/**
 * 表示対象（ViewerFilter）に対応する予算の置き場所を返す。
 * 画面の切り替えと、予算の保存先を1か所で結び付けるための対応表。
 */
export function budgetTargetOf(
  viewer: ViewerFilter,
  meId?: UUID,
  partnerId?: UUID | null,
): { scope: BudgetScope; userId: UUID | null } {
  if (viewer === 'all') return { scope: 'household', userId: null };
  if (viewer === 'shared') return { scope: 'shared', userId: null };
  return { scope: 'personal', userId: (viewer === 'me' ? meId : partnerId) ?? null };
}

/**
 * 前月までの未使用額を繰り越す（設定が有効な場合のみ）。
 * 直前の1ヶ月分だけを対象にする（無限に遡らない）。超過していた場合はマイナスを引き継ぐ。
 */
export function carryoverAmount(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  key: MonthKey,
  monthStartDay: number,
  enabled: boolean,
): Yen {
  if (!enabled) return 0;
  const prevKey = addMonthKey(key, -1);
  const prevBudget = findTotalBudget(budgets, prevKey, 'all');
  if (!prevBudget) return 0;
  const prevPeriod = monthPeriod(prevKey, monthStartDay);
  const prevSpent = totalExpense(inPeriod(transactions, prevPeriod));
  return remaining(prevBudget.amountYen, prevSpent);
}

// ---------------------------------------------------------------------------
// 月次サマリ
// ---------------------------------------------------------------------------

export interface MonthlySummary {
  period: MonthPeriod;
  /** 設定された予算額（繰越しを含まない） */
  baseBudgetYen: Yen;
  /** 前月からの繰越し額（設定が無効なら 0） */
  carryoverYen: Yen;
  /** 実際に使える予算 = baseBudget + carryover */
  budgetYen: Yen;
  hasBudget: boolean;
  spentYen: Yen;
  incomeYen: Yen;
  remainingYen: Yen;
  /** 使用率（%）。小数第1位まで */
  usageRate: number;
  level: BudgetLevel;
  /** 期間終了までの残り日数（今日を含む） */
  daysLeft: number;
  /** 残り予算を残り日数で割った1日あたりの目安（円・整数） */
  dailyRemainingYen: Yen;
  /** 経過日数に対する理想ペースとの差。プラスなら使いすぎ */
  paceDiffYen: Yen;
  /** 期間の何日目か（今日を含む） */
  elapsedDays: number;
  transactionCount: number;
}

export function buildMonthlySummary(params: {
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  key: MonthKey;
  monthStartDay: number;
  carryoverEnabled: boolean;
  today: Ymd;
  viewer?: ViewerFilter;
  meId?: UUID;
  partnerId?: UUID | null;
}): MonthlySummary {
  const {
    transactions,
    budgets,
    key,
    monthStartDay,
    carryoverEnabled,
    today,
    viewer = 'all',
    meId,
    partnerId,
  } = params;

  const period = monthPeriod(key, monthStartDay);
  const scoped = applyFilter(inPeriod(transactions, period), { viewer, meId, partnerId });
  const spentYen = totalExpense(scoped);
  const incomeYen = totalIncome(scoped);

  const budgetRow = findTotalBudget(budgets, key, viewer, meId, partnerId);
  const baseBudgetYen = budgetRow?.amountYen ?? 0;
  const carryoverYen =
    viewer === 'all'
      ? carryoverAmount(budgets, transactions, key, monthStartDay, carryoverEnabled)
      : 0;
  const budgetYen = baseBudgetYen + carryoverYen;
  const hasBudget = budgetRow !== null && baseBudgetYen > 0;

  const rate = usageRate(spentYen, budgetYen);
  const elapsed = elapsedDaysInPeriod(period, today);
  const rawDaysLeft = diffDays(period.endExclusive, today);
  const daysLeft = Math.min(period.days, Math.max(0, rawDaysLeft));
  const remainingYen = remaining(budgetYen, spentYen);
  const dailyRemainingYen = daysLeft > 0 && remainingYen > 0 ? Math.floor(remainingYen / daysLeft) : 0;
  const idealSpent = hasBudget && elapsed > 0 ? Math.round((budgetYen * elapsed) / period.days) : 0;

  return {
    period,
    baseBudgetYen,
    carryoverYen,
    budgetYen,
    hasBudget,
    spentYen,
    incomeYen,
    remainingYen,
    usageRate: rate,
    level: levelOf(hasBudget, rate),
    daysLeft,
    dailyRemainingYen,
    paceDiffYen: hasBudget ? spentYen - idealSpent : 0,
    elapsedDays: elapsed,
    transactionCount: scoped.length,
  };
}

// ---------------------------------------------------------------------------
// 内訳
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  id: string;
  label: string;
  color: string;
  icon?: string;
  amountYen: Yen;
  /** 全体に占める割合（%） */
  share: number;
  count: number;
  budgetYen: Yen | null;
  remainingYen: Yen | null;
  usageRate: number | null;
}

const FALLBACK_COLORS = ['#7c6f9c', '#4f9ec4', '#e0a83c', '#4e9c86', '#c97b9c', '#9aa0a6'];

/** カテゴリ別の支出内訳を金額の多い順に返す。 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  budgetMap?: Map<UUID, Yen>,
): BreakdownRow[] {
  const expenses = transactions.filter((t) => t.type === 'expense');
  const total = totalExpense(expenses);
  const byCategory = new Map<UUID, { amount: Yen; count: number }>();
  for (const t of expenses) {
    const cur = byCategory.get(t.categoryId) ?? { amount: 0, count: 0 };
    cur.amount += t.amountYen;
    cur.count += 1;
    byCategory.set(t.categoryId, cur);
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const rows: BreakdownRow[] = [];
  for (const [categoryId, agg] of byCategory) {
    const category = categoryById.get(categoryId);
    const budgetYen = budgetMap?.get(categoryId) ?? null;
    rows.push({
      id: categoryId,
      label: category?.name ?? '不明なカテゴリ',
      color: category?.color ?? FALLBACK_COLORS[rows.length % FALLBACK_COLORS.length],
      icon: category?.icon,
      amountYen: agg.amount,
      share: shareRate(agg.amount, total),
      count: agg.count,
      budgetYen,
      remainingYen: budgetYen === null ? null : remaining(budgetYen, agg.amount),
      usageRate: budgetYen === null ? null : usageRate(agg.amount, budgetYen),
    });
  }
  // 予算だけ設定されていて支出がないカテゴリも表示できるよう、予算側からも補完する
  if (budgetMap) {
    for (const [categoryId, budgetYen] of budgetMap) {
      if (byCategory.has(categoryId)) continue;
      const category = categoryById.get(categoryId);
      if (!category) continue;
      rows.push({
        id: categoryId,
        label: category.name,
        color: category.color,
        icon: category.icon,
        amountYen: 0,
        share: 0,
        count: 0,
        budgetYen,
        remainingYen: budgetYen,
        usageRate: 0,
      });
    }
  }
  return rows.sort((a, b) => b.amountYen - a.amountYen || a.label.localeCompare(b.label, 'ja'));
}

/**
 * 支払者別の内訳。
 * 共有の支出（paidBy が null）は個人には振り分けず、「共有」としてまとめる。
 */
export function memberBreakdown(
  transactions: readonly Transaction[],
  members: readonly { userId: UUID; displayName: string }[],
): BreakdownRow[] {
  const expenses = transactions.filter((t) => t.type === 'expense');
  const total = totalExpense(expenses);

  const toRow = (
    id: string,
    label: string,
    color: string,
    rows: readonly Transaction[],
  ): BreakdownRow => {
    const amount = totalExpense(rows);
    return {
      id,
      label,
      color,
      amountYen: amount,
      share: shareRate(amount, total),
      count: rows.length,
      budgetYen: null,
      remainingYen: null,
      usageRate: null,
    };
  };

  const memberRows = members.map((m, i) =>
    toRow(
      m.userId,
      m.displayName,
      FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      expenses.filter((t) => t.paidBy === m.userId),
    ),
  );

  const sharedRows = expenses.filter((t) => t.paidBy === null);
  const rows =
    sharedRows.length > 0
      ? [...memberRows, toRow(SHARED_PAYER_ID, '共有（家計から）', '#4e9c86', sharedRows)]
      : memberRows;

  return rows.sort((a, b) => b.amountYen - a.amountYen);
}

/** 共有支出 / 個人支出の内訳。 */
export function scopeBreakdown(transactions: readonly Transaction[]): BreakdownRow[] {
  const expenses = transactions.filter((t) => t.type === 'expense');
  const total = totalExpense(expenses);
  const defs: { id: ShareScope; label: string; color: string }[] = [
    { id: 'shared', label: '共有', color: '#4e9c86' },
    { id: 'personal', label: '個人', color: '#7c6f9c' },
  ];
  return defs.map((d) => {
    const rows = expenses.filter((t) => t.shareScope === d.id);
    const amount = totalExpense(rows);
    return {
      id: d.id,
      label: d.label,
      color: d.color,
      amountYen: amount,
      share: shareRate(amount, total),
      count: rows.length,
      budgetYen: null,
      remainingYen: null,
      usageRate: null,
    };
  });
}

/** 直近 n ヶ月の支出推移。古い順に返す。 */
export function monthlyTrend(
  transactions: readonly Transaction[],
  latest: MonthKey,
  months: number,
  monthStartDay: number,
  /** 指定するとそのカテゴリだけの推移を返す */
  categoryId?: UUID | null,
): { key: MonthKey; label: string; expenseYen: Yen; incomeYen: Yen }[] {
  const source = categoryId ? transactions.filter((t) => t.categoryId === categoryId) : transactions;
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = addMonthKey(latest, -i);
    const period = monthPeriod(key, monthStartDay);
    const rows = inPeriod(source, period);
    result.push({
      key,
      label: `${key.month}月`,
      expenseYen: totalExpense(rows),
      incomeYen: totalIncome(rows),
    });
  }
  return result;
}
