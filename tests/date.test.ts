import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthKey,
  addMonths,
  datesInPeriod,
  diffDays,
  elapsedDaysInPeriod,
  formatMonthDay,
  monthKeyOf,
  monthPeriod,
  normalizeMonthStartDay,
  todayJst,
  weekdayIndex,
  weekdayJa,
} from '@/lib/date';

describe('日付の基本計算', () => {
  it('日数の加算が月をまたいでも正しい', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('うるう年を正しく扱う', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('月の加算で月末が丸められる', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('日数の差を求められる', () => {
    expect(diffDays('2026-08-20', '2026-08-14')).toBe(6);
    expect(diffDays('2026-08-14', '2026-08-20')).toBe(-6);
  });

  it('曜日を日本語で返す', () => {
    expect(weekdayJa('2026-08-14')).toBe('金');
    expect(formatMonthDay('2026-08-14')).toBe('8月14日(金)');
  });

  it('曜日番号は日曜が0、土曜が6', () => {
    expect(weekdayIndex('2026-08-16')).toBe(0); // 日
    expect(weekdayIndex('2026-08-14')).toBe(5); // 金
    expect(weekdayIndex('2026-08-15')).toBe(6); // 土
  });
});

describe('カレンダー用の日付の列挙', () => {
  it('期間の日付をすべて古い順に返す', () => {
    const days = datesInPeriod(monthPeriod({ year: 2026, month: 8 }, 1));
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-08-01');
    expect(days[30]).toBe('2026-08-31');
  });

  it('月の開始日が25日でも月をまたいで連続する', () => {
    const days = datesInPeriod(monthPeriod({ year: 2026, month: 8 }, 25));
    expect(days[0]).toBe('2026-08-25');
    expect(days[days.length - 1]).toBe('2026-09-24');
    expect(days).toHaveLength(31);
  });

  it('うるう年の2月も正しく列挙する', () => {
    expect(datesInPeriod(monthPeriod({ year: 2028, month: 2 }, 1))).toHaveLength(29);
  });
});

describe('日本時間の今日', () => {
  it('UTC で日付が変わる時間帯でも日本時間の日付を返す', () => {
    // 2026-08-13 20:00 UTC = 2026-08-14 05:00 JST
    expect(todayJst(new Date('2026-08-13T20:00:00Z'))).toBe('2026-08-14');
    // 2026-08-14 14:00 UTC = 2026-08-14 23:00 JST
    expect(todayJst(new Date('2026-08-14T14:00:00Z'))).toBe('2026-08-14');
    // 2026-08-14 15:00 UTC = 2026-08-15 00:00 JST
    expect(todayJst(new Date('2026-08-14T15:00:00Z'))).toBe('2026-08-15');
  });
});

describe('月の集計期間', () => {
  it('月の開始日が1日なら暦月と一致する', () => {
    const period = monthPeriod({ year: 2026, month: 8 }, 1);
    expect(period.start).toBe('2026-08-01');
    expect(period.end).toBe('2026-08-31');
    expect(period.endExclusive).toBe('2026-09-01');
    expect(period.days).toBe(31);
  });

  it('月の開始日が25日なら 8/25〜9/24 が「2026年8月」になる', () => {
    const period = monthPeriod({ year: 2026, month: 8 }, 25);
    expect(period.start).toBe('2026-08-25');
    expect(period.end).toBe('2026-09-24');
    expect(period.days).toBe(31);
  });

  it('日付がどの月に属するかを開始日から判定する', () => {
    expect(monthKeyOf('2026-09-10', 25)).toEqual({ year: 2026, month: 8 });
    expect(monthKeyOf('2026-09-25', 25)).toEqual({ year: 2026, month: 9 });
    expect(monthKeyOf('2026-09-10', 1)).toEqual({ year: 2026, month: 9 });
  });

  it('1月の前月は前年の12月', () => {
    expect(addMonthKey({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonthKey({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('月の開始日は1〜28に丸める（存在しない日を避けるため）', () => {
    expect(normalizeMonthStartDay(0)).toBe(1);
    expect(normalizeMonthStartDay(31)).toBe(28);
    expect(normalizeMonthStartDay(15)).toBe(15);
  });

  it('2月始まりでも期間が途切れない', () => {
    const feb = monthPeriod({ year: 2026, month: 2 }, 28);
    expect(feb.start).toBe('2026-02-28');
    expect(feb.endExclusive).toBe('2026-03-28');
  });

  it('経過日数は期間内に収まる', () => {
    const period = monthPeriod({ year: 2026, month: 8 }, 1);
    expect(elapsedDaysInPeriod(period, '2026-08-01')).toBe(1);
    expect(elapsedDaysInPeriod(period, '2026-08-14')).toBe(14);
    expect(elapsedDaysInPeriod(period, '2026-09-30')).toBe(31);
    expect(elapsedDaysInPeriod(period, '2026-07-01')).toBe(0);
  });
});
