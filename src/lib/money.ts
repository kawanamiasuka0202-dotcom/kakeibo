/**
 * 金額ユーティリティ
 *
 * 方針:
 *  - 金額は「円単位の整数」だけで扱う。小数・浮動小数点の計算結果を金額として保存しない。
 *  - 割合の計算は表示のためだけに行い、金額そのものには使わない。
 *  - 割り算が必要な場面（月あたりの積立目安など）は必ず整数へ丸めてから返す。
 */

/** 円単位の整数金額 */
export type Yen = number;

/** JavaScript の安全な整数の範囲内で、家計簿として現実的な上限（1兆円） */
export const MAX_YEN = 1_000_000_000_000;

export function isValidYen(value: unknown): value is Yen {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= MAX_YEN;
}

/** 入力文字列を円の整数に変換する。全角数字・カンマ・「円」を許容。失敗時は null。 */
export function parseYen(input: string): Yen | null {
  if (typeof input !== 'string') return null;
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s円￥¥]/g, '')
    .trim();
  if (normalized === '' || normalized === '-') return null;
  if (!/^-?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_YEN) return null;
  return value;
}

/** 金額を '¥1,234' 形式にする。 */
export function formatYen(value: Yen): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.trunc(value)).toLocaleString('ja-JP')}`;
}

/** 金額を '1,234円' 形式にする（文章中で使う）。 */
export function formatYenText(value: Yen): string {
  const sign = value < 0 ? 'マイナス' : '';
  return `${sign}${Math.abs(Math.trunc(value)).toLocaleString('ja-JP')}円`;
}

/** 金額を '1.2万円' のような概算にする（グラフのラベルなど狭い場所用）。 */
export function formatYenCompact(value: Yen): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}億`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`;
  return `${sign}${abs.toLocaleString('ja-JP')}`;
}

/** 合計。整数のまま足す。 */
export function sumYen(values: readonly Yen[]): Yen {
  let total = 0;
  for (const v of values) total += Math.trunc(v);
  return total;
}

/**
 * 使用率（%）を返す。予算が 0 以下の場合は、支出があれば 100、なければ 0 を返す。
 * 小数第1位まで（表示用）。
 */
export function usageRate(spent: Yen, budget: Yen): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.round((spent / budget) * 1000) / 10;
}

/** 割合（%）を返す。合計が 0 の場合は 0。小数第1位まで。 */
export function shareRate(part: Yen, total: Yen): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** 残額。予算超過時はマイナスになる。 */
export function remaining(budget: Yen, spent: Yen): Yen {
  return Math.trunc(budget) - Math.trunc(spent);
}

/**
 * 目標金額に対して、残り期間で必要な月あたりの積立額（円・整数）を返す。
 * 残り月数が 0 以下の場合は残額全額を返す。切り上げ（足りなくならないように）。
 */
export function monthlyContribution(remainingYen: Yen, monthsLeft: number): Yen {
  if (remainingYen <= 0) return 0;
  if (!Number.isFinite(monthsLeft) || monthsLeft <= 0) return Math.trunc(remainingYen);
  return Math.ceil(remainingYen / monthsLeft);
}

/** 達成率（%）。目標が 0 以下なら 0。0〜999 にクランプ。小数第1位まで。 */
export function achievementRate(current: Yen, target: Yen): number {
  if (target <= 0) return 0;
  const rate = Math.round((current / target) * 1000) / 10;
  return Math.min(999, Math.max(0, rate));
}

/** 割合を 0〜100 のバー表示用の値にクランプする。 */
export function clampPercent(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(100, Math.max(0, rate));
}
