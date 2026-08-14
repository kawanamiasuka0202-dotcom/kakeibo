'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Badge, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { COLOR_CHOICES, ICON_CHOICES } from '@/lib/categories';
import { validateText } from '@/lib/validation';
import type { Category, CategoryKind } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function CategoriesPage() {
  const { data, backend, run, busy } = useHousehold();
  const toast = useToast();
  const [kind, setKind] = React.useState<CategoryKind>('expense');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Category | null>(null);

  const categories = React.useMemo(
    () => data.categories.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.categories, kind],
  );

  const usageCount = React.useCallback(
    (categoryId: string) =>
      data.transactions.filter((t) => t.categoryId === categoryId).length +
      data.recurringRules.filter((r) => r.categoryId === categoryId).length,
    [data.transactions, data.recurringRules],
  );

  const move = async (category: Category, direction: -1 | 1) => {
    if (!backend) return;
    const index = categories.findIndex((c) => c.id === category.id);
    const target = categories[index + direction];
    if (!target) return;
    await run(async () => {
      await backend.update('categories', category.id, { sortOrder: target.sortOrder });
      await backend.update('categories', target.id, { sortOrder: category.sortOrder });
    });
  };

  const toggleHidden = async (category: Category) => {
    if (!backend) return;
    await run(() => backend.update('categories', category.id, { isHidden: !category.isHidden }), {
      success: category.isHidden ? '表示に戻しました' : '非表示にしました',
    });
  };

  const save = async (values: { name: string; icon: string; color: string }) => {
    if (!backend) return;
    const target = editTarget;
    const duplicated = data.categories.some(
      (c) => c.kind === kind && c.name === values.name.trim() && c.id !== target?.id,
    );
    if (duplicated) {
      toast.show('同じ名前のカテゴリがすでにあります', { tone: 'error' });
      return;
    }
    const result = await run(
      async () => {
        if (target) {
          await backend.update('categories', target.id, values);
        } else {
          const maxOrder = Math.max(0, ...data.categories.map((c) => c.sortOrder));
          await backend.create('categories', {
            householdId: data.household.id,
            ...values,
            kind,
            sortOrder: maxOrder + 10,
            isHidden: false,
            isSystem: false,
          });
        }
      },
      { success: target ? 'カテゴリを更新しました' : 'カテゴリを追加しました' },
    );
    if (result !== null) {
      setFormOpen(false);
      setEditTarget(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget || !backend) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await run(() => backend.remove('categories', target.id), { success: 'カテゴリを削除しました' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="カテゴリの管理"
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

      <Tabs value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
        <TabsList>
          <TabsTrigger value="expense">支出</TabsTrigger>
          <TabsTrigger value="income">収入</TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="text-xs leading-relaxed text-muted">
        すでに使われているカテゴリや初期カテゴリは、記録を守るため削除できません。
        使わないものは「非表示」にすると入力画面に出なくなります。
      </p>

      <Card className="p-0">
        <ul className="divide-y divide-border">
          {categories.map((category, index) => {
            const count = usageCount(category.id);
            const deletable = !category.isSystem && count === 0;
            return (
              <li key={category.id} className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: `${category.color}22` }}
                >
                  {category.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-semibold', category.isHidden && 'text-muted')}>
                    {category.name}
                    {category.isHidden ? '（非表示）' : ''}
                  </span>
                  <span className="block text-xs text-muted">
                    {count > 0 ? `${count}件で使用中` : '未使用'}
                    {category.isSystem ? '・初期カテゴリ' : ''}
                  </span>
                </span>

                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label="上へ移動"
                    disabled={index === 0 || busy}
                    onClick={() => move(category, -1)}
                    className="rounded-lg p-2 text-muted disabled:opacity-30"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="下へ移動"
                    disabled={index === categories.length - 1 || busy}
                    onClick={() => move(category, 1)}
                    className="rounded-lg p-2 text-muted disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={category.isHidden ? '表示に戻す' : '非表示にする'}
                    disabled={busy}
                    onClick={() => toggleHidden(category)}
                    className="rounded-lg p-2 text-muted"
                  >
                    {category.isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    type="button"
                    aria-label="編集"
                    disabled={busy}
                    onClick={() => {
                      setEditTarget(category);
                      setFormOpen(true);
                    }}
                    className="rounded-lg p-2 text-muted"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="削除"
                    disabled={!deletable || busy}
                    onClick={() => setDeleteTarget(category)}
                    className="rounded-lg p-2 text-danger disabled:opacity-25"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent title={editTarget ? 'カテゴリを編集' : 'カテゴリを追加'}>
          <CategoryForm
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
        title="このカテゴリを削除しますか？"
        description={
          deleteTarget ? (
            <>
              <p>「{deleteTarget.name}」を削除します。</p>
              <p className="mt-2 text-muted">
                このカテゴリを使った記録はありません。削除しても既存のデータには影響しません。
              </p>
            </>
          ) : (
            ''
          )
        }
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}

function CategoryForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: Category | null;
  onSubmit: (values: { name: string; icon: string; color: string }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [icon, setIcon] = React.useState(initial?.icon ?? '📦');
  const [color, setColor] = React.useState(initial?.color ?? '#9aa0a6');
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateText(name, 'カテゴリ名', { required: true, max: 20 });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onSubmit({ name: name.trim(), icon, color });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {initial?.isSystem ? (
        <p className="rounded-xl bg-surface-muted p-3 text-xs text-muted">
          初期カテゴリです。名前・アイコン・色は変更できますが、削除はできません。
        </p>
      ) : null}
      <Field label="カテゴリ名" htmlFor="cat-name" error={error ?? undefined}>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-semibold">アイコン</p>
        <div className="grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto">
          {ICON_CHOICES.map((i) => (
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
          {COLOR_CHOICES.map((c) => (
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

      <div className="flex items-center gap-2 rounded-xl bg-surface-muted p-3">
        <span
          className="flex size-10 items-center justify-center rounded-lg text-xl"
          style={{ backgroundColor: `${color}22` }}
        >
          {icon}
        </span>
        <span className="font-semibold">{name || 'プレビュー'}</span>
        <Badge>表示例</Badge>
      </div>

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
