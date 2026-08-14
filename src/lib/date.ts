/**
 * 日付ユーティリティ（日本時間 / JST 固定）
 *
 * 方針:
 *  - 日付は必ず 'YYYY-MM-DD' の文字列で扱う（DB の date 型と 1:1）
 *  - 計算はすべて整数の暦算（days-from-civil）で行い、Date オブジェクトのタイムゾーン差に依存しない
 *  - 「今日」を求めるときだけ Intl で Asia/Tokyo を明示する
 */

export const TIME_ZONE = 'Asia/Tokyo';

/** 'YYYY-MM-DD' 形式の日付文字列 */
export type Ymd = string;

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export interface MonthKey {
  year: number;
  /** 1-12 */
  month: number;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(value: unknown): value is Ymd {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const c = parseYmd(value);
  if (c.month < 1 || c.month > 12) return false;
  // 2026-02-30 のように暦上存在しない日を弾く
  return c.day >= 1 && c.day <= daysInMonth(c.year, c.month);
}

export function parseYmd(value: Ymd): CivilDate {
  const m = YMD_RE.exec(value);
  if (!m) throw new Error(`日付の形式が正しくありません: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function formatYmd(c: CivilDate): Ymd {
  const mm = String(c.month).padStart(2, '0');
  const dd = String(c.day).padStart(2, '0');
  return `${c.year}-${mm}-${dd}`;
}

/** Howard Hinnant の days_from_civil。1970-01-01 からの通算日数を返す。 */
export function toEpochDay(c: CivilDate): number {
  const y = c.month <= 2 ? c.year - 1 : c.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (c.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + c.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** toEpochDay の逆変換。 */
export function fromEpochDay(epochDay: number): CivilDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

export function addDays(date: Ymd, days: number): Ymd {
  return formatYmd(fromEpochDay(toEpochDay(parseYmd(date)) + days));
}

/** date1 - date2 を日数で返す。 */
export function diffDays(date1: Ymd, date2: Ymd): number {
  return toEpochDay(parseYmd(date1)) - toEpochDay(parseYmd(date2));
}

export function daysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
  return days[month - 1];
}

/** 月を加算する。日が月末を超える場合は月末に丸める（1/31 + 1ヶ月 = 2/28）。 */
export function addMonths(date: Ymd, months: number): Ymd {
  const c = parseYmd(date);
  const total = c.year * 12 + (c.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(c.day, daysInMonth(year, month));
  return formatYmd({ year, month, day });
}

/** 日本時間の「今日」を 'YYYY-MM-DD' で返す。 */
export function todayJst(now: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA は YYYY-MM-DD 形式
}

/** 日本時間の現在時刻を 'YYYY-MM-DD HH:mm' で返す。 */
export function formatDateTimeJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return f.format(d).replace(/\//g, '/');
}

/** ISO日時を「たった今 / 3分前 / 昨日 10:20」のような日本語表記にする。 */
export function formatRelativeJst(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;
  return formatDateTimeJst(iso);
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 曜日の番号。0=日曜, 6=土曜 */
export function weekdayIndex(date: Ymd): number {
  // 1970-01-01 は木曜日
  return (((toEpochDay(parseYmd(date)) + 4) % 7) + 7) % 7;
}

export function weekdayJa(date: Ymd): string {
  return WEEKDAYS[weekdayIndex(date)];
}

/** 期間に含まれる日付を古い順に列挙する。 */
export function datesInPeriod(period: { start: Ymd; endExclusive: Ymd }): Ymd[] {
  const days: Ymd[] = [];
  let cursor = period.start;
  // 上限を設けて、万一 endExclusive が不正でも無限ループしないようにする
  for (let i = 0; i < 400 && diffDays(cursor, period.endExclusive) < 0; i++) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** '2026-08-14' -> '8月14日(金)' */
export function formatMonthDay(date: Ymd): string {
  const c = parseYmd(date);
  return `${c.month}月${c.day}日(${weekdayJa(date)})`;
}

/** '2026-08-14' -> '2026年8月14日(金)' */
export function formatLongDate(date: Ymd): string {
  const c = parseYmd(date);
  return `${c.year}年${c.month}月${c.day}日(${weekdayJa(date)})`;
}

// ---------------------------------------------------------------------------
// 月の期間（「月の開始日」設定に対応）
// ---------------------------------------------------------------------------

/** 月の開始日は 1〜28 に制限する（29日以降は月によって存在しないため）。 */
export function normalizeMonthStartDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

export interface MonthPeriod {
  key: MonthKey;
  /** 期間の開始日（この日を含む） */
  start: Ymd;
  /** 期間の終了日（この日を含む） */
  end: Ymd;
  /** 期間の翌日（この日は含まない。SQL の < 比較用） */
  endExclusive: Ymd;
  /** 期間の日数 */
  days: number;
  /** 表示用ラベル 例: '2026年8月' */
  label: string;
}

/**
 * 「YYYY年M月」の集計期間を返す。
 * 月の開始日が 25 の場合、2026年8月 = 2026-08-25 〜 2026-09-24。
 */
export function monthPeriod(key: MonthKey, monthStartDay = 1): MonthPeriod {
  const startDay = normalizeMonthStartDay(monthStartDay);
  const start = formatYmd({
    year: key.year,
    month: key.month,
    day: Math.min(startDay, daysInMonth(key.year, key.month)),
  });
  const endExclusive = addMonths(start, 1);
  const end = addDays(endExclusive, -1);
  return {
    key,
    start,
    end,
    endExclusive,
    days: diffDays(endExclusive, start),
    label: `${key.year}年${key.month}月`,
  };
}

/** ある日付がどの「月」に属するかを返す。 */
export function monthKeyOf(date: Ymd, monthStartDay = 1): MonthKey {
  const startDay = normalizeMonthStartDay(monthStartDay);
  const c = parseYmd(date);
  if (c.day >= startDay) return { year: c.year, month: c.month };
  return addMonthKey({ year: c.year, month: c.month }, -1);
}

export function addMonthKey(key: MonthKey, months: number): MonthKey {
  const total = key.year * 12 + (key.month - 1) + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function compareMonthKey(a: MonthKey, b: MonthKey): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** DB 保存用の月キー 'YYYY-MM-01' */
export function monthKeyToDbDate(key: MonthKey): Ymd {
  return formatYmd({ year: key.year, month: key.month, day: 1 });
}

export function monthKeyFromDbDate(date: Ymd): MonthKey {
  const c = parseYmd(date);
  return { year: c.year, month: c.month };
}

export function monthKeyLabel(key: MonthKey): string {
  return `${key.year}年${key.month}月`;
}

/** 期間内で今日までに経過した日数（1以上、期間日数以下）。日割りペース計算に使う。 */
export function elapsedDaysInPeriod(period: MonthPeriod, today: Ymd): number {
  if (diffDays(today, period.start) < 0) return 0;
  if (diffDays(today, period.end) >= 0) return period.days;
  return diffDays(today, period.start) + 1;
}
