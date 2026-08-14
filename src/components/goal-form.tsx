'use client';

import * as React from 'react';
import { useHousehold } from '@/components/app-provider';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { COLOR_CHOICES, ICON_CHOICES } from '@/lib/categories';
import { parseYen } from '@/lib/money';
import type { GoalScope, SavingsGoal } from '@/lib/types';
import { validateGoal } from '@/lib/validation';
import { cn } from '@/lib/utils';

export interface GoalFormValues {
  name: string;
  targetYen: number;
  targetDate: string | null;
  color: string;
  icon: string;
  memo: string;
  scope: GoalScope;
  /** 新規作成時のみ: 現在の貯金額を最初の入金として記録する */
  initialYen: number;
}

export function GoalForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  mode,
}: {
  initial?: SavingsGoal;
  onSubmit: (values: GoalFormValues) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  mode: 'create' | 'edit';
}) {
  const { isShared } = useHousehold();
  const [name, setName] = React.useState(initial?.name ?? '');
  const [target, setTarget] = React.useState(initial ? String(initial.targetYen) : '');
  const [initialAmount, setInitialAmount] = React.useState('');
  const [targetDate, setTargetDate] = React.useState(initial?.targetDate ?? '');
  const [icon, setIcon] = React.useState(initial?.icon ?? '🐖');
  const [color, setColor] = React.useState(initial?.color ?? '#3f9c7a');
  const [memo, setMemo] = React.useState(initial?.memo ?? '');
  const [scope, setScope] = React.useState<GoalScope>(initial?.scope ?? (isShared ? 'shared' : 'personal'));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const targetYen = parseYen(target);
    const result = validateGoal({ name, targetYen, targetDate: targetDate || null });
    setErrors(result.errors);
    if (!result.ok || targetYen === null) return;

    await onSubmit({
      name: name.trim(),
      targetYen,
      targetDate: targetDate || null,
      color,
      icon,
      memo: memo.trim(),
      scope,
      initialYen: mode === 'create' ? (parseYen(initialAmount) ?? 0) : 0,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="目標名" htmlFor="goal-name" error={errors.name}>
        <Input
          id="goal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="沖縄旅行、ソファ買い替え など"
          maxLength={50}
        />
      </Field>

      <Field label="目標金額" htmlFor="goal-target" error={errors.targetYen}>
        <Input
          id="goal-target"
          type="text"
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="300000"
          className="tabular"
        />
      </Field>

      {mode === 'create' ? (
        <Field
          label="現在の貯金額"
          htmlFor="goal-initial"
          hint="すでに貯めている分があれば入力してください（あとから追加もできます）"
        >
          <Input
            id="goal-initial"
            type="text"
            inputMode="numeric"
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            className="tabular"
          />
        </Field>
      ) : null}

      <Field label="目標日" htmlFor="goal-date" error={errors.targetDate} hint="任意">
        <Input
          id="goal-date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Field>

      {isShared ? (
        <Field
          label="種類"
          htmlFor="goal-scope"
          hint={scope === 'personal' ? '個人目標はパートナーには表示されません。' : '2人で共有する目標です。'}
        >
          <Select id="goal-scope" value={scope} onChange={(e) => setScope(e.target.value as GoalScope)}>
            <option value="shared">共有目標</option>
            <option value="personal">個人目標</option>
          </Select>
        </Field>
      ) : null}

      <div>
        <p className="mb-1.5 text-sm font-semibold">アイコン</p>
        <div className="grid grid-cols-8 gap-1.5">
          {ICON_CHOICES.slice(0, 24).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              aria-pressed={icon === i}
              className={cn(
                'flex h-10 items-center justify-center rounded-lg border text-lg',
                icon === i ? 'border-primary bg-primary-soft' : 'border-border',
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">色</p>
        <div className="grid grid-cols-10 gap-1.5">
          {COLOR_CHOICES.slice(0, 20).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`色 ${c}`}
              aria-pressed={color === c}
              className={cn('h-8 rounded-lg border-2', color === c ? 'border-foreground' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <Field label="メモ" htmlFor="goal-memo">
        <Textarea id="goal-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />
      </Field>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="block" onClick={onCancel} disabled={submitting}>
          キャンセル
        </Button>
        <Button type="submit" size="block" disabled={submitting}>
          {submitting ? '保存中…' : mode === 'create' ? '作成する' : '保存する'}
        </Button>
      </div>
    </form>
  );
}
