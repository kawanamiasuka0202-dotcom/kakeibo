'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { TransactionForm } from '@/components/transaction-form';
import { Card } from '@/components/ui/card';
import { buildMonthlySummary } from '@/lib/budget';
import { monthKeyOf } from '@/lib/date';
import { formatYen, formatYenText } from '@/lib/money';

/**
 * 起動してすぐの画面。アプリを開いたらまず入力できるようにしている。
 * 保存しても画面は移動せず、続けて登録できる。
 */
export default function InputPage() {
  const { data, me, partner, today } = useHousehold();
  const { household, transactions, budgets } = data;

  // 入力の結果がすぐ分かるよう、今日が含まれる月の残り予算だけを添える
  const summary = React.useMemo(
    () =>
      buildMonthlySummary({
        transactions,
        budgets,
        key: monthKeyOf(today, household.monthStartDay),
        monthStartDay: household.monthStartDay,
        carryoverEnabled: household.carryoverEnabled,
        today,
        viewer: 'all',
        meId: me.id,
        partnerId: partner?.userId ?? null,
      }),
    [transactions, budgets, today, household, me.id, partner],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="入力" />

      <Card className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {summary.hasBudget ? '今月あと使えるのは' : '今月の支出合計'}
          </p>
          <p
            className={`tabular text-xl font-bold ${
              summary.hasBudget && summary.remainingYen < 0 ? 'text-danger' : ''
            }`}
          >
            {summary.hasBudget ? formatYen(summary.remainingYen) : formatYen(summary.spentYen)}
          </p>
          <p className="text-xs text-muted">
            {summary.hasBudget
              ? `残り${summary.daysLeft}日・1日あたり${formatYenText(summary.dailyRemainingYen)}`
              : '予算を決めると残額が表示されます'}
          </p>
        </div>
        <Link
          href="/home"
          className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary"
        >
          ホーム
          <ArrowRight className="size-4" />
        </Link>
      </Card>

      <TransactionForm mode="create" afterSave="stay" />
    </div>
  );
}
