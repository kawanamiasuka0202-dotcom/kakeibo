'use client';

import * as React from 'react';

/** 端末ごとの表示設定（ログインしなくても保持したいのでローカルに保存する） */
export const STORAGE_KEYS = {
  mode: 'kakeibo:mode', // 'demo' | 'supabase'
  theme: 'kakeibo:theme', // 'light' | 'dark' | 'system'
  notify: 'kakeibo:notify',
  dismissedAlerts: 'kakeibo:dismissed-alerts',
  favoriteCategories: 'kakeibo:favorite-categories',
  // 相手に伝えるための控え。この端末の中だけに置く
  passphrase: 'kakeibo:passphrase',
} as const;

export type ThemeSetting = 'light' | 'dark' | 'system';

export interface NotifySetting {
  budget80: boolean;
  budget100: boolean;
  categoryOver: boolean;
}

export const DEFAULT_NOTIFY: NotifySetting = {
  budget80: true,
  budget100: true,
  categoryOver: true,
};

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージが使えない環境（プライベートブラウズ等）では黙って諦める
  }
}

export function removeLocal(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ストレージが使えない環境では何もしない
  }
}

/** localStorage と同期する useState。 */
export function useLocalSetting<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = React.useState<T>(fallback);

  React.useEffect(() => {
    setValue(readLocal(key, fallback));
    // fallback は初回だけ参照する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = React.useCallback(
    (next: T) => {
      setValue(next);
      writeLocal(key, next);
    },
    [key],
  );

  return [value, update];
}

/** テーマを <html> に反映する。 */
export function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}
