'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Delete } from 'lucide-react';
import { useHousehold } from '@/components/app-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FieldError, Input, Select, Textarea } from '@/components/ui/field';
import { addDays, diffDays, todayJst } from '@/lib/date';
import { formatYen } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethod, type ShareScope, type Transaction, type TxType } from '@/lib/types';
import { validateTransaction } from '@/lib/validation';
import { SAVINGS_CATEGORY_NAME } from '@/lib/categories';
import { STORAGE_KEYS, readLocal, writeLocal } from '@/lib/settings';
import { cn } from '@/lib/utils';

interface FormState {
  type: TxType;
  amount: string;
  categoryId: string;
  description: string;
  occurredOn: string;
  /** SHARED_PAYER_VALUE のときは「共有（家計から）」= 保存時は null にする */
  paidBy: string;
  shareScope: ShareScope;
  paymentMethod: PaymentMethod;
  memo: string;
  savingsGoalId: string;
}

/** select は値に null を持てないため、画面上だけで使う「共有」を表す値 */
const SHARED_PAYER_VALUE = '__shared__';

export function TransactionForm({
  mode,
  initial,
  transactionId,
  /**
   * 保存したあとの動き。
   *  'navigate' : 一覧（編集時は詳細）へ移動する
   *  'stay'     : 入力画面に留まり、続けて登録できるようにする（入力タブ用）
   */
  afterSave = 'navigate',
  onSaved,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<Transaction>;
  transactionId?: string;
  afterSave?: 'navigate' | 'stay';
  onSaved?: (id: string) => void;
}) {
  const { data, me, isShared, backend, run, busy, today, memberName } = useHousehold();
  const router = useRouter();

  const expenseCategories = React.useMemo(
    () => data.categories.filter((c) => c.kind === 'expense' && (!c.isHidden || c.id === initial?.categoryId)),
    [data.categories, initial?.categoryId],
  );
  const incomeCategories = React.useMemo(
    () => data.categories.filter((c) => c.kind === 'income' && (!c.isHidden || c.id === initial?.categoryId)),
    [data.categories, initial?.categoryId],
  );

  const [state, setState] = React.useState<FormState>(() => ({
    type: initial?.type ?? 'expense',
    amount: initial?.amountYen ? String(initial.amountYen) : '',
    categoryId: initial?.categoryId ?? '',
    description: initial?.description ?? '',
    occurredOn: initial?.occurredOn ?? today ?? todayJst(),
    paidBy:
      (initial?.type ?? 'expense') === 'expense' && (initial?.shareScope ?? 'shared') === 'shared'
        ? SHARED_PAYER_VALUE
        : (initial?.paidBy ?? me.id),
    shareScope: initial?.shareScope ?? 'shared',
    paymentMethod: initial?.paymentMethod ?? readLocal<PaymentMethod>('kakeibo:last-payment', '現金'),
    memo: initial?.memo ?? '',
    savingsGoalId: initial?.savingsGoalId ?? '',
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const categories = state.type === 'expense' ? expenseCategories : incomeCategories;

  // よく使うカテゴリ = 直近60日で登録回数が多いもの
  const frequentCategories = React.useMemo(() => {
    const since = addDays(today, -60);
    const counts = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.type !== state.type) continue;
      if (diffDays(t.occurredOn, since) < 0) continue;
      counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    const pinned = readLocal<string[]>(STORAGE_KEYS.favoriteCategories, []);
    const sorted = [...categories].sort((a, b) => {
      const pa = pinned.indexOf(a.id);
      const pb = pinned.indexOf(b.id);
      if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.sortOrder - b.sortOrder;
    });
    return sorted.slice(0, 8);
  }, [data.transactions, categories, state.type, today]);

  const amountYen = state.amount === '' ? null : Number(state.amount);
  const savingsCategory = data.categories.find(
    (c) => c.kind === 'expense' && c.name === SAVINGS_CATEGORY_NAME,
  );
  const isSavingsCategory = state.categoryId !== '' && state.categoryId === savingsCategory?.id;
  const visibleGoals = data.savingsGoals.filter(
    (g) => g.status === 'active' || g.id === initial?.savingsGoalId,
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * 「家計から出したお金」として扱うのは支出の共有だけ。
   * 収入は誰の収入かが分かるように、共有でも人を選べるようにする。
   */
  const isHouseholdPayment = (type: TxType, scope: ShareScope) =>
    type === 'expense' && scope === 'shared';

  const payerLabel = state.type === 'income' ? '受け取った人' : '支払った人';

  const pressKey = (key: string) => {
    setState((prev) => {
      if (key === 'back') return { ...prev, amount: prev.amount.slice(0, -1) };
      if (key === 'clear') return { ...prev, amount: '' };
      const next = (prev.amount + key).replace(/^0+(?=\d)/, '');
      if (next.length > 10) return prev;
      return { ...prev, amount: next };
    });
  };

  const onSubmit = async () => {
    if (submitting || busy || !backend) return;

    const input = {
      type: state.type,
      amountYen: amountYen ?? 0,
      categoryId: state.categoryId,
      description: state.description.trim(),
      occurredOn: state.occurredOn,
      // 支出の共有だけ「誰の支払いでもない」= null として保存する
      paidBy: isHouseholdPayment(state.type, state.shareScope) ? null : state.paidBy,
      shareScope: state.shareScope,
      paymentMethod: state.paymentMethod,
      memo: state.memo.trim(),
      savingsGoalId: state.savingsGoalId || null,
      receiptPath: null,
    };

    const result = validateTransaction(input);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const saved = await run(
      async () => {
        if (mode === 'edit' && transactionId) {
          await backend.update('transactions', transactionId, { ...input, updatedBy: me.id });
          return transactionId;
        }
        const created = await backend.create('transactions', {
          ...input,
          householdId: data.household.id,
          createdBy: me.id,
          updatedBy: me.id,
        });
        // 貯金カテゴリで目標を選んだ場合は入金として、それ以外の支出は取り崩しとして記録する
        if (input.savingsGoalId) {
          const signed = isSavingsCategory ? input.amountYen : -input.amountYen;
          await backend.create('savings_entries', {
            goalId: input.savingsGoalId,
            householdId: data.household.id,
            amountYen: signed,
            occurredOn: input.occurredOn,
            userId: me.id,
            memo: input.description || '家計簿から自動記録',
            transactionId: created.id,
          });
        }
        return created.id;
      },
      { success: mode === 'edit' ? '変更を保存しました' : '登録しました' },
    );

    setSubmitting(false);
    if (saved === null) return;

    writeLocal('kakeibo:last-payment', state.paymentMethod);
    onSaved?.(saved);

    if (afterSave === 'stay') {
      // 続けて入力しやすいように、金額と内容だけを消して他の設定は残す
      setState((prev) => ({
        ...prev,
        amount: '',
        description: '',
        memo: '',
        savingsGoalId: '',
        occurredOn: today ?? todayJst(),
      }));
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    router.push(mode === 'edit' ? `/expenses/${transactionId}` : '/expenses');
  };

  const disabled = submitting || busy;

  return (
    <div className="space-y-4 pb-4">
      {/* 種別 */}
      <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setState((prev) => ({
                ...prev,
                type: t,
                categoryId: '',
                // 収入は共有でも人を選ぶ／支出の共有は家計扱いに戻す
                paidBy: isHouseholdPayment(t, prev.shareScope)
                  ? SHARED_PAYER_VALUE
                  : prev.paidBy === SHARED_PAYER_VALUE
                    ? me.id
                    : prev.paidBy,
              }));
            }}
            aria-pressed={state.type === t}
            className={cn(
              'flex-1 rounded-lg py-2.5 text-base font-bold transition-colors',
              state.type === t ? 'bg-surface text-foreground shadow-sm' : 'text-muted',
            )}
          >
            {t === 'expense' ? '支出' : '収入'}
          </button>
        ))}
      </div>

      {/* 金額（最優先） */}
      <Card className="p-4">
        <p className="text-sm font-semibold text-muted">金額</p>
        <p
          className={cn(
            'tabular mt-1 text-right text-4xl font-bold',
            amountYen === null ? 'text-muted' : '',
          )}
          aria-live="polite"
        >
          {amountYen === null ? '¥0' : formatYen(amountYen)}
        </p>
        <FieldError message={errors.amountYen} />

        <div className="mt-3 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => pressKey(k)}
              className="h-14 rounded-xl bg-surface-muted text-2xl font-bold active:bg-border"
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pressKey('back')}
            onDoubleClick={() => pressKey('clear')}
            aria-label="1文字消す（ダブルタップで全消去）"
            className="flex h-14 items-center justify-center rounded-xl bg-surface-muted active:bg-border"
          >
            <Delete className="size-6" />
          </button>
        </div>
      </Card>

      {/* よく使うカテゴリ */}
      <Card>
        <p className="mb-2 text-sm font-semibold">
          カテゴリ
          {errors.categoryId ? <span className="ml-2 text-danger">{errors.categoryId}</span> : null}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {frequentCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setField('categoryId', c.id)}
              aria-label={c.name}
              aria-pressed={state.categoryId === c.id}
              className={cn(
                'flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border p-1 text-center transition-colors',
                state.categoryId === c.id
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface',
              )}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="w-full truncate px-0.5 text-[11px] font-semibold leading-tight">
                {c.name}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Select
            aria-label="すべてのカテゴリから選ぶ"
            value={state.categoryId}
            onChange={(e) => setField('categoryId', e.target.value)}
          >
            <option value="">すべてのカテゴリから選ぶ…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* 内容 */}
      <Card>
        <Field label="内容・店名" htmlFor="description" error={errors.description}>
          <Input
            id="description"
            value={state.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="スーパー、ランチ など"
            maxLength={100}
          />
        </Field>
      </Card>

      {/* 詳細（日付・支払方法など） */}
      <Card className="space-y-4">
          <Field label="日付" htmlFor="occurredOn" error={errors.occurredOn}>
            <Input
              id="occurredOn"
              type="date"
              value={state.occurredOn}
              onChange={(e) => setField('occurredOn', e.target.value)}
            />
          </Field>

          <Field label="区分" htmlFor="shareScope">
            <Select
              id="shareScope"
              value={state.shareScope}
              onChange={(e) => {
                const next = e.target.value as ShareScope;
                setState((prev) => ({
                  ...prev,
                  shareScope: next,
                  paidBy: isHouseholdPayment(prev.type, next) ? SHARED_PAYER_VALUE : me.id,
                }));
              }}
            >
              <option value="shared">
                {state.type === 'income' ? '共有（家計の収入）' : '共有（家計の支出）'}
              </option>
              <option value="personal">
                {state.type === 'income' ? '個人（自分の収入）' : '個人（自分の支出）'}
              </option>
            </Select>
          </Field>

          {isShared ? (
            <Field
              label={payerLabel}
              htmlFor="paidBy"
              error={errors.paidBy}
              hint={
                isHouseholdPayment(state.type, state.shareScope)
                  ? '共有の支出は家計から出したものとして記録します。どちらか個人の支出には加算されません。'
                  : state.type === 'income'
                    ? '共有の収入でも、誰の収入かは記録します。'
                    : undefined
              }
            >
              <Select
                id="paidBy"
                value={state.paidBy}
                disabled={isHouseholdPayment(state.type, state.shareScope)}
                onChange={(e) => setField('paidBy', e.target.value)}
              >
                {isHouseholdPayment(state.type, state.shareScope) ? (
                  <option value={SHARED_PAYER_VALUE}>共有（家計から）</option>
                ) : (
                  data.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {memberName(m.userId)}
                    </option>
                  ))
                )}
              </Select>
            </Field>
          ) : null}

          <Field label="支払方法" htmlFor="paymentMethod">
            <Select
              id="paymentMethod"
              value={state.paymentMethod}
              onChange={(e) => setField('paymentMethod', e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>

          {visibleGoals.length > 0 ? (
            <Field
              label="貯金目標との関連付け"
              htmlFor="savingsGoalId"
              hint={
                state.savingsGoalId
                  ? isSavingsCategory
                    ? 'この目標に「入金」として記録されます。'
                    : 'この目標から「取り崩し」として記録されます。'
                  : '選ぶと貯金目標の残高にも反映されます。'
              }
            >
              <Select
                id="savingsGoalId"
                value={state.savingsGoalId}
                onChange={(e) => setField('savingsGoalId', e.target.value)}
                disabled={mode === 'edit'}
              >
                <option value="">関連付けない</option>
                {visibleGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icon} {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="メモ" htmlFor="memo" error={errors.memo}>
            <Textarea
              id="memo"
              value={state.memo}
              onChange={(e) => setField('memo', e.target.value)}
              maxLength={500}
              placeholder="任意"
            />
          </Field>

          <p className="text-xs text-muted">
            レシート画像の添付は今後のバージョンで対応予定です。
          </p>
      </Card>

      <div className="flex gap-2">
        {afterSave === 'stay' ? (
          <Button
            variant="ghost"
            size="block"
            onClick={() => {
              setState((prev) => ({ ...prev, amount: '', description: '', memo: '' }));
              setErrors({});
            }}
            disabled={disabled}
          >
            入力を消す
          </Button>
        ) : (
          <Button variant="ghost" size="block" onClick={() => router.back()} disabled={disabled}>
            キャンセル
          </Button>
        )}
        <Button size="block" onClick={onSubmit} disabled={disabled}>
          {disabled ? '保存中…' : mode === 'edit' ? '変更を保存' : '保存する'}
        </Button>
      </div>

      {mode === 'create' ? (
        <p className="text-center text-xs text-muted">
          保存すると、ホームの残り予算とグラフにすぐ反映されます。
        </p>
      ) : null}
    </div>
  );
}
