import { formatDateTimeJst } from './date';
import type { Category, Transaction, UUID } from './types';

/** CSV の 1 セルをエスケープする。 */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // 先頭が = + - @ の場合は表計算ソフトで数式として解釈されるため、シングルクォートで無害化する
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** 取引一覧の CSV ヘッダー。将来の CSV インポートでもこの並びを使う。 */
export const TRANSACTION_CSV_HEADER = [
  '日付',
  '種別',
  '金額',
  'カテゴリ',
  '内容・店名',
  '支払った人',
  '区分',
  '支払方法',
  'メモ',
  '登録者',
  '登録日時',
] as const;

export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  memberNames: ReadonlyMap<UUID, string>,
): string {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const rows: unknown[][] = [[...TRANSACTION_CSV_HEADER]];
  for (const t of [...transactions].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))) {
    rows.push([
      t.occurredOn,
      t.type === 'expense' ? '支出' : '収入',
      t.amountYen,
      categoryName.get(t.categoryId) ?? '',
      t.description,
      // 支払った人が null の行は「共有（家計から出したお金）」
      t.paidBy === null ? '共有' : (memberNames.get(t.paidBy) ?? ''),
      t.shareScope === 'shared' ? '共有' : '個人',
      t.paymentMethod,
      t.memo,
      memberNames.get(t.createdBy) ?? '',
      formatDateTimeJst(t.createdAt),
    ]);
  }
  return toCsv(rows);
}

/** Excel が UTF-8 と判定できるよう BOM を付けた Blob を作る。 */
export function csvToBlob(csv: string): Blob {
  return new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(csvToBlob(csv));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
