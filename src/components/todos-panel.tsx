'use client';

import * as React from 'react';
import { Archive, CalendarClock, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge, EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { diffDays, formatMonthDay } from '@/lib/date';
import { validateText } from '@/lib/validation';
import type { Todo, TodoCategory, TodoPriority } from '@/lib/types';
import { cn } from '@/lib/utils';

const CATEGORY_LABEL: Record<TodoCategory, string> = {
  shopping: '買い物',
  payment: '支払い',
  procedure: '手続き',
  other: 'その他',
};

const PRIORITY_LABEL: Record<TodoPriority, string> = {
  high: '高',
  normal: '中',
  low: '低',
};

/** 完了から30日たったTodoはアーカイブの対象にする */
const ARCHIVE_AFTER_DAYS = 30;

type FilterKind = 'open' | 'done' | 'overdue';

export function TodosPanel() {
  const { data, me, backend, run, busy, today, isShared, memberName } = useHousehold();
  const toast = useToast();
  const [filter, setFilter] = React.useState<FilterKind>('open');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Todo | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Todo | null>(null);

  const todos = React.useMemo(() => {
    const rows = data.todos.filter((t) => !t.archivedAt);
    const filtered = rows.filter((t) => {
      if (filter === 'open') return !t.done;
      if (filter === 'done') return t.done;
      return !t.done && t.dueOn !== null && t.dueOn < today;
    });
    return filtered.sort((a, b) => {
      const da = a.dueOn ?? '9999-12-31';
      const db = b.dueOn ?? '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      const order: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
  }, [data.todos, filter, today]);

  const archivable = data.todos.filter(
    (t) => t.done && !t.archivedAt && t.doneAt && diffDays(today, t.doneAt.slice(0, 10)) >= ARCHIVE_AFTER_DAYS,
  );

  const toggle = async (todo: Todo) => {
    if (!backend) return;
    await run(() =>
      backend.update('todos', todo.id, {
        done: !todo.done,
        doneAt: todo.done ? null : new Date().toISOString(),
      }),
    );
  };

  const remove = async () => {
    if (!deleteTarget || !backend) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await run(() => backend.remove('todos', target.id), { success: 'Todoを削除しました' });
  };

  const archiveDone = async () => {
    if (!backend) return;
    await run(
      async () => {
        for (const t of archivable) {
          await backend.update('todos', t.id, { archivedAt: new Date().toISOString() });
        }
      },
      { success: `${archivable.length}件をアーカイブしました` },
    );
  };

  const save = async (values: TodoFormValues) => {
    if (!backend) return;
    const target = editTarget;
    const result = await run(
      async () => {
        if (target) {
          await backend.update('todos', target.id, values);
        } else {
          await backend.create('todos', {
            householdId: data.household.id,
            ...values,
            done: false,
            doneAt: null,
            createdBy: me.id,
            archivedAt: null,
          });
        }
      },
      { success: target ? 'Todoを更新しました' : 'Todoを追加しました' },
    );
    if (result !== null) {
      setFormOpen(false);
      setEditTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 gap-1 rounded-xl bg-surface-muted p-1">
          {(
            [
              ['open', '未完了'],
              ['done', '完了'],
              ['overdue', '期限切れ'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-sm font-semibold transition-colors',
                filter === key ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          size="icon"
          aria-label="Todoを追加"
          onClick={() => {
            setEditTarget(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-6" />
        </Button>
      </div>

      {archivable.length > 0 ? (
        <Card className="flex items-center justify-between gap-3 bg-surface-muted">
          <p className="min-w-0 flex-1 text-sm">
            完了から{ARCHIVE_AFTER_DAYS}日たったTodoが{archivable.length}件あります。
          </p>
          <Button size="sm" variant="outline" onClick={archiveDone} disabled={busy}>
            <Archive className="size-4" />
            片付ける
          </Button>
        </Card>
      ) : null}

      {todos.length === 0 ? (
        <EmptyState
          title={
            filter === 'open'
              ? '未完了のTodoはありません'
              : filter === 'done'
                ? '完了したTodoはありません'
                : '期限切れのTodoはありません'
          }
          description={filter === 'open' ? '買い物や支払いの予定を書いておけます。' : undefined}
          action={
            filter === 'open' ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditTarget(null);
                  setFormOpen(true);
                }}
              >
                Todoを追加
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => {
            const overdue = !todo.done && todo.dueOn !== null && todo.dueOn < today;
            return (
              <li key={todo.id}>
                <Card className={cn('flex items-start gap-3 p-3', overdue && 'border-danger/40')}>
                  <button
                    type="button"
                    onClick={() => toggle(todo)}
                    disabled={busy}
                    aria-label={todo.done ? '未完了に戻す' : '完了にする'}
                    aria-pressed={todo.done}
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                      todo.done ? 'border-primary bg-primary text-on-primary' : 'border-border',
                    )}
                  >
                    {todo.done ? <Check className="size-4" strokeWidth={3} /> : null}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold', todo.done && 'text-muted line-through')}>
                      {todo.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {todo.dueOn ? (
                        <span className={overdue ? 'font-bold text-danger' : ''}>
                          <CalendarClock className="mr-0.5 inline size-3" />
                          {formatMonthDay(todo.dueOn)}
                          {overdue ? '（期限切れ）' : ''}
                        </span>
                      ) : null}
                      <Badge>{CATEGORY_LABEL[todo.category]}</Badge>
                      {todo.priority !== 'normal' ? (
                        <Badge tone={todo.priority === 'high' ? 'danger' : 'neutral'}>
                          優先度{PRIORITY_LABEL[todo.priority]}
                        </Badge>
                      ) : null}
                      {isShared ? (
                        <span>
                          担当:{' '}
                          {todo.assignBoth
                            ? '2人'
                            : todo.assigneeUserId
                              ? memberName(todo.assigneeUserId)
                              : '未定'}
                        </span>
                      ) : null}
                    </div>
                    {todo.memo ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{todo.memo}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      aria-label="編集"
                      className="rounded-lg p-2 text-muted active:bg-surface-muted"
                      onClick={() => {
                        setEditTarget(todo);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="削除"
                      className="rounded-lg p-2 text-danger active:bg-surface-muted"
                      onClick={() => setDeleteTarget(todo)}
                    >
                      <Trash2 className="size-4" />
                    </button>
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
        <DialogContent title={editTarget ? 'Todoを編集' : 'Todoを追加'}>
          <TodoForm
            initial={editTarget}
            onSubmit={save}
            onCancel={() => {
              setFormOpen(false);
              setEditTarget(null);
            }}
            busy={busy}
            onInvalid={(message) => toast.show(message, { tone: 'error' })}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="このTodoを削除しますか？"
        description={deleteTarget ? `「${deleteTarget.title}」を削除します。` : ''}
        onConfirm={remove}
        busy={busy}
      />
    </div>
  );
}

interface TodoFormValues {
  title: string;
  assigneeUserId: string | null;
  assignBoth: boolean;
  dueOn: string | null;
  priority: TodoPriority;
  category: TodoCategory;
  memo: string;
  linkType: Todo['linkType'];
  linkId: string | null;
}

function TodoForm({
  initial,
  onSubmit,
  onCancel,
  busy,
  onInvalid,
}: {
  initial: Todo | null;
  onSubmit: (values: TodoFormValues) => void;
  onCancel: () => void;
  busy: boolean;
  onInvalid: (message: string) => void;
}) {
  const { data, isShared } = useHousehold();
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [assignee, setAssignee] = React.useState(
    initial?.assignBoth ? 'both' : (initial?.assigneeUserId ?? ''),
  );
  const [dueOn, setDueOn] = React.useState(initial?.dueOn ?? '');
  const [priority, setPriority] = React.useState<TodoPriority>(initial?.priority ?? 'normal');
  const [category, setCategory] = React.useState<TodoCategory>(initial?.category ?? 'other');
  const [memo, setMemo] = React.useState(initial?.memo ?? '');
  const [linkGoalId, setLinkGoalId] = React.useState(
    initial?.linkType === 'savings_goal' ? (initial.linkId ?? '') : '',
  );
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateText(title, 'やること', { required: true, max: 100 });
    if (err) {
      setError(err);
      onInvalid(err);
      return;
    }
    setError(null);
    onSubmit({
      title: title.trim(),
      assignBoth: assignee === 'both',
      assigneeUserId: assignee === 'both' || assignee === '' ? null : assignee,
      dueOn: dueOn || null,
      priority,
      category,
      memo: memo.trim(),
      linkType: linkGoalId ? 'savings_goal' : null,
      linkId: linkGoalId || null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="やること" htmlFor="todo-title" error={error ?? undefined}>
        <Input
          id="todo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="米を買う、電気代を払う など"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="期限" htmlFor="todo-due">
          <Input id="todo-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
        <Field label="優先度" htmlFor="todo-priority">
          <Select
            id="todo-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
          >
            <option value="high">高</option>
            <option value="normal">中</option>
            <option value="low">低</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="カテゴリ" htmlFor="todo-category">
          <Select
            id="todo-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TodoCategory)}
          >
            <option value="shopping">買い物</option>
            <option value="payment">支払い</option>
            <option value="procedure">手続き</option>
            <option value="other">その他</option>
          </Select>
        </Field>
        {isShared ? (
          <Field label="担当者" htmlFor="todo-assignee">
            <Select id="todo-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">未定</option>
              {data.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
              <option value="both">2人</option>
            </Select>
          </Field>
        ) : null}
      </div>

      {data.savingsGoals.length > 0 ? (
        <Field label="貯金目標との関連付け" htmlFor="todo-goal">
          <Select id="todo-goal" value={linkGoalId} onChange={(e) => setLinkGoalId(e.target.value)}>
            <option value="">関連付けない</option>
            {data.savingsGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icon} {g.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="メモ" htmlFor="todo-memo">
        <Textarea
          id="todo-memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="block" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button type="submit" size="block" disabled={busy}>
          {busy ? '保存中…' : '保存する'}
        </Button>
      </div>
    </form>
  );
}
