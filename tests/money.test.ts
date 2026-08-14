import { describe, expect, it } from 'vitest';
import {
  achievementRate,
  clampPercent,
  formatYen,
  formatYenCompact,
  formatYenText,
  isValidYen,
  monthlyContribution,
  parseYen,
  remaining,
  shareRate,
  sumYen,
  usageRate,
} from '@/lib/money';

describe('parseYen', () => {
  it('半角の数字を円の整数に変換する', () => {
    expect(parseYen('1200')).toBe(1200);
  });

  it('カンマ・全角数字・「円」記号を受け入れる', () => {
    expect(parseYen('1,200')).toBe(1200);
    expect(parseYen('１２００')).toBe(1200);
    expect(parseYen('1200円')).toBe(1200);
    expect(parseYen('¥1,200')).toBe(1200);
  });

  it('小数や文字が混ざっている場合は null を返す（浮動小数点を作らない）', () => {
    expect(parseYen('1200.5')).toBeNull();
    expect(parseYen('1.5')).toBeNull();
    expect(parseYen('abc')).toBeNull();
    expect(parseYen('')).toBeNull();
  });

  it('極端に大きい値は受け付けない', () => {
    expect(parseYen('9999999999999')).toBeNull();
  });
});

describe('金額の整数性', () => {
  it('isValidYen は整数だけを受け入れる', () => {
    expect(isValidYen(100)).toBe(true);
    expect(isValidYen(0)).toBe(true);
    expect(isValidYen(-100)).toBe(true);
    expect(isValidYen(100.5)).toBe(false);
    expect(isValidYen('100')).toBe(false);
  });

  it('合計は整数のまま計算される', () => {
    const values = [333, 333, 334];
    expect(sumYen(values)).toBe(1000);
    expect(Number.isInteger(sumYen(values))).toBe(true);
  });

  it('1円単位の合計がずれない（浮動小数点を使っていない）', () => {
    const values = Array.from({ length: 1000 }, () => 1);
    expect(sumYen(values)).toBe(1000);
  });
});

describe('予算の計算', () => {
  it('残額は予算 − 支出', () => {
    expect(remaining(50000, 30000)).toBe(20000);
  });

  it('予算超過時はマイナスになる', () => {
    expect(remaining(50000, 62000)).toBe(-12000);
  });

  it('使用率は小数第1位まで', () => {
    expect(usageRate(30000, 50000)).toBe(60);
    expect(usageRate(33333, 100000)).toBe(33.3);
  });

  it('予算0のときは、支出があれば100%、なければ0%', () => {
    expect(usageRate(1000, 0)).toBe(100);
    expect(usageRate(0, 0)).toBe(0);
  });

  it('割合は合計0でも例外を投げない', () => {
    expect(shareRate(0, 0)).toBe(0);
    expect(shareRate(2500, 10000)).toBe(25);
  });

  it('バー表示用に 0〜100 へ丸める', () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe('貯金の計算', () => {
  it('達成率は 0〜999 に収まる', () => {
    expect(achievementRate(150000, 300000)).toBe(50);
    expect(achievementRate(300000, 300000)).toBe(100);
    expect(achievementRate(-100, 300000)).toBe(0);
    expect(achievementRate(100, 0)).toBe(0);
  });

  it('月あたりの積立目安は切り上げた整数（足りなくならないように）', () => {
    expect(monthlyContribution(100000, 3)).toBe(33334);
    expect(Number.isInteger(monthlyContribution(100000, 3))).toBe(true);
  });

  it('残り月数が0以下なら残額全額', () => {
    expect(monthlyContribution(50000, 0)).toBe(50000);
    expect(monthlyContribution(50000, -3)).toBe(50000);
  });

  it('達成済みなら0円', () => {
    expect(monthlyContribution(0, 5)).toBe(0);
    expect(monthlyContribution(-5000, 5)).toBe(0);
  });
});

describe('表示', () => {
  it('円記号と3桁区切りで表示する', () => {
    expect(formatYen(1234567)).toBe('¥1,234,567');
    expect(formatYen(-5000)).toBe('-¥5,000');
  });

  it('文章用の表記', () => {
    expect(formatYenText(3000)).toBe('3,000円');
    expect(formatYenText(-3000)).toBe('マイナス3,000円');
  });

  it('狭い場所向けの概算表記', () => {
    expect(formatYenCompact(12000)).toBe('1.2万');
    expect(formatYenCompact(980)).toBe('980');
  });
});
