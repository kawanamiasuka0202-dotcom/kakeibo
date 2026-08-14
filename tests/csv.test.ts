import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv, transactionsToCsv, TRANSACTION_CSV_HEADER } from '@/lib/csv';
import { category, ME, PARTNER, transaction } from './factories';

describe('CSV のエスケープ', () => {
  it('カンマ・改行・引用符を含む値を囲む', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('数式として解釈される文字列を無害化する', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+SUM(A1)')).toBe("'+SUM(A1)");
  });

  it('通常の値はそのまま', () => {
    expect(escapeCsvCell('スーパー')).toBe('スーパー');
    expect(escapeCsvCell(1200)).toBe('1200');
    expect(escapeCsvCell(null)).toBe('');
  });
});

describe('取引の書き出し', () => {
  const food = category({ id: 'cat-food', name: '食費' });
  const names = new Map([
    [ME, 'わたし'],
    [PARTNER, 'パートナー'],
  ]);

  it('ヘッダーと本文を出力する', () => {
    const csv = transactionsToCsv(
      [transaction({ amountYen: 1200, categoryId: food.id, description: 'スーパー' })],
      [food],
      names,
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(TRANSACTION_CSV_HEADER.join(','));
    expect(lines[1]).toContain('2026-08-10');
    expect(lines[1]).toContain('支出');
    expect(lines[1]).toContain('1200');
    expect(lines[1]).toContain('食費');
    expect(lines[1]).toContain('わたし');
  });

  it('金額は整数のまま出力される', () => {
    const csv = transactionsToCsv([transaction({ amountYen: 1234567 })], [food], names);
    expect(csv).toContain('1234567');
    expect(csv).not.toContain('1234567.0');
  });

  it('日付の古い順に並ぶ', () => {
    const csv = transactionsToCsv(
      [
        transaction({ occurredOn: '2026-08-20', description: 'B' }),
        transaction({ occurredOn: '2026-08-01', description: 'A' }),
      ],
      [food],
      names,
    );
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('A');
    expect(lines[2]).toContain('B');
  });

  it('空配列でもヘッダーだけ出力される', () => {
    expect(transactionsToCsv([], [food], names)).toBe(TRANSACTION_CSV_HEADER.join(','));
  });
});

describe('汎用の CSV 化', () => {
  it('CRLF で連結する', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });
});
