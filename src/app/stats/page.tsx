'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { BarTrend, ChartLegend } from '@/components/charts';
import { MonthSwitcher, PageHeader, StatRow } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  categoryBreakdown,
  categoryBudgetMap,
  inPeriod,
  memberBreakdown,
  monthlyTrend,
  scopeBreakdown,
  totalExpense,
  totalIncome,
} from '@/lib/budget';
import { downloadCsv, transactionsToCsv } from '@/lib/csv';
import { addMonthKey, monthKeyLabel, monthPeriod } from '@/lib/date';
import { formatYen, formatYenText, shareRate } from '@/lib/money';

export default function StatsPage() {
  const { data, monthKey, setMonthKey, today, isShared } = useHousehold();
  const { household, transactions, categories, budgets, members } = data;
  const toast = useToast();

  const period = monthPeriod(monthKey, household.monthStartDay);

  const current = React.useMemo(() => inPeriod(transactions, period), [transactions, period]);
  const currentExpense = totalExpense(current);

  // 棒グラフの対象カテゴリ（空文字はすべてのカテゴリ）
  const [trendCategoryId, setTrendCategoryId] = React.useState('');
  const trendCategory = categories.find((c) => c.id === trendCategoryId) ?? null;

  const trend = React.useMemo(
    () => monthlyTrend(transactions, monthKey, 6, household.monthStartDay, trendCategoryId || null),
    [transactions, monthKey, household.monthStartDay, trendCategoryId],
  );

  // 比較の数値は棒グラフと同じ対象（カテゴリ絞り込みを反映）にそろえる
  const trendCurrent = trend[trend.length - 1]?.expenseYen ?? 0;
  const trendPrevious = trend[trend.length - 2]?.expenseYen ?? 0;
  const trendDiff = trendCurrent - trendPrevious;

  const catRows = React.useMemo(
    () => categoryBreakdown(current, categories, categoryBudgetMap(budgets, monthKey)),
    [current, categories, budgets, monthKey],
  );

  const memberRows = React.useMemo(() => memberBreakdown(current, members), [current, members]);
  const scopeRows = React.useMemo(() => scopeBreakdown(current), [current]);

  const exportCsv = () => {
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    const csv = transactionsToCsv(current, categories, names);
    downloadCsv(`kakeibo_${monthKey.year}${String(monthKey.month).padStart(2, '0')}.csv`, csv);
    toast.show('CSVを書き出しました', { tone: 'success' });
  };

  const exportAllCsv = () => {
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    const csv = transactionsToCsv(transactions, categories, names);
    downloadCsv('kakeibo_all.csv', csv);
    toast.show('すべての記録をCSVに書き出しました', { tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="履歴・集計" back="/expenses" />

      <MonthSwitcher
        monthKey={monthKey}
        onChange={setMonthKey}
        today={today}
        monthStartDay={household.monthStartDay}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            月別の支出推移
            {trendCategory ? <span className="text-muted">（{trendCategory.name}）</span> : null}
          </CardTitle>
        </CardHeader>

        <Field label="カテゴリで絞り込む" htmlFor="trend-category">
          <Select
            id="trend-category"
            value={trendCategoryId}
            onChange={(e) => setTrendCategoryId(e.target.value)}
          >
            <option value="">すべてのカテゴリ（支出合計）</option>
            {categories
              .filter((c) => c.kind === 'expense')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
          </Select>
        </Field>

        <div className="mt-4">
          <BarTrend
            items={trend.map((t) => ({
              label: t.label,
              value: t.expenseYen,
              highlight: t.key.year === monthKey.year && t.key.month === monthKey.month,
            }))}
            color={trendCategory?.color}
          />
        </div>

        <div className="mt-4 border-t border-border pt-2">
          <StatRow label={`${monthKeyLabel(monthKey)}の支出`} value={formatYen(trendCurrent)} />
          <StatRow
            label={`${monthKeyLabel(addMonthKey(monthKey, -1))}の支出`}
            value={formatYen(trendPrevious)}
          />
          <StatRow
            label="前月との差"
            value={`${trendDiff >= 0 ? '+' : ''}${formatYen(trendDiff)}`}
            tone={trendDiff > 0 ? 'danger' : 'primary'}
            hint={trendPrevious > 0 ? `${shareRate(Math.abs(trendDiff), trendPrevious)}%` : undefined}
          />
          {trendCategory ? null : (
            <>
              <StatRow label="今月の収入" value={formatYen(totalIncome(current))} />
              <StatRow
                label="収支"
                value={formatYen(totalIncome(current) - currentExpense)}
                tone={totalIncome(current) - currentExpense < 0 ? 'danger' : 'primary'}
              />
            </>
          )}
        </div>

        <p className="mt-2 text-sm text-muted">
          {trendCategory ? `${trendCategory.name}: ` : ''}
          {trendPrevious === 0
            ? '前月の記録がないため比較できません。'
            : trendDiff > 0
              ? `前月より${formatYenText(trendDiff)}多く使っています。`
              : trendDiff < 0
                ? `前月より${formatYenText(Math.abs(trendDiff))}少なく抑えられています。`
                : '前月とほぼ同じです。'}
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別の支出額</CardTitle>
        </CardHeader>
        {catRows.length === 0 ? (
          <p className="py-2 text-sm text-muted">この月の支出はありません。</p>
        ) : (
          <ul className="divide-y divide-border">
            {catRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2.5 text-sm">
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {row.icon} {row.label}
                  {row.budgetYen !== null ? (
                    <span className="ml-1 text-xs text-muted">
                      / 予算 {formatYen(row.budgetYen)}
                    </span>
                  ) : null}
                </span>
                <span className="tabular shrink-0 text-right font-semibold">
                  {formatYen(row.amountYen)}
                  {row.remainingYen !== null ? (
                    <span
                      className={`ml-2 text-xs ${row.remainingYen < 0 ? 'font-bold text-danger' : 'text-muted'}`}
                    >
                      残 {formatYen(row.remainingYen)}
                    </span>
                  ) : null}
                </span>
                <span className="tabular w-12 shrink-0 text-right text-xs text-muted">{row.share}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isShared ? (
        <Card>
          <CardHeader>
            <CardTitle>支払った人の内訳</CardTitle>
          </CardHeader>
          <ChartLegend
            segments={memberRows.map((r) => ({ id: r.id, label: r.label, color: r.color, value: r.amountYen }))}
            total={currentExpense}
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>共有支出と個人支出</CardTitle>
        </CardHeader>
        <ChartLegend
          segments={scopeRows.map((r) => ({ id: r.id, label: r.label, color: r.color, value: r.amountYen }))}
          total={currentExpense}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSVで書き出す</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          Excel やスプレッドシートで開ける形式（UTF-8）で保存します。
        </p>
        <div className="grid gap-2">
          <Button variant="outline" size="block" onClick={exportCsv}>
            <Download className="size-5" />
            {monthKeyLabel(monthKey)}分を書き出す
          </Button>
          <Button variant="ghost" size="block" onClick={exportAllCsv}>
            <Download className="size-5" />
            すべての記録を書き出す
          </Button>
        </div>
      </Card>
    </div>
  );
}
