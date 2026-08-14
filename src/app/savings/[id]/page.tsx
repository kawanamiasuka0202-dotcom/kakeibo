'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2 } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader, StatRow } from '@/components/common';
import { GoalForm, type GoalFormValues } from '@/components/goal-form';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, EmptyState, Progress } from '@/components/ui/misc';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast, UNDO_DURATION_MS } from '@/components/ui/toast';
import { formatMonthDay } from '@/lib/date';
import { clampPercent, formatYen, formatYenText, parseYen } from '@/lib/money';
import { describeDeadline, goalProgress } from '@/lib/savings';
import { validateAmount } from '@/lib/validation';
import type { GoalStatus, SavingsEntry } from '@/lib/types';

export default function SavingsGoalPage() {
  const { data, me, backend, run, busy, today, memberName, isShared } = useHousehold();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [entryOpen, setEntryOpen] = React.useState<null | 'deposit' | 'withdraw'>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const goal = data.savingsGoals.find((g) => g.id === params.id);
  const entries = React.useMemo(
    () =>
      data.savingsEntries
        .filter((e) => e.goalId === params.id)
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)),
    [data.savingsEntries, params.id],
  );

  if (!goal) {
    return (
      <>
        <PageHeader title="貯金目標" back="/savings" />
        <EmptyState
          title="目標が見つかりません"
          description="削除された可能性があります。"
          action={
            <Button asChild size="sm">
              <Link href="/savings">貯金一覧へ</Link>
            </Button>
          }
        />
      </>
    );
  }

  const progress = goalProgress(goal, data.savingsEntries, today);

  const addEntry = async (values: { amount: number; occurredOn: string; memo: string }, sign: 1 | -1) => {
    if (!backend) return;
    const result = await run(
      () =>
        backend.create('savings_entries', {
          goalId: goal.id,
          householdId: goal.householdId,
          amountYen: sign * values.amount,
          occurredOn: values.occurredOn,
          userId: me.id,
          memo: values.memo,
          transactionId: null,
        }),
      { success: sign > 0 ? '入金を記録しました' : '出金を記録しました' },
    );
    if (result !== null) setEntryOpen(null);
  };

  const deleteEntry = async (entry: SavingsEntry) => {
    if (!backend) return;
    const result = await run(() => backend.remove('savings_entries', entry.id));
    if (result !== null) {
      toast.show('履歴を削除しました', {
        duration: UNDO_DURATION_MS,
        onUndo: () => {
          void run(
            () =>
              backend.create('savings_entries', {
                goalId: entry.goalId,
                householdId: entry.householdId,
                amountYen: entry.amountYen,
                occurredOn: entry.occurredOn,
                userId: entry.userId,
                memo: entry.memo,
                transactionId: entry.transactionId,
              }),
            { success: '削除を取り消しました' },
          );
        },
      });
    }
  };

  const updateGoal = async (values: GoalFormValues) => {
    if (!backend) return;
    const result = await run(
      () =>
        backend.update('savings_goals', goal.id, {
          name: values.name,
          targetYen: values.targetYen,
          targetDate: values.targetDate,
          color: values.color,
          icon: values.icon,
          memo: values.memo,
          scope: values.scope,
          ownerId: values.scope === 'personal' ? (goal.ownerId ?? me.id) : null,
        }),
      { success: '目標を更新しました' },
    );
    if (result !== null) setEditOpen(false);
  };

  const changeStatus = async (status: GoalStatus) => {
    if (!backend) return;
    await run(() => backend.update('savings_goals', goal.id, { status }), { success: '状態を変更しました' });
  };

  const deleteGoal = async () => {
    if (!backend) return;
    setConfirmDelete(false);
    const result = await run(() => backend.remove('savings_goals', goal.id), {
      success: '目標を削除しました',
    });
    if (result !== null) router.replace('/savings');
  };

  return (
    <div className="space-y-4">
      <PageHeader title={goal.name} back="/savings" />

      <Card>
        <div className="flex items-start gap-3">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
            style={{ backgroundColor: `${goal.color}22` }}
          >
            {goal.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{goal.name}</h2>
              {goal.scope === 'personal' && isShared ? <Badge>個人目標</Badge> : null}
              {goal.status === 'paused' ? <Badge tone="warn">一時停止</Badge> : null}
              {goal.status === 'archived' ? <Badge>アーカイブ</Badge> : null}
              {progress.achieved ? <Badge tone="success">達成🎉</Badge> : null}
            </div>
            <p className="tabular mt-1 text-2xl font-bold">{formatYen(progress.currentYen)}</p>
            <p className="text-sm text-muted">目標 {formatYen(goal.targetYen)}</p>
          </div>
        </div>

        <Progress
          className="mt-4"
          value={clampPercent(progress.rate)}
          tone={progress.achieved ? 'success' : 'primary'}
          label={`達成率 ${progress.rate}%`}
        />

        <div className="mt-3 border-t border-border pt-2">
          <StatRow label="達成率" value={`${progress.rate}%`} tone="primary" />
          <StatRow
            label="あと必要な額"
            value={progress.achieved ? '達成しました' : formatYen(progress.remainingYen)}
          />
          <StatRow label="目標日" value={describeDeadline(progress.daysLeft, goal.targetDate)} />
          {progress.monthlyNeededYen !== null && !progress.achieved ? (
            <StatRow label="月あたりの積立目安" value={formatYen(progress.monthlyNeededYen)} />
          ) : null}
          <StatRow label="入金合計" value={formatYen(progress.depositYen)} />
          {progress.withdrawalYen > 0 ? (
            <StatRow label="出金合計" value={`-${formatYen(progress.withdrawalYen)}`} tone="danger" />
          ) : null}
        </div>

        {goal.memo ? (
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-sm">{goal.memo}</p>
        ) : null}

        {isShared && goal.scope === 'shared' && progress.byMember.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-sm font-semibold">だれがいくら入れたか</p>
            <ul className="space-y-1">
              {progress.byMember.map((m) => (
                <li key={m.userId} className="flex justify-between text-sm">
                  <span>{memberName(m.userId)}</span>
                  <span className="tabular font-semibold">{formatYen(m.amountYen)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setEntryOpen('deposit')} disabled={busy}>
          <ArrowUpCircle className="size-5" />
          入金する
        </Button>
        <Button variant="outline" onClick={() => setEntryOpen('withdraw')} disabled={busy}>
          <ArrowDownCircle className="size-5" />
          取り崩す
        </Button>
      </div>

      {/* 入出金履歴 */}
      <Card>
        <CardHeader>
          <CardTitle>入金・出金の履歴</CardTitle>
          <span className="text-sm text-muted">{entries.length}件</span>
        </CardHeader>
        {entries.length === 0 ? (
          <p className="py-3 text-sm text-muted">まだ履歴がありません。</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {formatMonthDay(entry.occurredOn)}
                    {isShared ? `・${memberName(entry.userId)}` : ''}
                  </span>
                  {entry.memo ? (
                    <span className="block truncate text-xs text-muted">{entry.memo}</span>
                  ) : null}
                  {entry.transactionId ? (
                    <Link
                      href={`/expenses/${entry.transactionId}`}
                      className="text-xs text-primary underline"
                    >
                      家計簿の記録を見る
                    </Link>
                  ) : null}
                </span>
                <span
                  className={`tabular shrink-0 font-bold ${entry.amountYen < 0 ? 'text-danger' : 'text-success'}`}
                >
                  {entry.amountYen > 0 ? '+' : ''}
                  {formatYen(entry.amountYen)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteEntry(entry)}
                  disabled={busy}
                  aria-label="この履歴を削除"
                  className="shrink-0 rounded-lg p-2 text-muted active:bg-surface-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 目標の操作 */}
      <Card>
        <CardHeader>
          <CardTitle>目標の管理</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          <Button variant="outline" size="block" onClick={() => setEditOpen(true)} disabled={busy}>
            <Pencil className="size-5" />
            目標を編集する
          </Button>
          <Field label="状態" htmlFor="goal-status">
            <Select
              id="goal-status"
              value={goal.status}
              onChange={(e) => changeStatus(e.target.value as GoalStatus)}
              disabled={busy}
            >
              <option value="active">進行中</option>
              <option value="paused">一時停止</option>
              <option value="done">達成（完了）</option>
              <option value="archived">アーカイブ</option>
            </Select>
          </Field>
          <Button variant="ghost" size="block" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="size-5 text-danger" />
            <span className="text-danger">目標を削除する</span>
          </Button>
        </div>
      </Card>

      <EntryDialog
        open={entryOpen !== null}
        kind={entryOpen ?? 'deposit'}
        today={today}
        busy={busy}
        onClose={() => setEntryOpen(null)}
        onSubmit={(values) => addEntry(values, entryOpen === 'withdraw' ? -1 : 1)}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="目標を編集">
          <GoalForm
            mode="edit"
            initial={goal}
            onSubmit={updateGoal}
            onCancel={() => setEditOpen(false)}
            submitting={busy}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="この目標を削除しますか？"
        description={
          <>
            <p>
              「{goal.name}」と、入金・出金の履歴{entries.length}件がすべて削除されます。
            </p>
            <p className="mt-2 text-muted">
              残しておきたい場合は、削除ではなく「アーカイブ」をご利用ください。
            </p>
          </>
        }
        onConfirm={deleteGoal}
        busy={busy}
      />
    </div>
  );
}

function EntryDialog({
  open,
  kind,
  today,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: 'deposit' | 'withdraw';
  today: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: { amount: number; occurredOn: string; memo: string }) => void;
}) {
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [memo, setMemo] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setAmount('');
      setDate(today);
      setMemo('');
      setError(null);
    }
  }, [open, today]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYen(amount);
    const err = validateAmount(parsed);
    if (err) {
      setError(err);
      return;
    }
    onSubmit({ amount: parsed!, occurredOn: date, memo: memo.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        title={kind === 'deposit' ? '入金を記録する' : '取り崩しを記録する'}
        description={
          kind === 'withdraw' ? '目標のお金を使った分をマイナスとして記録します。' : undefined
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="金額" htmlFor="entry-amount" error={error ?? undefined}>
            <Input
              id="entry-amount"
              type="text"
              inputMode="numeric"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              className="tabular text-right text-2xl"
              placeholder="10000"
            />
          </Field>
          <Field label="日付" htmlFor="entry-date">
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="メモ" htmlFor="entry-memo">
            <Textarea
              id="entry-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={200}
              rows={2}
            />
          </Field>
          {amount ? (
            <p className="text-sm text-muted">
              {kind === 'deposit' ? '入金' : '取り崩し'}
              {formatYenText(Number(amount))}として記録します。
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="block" onClick={onClose} disabled={busy}>
              キャンセル
            </Button>
            <Button type="submit" size="block" disabled={busy}>
              記録する
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
