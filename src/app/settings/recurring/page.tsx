'use client';

import * as React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge, EmptyState, Switch } from '@/components/ui/misc';
import { formatYen, parseYen } from '@/lib/money';
import { validateAmount, validateText } from '@/lib/validation';
import { PAYMENT_METHODS, type PaymentMethod, type RecurringRule, type ShareScope } from '@/lib/types';

export default function RecurringPage() {
  const { data, me, backend, run, busy, isShared, memberName } = useHousehold();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<RecurringRule | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RecurringRule | null>(null);

  const rules = [...data.recurringRules].sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  const save = async (values: RecurringFormValues) => {
    if (!backend) return;
    const target = editTarget;
    const result = await run(
      async () => {
        if (target) {
          await backend.update('recurring_rules', target.id, values);
        } else {
          await backend.create('recurring_rules', {
            householdId: data.household.id,
            ...values,
            active: true,
            lastConfirmedMonth: null,
            createdBy: me.id,
          });
        }
      },
      { success: target ? '定期支出を更新しました' : '定期支出を追加しました' },
    );
    if (result !== null) {
      setFormOpen(false);
      setEditTarget(null);
    }
  };

  const toggleActive = async (rule: RecurringRule) => {
    if (!backend) return;
    await run(() => backend.update('recurring_rules', rule.id, { active: !rule.active }));
  };

  const remove = async () => {
    if (!deleteTarget || !backend) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await run(() => backend.remove('recurring_rules', target.id), { success: '削除しました' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="定期支出の管理"
        back="/settings"
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditTarget(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            追加
          </Button>
        }
      />

      <p className="text-xs leading-relaxed text-muted">
        家賃や保険料など毎月発生する支出を登録しておくと、家計簿の画面に「今月の確認候補」として表示されます。
        誤登録を防ぐため、自動では確定しません。内容を確認してから登録してください。
      </p>

      {rules.length === 0 ? (
        <EmptyState
          title="定期支出はまだありません"
          description="家賃・光熱費・サブスクなどを登録できます。"
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditTarget(null);
                setFormOpen(true);
              }}
            >
              定期支出を追加
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const category = data.categories.find((c) => c.id === rule.categoryId);
            return (
              <li key={rule.id}>
                <Card className="flex items-start gap-3 p-3">
                  <span className="text-xl">{category?.icon ?? '🔁'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{rule.name}</p>
                    <p className="text-xs text-muted">
                      毎月{rule.dayOfMonth}日・{category?.name}
                      {isShared ? `・${memberName(rule.paidBy)}` : ''}・{rule.paymentMethod}
                    </p>
                    <p className="tabular mt-1 font-bold">{formatYen(rule.amountYen)}</p>
                    {!rule.active ? <Badge tone="neutral">停止中</Badge> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => toggleActive(rule)}
                      disabled={busy}
                      aria-label={`${rule.name}の有効・無効`}
                    />
                    <div className="flex">
                      <button
                        type="button"
                        aria-label="編集"
                        className="rounded-lg p-2 text-muted"
                        onClick={() => {
                          setEditTarget(rule);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="削除"
                        className="rounded-lg p-2 text-danger"
                        onClick={() => setDeleteTarget(rule)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent title={editTarget ? '定期支出を編集' : '定期支出を追加'}>
          <RecurringForm
            initial={editTarget}
            onSubmit={save}
            onCancel={() => {
              setFormOpen(false);
              setEditTarget(null);
            }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="この定期支出を削除しますか？"
        description={
          deleteTarget
            ? `「${deleteTarget.name}」を削除します。すでに登録済みの家計簿の記録は残ります。`
            : ''
        }
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}

interface RecurringFormValues {
  name: string;
  type: 'expense' | 'income';
  amountYen: number;
  categoryId: string;
  dayOfMonth: number;
  paidBy: string;
  shareScope: ShareScope;
  paymentMethod: PaymentMethod;
  memo: string;
}

function RecurringForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: RecurringRule | null;
  onSubmit: (values: RecurringFormValues) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { data, me, isShared } = useHousehold();
  const [name, setName] = React.useState(initial?.name ?? '');
  const [amount, setAmount] = React.useState(initial ? String(initial.amountYen) : '');
  const [categoryId, setCategoryId] = React.useState(initial?.categoryId ?? '');
  const [dayOfMonth, setDayOfMonth] = React.useState(String(initial?.dayOfMonth ?? 1));
  const [paidBy, setPaidBy] = React.useState(initial?.paidBy ?? me.id);
  const [shareScope, setShareScope] = React.useState<ShareScope>(initial?.shareScope ?? 'shared');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(
    initial?.paymentMethod ?? '口座振替',
  );
  const [memo, setMemo] = React.useState(initial?.memo ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const expenseCategories = data.categories.filter((c) => c.kind === 'expense');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const nameError = validateText(name, '名前', { required: true, max: 50 });
    if (nameError) next.name = nameError;
    const parsed = parseYen(amount);
    const amountError = validateAmount(parsed);
    if (amountError) next.amount = amountError;
    if (!categoryId) next.categoryId = 'カテゴリを選択してください';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      name: name.trim(),
      type: 'expense',
      amountYen: parsed!,
      categoryId,
      dayOfMonth: Number(dayOfMonth),
      paidBy,
      shareScope,
      paymentMethod,
      memo: memo.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="名前" htmlFor="rec-name" error={errors.name}>
        <Input
          id="rec-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="家賃、生命保険 など"
          autoFocus
        />
      </Field>

      <Field label="金額" htmlFor="rec-amount" error={errors.amount}>
        <Input
          id="rec-amount"
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          className="tabular text-right"
        />
      </Field>

      <Field label="カテゴリ" htmlFor="rec-category" error={errors.categoryId}>
        <Select id="rec-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">選択してください</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="毎月の発生日" htmlFor="rec-day" hint="29日以降は月によって存在しないため、28日までで設定します">
        <Select id="rec-day" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}日
            </option>
          ))}
        </Select>
      </Field>

      {isShared ? (
        <Field label="支払う人" htmlFor="rec-paidby">
          <Select id="rec-paidby" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {data.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="区分" htmlFor="rec-scope">
          <Select
            id="rec-scope"
            value={shareScope}
            onChange={(e) => setShareScope(e.target.value as ShareScope)}
          >
            <option value="shared">共有</option>
            <option value="personal">個人</option>
          </Select>
        </Field>
        <Field label="支払方法" htmlFor="rec-method">
          <Select
            id="rec-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="メモ" htmlFor="rec-memo">
        <Textarea id="rec-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} maxLength={500} />
      </Field>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="block" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button type="submit" size="block" disabled={busy}>
          保存する
        </Button>
      </div>
    </form>
  );
}
