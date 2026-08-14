/**
 * 合言葉（パスフレーズ）のあつかい。
 *
 * このアプリはメールアドレスやパスワードを入力させない。
 * かわりに「2人で決めた合言葉」と「お名前」から、
 *   - 家計グループを見分ける値（passphrase_hash）
 *   - ログインに使う内部用のメールアドレスとパスワード
 * を、その場で計算して使う。合言葉そのものはサーバーに送らない。
 *
 * 同じ合言葉を入れた2人が同じ家計グループに入り、
 * 「合言葉 + お名前」が同じなら、どの端末からでも同じ人として入り直せる。
 *
 * 総当たりを遅くするため、鍵の生成には PBKDF2 を使う。
 */

/** 合言葉の最低文字数（空白を除いた長さ） */
export const MIN_PASSPHRASE_LENGTH = 8;
export const MAX_PASSPHRASE_LENGTH = 100;

/** ログイン用に自動生成するメールアドレスのドメイン（RFC 2606 の予約済み。実在せず配送もされない） */
const EMAIL_DOMAIN = 'kakeibo.example';

const PBKDF2_ITERATIONS = 150_000;
const MASTER_SALT = 'kakeibo/passphrase/v1';
const HOUSEHOLD_TAG = 'kakeibo/household/v1';
const EMAIL_TAG = 'kakeibo/email/v1';
const PASSWORD_TAG = 'kakeibo/password/v1';

export interface Credentials {
  /** 家計グループの照合に使う値（サーバーに保存される） */
  householdHash: string;
  /** Supabase のログインに使う内部用アドレス */
  email: string;
  /** Supabase のログインに使う内部用パスワード */
  password: string;
}

/**
 * 合言葉の表記ゆれを吸収する。
 * 全角/半角、大文字/小文字、空白の有無で入れなくなるのを防ぐ。
 */
export function normalizePassphrase(input: string): string {
  return input.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** お名前の表記ゆれを吸収する（前後の空白と大文字小文字） */
export function normalizeLoginName(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function validatePassphrase(input: string): string | null {
  const value = normalizePassphrase(input);
  if (value === '') return '合言葉を入力してください';
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    return `合言葉は${MIN_PASSPHRASE_LENGTH}文字以上にしてください`;
  }
  if (value.length > MAX_PASSPHRASE_LENGTH) {
    return `合言葉は${MAX_PASSPHRASE_LENGTH}文字までにしてください`;
  }
  return null;
}

export function validateLoginName(input: string): string | null {
  const value = input.trim();
  if (value === '') return 'お名前を入力してください';
  if (value.length > 20) return 'お名前は20文字までにしてください';
  return null;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      'この環境では合言葉を扱えません。https:// または localhost で開いてください。',
    );
  }
  return c;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await getCrypto().subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(digest);
}

/** 合言葉から時間のかかる鍵を1回だけ作る（この結果を使い回して各値を導出する） */
async function deriveMasterKey(passphrase: string): Promise<string> {
  const subtle = getCrypto().subtle;
  const encoder = new TextEncoder();
  const key = await subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(MASTER_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return toHex(bits);
}

/**
 * 合言葉とお名前から、家計グループの識別子とログイン情報を作る。
 * 同じ入力なら必ず同じ結果になる（別の端末でも入り直せる）。
 */
export async function deriveCredentials(
  passphrase: string,
  loginName: string,
): Promise<Credentials> {
  const pass = normalizePassphrase(passphrase);
  const name = normalizeLoginName(loginName);
  const master = await deriveMasterKey(pass);

  const [householdHash, emailHash, password] = await Promise.all([
    sha256Hex(`${HOUSEHOLD_TAG}:${master}`),
    sha256Hex(`${EMAIL_TAG}:${master}:${name}`),
    sha256Hex(`${PASSWORD_TAG}:${master}:${name}`),
  ]);

  return {
    householdHash,
    // 先頭を英字にして、メールアドレスとして確実に妥当な形にする
    email: `k${emailHash.slice(0, 31)}@${EMAIL_DOMAIN}`,
    password,
  };
}

/** 家計グループの識別子だけが必要なとき（合言葉の変更など）に使う */
export async function deriveHouseholdHash(passphrase: string): Promise<string> {
  const master = await deriveMasterKey(normalizePassphrase(passphrase));
  return sha256Hex(`${HOUSEHOLD_TAG}:${master}`);
}

/** 入力しやすい合言葉の候補を作る（「ひらがな-ひらがな-4桁」の形） */
const WORDS_A = ['あおぞら', 'やまびこ', 'こもれび', 'なぎさ', 'ひだまり', 'ゆきどけ', 'はるかぜ', 'つきあかり'];
const WORDS_B = ['さくら', 'みかん', 'すずらん', 'もみじ', 'ひまわり', 'つばき', 'わたあめ', 'まっちゃ'];

export function suggestPassphrase(random: () => number = Math.random): string {
  const a = WORDS_A[Math.floor(random() * WORDS_A.length)];
  const b = WORDS_B[Math.floor(random() * WORDS_B.length)];
  const digits = String(1000 + Math.floor(random() * 9000));
  return `${a}-${b}-${digits}`;
}
