'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, MessageSquare, PiggyBank } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { BudgetAlert, MonthSwitcher, PageHeader, StatRow, ViewerSwitch } from '@/components/common';
import { ChartLegend, DonutChart, type Segment } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, EmptyState, Progress } from '@/components/ui/misc';
import {
  applyFilter,
  buildMonthlySummary,
  categoryBreakdown,
  categoryBudgetMap,
  inPeriod,
  memberBreakdown,
} from '@/lib/budget';
import { formatMonthDay, formatRelativeJst, monthKeyLabel } from '@/lib/date';
import { clampPercent, formatYen, formatYenText } from '@/lib/money';
import { goalProgress, sortGoals } from '@/lib/savings';
import {
  DEFAULT_NOTIFY,
  STORAGE_KEYS,
  readLocal,
  writeLocal,
  type NotifySetting,
} from '@/lib/settings';

export default function HomePage() {
  const {
    data,
    me,
    partner,
    isShared,
    monthKey,
    setMonthKey,
    viewer,
    setViewer,
    today,
    memberName,
  } = useHousehold();

  const { household, transactions, budgets, categories, savingsGoals, savingsEntries, todos, comments } = data;

  const summary = React.useMemo(
    () =>
      buildMonthlySummary({
        transactions,
        budgets,
        key: monthKey,
        monthStartDay: household.monthStartDay,
        carryoverEnabled: household.carryoverEnabled,
        today,
        viewer,
        meId: me.id,
        partnerId: partner?.userId ?? null,
      }),
    [transactions, budgets, monthKey, household, today, viewer, me.id, partner],
  );

  const periodTransactions = React.useMemo(
    () =>
      applyFilter(inPeriod(transactions, summary.period), {
        viewer,
        meId: me.id,
        partnerId: partner?.userId ?? null,
      }),
    [transactions, summary.period, viewer, me.id, partner],
  );

  const catRows = React.useMemo(
    () => categoryBreakdown(periodTransactions.filter((t) => t.type === 'expense'), categories, categoryBudgetMap(budgets, monthKey)),
    [periodTransactions, categories, budgets, monthKey],
  );

  const categorySegments: Segment[] = catRows
    .filter((r) => r.amountYen > 0)
    .map((r) => ({ id: r.id, label: r.label, color: r.color, value: r.amountYen, icon: r.icon }));

  const recent = React.useMemo(
    () =>
      [...periodTransactions]
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [periodTransactions],
  );

  const activeGoals = React.useMemo(
    () => sortGoals(savingsGoals.filter((g) => g.status === 'active')).slice(0, 3),
    [savingsGoals],
  );

  const openTodos = React.useMemo(
    () =>
      todos
        .filter((t) => !t.done && !t.archivedAt)
        .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
        .slice(0, 3),
    [todos],
  );

  const recentComments = React.useMemo(
    () => [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2),
    [comments],
  );

  const memberRows = React.useMemo(
    () => memberBreakdown(periodTransactions, data.members),
    [periodTransactions, data.members],
  );

  // 予算アラートは一度閉じたら、その月・その閾値では再表示しない
  const alertKey = `${monthKey.year}-${monthKey.month}-${summary.level}-${viewer}`;
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  const [notify, setNotify] = React.useState<NotifySetting>(DEFAULT_NOTIFY);
  React.useEffect(() => {
    setDismissed(readLocal<string[]>(STORAGE_KEYS.dismissedAlerts, []));
    setNotify(readLocal<NotifySetting>(STORAGE_KEYS.notify, DEFAULT_NOTIFY));
  }, []);

  // 設定でオフにした通知は表示しない（設定 > 通知）
  const levelEnabled =
    (summary.level === 'warn' && notify.budget80) || (summary.level === 'over' && notify.budget100);
  const showAlert = levelEnabled && !dismissed.includes(alertKey);

  const dismissAlert = () => {
    const next = [...dismissed, alertKey].slice(-30);
    setDismissed(next);
    writeLocal(STORAGE_KEYS.dismissedAlerts, next);
  };

  // カテゴリ別予算の超過（ちょうど予算どおりの場合は超過に含めない）
  const overCategories = notify.categoryOver
    ? catRows.filter((r) => r.remainingYen !== null && r.remainingYen < 0)
    : [];

  const budgetSegments: Segment[] = summary.hasBudget
    ? [
        {
          id: 'spent',
          label: '使った金額',
          color:
            summary.level === 'over'
              ? 'var(--color-danger)'
              : summary.level === 'warn'
                ? 'var(--color-warn)'
                : 'var(--color-primary)',
          value: Math.min(summary.spentYen, summary.budgetYen),
        },
        {
          id: 'left',
          label: '残り',
          color: 'var(--color-primary-soft)',
          value: Math.max(0, summary.remainingYen),
        },
      ]
    : [];

  const viewerLabel = viewer === 'all' ? '2人合計' : viewer === 'me' ? '自分' : (partner?.displayName ?? 'パートナー');

  return (
    <div className="space-y-4">
      <PageHeader title="ホーム" />

      <MonthSwitcher
        monthKey={monthKey}
        onChange={setMonthKey}
        today={today}
        monthStartDay={household.monthStartDay}
      />

      {isShared ? (
        <ViewerSwitch
          value={viewer}
          onChange={setViewer}
          partnerName={partner?.displayName ?? 'パートナー'}
        />
      ) : null}

      {showAlert ? (
        <BudgetAlert
          level={summary.level}
          usageRate={summary.usageRate}
          remainingYen={summary.remainingYen}
          onDismiss={dismissAlert}
        />
      ) : null}

      {overCategories.length > 0 ? (
        <div
          role="alert"
          className="rounded-card border border-warn/40 bg-warn-soft p-3 text-sm font-semibold text-warn"
        >
          <p className="mb-1">カテゴリ別予算を超えています</p>
          <ul className="space-y-0.5 font-normal">
            {overCategories.map((r) => (
              <li key={r.id}>
                {r.icon} {r.label}: {formatYen(r.amountYen)} / 予算 {formatYen(r.budgetYen ?? 0)}（
                {formatYenText(Math.abs(r.remainingYen ?? 0))}超過）
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 今月の状況 ------------------------------------------------------ */}
      <Card>
        <div className="flex items-center gap-4">
          <DonutChart
            segments={budgetSegments}
            size={148}
            thickness={16}
            centerLabel={summary.hasBudget ? '使用率' : '今月の支出'}
            centerValue={summary.hasBudget ? `${summary.usageRate}%` : formatYen(summary.spentYen)}
            centerSub={summary.hasBudget ? `残り ${formatYen(summary.remainingYen)}` : undefined}
            emptyLabel="予算が未設定です"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted">
              {monthKeyLabel(monthKey)}
              {isShared ? `・${viewerLabel}` : ''}
            </p>
            {summary.hasBudget ? (
              <>
                <p className="mt-1 text-sm text-muted">あと使えるのは</p>
                <p
                  className={`tabular text-3xl font-bold ${summary.remainingYen < 0 ? 'text-danger' : ''}`}
                >
                  {formatYen(summary.remainingYen)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {summary.daysLeft > 0
                    ? `残り${summary.daysLeft}日・1日あたり ${formatYen(summary.dailyRemainingYen)}`
                    : '今月の集計期間は終了しました'}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">予算が未設定です</p>
                <Button asChild size="sm" className="mt-2">
                  <Link href="/budget">予算を設定する</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <StatRow label="今月の全体予算" value={formatYen(summary.budgetYen)} />
          {summary.carryoverYen !== 0 ? (
            <StatRow label="前月からの繰越し" value={formatYen(summary.carryoverYen)} />
          ) : null}
          <StatRow label="今月の支出合計" value={formatYen(summary.spentYen)} hint={`${summary.transactionCount}件`} />
          <StatRow
            label="残り予算"
            value={formatYen(summary.remainingYen)}
            tone={summary.remainingYen < 0 ? 'danger' : 'primary'}
          />
          {summary.incomeYen > 0 ? (
            <StatRow label="今月の収入" value={formatYen(summary.incomeYen)} />
          ) : null}
        </div>

        <div className="mt-2 flex justify-end">
          <Link href="/budget" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            予算を設定・編集
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {summary.hasBudget ? (
          <div className="mt-3 space-y-1.5">
            <Progress
              value={clampPercent(summary.usageRate)}
              tone={summary.level === 'over' ? 'danger' : summary.level === 'warn' ? 'warn' : 'primary'}
              label={`予算の使用率 ${summary.usageRate}%`}
            />
            <p className="text-xs text-muted">
              {summary.level === 'over'
                ? `予算を${formatYenText(Math.abs(summary.remainingYen))}超えています。`
                : summary.paceDiffYen > 0
                  ? `日割りのペースより${formatYenText(summary.paceDiffYen)}多く使っています。`
                  : `日割りのペースより${formatYenText(Math.abs(summary.paceDiffYen))}少なく抑えられています。`}
            </p>
          </div>
        ) : null}
      </Card>

      {/* カテゴリ別支出 --------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別の支出</CardTitle>
          <Link href="/stats" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            集計
            <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        {categorySegments.length === 0 ? (
          <p className="py-4 text-sm text-muted">この月の支出はまだありません。</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <DonutChart
              segments={categorySegments.slice(0, 8)}
              size={148}
              thickness={16}
              centerLabel="支出合計"
              centerValue={formatYen(summary.spentYen)}
              className="mx-auto"
            />
            <div className="min-w-0 flex-1">
              <ChartLegend segments={categorySegments} total={summary.spentYen} max={6} />
            </div>
          </div>
        )}
      </Card>

      {/* 支払者別（共有モードのみ） -------------------------------------- */}
      {isShared && viewer === 'all' && summary.spentYen > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>誰がいくら払ったか</CardTitle>
          </CardHeader>
          <ChartLegend
            segments={memberRows.map((r) => ({ id: r.id, label: r.label, color: r.color, value: r.amountYen }))}
            total={summary.spentYen}
          />
        </Card>
      ) : null}

      {/* 直近の支出 ------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>直近の支出</CardTitle>
          <Link href="/expenses" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            すべて見る
            <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        {recent.length === 0 ? (
          <EmptyState
            title="まだ登録がありません"
            description="左下の「入力」タブから支出を登録できます。"
            action={
              <Button asChild size="sm">
                <Link href="/">支出を登録する</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => {
              const category = categories.find((c) => c.id === t.categoryId);
              return (
                <li key={t.id}>
                  <Link href={`/expenses/${t.id}`} className="flex items-center gap-3 py-3">
                    <span className="text-xl">{category?.icon ?? '📦'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {t.description || category?.name || '支出'}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {formatMonthDay(t.occurredOn)}・{category?.name}
                        {isShared ? `・${memberName(t.paidBy)}` : ''}
                        {t.shareScope === 'personal' ? '・個人' : ''}
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
        )}
      </Card>

      {/* 貯金目標 -------------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>進行中の貯金目標</CardTitle>
          <Link href="/savings" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            すべて見る
            <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        {activeGoals.length === 0 ? (
          <EmptyState
            title="進行中の目標はありません"
            description="旅行や家具の買い替えなど、目的別に貯金を管理できます。"
            icon={<PiggyBank className="size-8" />}
            action={
              <Button asChild size="sm">
                <Link href="/savings">目標を作る</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {activeGoals.map((goal) => {
              const p = goalProgress(goal, savingsEntries, today);
              return (
                <li key={goal.id}>
                  <Link href={`/savings/${goal.id}`} className="block space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">
                        {goal.icon} {goal.name}
                      </span>
                      <span className="tabular shrink-0 text-sm font-bold">{p.rate}%</span>
                    </div>
                    <Progress value={clampPercent(p.rate)} tone={p.achieved ? 'success' : 'primary'} />
                    <p className="text-xs text-muted">
                      {formatYen(p.currentYen)} / {formatYen(goal.targetYen)}・
                      {p.achieved ? '達成しました🎉' : `あと${formatYenText(p.remainingYen)}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Todo / コメント -------------------------------------------------- */}
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>未完了のTodo</CardTitle>
            <Link href="/share?tab=todo" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
              すべて見る
              <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          {openTodos.length === 0 ? (
            <p className="py-3 text-sm text-muted">未完了のTodoはありません。</p>
          ) : (
            <ul className="space-y-2">
              {openTodos.map((todo) => {
                const overdue = todo.dueOn !== null && todo.dueOn < today;
                return (
                  <li key={todo.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{todo.title}</span>
                      {todo.dueOn ? (
                        <span className={`text-xs ${overdue ? 'text-danger' : 'text-muted'}`}>
                          <CalendarClock className="mr-1 inline size-3" />
                          {formatMonthDay(todo.dueOn)}
                          {overdue ? '（期限切れ）' : ''}
                        </span>
                      ) : null}
                    </span>
                    {todo.priority === 'high' ? <Badge tone="danger">重要</Badge> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近のコメント</CardTitle>
            <Link href="/share" className="flex items-center gap-0.5 text-sm font-semibold text-primary">
              すべて見る
              <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          {recentComments.length === 0 ? (
            <p className="py-3 text-sm text-muted">
              {isShared ? 'まだコメントはありません。' : 'メモとして自由に書き残せます。'}
            </p>
          ) : (
            <ul className="space-y-3">
              {recentComments.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words">{c.body}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {memberName(c.userId)}・{formatRelativeJst(c.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
