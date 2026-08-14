'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader, StatRow } from '@/components/common';
import { TransactionForm } from '@/components/transaction-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState } from '@/components/ui/misc';
import { useToast, UNDO_DURATION_MS } from '@/components/ui/toast';
import { formatDateTimeJst, formatLongDate } from '@/lib/date';
import { formatYen } from '@/lib/money';
import type { Transaction } from '@/lib/types';

export default function TransactionDetailPage() {
  const { data, backend, run, busy, memberName, isShared, me } = useHousehold();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const tx = data.transactions.find((t) => t.id === params.id);
  const category = tx ? data.categories.find((c) => c.id === tx.categoryId) : undefined;
  const goal = tx?.savingsGoalId ? data.savingsGoals.find((g) => g.id === tx.savingsGoalId) : undefined;

  if (!tx) {
    return (
      <>
        <PageHeader title="支出の詳細" back="/expenses" />
        <EmptyState
          title="データが見つかりません"
          description="すでに削除された可能性があります。"
          action={
            <Button asChild size="sm">
              <Link href="/expenses">家計簿へ戻る</Link>
            </Button>
          }
        />
      </>
    );
  }

  const onDelete = async () => {
    if (!backend) return;
    const snapshot: Transaction = { ...tx };
    const linkedEntries = data.savingsEntries.filter((e) => e.transactionId === tx.id);
    setConfirmOpen(false);

    const result = await run(async () => {
      for (const e of linkedEntries) await backend.remove('savings_entries', e.id);
      await backend.remove('transactions', tx.id);
    });

    if (result !== null) {
      router.replace('/expenses');
      toast.show('削除しました', {
        duration: UNDO_DURATION_MS,
        onUndo: () => {
          void run(
            async () => {
              const restored = await backend.create('transactions', {
                householdId: snapshot.householdId,
                type: snapshot.type,
                amountYen: snapshot.amountYen,
                categoryId: snapshot.categoryId,
                description: snapshot.description,
                occurredOn: snapshot.occurredOn,
                paidBy: snapshot.paidBy,
                shareScope: snapshot.shareScope,
                paymentMethod: snapshot.paymentMethod,
                memo: snapshot.memo,
                savingsGoalId: snapshot.savingsGoalId,
                receiptPath: snapshot.receiptPath,
                createdBy: snapshot.createdBy,
                updatedBy: me.id,
              });
              for (const e of linkedEntries) {
                await backend.create('savings_entries', {
                  goalId: e.goalId,
                  householdId: e.householdId,
                  amountYen: e.amountYen,
                  occurredOn: e.occurredOn,
                  userId: e.userId,
                  memo: e.memo,
                  transactionId: restored.id,
                });
              }
            },
            { success: '削除を取り消しました' },
          );
        },
      });
    }
  };

  if (editing) {
    return (
      <>
        <PageHeader title="編集" back={`/expenses/${tx.id}`} />
        <TransactionForm mode="edit" initial={tx} transactionId={tx.id} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="登録内容" back="/expenses" />

      <Card>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{category?.icon ?? '📦'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{tx.description || category?.name}</p>
            <p className="text-sm text-muted">{category?.name}</p>
          </div>
          <span className={`tabular text-2xl font-bold ${tx.type === 'income' ? 'text-success' : ''}`}>
            {tx.type === 'income' ? '+' : ''}
            {formatYen(tx.amountYen)}
          </span>
        </div>

        <div className="mt-4 border-t border-border pt-2">
          <StatRow label="日付" value={formatLongDate(tx.occurredOn)} />
          <StatRow label="種別" value={tx.type === 'expense' ? '支出' : '収入'} />
          {isShared ? <StatRow label="支払った人" value={memberName(tx.paidBy)} /> : null}
          <StatRow label="区分" value={tx.shareScope === 'shared' ? '共有' : '個人'} />
          <StatRow label="支払方法" value={tx.paymentMethod} />
          {goal ? <StatRow label="貯金目標" value={`${goal.icon} ${goal.name}`} /> : null}
        </div>

        {tx.memo ? (
          <div className="mt-3 rounded-xl bg-surface-muted p-3 text-sm">
            <p className="mb-1 font-semibold text-muted">メモ</p>
            <p className="whitespace-pre-wrap break-words">{tx.memo}</p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted">
          <Badge>登録: {memberName(tx.createdBy)}</Badge>
          <span>{formatDateTimeJst(tx.createdAt)}</span>
          {tx.updatedAt !== tx.createdAt ? (
            <>
              <Badge tone="primary">更新: {memberName(tx.updatedBy)}</Badge>
              <span>{formatDateTimeJst(tx.updatedAt)}</span>
            </>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-2">
        <Button size="block" onClick={() => setEditing(true)} disabled={busy}>
          <Pencil className="size-5" />
          編集する
        </Button>
        <Button asChild variant="outline" size="block">
          <Link href={`/expenses/new?from=${tx.id}`}>
            <Copy className="size-5" />
            同じ内容で登録する
          </Link>
        </Button>
        <Button variant="ghost" size="block" onClick={() => setConfirmOpen(true)} disabled={busy}>
          <Trash2 className="size-5 text-danger" />
          <span className="text-danger">削除する</span>
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="この記録を削除しますか？"
        description={
          <>
            <p>
              {formatLongDate(tx.occurredOn)}の「{tx.description || category?.name}」
              {formatYen(tx.amountYen)}を削除します。
            </p>
            <p className="mt-2 text-muted">削除後7秒間は「元に戻す」で取り消せます。</p>
          </>
        }
        onConfirm={onDelete}
        busy={busy}
      />
    </div>
  );
}
