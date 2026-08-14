'use client';

import * as React from 'react';
import Link from 'next/link';
import { BarChart3, Filter, Repeat, Search, X } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { MonthSwitcher, PageHeader } from '@/components/common';
import { MonthCalendar } from '@/components/month-calendar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge, EmptyState } from '@/components/ui/misc';
import { applyFilter, inPeriod, totalExpense, totalIncome } from '@/lib/budget';
import { formatMonthDay, monthKeyToDbDate, monthPeriod } from '@/lib/date';
import { formatYen } from '@/lib/money';
import { candidateToTransaction, pendingRecurring } from '@/lib/recurring';
import type { ShareScope, ViewerFilter } from '@/lib/types';

export default function ExpensesPage() {
  const { data, me, partner, isShared, monthKey, setMonthKey, today, memberName, backend, run, busy } =
    useHousehold();
  const { household, categories, transactions, recurringRules } = data;

  const [showFilters, setShowFilters] = React.useState(false);
  const [keyword, setKeyword] = React.useState('');
  const [type, setType] = React.useState<'both' | 'expense' | 'income'>('both');
  const [categoryId, setCategoryId] = React.useState('');
  const [viewerFilter, setViewerFilter] = React.useState<ViewerFilter>('all');
  const [scope, setScope] = React.useState<ShareScope | 'both'>('both');
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const period = monthPeriod(monthKey, household.monthStartDay);
  const monthTransactions = React.useMemo(() => inPeriod(transactions, period), [transactions, period]);

  // 絞り込み条件（カレンダーの日付以外）を適用したもの。カレンダーの集計はこれを使う。
  const conditionFiltered = React.useMemo(
    () =>
      applyFilter(
        monthTransactions,
        {
          viewer: viewerFilter,
          meId: me.id,
          partnerId: partner?.userId ?? null,
          shareScope: scope,
          categoryIds: categoryId ? [categoryId] : undefined,
          keyword,
          type,
        },
        categories,
      ),
    [monthTransactions, viewerFilter, me.id, partner, scope, categoryId, keyword, type, categories],
  );

  const filtered = React.useMemo(
    () =>
      (selectedDate ? conditionFiltered.filter((t) => t.occurredOn === selectedDate) : conditionFiltered)
        .slice()
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)),
    [conditionFiltered, selectedDate],
  );

  // 表示月を変えたら、選んでいた日付は解除する
  React.useEffect(() => {
    setSelectedDate(null);
  }, [monthKey.year, monthKey.month]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const list = map.get(t.occurredOn) ?? [];
      list.push(t);
      map.set(t.occurredOn, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const candidates = React.useMemo(
    () =>
      pendingRecurring({
        rules: recurringRules,
        key: monthKey,
        monthStartDay: household.monthStartDay,
        existing: monthTransactions,
      }),
    [recurringRules, monthKey, household.monthStartDay, monthTransactions],
  );

  const filterCount =
    (keyword ? 1 : 0) + (type !== 'both' ? 1 : 0) + (categoryId ? 1 : 0) + (viewerFilter !== 'all' ? 1 : 0) + (scope !== 'both' ? 1 : 0);

  const confirmRecurring = async (candidateId: string) => {
    const candidate = candidates.find((c) => c.rule.id === candidateId);
    if (!candidate || !backend) return;
    await run(
      async () => {
        const input = candidateToTransaction(candidate);
        await backend.create('transactions', {
          ...input,
          householdId: household.id,
          createdBy: me.id,
          updatedBy: me.id,
        });
        await backend.update('recurring_rules', candidate.rule.id, {
          lastConfirmedMonth: monthKeyToDbDate(monthKey),
        });
      },
      { success: `${candidate.rule.name}を登録しました` },
    );
  };

  const skipRecurring = async (ruleId: string) => {
    if (!backend) return;
    await run(
      () => backend.update('recurring_rules', ruleId, { lastConfirmedMonth: monthKeyToDbDate(monthKey) }),
      { success: '今月は登録しませんでした' },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="家計簿"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="集計を見る">
            <Link href="/stats">
              <BarChart3 className="size-6" />
            </Link>
          </Button>
        }
      />

      <MonthSwitcher
        monthKey={monthKey}
        onChange={setMonthKey}
        today={today}
        monthStartDay={household.monthStartDay}
      />

      <Card>
        <CardHeader>
          <CardTitle>いつ、いくら使ったか</CardTitle>
        </CardHeader>
        <MonthCalendar
          period={period}
          transactions={conditionFiltered}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted">支出合計</p>
            <p className="tabular text-xl font-bold">{formatYen(totalExpense(filtered))}</p>
          </div>
          <div>
            <p className="text-xs text-muted">収入合計</p>
            <p className="tabular text-xl font-bold text-success">{formatYen(totalIncome(filtered))}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {selectedDate ? formatMonthDay(selectedDate) : `${period.start} 〜 ${period.end}`}・
          {filtered.length}件
        </p>
      </Card>

      {/* 定期支出の確認候補 */}
      {candidates.length > 0 ? (
        <Card className="border-warn/40 bg-warn-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warn">
              <Repeat className="size-5" />
              今月の定期支出の確認
            </CardTitle>
          </CardHeader>
          <p className="mb-3 text-sm">
            自動では登録されません。内容を確認して「登録する」を押してください。
          </p>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.rule.id} className="rounded-xl bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.rule.name}</p>
                    <p className="text-xs text-muted">
                      {formatMonthDay(c.occurredOn)}・{memberName(c.rule.paidBy)}
                      {c.possibleDuplicate ? '・すでに似た記録があります' : ''}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-bold">{formatYen(c.rule.amountYen)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => confirmRecurring(c.rule.id)} disabled={busy}>
                    登録する
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => skipRecurring(c.rule.id)}
                    disabled={busy}
                  >
                    今月は見送る
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 検索・絞り込み */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="内容・メモ・カテゴリで検索"
              className="pl-10"
              aria-label="キーワード検索"
            />
          </div>
          <Button
            variant={filterCount > 0 ? 'primary' : 'outline'}
            size="icon"
            aria-label="絞り込み"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="size-5" />
          </Button>
        </div>

        {showFilters ? (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="種別" htmlFor="f-type">
                <Select id="f-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="both">すべて</option>
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                </Select>
              </Field>
              <Field label="区分" htmlFor="f-scope">
                <Select id="f-scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  <option value="both">すべて</option>
                  <option value="shared">共有</option>
                  <option value="personal">個人</option>
                </Select>
              </Field>
            </div>
            <Field label="カテゴリ" htmlFor="f-category">
              <Select id="f-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {isShared ? (
              <Field label="支払った人" htmlFor="f-viewer">
                <Select
                  id="f-viewer"
                  value={viewerFilter}
                  onChange={(e) => setViewerFilter(e.target.value as ViewerFilter)}
                >
                  <option value="all">すべて</option>
                  <option value="me">自分</option>
                  <option value="partner">{partner?.displayName ?? 'パートナー'}</option>
                </Select>
              </Field>
            ) : null}
            {filterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyword('');
                  setType('both');
                  setCategoryId('');
                  setViewerFilter('all');
                  setScope('both');
                }}
              >
                <X className="size-4" />
                絞り込みを解除
              </Button>
            ) : null}
          </Card>
        ) : null}
      </div>

      {/* 一覧 */}
      {grouped.length === 0 ? (
        <EmptyState
          title={
            selectedDate
              ? `${formatMonthDay(selectedDate)}の記録はありません`
              : filterCount > 0
                ? '条件に合う記録がありません'
                : 'この月の記録はまだありません'
          }
          description={
            selectedDate
              ? 'カレンダーの日付をもう一度タップすると、月全体の表示に戻ります。'
              : filterCount > 0
                ? '絞り込み条件を変えてお試しください。'
                : '左下の「入力」タブから登録できます。'
          }
          action={
            <Button asChild size="sm">
              <Link href="/">支出を登録する</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, items]) => (
            <Card key={date} className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-bold">{formatMonthDay(date)}</span>
                <span className="tabular text-sm text-muted">
                  {formatYen(totalExpense(items))}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((t) => {
                  const category = categories.find((c) => c.id === t.categoryId);
                  return (
                    <li key={t.id}>
                      <Link href={`/expenses/${t.id}`} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xl">{category?.icon ?? '📦'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {t.description || category?.name || '記録'}
                          </span>
                          <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                            <span>{category?.name}</span>
                            {isShared ? <span>・{memberName(t.paidBy)}</span> : null}
                            {t.shareScope === 'personal' ? <Badge>個人</Badge> : null}
                          </span>
                        </span>
                        <span
                          className={`tabular shrink-0 font-bold ${t.type === 'income' ? 'text-success' : ''}`}
                        >
                          {t.type === 'income' ? '+' : ''}
                          {formatYen(t.amountYen)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
