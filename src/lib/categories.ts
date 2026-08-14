import type { CategoryKind } from './types';

export interface CategorySeed {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
}

/**
 * 初期カテゴリ。SQL のシード（supabase/migrations/0002_seed_categories.sql の
 * public.seed_default_categories 関数）と同じ順序・同じ名前で定義している。
 * どちらかを変更したら必ず両方を揃えること。
 */
export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: '食費', kind: 'expense', color: '#e2725b', icon: '🍚' },
  { name: '外食費', kind: 'expense', color: '#d9694f', icon: '🍜' },
  { name: '日用品', kind: 'expense', color: '#c98a5b', icon: '🧻' },
  { name: '住居費', kind: 'expense', color: '#7c6f9c', icon: '🏠' },
  { name: '水道', kind: 'expense', color: '#4f9ec4', icon: '🚰' },
  { name: '電気', kind: 'expense', color: '#e0a83c', icon: '💡' },
  { name: 'ガス', kind: 'expense', color: '#cf7b3c', icon: '🔥' },
  { name: '通信費', kind: 'expense', color: '#5a8fbf', icon: '📱' },
  { name: 'サブスクリプション', kind: 'expense', color: '#8a7fc4', icon: '🔁' },
  { name: '交通費', kind: 'expense', color: '#4e9c86', icon: '🚃' },
  { name: '自動車', kind: 'expense', color: '#5f7f9c', icon: '🚗' },
  { name: '医療費', kind: 'expense', color: '#4fa39c', icon: '🏥' },
  { name: '保険', kind: 'expense', color: '#6c8fa3', icon: '🛡️' },
  { name: '美容', kind: 'expense', color: '#c97b9c', icon: '💇' },
  { name: '衣服', kind: 'expense', color: '#b06f8c', icon: '👕' },
  { name: '趣味', kind: 'expense', color: '#9c7bc4', icon: '🎸' },
  { name: '娯楽', kind: 'expense', color: '#7f8fd6', icon: '🎬' },
  { name: '旅行', kind: 'expense', color: '#3f9ec4', icon: '✈️' },
  { name: '交際費', kind: 'expense', color: '#c98a3c', icon: '🍻' },
  { name: 'プレゼント', kind: 'expense', color: '#d6708c', icon: '🎁' },
  { name: '教育', kind: 'expense', color: '#5f9c5f', icon: '📚' },
  { name: '子ども', kind: 'expense', color: '#e09a5f', icon: '🧸' },
  { name: 'ペット', kind: 'expense', color: '#a3874f', icon: '🐾' },
  { name: '税金', kind: 'expense', color: '#8c8c8c', icon: '🧾' },
  { name: '家具・家電', kind: 'expense', color: '#7a8fa3', icon: '🛋️' },
  { name: '特別支出', kind: 'expense', color: '#a35f7a', icon: '⭐' },
  { name: 'お小遣い', kind: 'expense', color: '#9c9c5f', icon: '👛' },
  { name: '貯金', kind: 'expense', color: '#3f9c7a', icon: '🐖' },
  { name: '投資', kind: 'expense', color: '#4f7fa3', icon: '📈' },
  { name: 'その他', kind: 'expense', color: '#9aa0a6', icon: '📦' },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { name: '給与', kind: 'income', color: '#3f9c7a', icon: '💴' },
  { name: '賞与', kind: 'income', color: '#4fa39c', icon: '🎉' },
  { name: '副業', kind: 'income', color: '#5f9c5f', icon: '💼' },
  { name: '臨時収入', kind: 'income', color: '#7fa35f', icon: '✨' },
  { name: 'その他収入', kind: 'income', color: '#9aa0a6', icon: '📥' },
];

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

/** 「貯金」カテゴリ名（貯金目標との自動連携に使う） */
export const SAVINGS_CATEGORY_NAME = '貯金';

/** カテゴリのアイコン候補（設定画面で選択） */
export const ICON_CHOICES = [
  '🍚', '🍜', '🧻', '🏠', '🚰', '💡', '🔥', '📱', '🔁', '🚃',
  '🚗', '🏥', '🛡️', '💇', '👕', '🎸', '🎬', '✈️', '🍻', '🎁',
  '📚', '🧸', '🐾', '🧾', '🛋️', '⭐', '👛', '🐖', '📈', '📦',
  '💴', '🎉', '💼', '✨', '📥', '☕', '🍰', '🏋️', '🎮', '💊',
];

/** カテゴリの色候補（落ち着いたトーンで統一） */
export const COLOR_CHOICES = [
  '#e2725b', '#d9694f', '#c98a5b', '#7c6f9c', '#4f9ec4',
  '#e0a83c', '#cf7b3c', '#5a8fbf', '#8a7fc4', '#4e9c86',
  '#5f7f9c', '#4fa39c', '#6c8fa3', '#c97b9c', '#b06f8c',
  '#9c7bc4', '#7f8fd6', '#3f9ec4', '#c98a3c', '#d6708c',
  '#5f9c5f', '#e09a5f', '#a3874f', '#8c8c8c', '#7a8fa3',
  '#a35f7a', '#9c9c5f', '#3f9c7a', '#4f7fa3', '#9aa0a6',
];
