'use client';

import * as React from 'react';
import { Copy, Info } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { BudgetBar } from '@/components/charts';
import { MonthSwitcher, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  applyFilter,
  budgetsOfMonth,
  budgetTargetOf,
  buildMonthlySummary,
  categoryBudgetMap,
  inPeriod,
  totalExpense,
} from '@/lib/budget';
import { monthKeyLabel, monthKeyToDbDate, monthPeriod } from '@/lib/date';
import { formatYen, formatYenText, parseYen, remaining, usageRate } from '@/lib/money';
import { validateBudgetAmount } from '@/lib/validation';
import type { BudgetScope, ViewerFilter } from '@/lib/types';

export default function BudgetPage() {
  const { data, me, partner, isShared, monthKey, setMonthKey, today, backend, run, busy } = useHousehold();
  const { household, budgets, categories, transactions } = data;
  const toast = useToast();

  // 右上で「どの予算を見るか」を切り替える
  const [viewer, setViewer] = React.useState<ViewerFilter>('all');
  const target = budgetTargetOf(viewer, me.id, partner?.userId ?? null);

  const month = monthKeyToDbDate(monthKey);
  const period = monthPeriod(monthKey, household.monthStartDay);
  const periodTransactions = React.useMemo(() => inPeriod(transactions, period), [transactions, period]);

  // 選んでいる対象の支出だけを見る
  const scopedTransactions = React.useMemo(
    () =>
      applyFilter(periodTransactions, {
        viewer,
        meId: me.id,
        partnerId: partner?.userId ?? null,
      }).filter((t) => t.type === 'expense'),
    [periodTransactions, viewer, me.id, partner],
  );

  const summary = buildMonthlySummary({
    transactions,
    budgets,
    key: monthKey,
    monthStartDay: household.monthStartDay,
    carryoverEnabled: household.carryoverEnabled,
    today,
    viewer,
    meId: me.id,
    partnerId: partner?.userId ?? null,
  });

  const monthBudgets = budgetsOfMonth(budgets, monthKey);
  const catBudgets = React.useMemo(
    () => categoryBudgetMap(budgets, monthKey, target.scope, target.userId),
    [budgets, monthKey, target.scope, target.userId],
  );

  const saveBudget = React.useCallback(
    async (params: { scope: BudgetScope; userId: string | null; categoryId: string | null; amount: number | null }) => {
      if (!backend) return;
      const existing = monthBudgets.find(
        (b) => b.scope === params.scope && b.userId === params.userId && b.categoryId === params.categoryId,
      );
      const error = params.amount === null ? null : validateBudgetAmount(params.amount);
      if (error) {
        toast.show(error, { tone: 'error' });
        return;
      }

      await run(async () => {
        if (params.amount === null || params.amount === 0) {
          if (existing) await backend.remove('budgets', existing.id);
          return;
        }
        if (existing) {
          await backend.update('budgets', existing.id, { amountYen: params.amount });
        } else {
          await backend.create('budgets', {
            householdId: household.id,
            month,
            scope: params.scope,
            userId: params.userId,
            categoryId: params.categoryId,
            amountYen: params.amount,
            createdBy: me.id,
          });
        }
      });
    },
    [backend, monthBudgets, run, household.id, month, me.id, toast],
  );

  const copyPrevious = async () => {
    if (!backend) return;
    const count = await run(() => backend.copyBudgetsFromPreviousMonth(month));
    if (count !== null) {
      toast.show(count > 0 ? `${count}件の予算をコピーしました` : 'コピーできる前月の予算がありませんでした', {
        tone: count && count > 0 ? 'success' : 'info',
      });
    }
  };

  const totalBudget = monthBudgets.find(
    (b) => b.scope === target.scope && b.userId === target.userId && b.categoryId === null,
  );
  const categoryTotal = [...catBudgets.values()].reduce((s, v) => s + v, 0);

  // 日割りのペース（今日までに経過した割合）
  const paceRatio = period.days > 0 ? summary.elapsedDays / period.days : 0;

  const expenseCategories = categories
    .filter((c) => c.kind === 'expense' && (!c.isHidden || catBudgets.has(c.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const VIEWER_LABEL: Record<ViewerFilter, string> = {
    all: '家計全体',
    shared: '共有（家計から）',
    me: `${me.displayName}（自分）`,
    partner: partner?.displayName ?? 'パートナー',
  };
  const scopeLabel = VIEWER_LABEL[viewer];

  const SCOPE_NOTE: Record<ViewerFilter, string> = {
    all: '共有と、2人それぞれの個人支出をすべて合わせた予算です。',
    shared: '家計から出したお金の予算です。個人の支出は含みません。',
    me: '自分が個人で払った分の予算です。',
    partner: `${partner?.displayName ?? 'パートナー'}が個人で払った分の予算です。`,
  };

  // カテゴリ別の使用状況（金額の大きい順。予算があるものは必ず出す）
  const categoryRows = expenseCategories
    .map((category) => ({
      category,
      budgetYen: catBudgets.get(category.id) ?? null,
      spentYen: totalExpense(scopedTransactions.filter((t) => t.categoryId === category.id)),
    }))
    .filter((r) => r.budgetYen !== null || r.spentYen > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="予算管理"
        subtitle={`${period.start} 〜 ${period.end}`}
        back="/home"
        action={
          isShared ? (
            <Select
              value={viewer}
              onChange={(e) => setViewer(e.target.value as ViewerFilter)}
              aria-label="表示する予算"
              className="h-10 w-36 py-1 text-sm"
            >
              <option value="all">家計全体</option>
              <option value="shared">共有</option>
              <option value="me">自分</option>
              <option value="partner">{partner?.displayName ?? 'パートナー'}</option>
            </Select>
          ) : null
        }
      />

      <MonthSwitcher
        monthKey={monthKey}
        onChange={setMonthKey}
        today={today}
        monthStartDay={household.monthStartDay}
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={copyPrevious} disabled={busy}>
          <Copy className="size-4" />
          前月の予算をコピー
        </Button>
      </div>

      {/* 合計予算 */}
      <Card>
        <CardHeader>
          <CardTitle>
            {monthKeyLabel(monthKey)}の{scopeLabel}
          </CardTitle>
        </CardHeader>

        <BudgetBar
          label="合計"
          spentYen={summary.spentYen}
          budgetYen={summary.budgetYen}
          paceRatio={paceRatio}
        />

        <div className="mt-4 border-t border-border pt-4">
          <BudgetInput
            label="合計の予算"
            value={totalBudget?.amountYen ?? null}
            onSave={(amount) =>
              saveBudget({ scope: target.scope, userId: target.userId, categoryId: null, amount })
            }
            disabled={busy}
          />
          <p className="mt-2 text-xs text-muted">{SCOPE_NOTE[viewer]}</p>
        </div>

        <p className="mt-3 text-xs text-muted">
          横グラフの細い縦線は、今日までの日割りのペースです。線より右まで伸びていれば、使うのが早めということです。
        </p>
      </Card>

      {/* カテゴリ別予算 */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別予算（{scopeLabel}）</CardTitle>
          <span className="tabular text-sm text-muted">合計 {formatYen(categoryTotal)}</span>
        </CardHeader>

        {totalBudget && categoryTotal > totalBudget.amountYen ? (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <Info className="mt-0.5 size-4 shrink-0" />
            カテゴリ別予算の合計が、{scopeLabel}の合計予算を
            {formatYenText(categoryTotal - totalBudget.amountYen)}上回っています。
          </p>
        ) : null}

        {categoryRows.length === 0 ? (
          <p className="py-2 text-sm text-muted">
            この対象のカテゴリ別予算・支出はまだありません。下の一覧から金額を入れると設定できます。
          </p>
        ) : (
          <ul className="space-y-4">
            {categoryRows.map(({ category, budgetYen, spentYen }) => (
              <li key={category.id}>
                <BudgetBar
                  label={category.name}
                  icon={category.icon}
                  spentYen={spentYen}
                  budgetYen={budgetYen ?? 0}
                  paceRatio={paceRatio}
                  color={category.color}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* カテゴリ別予算の入力 */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別予算を決める</CardTitle>
        </CardHeader>
        <ul className="space-y-4">
          {expenseCategories.map((category) => {
            const budgetYen = catBudgets.get(category.id) ?? null;
            const spent = totalExpense(scopedTransactions.filter((t) => t.categoryId === category.id));
            const rest = budgetYen === null ? null : remaining(budgetYen, spent);
            return (
              <li key={category.id}>
                <BudgetInput
                  label={`${category.icon} ${category.name}`}
                  value={budgetYen}
                  onSave={(amount) =>
                    saveBudget({
                      scope: target.scope,
                      userId: target.userId,
                      categoryId: category.id,
                      amount,
                    })
                  }
                  disabled={busy}
                />
                {budgetYen !== null ? (
                  <p className="mt-1.5 text-xs text-muted">
                    使用 {formatYen(spent)}・残り{' '}
                    <span className={(rest ?? 0) < 0 ? 'font-bold text-danger' : ''}>
                      {formatYen(rest ?? 0)}
                    </span>
                    （{usageRate(spent, budgetYen)}%）
                  </p>
                ) : spent > 0 ? (
                  <p className="mt-1.5 text-xs text-muted">使用 {formatYen(spent)}（予算未設定）</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-muted">
        予算の未使用額は初期状態では翌月に繰り越しません。設定画面の「予算の繰越し」を有効にすると、
        前月の残額（または超過額）が翌月の予算に加算されます。
      </p>
    </div>
  );
}

/** 予算額の入力欄。入力中は文字列で保持し、確定時に整数の円へ変換する。 */
function BudgetInput({
  label,
  value,
  onSave,
  disabled,
}: {
  label: string;
  value: number | null;
  onSave: (amount: number | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = React.useState(value === null ? '' : String(value));
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!dirty) setText(value === null ? '' : String(value));
  }, [value, dirty]);

  const commit = async () => {
    if (!dirty) return;
    setDirty(false);
    const trimmed = text.trim();
    if (trimmed === '') {
      await onSave(null);
      return;
    }
    const parsed = parseYen(trimmed);
    await onSave(parsed);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
      <div className="flex w-40 shrink-0 items-center gap-1">
        <span className="text-sm text-muted">¥</span>
        <Input
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setDirty(true);
            setText(e.target.value.replace(/[^\d]/g, ''));
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="未設定"
          className="tabular h-11 text-right"
          aria-label={`${label}の予算額`}
        />
      </div>
    </div>
  );
}
