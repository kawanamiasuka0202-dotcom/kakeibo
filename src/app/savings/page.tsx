'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { GoalForm, type GoalFormValues } from '@/components/goal-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, EmptyState, Progress, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { clampPercent, formatYen, formatYenText } from '@/lib/money';
import { describeDeadline, goalProgress, sortGoals } from '@/lib/savings';
import type { GoalStatus } from '@/lib/types';

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: '進行中',
  paused: '一時停止',
  done: '達成',
  archived: 'アーカイブ',
};

export default function SavingsPage() {
  const { data, me, backend, run, busy, today, isShared } = useHousehold();
  const [tab, setTab] = React.useState<'active' | 'done' | 'archived'>('active');
  const [open, setOpen] = React.useState(false);

  const goals = React.useMemo(() => {
    const filtered = data.savingsGoals.filter((g) => {
      if (tab === 'active') return g.status === 'active' || g.status === 'paused';
      if (tab === 'done') return g.status === 'done';
      return g.status === 'archived';
    });
    return sortGoals(filtered);
  }, [data.savingsGoals, tab]);

  const createGoal = async (values: GoalFormValues) => {
    if (!backend) return;
    const result = await run(
      async () => {
        const goal = await backend.create('savings_goals', {
          householdId: data.household.id,
          name: values.name,
          targetYen: values.targetYen,
          targetDate: values.targetDate,
          color: values.color,
          icon: values.icon,
          memo: values.memo,
          scope: values.scope,
          ownerId: values.scope === 'personal' ? me.id : null,
          status: 'active',
          createdBy: me.id,
        });
        if (values.initialYen > 0) {
          await backend.create('savings_entries', {
            goalId: goal.id,
            householdId: data.household.id,
            amountYen: values.initialYen,
            occurredOn: today,
            userId: me.id,
            memo: '開始時の残高',
            transactionId: null,
          });
        }
      },
      { success: '目標を作成しました' },
    );
    if (result !== null) setOpen(false);
  };

  const totalTarget = goals.reduce((s, g) => s + g.targetYen, 0);
  const totalCurrent = goals.reduce((s, g) => s + goalProgress(g, data.savingsEntries, today).currentYen, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="貯金"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            目標を作る
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="active">進行中</TabsTrigger>
          <TabsTrigger value="done">達成</TabsTrigger>
          <TabsTrigger value="archived">アーカイブ</TabsTrigger>
        </TabsList>
      </Tabs>

      {goals.length > 0 ? (
        <Card>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">{STATUS_LABEL[tab === 'active' ? 'active' : tab === 'done' ? 'done' : 'archived']}の合計</span>
            <span className="tabular text-xl font-bold">
              {formatYen(totalCurrent)}
              <span className="ml-1 text-sm font-normal text-muted">/ {formatYen(totalTarget)}</span>
            </span>
          </div>
        </Card>
      ) : null}

      {goals.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? '目標がまだありません' : '該当する目標はありません'}
          description={
            tab === 'active'
              ? '旅行・家具の買い替え・引っ越しなど、目的別に貯金を管理できます。'
              : undefined
          }
          action={
            tab === 'active' ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                目標を作る
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {goals.map((goal) => {
            const p = goalProgress(goal, data.savingsEntries, today);
            return (
              <li key={goal.id}>
                <Link href={`/savings/${goal.id}`}>
                  <Card className="transition-colors active:bg-surface-muted">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-2xl"
                        style={{ backgroundColor: `${goal.color}22` }}
                      >
                        {goal.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 truncate font-bold">{goal.name}</p>
                          {goal.status === 'paused' ? <Badge tone="warn">一時停止</Badge> : null}
                          {goal.scope === 'personal' && isShared ? <Badge>個人</Badge> : null}
                          {p.achieved ? <Badge tone="success">達成</Badge> : null}
                        </div>
                        <p className="tabular mt-0.5 text-sm">
                          <span className="font-bold">{formatYen(p.currentYen)}</span>
                          <span className="text-muted"> / {formatYen(goal.targetYen)}</span>
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-lg font-bold">{p.rate}%</span>
                    </div>

                    <Progress
                      className="mt-3"
                      value={clampPercent(p.rate)}
                      tone={p.achieved ? 'success' : 'primary'}
                      label={`${goal.name} の達成率 ${p.rate}%`}
                    />

                    <div className="mt-2 space-y-0.5 text-xs text-muted">
                      <p>
                        {p.achieved
                          ? '目標を達成しました🎉'
                          : `あと${formatYenText(p.remainingYen)}必要です。`}
                      </p>
                      <p>{describeDeadline(p.daysLeft, goal.targetDate)}</p>
                      {!p.achieved && p.monthlyNeededYen !== null ? (
                        <p>月あたり{formatYenText(p.monthlyNeededYen)}の積立が目安です。</p>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="貯金目標を作る">
          <GoalForm mode="create" onSubmit={createGoal} onCancel={() => setOpen(false)} submitting={busy} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
