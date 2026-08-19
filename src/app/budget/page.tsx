'use client';

import * as React from 'react';
import { Copy, Info } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { BudgetBar } from '@/components/charts';
import { MonthSwitcher, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import {
  applyFilter,
  budgetsOfMonth,
  buildMonthlySummary,
  categoryBudgetMap,
  inPeriod,
  totalExpense,
} from '@/lib/budget';
import { monthKeyLabel, monthKeyToDbDate, monthPeriod } from '@/lib/date';
import { clampPercent, formatYen, formatYenText, parseYen, remaining, usageRate } from '@/lib/money';
import { validateBudgetAmount } from '@/lib/validation';
import type { BudgetScope } from '@/lib/types';

export default function BudgetPage() {
  const { data, me, partner, isShared, monthKey, setMonthKey, today, backend, run, busy } = useHousehold();
  const { household, budgets, categories, transactions } = data;
  const toast = useToast();

  const month = monthKeyToDbDate(monthKey);
  const period = monthPeriod(monthKey, household.monthStartDay);
  const periodTransactions = React.useMemo(() => inPeriod(transactions, period), [transactions, period]);

  const summary = buildMonthlySummary({
    transactions,
    budgets,
    key: monthKey,
    monthStartDay: household.monthStartDay,
    carryoverEnabled: household.carryoverEnabled,
    today,
    viewer: 'all',
    meId: me.id,
    partnerId: partner?.userId ?? null,
  });

  const monthBudgets = budgetsOfMonth(budgets, monthKey);
  const catBudgets = categoryBudgetMap(budgets, monthKey);

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

  const totalBudget = monthBudgets.find((b) => b.scope === 'household' && b.categoryId === null);
  const sharedBudget = monthBudgets.find((b) => b.scope === 'shared' && b.categoryId === null);
  const personalBudget = (userId: string) =>
    monthBudgets.find((b) => b.scope === 'personal' && b.userId === userId && b.categoryId === null);

  const categoryTotal = [...catBudgets.values()].reduce((s, v) => s + v, 0);

  // 共有＝支払った人がいない支出。個人＝その人が払った支出。
  const sharedSpent = totalExpense(
    applyFilter(periodTransactions, { viewer: 'shared', meId: me.id, partnerId: partner?.userId ?? null }),
  );
  const personalSpent = (userId: string) =>
    totalExpense(
      applyFilter(periodTransactions, {
        viewer: userId === me.id ? 'me' : 'partner',
        meId: me.id,
        partnerId: partner?.userId ?? null,
      }),
    );

  const sharedPlusPersonal =
    (sharedBudget?.amountYen ?? 0) +
    data.members.reduce((sum, m) => sum + (personalBudget(m.userId)?.amountYen ?? 0), 0);

  // 日割りのペース（今日までに経過した割合）
  const paceRatio = period.days > 0 ? summary.elapsedDays / period.days : 0;

  const expenseCategories = categories
    .filter((c) => c.kind === 'expense' && (!c.isHidden || catBudgets.has(c.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <PageHeader title="予算管理" subtitle={`${period.start} 〜 ${period.end}`} back="/home" />

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

      {/* 使用状況のまとめ（横グラフ） */}
      <Card>
        <CardHeader>
          <CardTitle>{monthKeyLabel(monthKey)}の使用状況</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <BudgetBar
            label="家計全体"
            spentYen={summary.spentYen}
            budgetYen={summary.budgetYen}
            paceRatio={paceRatio}
          />
          {isShared ? (
            <>
              <BudgetBar
                label="共有（家計から）"
                spentYen={sharedSpent}
                budgetYen={sharedBudget?.amountYen ?? 0}
                paceRatio={paceRatio}
              />
              {data.members.map((member) => (
                <BudgetBar
                  key={member.userId}
                  label={`${member.displayName}${member.userId === me.id ? '（自分）' : ''}の個人`}
                  spentYen={personalSpent(member.userId)}
                  budgetYen={personalBudget(member.userId)?.amountYen ?? 0}
                  paceRatio={paceRatio}
                />
              ))}
            </>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted">
          細い縦線は、今日までの日割りのペースです。線より右まで伸びていれば、使うのが早めということです。
        </p>
      </Card>

      {/* 全体予算 */}
      <Card>
        <CardHeader>
          <CardTitle>全体予算</CardTitle>
        </CardHeader>
        <BudgetInput
          label="家計全体"
          value={totalBudget?.amountYen ?? null}
          onSave={(amount) => saveBudget({ scope: 'household', userId: null, categoryId: null, amount })}
          disabled={busy}
        />
        <p className="mt-2 text-xs text-muted">
          共有と、2人それぞれの個人支出を合わせた全体の予算です。
        </p>
      </Card>

      {/* 共有予算・個人予算 */}
      {isShared ? (
        <Card>
          <CardHeader>
            <CardTitle>共有・個人の予算</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <BudgetInput
                label="共有（家計から）"
                value={sharedBudget?.amountYen ?? null}
                onSave={(amount) => saveBudget({ scope: 'shared', userId: null, categoryId: null, amount })}
                disabled={busy}
              />
              <p className="mt-1.5 text-xs text-muted">
                家計から出したお金の予算です。個人の支出は含みません。
              </p>
            </div>

            {data.members.map((member) => {
              const row = personalBudget(member.userId);
              const spent = personalSpent(member.userId);
              const rest = remaining(row?.amountYen ?? 0, spent);
              return (
                <div key={member.userId}>
                  <BudgetInput
                    label={`${member.displayName}${member.userId === me.id ? '（自分）' : ''}`}
                    value={row?.amountYen ?? null}
                    onSave={(amount) =>
                      saveBudget({ scope: 'personal', userId: member.userId, categoryId: null, amount })
                    }
                    disabled={busy}
                  />
                  {row ? (
                    <p className="mt-1.5 text-xs text-muted">
                      使用 {formatYen(spent)}・残り{' '}
                      <span className={rest < 0 ? 'font-bold text-danger' : ''}>{formatYen(rest)}</span>（
                      {usageRate(spent, row.amountYen)}%）
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {totalBudget && sharedPlusPersonal > totalBudget.amountYen ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
              <Info className="mt-0.5 size-4 shrink-0" />
              共有と個人の予算の合計が、全体予算を
              {formatYenText(sharedPlusPersonal - totalBudget.amountYen)}上回っています。
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* カテゴリ別予算 */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別予算</CardTitle>
          <span className="tabular text-sm text-muted">合計 {formatYen(categoryTotal)}</span>
        </CardHeader>

        {totalBudget && categoryTotal > totalBudget.amountYen ? (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <Info className="mt-0.5 size-4 shrink-0" />
            カテゴリ別予算の合計が全体予算を{formatYenText(categoryTotal - totalBudget.amountYen)}
            上回っています。
          </p>
        ) : null}

        <ul className="space-y-4">
          {expenseCategories.map((category) => {
            const budgetYen = catBudgets.get(category.id) ?? null;
            const spent = totalExpense(periodTransactions.filter((t) => t.categoryId === category.id));
            const rest = budgetYen === null ? null : remaining(budgetYen, spent);
            const rate = budgetYen === null ? 0 : usageRate(spent, budgetYen);
            return (
              <li key={category.id}>
                <BudgetInput
                  label={`${category.icon} ${category.name}`}
                  value={budgetYen}
                  onSave={(amount) =>
                    saveBudget({ scope: 'household', userId: null, categoryId: category.id, amount })
                  }
                  disabled={busy}
                />
                {budgetYen !== null ? (
                  <div className="mt-1.5 space-y-1">
                    <Progress
                      value={clampPercent(rate)}
                      tone={rate >= 100 ? 'danger' : rate >= 80 ? 'warn' : 'primary'}
                    />
                    <p className="text-xs text-muted">
                      使用 {formatYen(spent)}・残り{' '}
                      <span className={(rest ?? 0) < 0 ? 'font-bold text-danger' : ''}>
                        {formatYen(rest ?? 0)}
                      </span>
                      （{rate}%）
                    </p>
                  </div>
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
