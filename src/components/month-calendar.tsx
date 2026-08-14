'use client';

import * as React from 'react';
import { datesInPeriod, formatMonthDay, parseYmd, weekdayIndex, type MonthPeriod } from '@/lib/date';
import { formatYen, formatYenCompact } from '@/lib/money';
import type { Transaction } from '@/lib/types';
import { cn } from '@/lib/utils';

const WEEK_HEADERS = ['日', '月', '火', '水', '木', '金', '土'];

interface DayCell {
  date: string;
  day: number;
  expenseYen: number;
  incomeYen: number;
  count: number;
}

/**
 * 集計期間のカレンダー。どの日にいくら使ったかを一目で確認できるようにする。
 * 月の開始日が1日以外でも正しく並ぶよう、暦月ではなく集計期間の範囲を描く。
 */
export function MonthCalendar({
  period,
  transactions,
  today,
  selectedDate,
  onSelectDate,
}: {
  period: MonthPeriod;
  /** 集計期間内に絞り込み済みの取引 */
  transactions: readonly Transaction[];
  today: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const cells = React.useMemo<DayCell[]>(() => {
    const byDate = new Map<string, DayCell>();
    for (const date of datesInPeriod(period)) {
      byDate.set(date, { date, day: parseYmd(date).day, expenseYen: 0, incomeYen: 0, count: 0 });
    }
    for (const t of transactions) {
      const cell = byDate.get(t.occurredOn);
      if (!cell) continue;
      if (t.type === 'income') cell.incomeYen += t.amountYen;
      else cell.expenseYen += t.amountYen;
      cell.count += 1;
    }
    return [...byDate.values()];
  }, [period, transactions]);

  const leadingBlanks = cells.length > 0 ? weekdayIndex(cells[0].date) : 0;
  const trailingBlanks = (7 - ((leadingBlanks + cells.length) % 7)) % 7;

  const maxExpense = Math.max(1, ...cells.map((c) => c.expenseYen));
  const selected = selectedDate ? cells.find((c) => c.date === selectedDate) ?? null : null;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_HEADERS.map((label, i) => (
          <div
            key={label}
            aria-hidden
            className={cn(
              'pb-1 text-center text-[11px] font-bold',
              i === 0 ? 'text-danger' : i === 6 ? 'text-info' : 'text-muted',
            )}
          >
            {label}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`lead-${i}`} aria-hidden />
        ))}

        {cells.map((cell) => {
          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDate;
          const weekday = weekdayIndex(cell.date);
          // 使った額の多い日ほど背景を濃くして、山になっている日が目で分かるようにする
          const intensity = cell.expenseYen > 0 ? 0.1 + (cell.expenseYen / maxExpense) * 0.35 : 0;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : cell.date)}
              aria-pressed={isSelected}
              aria-label={`${formatMonthDay(cell.date)} 支出 ${formatYen(cell.expenseYen)}${
                cell.incomeYen > 0 ? ` 収入 ${formatYen(cell.incomeYen)}` : ''
              }`}
              className={cn(
                'flex min-h-14 flex-col items-center rounded-lg border px-0.5 py-1 transition-colors',
                isSelected ? 'border-primary bg-primary-soft' : 'border-transparent',
                isToday && !isSelected ? 'border-primary/50' : '',
              )}
              style={
                !isSelected && intensity > 0
                  ? { backgroundColor: `color-mix(in srgb, var(--color-primary) ${intensity * 100}%, transparent)` }
                  : undefined
              }
            >
              <span
                className={cn(
                  'tabular text-[11px] font-bold leading-tight',
                  isToday ? 'text-primary' : weekday === 0 ? 'text-danger' : weekday === 6 ? 'text-info' : '',
                )}
              >
                {cell.day}
              </span>
              {cell.expenseYen > 0 ? (
                <span className="tabular w-full truncate text-center text-[9px] font-semibold leading-tight">
                  {formatYenCompact(cell.expenseYen)}
                </span>
              ) : null}
              {cell.incomeYen > 0 ? (
                <span className="tabular w-full truncate text-center text-[9px] font-semibold leading-tight text-success">
                  +{formatYenCompact(cell.incomeYen)}
                </span>
              ) : null}
            </button>
          );
        })}

        {Array.from({ length: trailingBlanks }, (_, i) => (
          <div key={`trail-${i}`} aria-hidden />
        ))}
      </div>

      <p className="mt-2 text-center text-xs text-muted" aria-live="polite">
        {selected ? (
          <>
            <span className="font-semibold text-foreground">{formatMonthDay(selected.date)}</span>
            {'：'}
            {selected.count === 0
              ? '記録はありません'
              : `支出 ${formatYen(selected.expenseYen)}${
                  selected.incomeYen > 0 ? `・収入 ${formatYen(selected.incomeYen)}` : ''
                }（${selected.count}件）`}
            {'　'}
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="font-semibold text-primary underline"
            >
              解除
            </button>
          </>
        ) : (
          '日付をタップすると、その日の記録だけを表示します。'
        )}
      </p>
    </div>
  );
}
