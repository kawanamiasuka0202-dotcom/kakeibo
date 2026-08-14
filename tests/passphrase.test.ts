import { describe, expect, it } from 'vitest';
import {
  deriveCredentials,
  deriveHouseholdHash,
  MIN_PASSPHRASE_LENGTH,
  normalizeLoginName,
  normalizePassphrase,
  suggestPassphrase,
  validateLoginName,
  validatePassphrase,
} from '@/lib/passphrase';

describe('合言葉の正規化', () => {
  it('全角・空白・大文字小文字の違いを吸収する', () => {
    expect(normalizePassphrase('わがや-さくら-2026')).toBe('わがや-さくら-2026');
    expect(normalizePassphrase('わがや-さくら-２０２６')).toBe('わがや-さくら-2026');
    expect(normalizePassphrase(' わがや - さくら - 2026 ')).toBe('わがや-さくら-2026');
    expect(normalizePassphrase('OurHouse-2026')).toBe('ourhouse-2026');
  });

  it('お名前も表記ゆれを吸収する', () => {
    expect(normalizeLoginName(' たろう ')).toBe('たろう');
    expect(normalizeLoginName('Taro')).toBe('taro');
  });
});

describe('入力の検証', () => {
  it('短すぎる合言葉は使えない', () => {
    expect(validatePassphrase('')).toContain('入力');
    expect(validatePassphrase('あい')).toContain(`${MIN_PASSPHRASE_LENGTH}文字以上`);
    expect(validatePassphrase('わがや-さくら-2026')).toBeNull();
  });

  it('空白だけの合言葉は入力なしとみなす', () => {
    expect(validatePassphrase('        ')).toContain('入力');
  });

  it('長すぎる合言葉は使えない', () => {
    expect(validatePassphrase('あ'.repeat(101))).toContain('100文字まで');
  });

  it('お名前は必須で20文字まで', () => {
    expect(validateLoginName('')).toContain('入力');
    expect(validateLoginName('あ'.repeat(21))).toContain('20文字');
    expect(validateLoginName('たろう')).toBeNull();
  });

  it('提案される合言葉はそのまま使える', () => {
    for (let i = 0; i < 20; i++) {
      expect(validatePassphrase(suggestPassphrase())).toBeNull();
    }
  });
});

describe('ログイン情報の生成', () => {
  const PASS = 'わがや-さくら-2026';

  it('同じ合言葉とお名前なら、いつでも同じ結果になる（別の端末から入り直せる）', async () => {
    const a = await deriveCredentials(PASS, 'たろう');
    const b = await deriveCredentials(PASS, 'たろう');
    expect(a).toEqual(b);
  });

  it('表記ゆれがあっても同じ結果になる', async () => {
    const a = await deriveCredentials('わがや-さくら-2026', 'たろう');
    const b = await deriveCredentials(' わがや-さくら-２０２６ ', ' たろう ');
    expect(a).toEqual(b);
  });

  it('同じ合言葉なら、2人とも同じ家計グループになる', async () => {
    const a = await deriveCredentials(PASS, 'たろう');
    const b = await deriveCredentials(PASS, 'はなこ');
    expect(a.householdHash).toBe(b.householdHash);
  });

  it('同じ合言葉でも、お名前が違えば別のログイン情報になる', async () => {
    const a = await deriveCredentials(PASS, 'たろう');
    const b = await deriveCredentials(PASS, 'はなこ');
    expect(a.email).not.toBe(b.email);
    expect(a.password).not.toBe(b.password);
  });

  it('合言葉が違えば、別の家計グループになる', async () => {
    const a = await deriveCredentials(PASS, 'たろう');
    const b = await deriveCredentials('となりのいえ-2026', 'たろう');
    expect(a.householdHash).not.toBe(b.householdHash);
    expect(a.email).not.toBe(b.email);
  });

  it('家計グループの識別子は DB の制約に合う形式（64桁の16進数）', async () => {
    const { householdHash } = await deriveCredentials(PASS, 'たろう');
    expect(householdHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('合言葉だけからでも同じ識別子を作れる', async () => {
    const { householdHash } = await deriveCredentials(PASS, 'たろう');
    expect(await deriveHouseholdHash(PASS)).toBe(householdHash);
  });

  it('生成されるメールアドレスは配送されない予約ドメインを使う', async () => {
    const { email } = await deriveCredentials(PASS, 'たろう');
    expect(email).toMatch(/^k[0-9a-f]{31}@kakeibo\.example$/);
  });

  it('パスワードは十分な長さがある', async () => {
    const { password } = await deriveCredentials(PASS, 'たろう');
    expect(password).toMatch(/^[0-9a-f]{64}$/);
  });

  it('合言葉そのものは生成物に含まれない', async () => {
    const creds = await deriveCredentials(PASS, 'たろう');
    const joined = `${creds.householdHash}${creds.email}${creds.password}`;
    expect(joined).not.toContain('わがや');
    expect(joined).not.toContain('2026');
  });
});
