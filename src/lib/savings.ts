import { diffDays, parseYmd, type Ymd } from './date';
import { achievementRate, monthlyContribution, remaining, sumYen, type Yen } from './money';
import type { SavingsEntry, SavingsGoal, UUID } from './types';

export interface GoalProgress {
  goal: SavingsGoal;
  /** 入金合計 − 出金合計 */
  currentYen: Yen;
  depositYen: Yen;
  withdrawalYen: Yen;
  /** 目標まであといくら（達成済みなら 0） */
  remainingYen: Yen;
  /** 達成率（%）。0〜999 */
  rate: number;
  achieved: boolean;
  /** 目標日までの残り日数。目標日なしなら null。過去日はマイナス */
  daysLeft: number | null;
  /** 目標日までの残り月数（切り上げ、最低1）。目標日なしなら null */
  monthsLeft: number | null;
  /** 目標達成に必要な月あたりの積立額。目標日なしなら null */
  monthlyNeededYen: Yen | null;
  /** メンバーごとの入金額（共有目標の「どちらがいくら入れたか」表示用） */
  byMember: { userId: UUID; amountYen: Yen }[];
  entryCount: number;
}

/** 残り日数から残り月数を求める（30日=1ヶ月、最低1ヶ月）。 */
export function monthsLeftFromDays(daysLeft: number): number {
  if (daysLeft <= 0) return 0;
  return Math.max(1, Math.ceil(daysLeft / 30));
}

export function goalProgress(
  goal: SavingsGoal,
  entries: readonly SavingsEntry[],
  today: Ymd,
): GoalProgress {
  const mine = entries.filter((e) => e.goalId === goal.id);
  const depositYen = sumYen(mine.filter((e) => e.amountYen > 0).map((e) => e.amountYen));
  const withdrawalYen = sumYen(mine.filter((e) => e.amountYen < 0).map((e) => -e.amountYen));
  const currentYen = depositYen - withdrawalYen;
  const rawRemaining = remaining(goal.targetYen, currentYen);
  const remainingYen = Math.max(0, rawRemaining);

  const daysLeft = goal.targetDate ? diffDays(goal.targetDate, today) : null;
  const monthsLeft = daysLeft === null ? null : monthsLeftFromDays(daysLeft);
  const monthlyNeededYen =
    monthsLeft === null ? null : monthlyContribution(remainingYen, monthsLeft);

  const byMemberMap = new Map<UUID, Yen>();
  for (const e of mine) {
    byMemberMap.set(e.userId, (byMemberMap.get(e.userId) ?? 0) + e.amountYen);
  }

  return {
    goal,
    currentYen,
    depositYen,
    withdrawalYen,
    remainingYen,
    rate: achievementRate(currentYen, goal.targetYen),
    achieved: currentYen >= goal.targetYen && goal.targetYen > 0,
    daysLeft,
    monthsLeft,
    monthlyNeededYen,
    byMember: [...byMemberMap.entries()]
      .map(([userId, amountYen]) => ({ userId, amountYen }))
      .sort((a, b) => b.amountYen - a.amountYen),
    entryCount: mine.length,
  };
}

/** 目標日までの残り期間を日本語で表す。 */
export function describeDeadline(daysLeft: number | null, targetDate: Ymd | null): string {
  if (daysLeft === null || !targetDate) return '目標日なし';
  const c = parseYmd(targetDate);
  const label = `${c.year}年${c.month}月${c.day}日`;
  if (daysLeft < 0) return `${label}（${-daysLeft}日超過）`;
  if (daysLeft === 0) return `${label}（今日まで）`;
  if (daysLeft < 31) return `${label}（あと${daysLeft}日）`;
  const months = Math.floor(daysLeft / 30);
  return `${label}（あと約${months}ヶ月）`;
}

/** 一覧に表示する順番: 進行中 → 一時停止 → 達成 → アーカイブ */
const STATUS_ORDER: Record<SavingsGoal['status'], number> = {
  active: 0,
  paused: 1,
  done: 2,
  archived: 3,
};

export function sortGoals(goals: readonly SavingsGoal[]): SavingsGoal[] {
  return [...goals].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    if (a.targetDate) return -1;
    if (b.targetDate) return 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}
